-- Patch: show "Introduced to <other>" on introducer's contact history when an intro is sent.
-- Run in Supabase SQL Editor if contact-intro-and-met-via-migration.sql was already applied.

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
SET search_path = public
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

    SELECT
      ('v:' || a.id::text)         AS id,
      'vouch'::text                AS kind,
      ('You vouched (' || a.attestation_type || ')') AS text,
      a.created_at                 AS occurred_at
    FROM public.attestations a
    WHERE a.from_user_id = v_caller_id
      AND a.to_user_id   = p_contact_id

    UNION ALL

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

    UNION ALL

    SELECT
      ('i:' || c.id::text)         AS id,
      'intro'::text                AS kind,
      ('Introduced by ' || COALESCE(pb.display_name, 'Someone')) AS text,
      COALESCE(c.first_met_at, c.met_at, c.created_at) AS occurred_at
    FROM public.contacts c
    LEFT JOIN public.profiles pb ON pb.id = c.introduced_by_user_id
    WHERE c.user_id = v_caller_id
      AND c.contact_id = p_contact_id
      AND c.introduced_by_user_id IS NOT NULL

    UNION ALL

    SELECT
      ('ci:' || ci.id::text)       AS id,
      'intro'::text                AS kind,
      ('Introduced to ' || COALESCE(po.display_name, 'Someone')) AS text,
      ci.created_at                AS occurred_at
    FROM public.contact_intros ci
    JOIN public.profiles po ON po.id = CASE
      WHEN ci.contact_a_id = p_contact_id THEN ci.contact_b_id
      ELSE ci.contact_a_id
    END
    WHERE ci.introducer_id = v_caller_id
      AND (ci.contact_a_id = p_contact_id OR ci.contact_b_id = p_contact_id)
  )
  SELECT events.id, events.kind, events.text, events.occurred_at
  FROM events
  ORDER BY events.occurred_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 6), 1);
END;
$$;
