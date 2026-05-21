-- Vouch types catalog: shared flag, display descriptions, and recipient push for shared vouches.
-- Run in Supabase SQL Editor after web-of-trust-schema.sql.

-- 1. Attestation types reference table
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
ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  shared      = EXCLUDED.shared,
  sort_order  = EXCLUDED.sort_order;

-- Replace inline CHECK with FK so new types can be added via the catalog only.
ALTER TABLE public.attestations
  DROP CONSTRAINT IF EXISTS attestations_attestation_type_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attestations_attestation_type_fkey'
      AND conrelid = 'public.attestations'::regclass
  ) THEN
    ALTER TABLE public.attestations
      ADD CONSTRAINT attestations_attestation_type_fkey
      FOREIGN KEY (attestation_type) REFERENCES public.attestation_types(id);
  END IF;
END $$;


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


-- 3. RPC: create_attestation — validate via catalog; push recipient when shared
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


-- 4. get_contact_history — use catalog descriptions in vouch timeline text
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
      ('You vouched (' || coalesce(at.description, a.attestation_type) || ')') AS text,
      a.created_at                 AS occurred_at
    FROM public.attestations a
    LEFT JOIN public.attestation_types at ON at.id = a.attestation_type
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
