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
--   * mutual attestations count (people who attested to BOTH caller and contact)
--   * profile-picture confirmation count for the contact
--   * vouchers_total = caller's contacts who have attested to this contact
--     (count only; vouchers are kept private from the contact themselves, so we
--     deliberately do NOT return names or avatars)
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
  v_attestations int := 0;
  v_profile_pic_matches int := 0;
  v_vouchers_total int := 0;
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

  -- Mutual attestations (third parties who attested to BOTH).
  SELECT COUNT(DISTINCT a1.from_user_id)
  INTO v_attestations
  FROM public.attestations a1
  JOIN public.attestations a2 ON a1.from_user_id = a2.from_user_id
  WHERE a1.to_user_id = v_caller_id
    AND a2.to_user_id = p_contact_id
    AND a1.from_user_id NOT IN (v_caller_id, p_contact_id);

  -- Distinct people who confirmed the contact's profile picture.
  SELECT COUNT(DISTINCT from_user_id)
  INTO v_profile_pic_matches
  FROM public.attestations
  WHERE to_user_id = p_contact_id
    AND attestation_type = 'profile_picture_accurate';

  -- Vouchers: caller's contacts (other than caller/contact) who have
  -- attested ANY type to p_contact_id. Count only -- the actual identities
  -- of the vouchers are intentionally NOT exposed to the contact themselves.
  SELECT COUNT(DISTINCT a.from_user_id)
  INTO v_vouchers_total
  FROM public.attestations a
  JOIN public.contacts c
    ON c.user_id = v_caller_id AND c.contact_id = a.from_user_id
  WHERE a.to_user_id = p_contact_id
    AND a.from_user_id NOT IN (v_caller_id, p_contact_id);

  -- Have I vouched (any attestation type) for this contact?
  SELECT EXISTS (
    SELECT 1 FROM public.attestations
    WHERE from_user_id = v_caller_id AND to_user_id = p_contact_id
  ) INTO v_have_i_vouched;

  -- Trust score: deterministic, capped at 100. See plan §4.
  v_score := LEAST(100,
      20
    + LEAST(30, v_shared_contacts * 2)
    + LEAST(15, v_shared_groups   * 5)
    + LEAST(20, v_attestations    * 4)
    + LEAST(10, v_vouchers_total  * 2)
    + LEAST( 5, v_profile_pic_matches * 2)
  );

  RETURN json_build_object(
    'score', v_score,
    'shared_contacts', v_shared_contacts,
    'shared_groups', v_shared_groups,
    'attestations', v_attestations,
    'profile_picture_matches', v_profile_pic_matches,
    'vouchers_total', v_vouchers_total,
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
--   vouch   -- attestation rows in either direction (between the two)
--   group   -- groups they both joined (event time = the LATER of the two joins)
--
-- Each row: { id text, kind text, text text, occurred_at timestamptz }.
-- Client formats `occurred_at` for display (formatLastSeen in utils).

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

    -- Vouches in either direction.
    SELECT
      ('v:' || a.id::text)         AS id,
      'vouch'::text                AS kind,
      CASE
        WHEN a.from_user_id = v_caller_id
          THEN 'You vouched (' || a.attestation_type || ')'
        ELSE 'They vouched for you (' || a.attestation_type || ')'
      END                          AS text,
      a.created_at                 AS occurred_at
    FROM public.attestations a
    WHERE
      (a.from_user_id = v_caller_id  AND a.to_user_id = p_contact_id) OR
      (a.from_user_id = p_contact_id AND a.to_user_id = v_caller_id)

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
