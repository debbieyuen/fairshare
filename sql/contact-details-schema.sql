-- Contact Details (Variation A) RPCs for Union
-- Run this in Supabase SQL Editor.
--
-- Adds two RPCs powering the redesigned Contact Details screen:
--   1. get_contact_trust_summary(p_contact_id) -- single-call trust card data + score
--   2. get_contact_history(p_contact_id, p_limit) -- unified "history together" timeline
--
-- Both are SECURITY DEFINER and gated on caller having the target as a contact.

-- =============================================================================
-- 1. get_contact_trust_summary
-- =============================================================================
-- Aggregates trust-card data into a single round trip:
--   * shared contacts / shared groups counts
--   * mutual_vouches = total vouches sent by mutual contacts (people who are
--     contacts of both caller and target) to EITHER caller or target. Counts
--     attestation rows, not distinct attesters, so a mutual who has vouched
--     to both endpoints with multiple types contributes more.
--   * trusted_vouches = total vouches received by the target from mutual
--     contacts to whom the caller has personally sent at least one
--     "I trust you" (attestation_type = 'trust') vouch.
--   * profile-picture confirmation count for the contact
--   * have_i_vouched = caller has any attestation -> this contact (any type)
--   * score = deterministic 0..100 derived from the above; see formula below.

CREATE OR REPLACE FUNCTION public.get_contact_trust_summary(p_contact_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_shared_contacts int := 0;
  v_shared_groups int := 0;
  v_mutual_vouches int := 0;
  v_trusted_vouches int := 0;
  v_profile_pic_matches int := 0;
  v_have_i_vouched boolean := false;
  v_score int := 0;
  v_shared_contacts_list json;
  v_shared_groups_list json;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'You must be logged in';
  END IF;

  IF p_contact_id IS NULL THEN
    RAISE EXCEPTION 'Contact is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.contacts
    WHERE user_id = v_caller_id AND contact_id = p_contact_id
  ) THEN
    RAISE EXCEPTION 'You can only view trust for your contacts';
  END IF;

  -- Shared contacts (mutual contacts excluding the two parties).
  SELECT COUNT(DISTINCT c1.contact_id)
  INTO v_shared_contacts
  FROM public.contacts c1
  JOIN public.contacts c2
    ON c1.contact_id = c2.contact_id
  WHERE c1.user_id = v_caller_id
    AND c2.user_id = p_contact_id
    AND c1.contact_id NOT IN (v_caller_id, p_contact_id);

  -- Shared groups (both active members).
  SELECT COUNT(DISTINCT m1.group_id)
  INTO v_shared_groups
  FROM public.members m1
  JOIN public.members m2 ON m1.group_id = m2.group_id
  WHERE m1.user_id = v_caller_id
    AND m2.user_id = p_contact_id
    AND m1.status = 'active'
    AND m2.status = 'active';

  -- Shared contacts list (id, display_name, profile_image_url) for the
  -- "mutuals" preview/dialog. Capped to keep payload bounded; counts above
  -- remain authoritative for the stat.
  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY lower(t.display_name)), '[]'::json)
  INTO v_shared_contacts_list
  FROM (
    SELECT p.id, p.display_name, p.profile_image_url
    FROM (
      SELECT DISTINCT c1.contact_id AS id
      FROM public.contacts c1
      JOIN public.contacts c2
        ON c1.contact_id = c2.contact_id
      WHERE c1.user_id = v_caller_id
        AND c2.user_id = p_contact_id
        AND c1.contact_id NOT IN (v_caller_id, p_contact_id)
      LIMIT 50
    ) m
    JOIN public.profiles p ON p.id = m.id
  ) t;

  -- Shared groups list (id, name, logo_url). Each is a group both parties
  -- are active members of, so the caller can navigate into it directly.
  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY lower(t.name)), '[]'::json)
  INTO v_shared_groups_list
  FROM (
    SELECT g.id, g.name, g.logo_url
    FROM public.groups g
    WHERE g.id IN (
      SELECT m1.group_id
      FROM public.members m1
      JOIN public.members m2 ON m1.group_id = m2.group_id
      WHERE m1.user_id = v_caller_id
        AND m2.user_id = p_contact_id
        AND m1.status = 'active'
        AND m2.status = 'active'
      LIMIT 50
    )
  ) t;

  -- Mutual Vouches: TOTAL number of attestation rows authored by mutual
  -- contacts (people who are contacts of both caller and target, excluding
  -- the two parties themselves) where the recipient is either the caller
  -- or the target. Counts rows -- a mutual who vouched several times to
  -- both endpoints contributes once per vouch.
  SELECT COUNT(*)
  INTO v_mutual_vouches
  FROM public.attestations a
  WHERE a.to_user_id IN (v_caller_id, p_contact_id)
    AND a.from_user_id NOT IN (v_caller_id, p_contact_id)
    AND a.from_user_id IN (
      SELECT c1.contact_id
      FROM public.contacts c1
      JOIN public.contacts c2 ON c1.contact_id = c2.contact_id
      WHERE c1.user_id = v_caller_id
        AND c2.user_id = p_contact_id
    );

  -- Trusted Vouches: TOTAL number of attestation rows sent to the target
  -- by mutual contacts to whom the caller has personally sent at least
  -- one "I trust you" (attestation_type = 'trust') vouch. This narrows
  -- mutual_vouches to vouches authored by people the caller has
  -- explicitly marked as trusted -- a "trust-weighted" signal.
  SELECT COUNT(*)
  INTO v_trusted_vouches
  FROM public.attestations a
  WHERE a.to_user_id = p_contact_id
    AND a.from_user_id NOT IN (v_caller_id, p_contact_id)
    AND a.from_user_id IN (
      -- Mutual contacts that the caller has sent a 'trust' vouch to.
      SELECT c1.contact_id
      FROM public.contacts c1
      JOIN public.contacts c2 ON c1.contact_id = c2.contact_id
      WHERE c1.user_id = v_caller_id
        AND c2.user_id = p_contact_id
        AND EXISTS (
          SELECT 1 FROM public.attestations t
          WHERE t.from_user_id = v_caller_id
            AND t.to_user_id   = c1.contact_id
            AND t.attestation_type = 'trust'
        )
    );

  -- Distinct people who confirmed the contact's profile picture.
  SELECT COUNT(DISTINCT from_user_id)
  INTO v_profile_pic_matches
  FROM public.attestations
  WHERE to_user_id = p_contact_id
    AND attestation_type = 'profile_picture_accurate';

  -- Have I vouched (any attestation type) for this contact?
  SELECT EXISTS (
    SELECT 1 FROM public.attestations
    WHERE from_user_id = v_caller_id AND to_user_id = p_contact_id
  ) INTO v_have_i_vouched;

  -- Trust score: deterministic, capped at 100.
  --   20 base + 30 (mutual contacts) + 15 (shared groups)
  -- + 20 (mutual vouches, 1 pt each) + 10 (trusted vouches, 2 pts each)
  -- + 5 (profile-pic confirmations, 2 pts each).
  v_score := LEAST(100,
      20
    + LEAST(30, v_shared_contacts   * 2)
    + LEAST(15, v_shared_groups     * 5)
    + LEAST(20, v_mutual_vouches    * 1)
    + LEAST(10, v_trusted_vouches   * 2)
    + LEAST( 5, v_profile_pic_matches * 2)
  );

  RETURN json_build_object(
    'score', v_score,
    'shared_contacts', v_shared_contacts,
    'shared_groups', v_shared_groups,
    'mutual_vouches', v_mutual_vouches,
    'trusted_vouches', v_trusted_vouches,
    'profile_picture_matches', v_profile_pic_matches,
    'have_i_vouched', v_have_i_vouched,
    'shared_contacts_list', v_shared_contacts_list,
    'shared_groups_list', v_shared_groups_list
  );
