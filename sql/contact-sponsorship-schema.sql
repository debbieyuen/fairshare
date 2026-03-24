-- Contact Sponsorship Tree schema for FairShare
-- Run this in Supabase SQL Editor.
--
-- Every FairShare user has a sponsor (except the root user).
-- The handshake QR code / meet link sets the issuer as sponsor
-- for new users, and each meet token can only be used once.

-- 1. Add sponsor_id to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sponsor_id uuid REFERENCES public.profiles(id);

-- 2. Add used_by column to meet_requests (single-use tokens)
ALTER TABLE public.meet_requests ADD COLUMN IF NOT EXISTS used_by uuid REFERENCES auth.users(id);


-- 3. Replace complete_meet to enforce single-use and set sponsor_id
CREATE OR REPLACE FUNCTION public.complete_meet(p_token text)
RETURNS json AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_meet_request record;
  v_contact_name text;
  v_caller_sponsor uuid;
BEGIN
  -- Look up the meet request by token
  SELECT * INTO v_meet_request
  FROM public.meet_requests
  WHERE token = p_token
    AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meet request not found or expired';
  END IF;

  -- Reject if already used
  IF v_meet_request.used_by IS NOT NULL THEN
    RAISE EXCEPTION 'This meet link has already been used';
  END IF;

  -- Cannot meet yourself
  IF v_meet_request.user_id = v_caller_id THEN
    RAISE EXCEPTION 'Cannot create a contact with yourself';
  END IF;

  -- Mark the token as used
  UPDATE public.meet_requests
  SET used_by = v_caller_id
  WHERE id = v_meet_request.id;

  -- If the caller has no sponsor yet, set the meet issuer as their sponsor
  SELECT sponsor_id INTO v_caller_sponsor
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_sponsor IS NULL THEN
    UPDATE public.profiles
    SET sponsor_id = v_meet_request.user_id
    WHERE id = v_caller_id;
  END IF;

  -- Insert bidirectional contacts, or update met_at if already exist
  INSERT INTO public.contacts (user_id, contact_id, met_at)
  VALUES (v_caller_id, v_meet_request.user_id, now())
  ON CONFLICT (user_id, contact_id) DO UPDATE SET met_at = now();

  INSERT INTO public.contacts (user_id, contact_id, met_at)
  VALUES (v_meet_request.user_id, v_caller_id, now())
  ON CONFLICT (user_id, contact_id) DO UPDATE SET met_at = now();

  -- Get the other person's display name
  SELECT display_name INTO v_contact_name
  FROM public.profiles
  WHERE id = v_meet_request.user_id;

  RETURN json_build_object(
    'contact_id', v_meet_request.user_id,
    'contact_name', COALESCE(v_contact_name, 'Unknown')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Replace get_meet_by_token to also check used_by
CREATE OR REPLACE FUNCTION public.get_meet_by_token(p_token text)
RETURNS json AS $$
DECLARE
  v_meet record;
  v_name text;
  v_profile_image_url text;
BEGIN
  SELECT * INTO v_meet
  FROM public.meet_requests
  WHERE token = p_token
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Meet request not found or expired');
  END IF;

  IF v_meet.used_by IS NOT NULL THEN
    RETURN json_build_object('error', 'This meet link has already been used');
  END IF;

  SELECT display_name, profile_image_url INTO v_name, v_profile_image_url
  FROM public.profiles
  WHERE id = v_meet.user_id;

  RETURN json_build_object(
    'user_name', COALESCE(v_name, 'A Union member'),
    'profile_image_url', v_profile_image_url
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. Backfill: set all existing profiles (except root) to have you as sponsor
UPDATE public.profiles
SET sponsor_id = 'a8253eea-e76a-46d1-a92d-6fe36911f038'
WHERE id != 'a8253eea-e76a-46d1-a92d-6fe36911f038'
  AND sponsor_id IS NULL;


-- 6. get_ancestor_chain: walk up the sponsor tree from a given user
CREATE OR REPLACE FUNCTION public.get_ancestor_chain(p_user_id uuid)
RETURNS TABLE(id uuid, display_name text, profile_image_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH RECURSIVE ancestors AS (
    SELECT p.id, p.display_name, p.profile_image_url, p.sponsor_id, 0 AS depth
    FROM public.profiles p WHERE p.id = p_user_id
    UNION ALL
    SELECT p.id, p.display_name, p.profile_image_url, p.sponsor_id, a.depth + 1
    FROM public.profiles p JOIN ancestors a ON p.id = a.sponsor_id
    WHERE a.depth < 50  -- safety limit
  )
  SELECT ancestors.id, ancestors.display_name, ancestors.profile_image_url
  FROM ancestors ORDER BY depth;
$$;
