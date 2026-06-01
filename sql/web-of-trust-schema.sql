-- Web of Trust: Attestations schema for FairShare
-- Run this in Supabase SQL Editor.

-- 0. Attestation types catalog (display text, shared-with-recipient flag)
CREATE TABLE IF NOT EXISTS public.attestation_types (
  id text PRIMARY KEY,
  description text NOT NULL,
  shared boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0
);

ALTER TABLE public.attestation_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read attestation types" ON public.attestation_types;
CREATE POLICY "Authenticated users can read attestation types"
  ON public.attestation_types FOR SELECT
  USING (auth.uid() IS NOT NULL);

INSERT INTO public.attestation_types (id, description, shared, sort_order) VALUES
  ('profile_picture_accurate', 'Accurate Profile Picture', true,  1),
  ('respect',                  'I respect you',            false, 2),
  ('trust',                    'I trust you',              false, 3),
  ('love',                     'I Love You',               true,  4),
  ('help',                     'I will help you',          false, 5)
ON CONFLICT (id) DO NOTHING;

-- 1. Attestations table
-- Stores individual attestation events. Users can attest multiple times.
-- No SELECT policy exists — individual rows are never readable via the REST API.
CREATE TABLE IF NOT EXISTS public.attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attestation_type text NOT NULL REFERENCES public.attestation_types(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.attestations ENABLE ROW LEVEL SECURITY;

-- Only allow inserts where the caller is the attester and the target is a contact.
-- No SELECT, UPDATE, or DELETE policies — attestations are write-only from the client's perspective.
DROP POLICY IF EXISTS "Users can insert own attestations" ON public.attestations;
CREATE POLICY "Users can insert own attestations"
  ON public.attestations FOR INSERT
  WITH CHECK (
    auth.uid() = from_user_id
    AND from_user_id <> to_user_id
    AND EXISTS (
      SELECT 1 FROM public.contacts
      WHERE user_id = auth.uid() AND contact_id = to_user_id
    )
  );


-- 2. RPC: get_attestation_types
CREATE OR REPLACE FUNCTION public.get_attestation_types()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id',          id,
          'description', description,
          'shared',      shared
        )
        ORDER BY sort_order
      )
      FROM public.attestation_types
    ),
    '[]'::json
  );
END;
$$;

-- 3. RPC: create_attestation
-- SECURITY DEFINER so it bypasses RLS for the insert.
-- Validates that the target is a contact of the caller.
-- Shared types notify the recipient via push.
CREATE OR REPLACE FUNCTION public.create_attestation(
  p_to_user_id uuid,
  p_attestation_type text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_shared boolean;
  v_description text;
  v_name text;
  v_msg text;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'You must be logged in';
  END IF;

  SELECT shared, description
  INTO v_shared, v_description
  FROM public.attestation_types
  WHERE id = p_attestation_type;

  IF v_description IS NULL THEN
    RAISE EXCEPTION 'Invalid attestation type';
  END IF;

  IF v_caller_id = p_to_user_id THEN
    RAISE EXCEPTION 'Cannot attest yourself';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.contacts
    WHERE user_id = v_caller_id AND contact_id = p_to_user_id
  ) THEN
    RAISE EXCEPTION 'You can only attest contacts you have met';
  END IF;

  INSERT INTO public.attestations (from_user_id, to_user_id, attestation_type)
  VALUES (v_caller_id, p_to_user_id, p_attestation_type);

  IF v_shared THEN
    SELECT display_name INTO v_name FROM public.profiles WHERE id = v_caller_id;
    v_msg := coalesce(v_name, 'Someone') || ' says ' || v_description;
    PERFORM public.send_push_to_users(
      ARRAY[p_to_user_id],
      v_caller_id,
      'Union',
      v_msg,
      '/?action=view_contact&contact=' || v_caller_id::text
    );
  END IF;

  RETURN json_build_object('success', true);
END;
$$;


-- 4. RPC: get_my_attestation_counts
-- Returns aggregate vouch/attestation counts for the caller, plus sponsor tree depth.
-- Only aggregate counts are returned — never individual attestation details.
CREATE OR REPLACE FUNCTION public.get_my_attestation_counts()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_love_count int;
  v_trust_count int;
  v_respect_count int;
  v_help_count int;
  v_profile_picture_count int;
  v_sponsored_direct int;
  v_sponsored_indirect int;
