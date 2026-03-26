-- ============================================================
-- Group Invitations: offer group membership to existing contacts
-- Run this in the Supabase SQL Editor after fairshare-schema.sql
-- ============================================================

-- 1. TABLE
CREATE TABLE IF NOT EXISTS public.group_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  sponsor_id uuid NOT NULL REFERENCES public.profiles(id),
  candidate_id uuid NOT NULL REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE(group_id, candidate_id, sponsor_id)
);

ALTER TABLE public.group_invitations ENABLE ROW LEVEL SECURITY;

-- Candidates and sponsors can see their own invitations
CREATE POLICY "Users can view own invitations"
  ON public.group_invitations FOR SELECT
  USING (auth.uid() = candidate_id OR auth.uid() = sponsor_id);

-- Invitations are inserted by the offer_group_membership SECURITY DEFINER function,
-- but we also allow direct insert for the sponsor (belt-and-suspenders).
CREATE POLICY "Sponsors can insert invitations"
  ON public.group_invitations FOR INSERT
  WITH CHECK (auth.uid() = sponsor_id);

-- Enable Realtime so candidates get notified immediately
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_invitations;
ALTER TABLE public.group_invitations REPLICA IDENTITY FULL;


-- 2. OFFER GROUP MEMBERSHIP RPC
-- Called by the sponsor to create an invitation and notify the candidate.
CREATE OR REPLACE FUNCTION public.offer_group_membership(
  p_group_id uuid,
  p_candidate_id uuid
)
RETURNS json AS $$
DECLARE
  v_sponsor_id uuid := auth.uid();
  v_sponsor_name text;
  v_group_name text;
  v_invitation_id uuid;
BEGIN
  IF v_sponsor_id IS NULL THEN
    RAISE EXCEPTION 'You must be logged in';
  END IF;

  IF NOT public.is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'You are not an active member of this group';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_candidate_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.members
    WHERE group_id = p_group_id AND user_id = p_candidate_id
      AND status IN ('active', 'pending')
  ) THEN
    RAISE EXCEPTION 'This person is already a member or pending candidate of this group';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.group_invitations
    WHERE group_id = p_group_id AND candidate_id = p_candidate_id
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'A pending invitation already exists for this person in this group';
  END IF;

  SELECT display_name INTO v_sponsor_name FROM public.profiles WHERE id = v_sponsor_id;
  SELECT name INTO v_group_name FROM public.groups WHERE id = p_group_id;

  INSERT INTO public.group_invitations (group_id, sponsor_id, candidate_id)
  VALUES (p_group_id, v_sponsor_id, p_candidate_id)
  RETURNING id INTO v_invitation_id;

  -- Send push notification to the candidate
  PERFORM public.send_push_to_users(
    ARRAY[p_candidate_id],
    v_sponsor_id,
    'Group Membership Offer',
    COALESCE(v_sponsor_name, 'Someone') || ' has offered to sponsor your membership in ' || COALESCE(v_group_name, 'a group'),
    '/fairshare/'
  );

  RETURN json_build_object(
    'success', true,
    'invitation_id', v_invitation_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. RESPOND TO GROUP INVITATION RPC
-- Called by the candidate to accept or decline.
-- On accept: creates pending membership, auto-endorses, checks threshold.
CREATE OR REPLACE FUNCTION public.respond_to_group_invitation(
  p_invitation_id uuid,
  p_accept boolean
)
RETURNS json AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_invitation record;
  v_group_name text;
  v_sponsor_name text;
  v_admitted boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be logged in';
  END IF;

  SELECT * INTO v_invitation
  FROM public.group_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  IF v_invitation.candidate_id <> v_user_id THEN
    RAISE EXCEPTION 'This invitation is not for you';
  END IF;

  IF v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'This invitation has already been responded to';
  END IF;

  IF NOT p_accept THEN
    UPDATE public.group_invitations
    SET status = 'declined', resolved_at = now()
    WHERE id = p_invitation_id;

    RETURN json_build_object('success', true, 'action', 'declined');
  END IF;

  -- Accept flow: mirrors claim_sponsorship / complete_meet logic

  IF EXISTS (
    SELECT 1 FROM public.members
    WHERE group_id = v_invitation.group_id AND user_id = v_user_id
      AND status IN ('active', 'pending')
  ) THEN
    UPDATE public.group_invitations
    SET status = 'declined', resolved_at = now()
    WHERE id = p_invitation_id;
    RAISE EXCEPTION 'You are already a member or pending candidate of this group';
  END IF;

  UPDATE public.group_invitations
  SET status = 'accepted', resolved_at = now()
  WHERE id = p_invitation_id;

  INSERT INTO public.members (group_id, user_id, status, balance)
  VALUES (v_invitation.group_id, v_user_id, 'pending', 0);

  SELECT display_name INTO v_sponsor_name
  FROM public.profiles WHERE id = v_invitation.sponsor_id;

  SELECT name INTO v_group_name
  FROM public.groups WHERE id = v_invitation.group_id;

  INSERT INTO public.group_events (group_id, event_type, summary, actor_id, metadata)
  VALUES (
    v_invitation.group_id,
    'member_sponsored',
    'New candidate '
      || (SELECT display_name FROM public.profiles WHERE id = v_user_id)
      || ', sponsored by '
      || COALESCE(v_sponsor_name, 'Unknown'),
    v_invitation.sponsor_id,
    json_build_object('sponsor_id', v_invitation.sponsor_id, 'candidate_id', v_user_id)::jsonb
  );

  INSERT INTO public.endorsements (group_id, candidate_id, endorser_id)
  VALUES (v_invitation.group_id, v_user_id, v_invitation.sponsor_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND sponsor_id IS NOT NULL
  ) THEN
    UPDATE public.profiles
    SET sponsor_id = v_invitation.sponsor_id
    WHERE id = v_user_id;
  END IF;

  PERFORM public.check_endorsements(v_invitation.group_id, v_user_id);

  SELECT (status = 'active') INTO v_admitted
  FROM public.members
  WHERE group_id = v_invitation.group_id AND user_id = v_user_id;

  RETURN json_build_object(
    'success', true,
    'action', 'accepted',
    'group_id', v_invitation.group_id,
    'group_name', v_group_name,
    'admitted', COALESCE(v_admitted, false)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