END;
$$;


-- =============================================================================
-- 2. get_contact_history
-- =============================================================================
-- Returns up to p_limit recent shared events between caller and p_contact_id,
-- ordered most-recent-first. Event kinds:
--   nearby  -- contact_notifications row of type 'nearby_alert' between the two
--   selfie  -- contact_selfies row taken with the contact
--   vouch   -- attestation rows the caller gave TO p_contact_id (one direction
--              only -- vouches received from the contact are intentionally
--              never returned, see Privacy note below)
--   group   -- groups they both joined (event time = the LATER of the two joins)
--
-- Each row: { id text, kind text, text text, occurred_at timestamptz }.
-- Client formats `occurred_at` for display (formatLastSeen in utils).
--
-- Privacy: the integrity of the web of trust depends on a vouch recipient
-- never learning that a particular person vouched for them. We therefore
-- never expose individual rows where to_user_id = caller through any RPC --
-- only aggregate counts (see get_my_attestation_counts). This RPC enforces
-- that by filtering the vouch UNION arm to caller-as-attester only.

CREATE OR REPLACE FUNCTION public.get_contact_history(
  p_contact_id uuid,
  p_limit int DEFAULT 6
)
RETURNS TABLE (
  id text,
  kind text,
  text text,
  occurred_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'You must be logged in';
  END IF;

  IF p_contact_id IS NULL THEN
    RAISE EXCEPTION 'Contact is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.contacts
    WHERE user_id = v_caller_id AND contact_id = p_contact_id
  ) THEN
    RAISE EXCEPTION 'You can only view history for your contacts';
  END IF;

  RETURN QUERY
  WITH events AS (
    -- Nearby alerts in either direction.
    SELECT
      ('n:' || cn.id::text)        AS id,
      'nearby'::text               AS kind,
      CASE
        WHEN cn.location_label IS NOT NULL AND cn.location_label <> ''
          THEN 'Nearby together in ' || cn.location_label
        ELSE 'Nearby together'
      END                          AS text,
      cn.created_at                AS occurred_at
    FROM public.contact_notifications cn
    WHERE cn.notification_type = 'nearby_alert'
      AND (
        (cn.to_user_id = v_caller_id   AND cn.from_user_id = p_contact_id) OR
        (cn.to_user_id = p_contact_id  AND cn.from_user_id = v_caller_id)
      )

    UNION ALL

    -- Selfies the caller took with this contact.
    SELECT
      ('s:' || cs.id::text)        AS id,
      'selfie'::text               AS kind,
      CASE
        WHEN cs.location_label IS NOT NULL AND cs.location_label <> ''
          THEN 'Selfie together in ' || cs.location_label
        ELSE 'Selfie together'
      END                          AS text,
      cs.captured_at               AS occurred_at
    FROM public.contact_selfies cs
    WHERE cs.user_id = v_caller_id AND cs.contact_id = p_contact_id

    UNION ALL

    -- Vouches the caller GAVE to this contact. We deliberately do NOT
    -- include the reverse direction (vouches received from the contact):
    -- exposing those would let a vouch recipient learn who vouched for
    -- them, which breaks the privacy guarantee of the web of trust. Only
    -- aggregate counts of received vouches are ever returned to clients,
    -- via get_my_attestation_counts.
    SELECT
      ('v:' || a.id::text)         AS id,
      'vouch'::text                AS kind,
      ('You vouched (' || a.attestation_type || ')') AS text,
      a.created_at                 AS occurred_at
    FROM public.attestations a
    WHERE a.from_user_id = v_caller_id
      AND a.to_user_id   = p_contact_id

    UNION ALL

    -- Shared groups: event time = LATER of the two join dates.
    SELECT
      ('g:' || g.id::text)         AS id,
      'group'::text                AS kind,
      ('Both in ' || g.name)       AS text,
      GREATEST(m1.joined_at, m2.joined_at) AS occurred_at
    FROM public.members m1
    JOIN public.members m2
      ON m1.group_id = m2.group_id
    JOIN public.groups g
      ON g.id = m1.group_id
    WHERE m1.user_id = v_caller_id
      AND m2.user_id = p_contact_id
      AND m1.status = 'active'
      AND m2.status = 'active'
  )
  SELECT events.id, events.kind, events.text, events.occurred_at
  FROM events
  ORDER BY events.occurred_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 6), 1);
END;
$$;