BEGIN
  SELECT COUNT(DISTINCT from_user_id) INTO v_love_count
  FROM public.attestations
  WHERE to_user_id = v_caller_id AND attestation_type = 'love';

  SELECT COUNT(DISTINCT from_user_id) INTO v_trust_count
  FROM public.attestations
  WHERE to_user_id = v_caller_id AND attestation_type = 'trust';

  SELECT COUNT(DISTINCT from_user_id) INTO v_respect_count
  FROM public.attestations
  WHERE to_user_id = v_caller_id AND attestation_type = 'respect';

  SELECT COUNT(DISTINCT from_user_id) INTO v_help_count
  FROM public.attestations
  WHERE to_user_id = v_caller_id AND attestation_type = 'help';

  SELECT COUNT(DISTINCT from_user_id) INTO v_profile_picture_count
  FROM public.attestations
  WHERE to_user_id = v_caller_id AND attestation_type = 'profile_picture_accurate';

  -- Direct sponsors: simple count of profiles pointing directly at the caller.
  SELECT COUNT(*) INTO v_sponsored_direct
  FROM public.profiles
  WHERE sponsor_id = v_caller_id;

  -- Full sponsor subtree using UNION (not UNION ALL) so each profile is
  -- visited at most once, preventing cycles and duplicate counts.
  -- Subtract the direct tier to get the indirect total.
  WITH RECURSIVE descendants AS (
    SELECT id
    FROM public.profiles
    WHERE sponsor_id = v_caller_id
    UNION
    SELECT p.id
    FROM public.profiles p
    JOIN descendants d ON p.sponsor_id = d.id
  )
  SELECT GREATEST(COUNT(*) - v_sponsored_direct, 0)
  INTO v_sponsored_indirect
  FROM descendants;

  RETURN json_build_object(
    'love_count',            COALESCE(v_love_count, 0),
    'trust_count',           COALESCE(v_trust_count, 0),
    'respect_count',         COALESCE(v_respect_count, 0),
    'help_count',            COALESCE(v_help_count, 0),
    'profile_picture_count', COALESCE(v_profile_picture_count, 0),
    'sponsored_direct',      COALESCE(v_sponsored_direct, 0),
    'sponsored_indirect',    COALESCE(v_sponsored_indirect, 0)
  );
END;
$$;

-- 5. RPC: get_shared_attesters_count
-- Returns number of distinct "other people" who have attested to both caller and p_contact_id.
CREATE OR REPLACE FUNCTION public.get_shared_attesters_count(p_contact_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_count integer := 0;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'You must be logged in';
  END IF;

  IF p_contact_id IS NULL THEN
    RAISE EXCEPTION 'Contact is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.contacts
    WHERE user_id = v_caller_id
      AND contact_id = p_contact_id
  ) THEN
    RAISE EXCEPTION 'You can only view shared trust for your contacts';
  END IF;

  SELECT COUNT(DISTINCT a1.from_user_id)
  INTO v_count
  FROM public.attestations a1
  JOIN public.attestations a2
    ON a1.from_user_id = a2.from_user_id
  WHERE a1.to_user_id = v_caller_id
    AND a2.to_user_id = p_contact_id
    AND a1.from_user_id NOT IN (v_caller_id, p_contact_id);

  RETURN COALESCE(v_count, 0);
END;
$$;

-- 6. RPC: get_profile_picture_attesters_count
-- Returns number of distinct people who attested that the contact's profile picture is accurate.
CREATE OR REPLACE FUNCTION public.get_profile_picture_attesters_count(p_contact_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_count integer := 0;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'You must be logged in';
  END IF;

  IF p_contact_id IS NULL THEN
    RAISE EXCEPTION 'Contact is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.contacts
    WHERE user_id = v_caller_id
      AND contact_id = p_contact_id
  ) THEN
    RAISE EXCEPTION 'You can only view trust for your contacts';
  END IF;

  SELECT COUNT(DISTINCT from_user_id)
  INTO v_count
  FROM public.attestations
  WHERE to_user_id = p_contact_id
    AND attestation_type = 'profile_picture_accurate';

  RETURN COALESCE(v_count, 0);
END;
$$;
