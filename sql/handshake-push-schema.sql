-- Handshake push notification schema for FairShare
-- Run this in Supabase SQL Editor.
--
-- Goal: when a contact connects with you via your handshake QR / meet link
-- (whether they're a brand-new signup or an existing user), send a push
-- notification to you (the QR holder). Previously complete_meet only
-- inserted the bidirectional contacts row, so the issuer learned about
-- the connection only via Realtime while the meet overlay was open or
-- via subscribeToContactEvents in auth.js (foreground only). Backgrounded
-- or terminated apps got nothing because no push was being emitted.
--
-- This migration:
--   1. Adds 'new_contact' to the contact_notifications.notification_type
--      CHECK constraint, so we can write a row of that type.
--   2. Replaces complete_meet to insert a contact_notifications row and
--      call send_push_to_users for the meet issuer. Push delivery uses
--      the same APNs / Web Push plumbing as every other notification in
--      the app, which is configured for alert-style delivery so iOS
--      shows a banner even when the app is backgrounded or terminated.
--   3. Differentiates the message slightly when the caller signed up via
--      this exact handshake token (signup_token = p_token, set by
--      handle_new_user), so the issuer sees "X just joined FairShare via
--      your handshake" rather than the generic "X is now your contact".


-- 1. Allow 'new_contact' notification_type.
--    The constraint has been replaced multiple times across previous
--    migrations (nearby-schema.sql, location-sharing-schema.sql), so we
--    drop and re-create with the full superset to keep the DB consistent.
ALTER TABLE public.contact_notifications
  DROP CONSTRAINT IF EXISTS contact_notifications_notification_type_check;

ALTER TABLE public.contact_notifications
  ADD CONSTRAINT contact_notifications_notification_type_check
  CHECK (notification_type IN (
    'profile_picture_updated',
    'profile_updated',
    'met_date_set',
    'profile_picture_suggested',
    'nearby_alert',
    'new_selfie',
    'location_share_started',
    'new_contact',
    'display_name_changed'
  ));


-- 2. Replace complete_meet so it sends a push to the meet issuer.
CREATE OR REPLACE FUNCTION public.complete_meet(p_token text)
RETURNS json AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_meet_request record;
  v_contact_name text;
  v_caller_name text;
  v_caller_signup_token text;
  v_caller_sponsor uuid;
  v_group_name text;
  v_admitted boolean;
  v_is_new_account boolean;
  v_push_msg text;
BEGIN
  -- Look up the meet request by token, locking the row so a concurrent
  -- call cannot also pass the used_by check before we mark it used.
  SELECT * INTO v_meet_request
  FROM public.meet_requests
  WHERE token = p_token
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meet request not found or expired';
  END IF;

  IF v_meet_request.used_by IS NOT NULL THEN
    RAISE EXCEPTION 'This meet link has already been used';
  END IF;

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

  -- Other person's name (the issuer, used in the return JSON)
  SELECT display_name INTO v_contact_name
  FROM public.profiles
  WHERE id = v_meet_request.user_id;

  -- Caller's name + whether they signed up via this exact handshake.
  -- handle_new_user() stamps profiles.signup_token = meet_token at signup.
  SELECT display_name, signup_token
    INTO v_caller_name, v_caller_signup_token
  FROM public.profiles
  WHERE id = v_caller_id;

  v_is_new_account := (v_caller_signup_token IS NOT NULL
                       AND v_caller_signup_token = p_token);

  v_push_msg := COALESCE(v_caller_name, 'Someone')
              || CASE
                   WHEN v_is_new_account
                     THEN ' just joined FairShare via your handshake.'
                   ELSE ' is now your contact.'
                 END;

  -- Notify the meet issuer (the QR holder). Inserting into
  -- contact_notifications gives us a Realtime in-app toast when the
  -- issuer is foregrounded; send_push_to_users delivers an APNs alert
  -- (and Web Push) so they also get a banner when backgrounded /
  -- terminated. Excludes the actor automatically.
  INSERT INTO public.contact_notifications
    (to_user_id, from_user_id, notification_type, message)
  VALUES
    (v_meet_request.user_id, v_caller_id, 'new_contact', v_push_msg);

  PERFORM public.send_push_to_users(
    ARRAY[v_meet_request.user_id],
    v_caller_id,
    'FairShare',
    v_push_msg,
    '/?action=view_contact&contact=' || v_caller_id::text
  );

  -- If this meet carries group context, also perform sponsorship
  IF v_meet_request.group_id IS NOT NULL THEN

    IF EXISTS (
      SELECT 1 FROM public.members
      WHERE group_id = v_meet_request.group_id
        AND user_id = v_caller_id
        AND status IN ('active', 'pending')
    ) THEN
      RAISE EXCEPTION 'You are already a member or pending candidate of this group';
    END IF;

    INSERT INTO public.members (group_id, user_id, status, balance)
    VALUES (v_meet_request.group_id, v_caller_id, 'pending', 0);

    INSERT INTO public.group_events (group_id, event_type, summary, actor_id, metadata)
    VALUES (
      v_meet_request.group_id,
      'member_sponsored',
      'New candidate '
        || (SELECT display_name FROM public.profiles WHERE id = v_caller_id)
        || ', sponsored by '
        || COALESCE(v_contact_name, 'Unknown'),
      v_meet_request.user_id,
      json_build_object('sponsor_id', v_meet_request.user_id, 'candidate_id', v_caller_id)::jsonb
    );

    INSERT INTO public.endorsements (group_id, candidate_id, endorser_id)
    VALUES (v_meet_request.group_id, v_caller_id, v_meet_request.user_id);

    PERFORM public.check_endorsements(v_meet_request.group_id, v_caller_id);

    SELECT name INTO v_group_name
    FROM public.groups WHERE id = v_meet_request.group_id;

    SELECT (status = 'active') INTO v_admitted
    FROM public.members
    WHERE group_id = v_meet_request.group_id AND user_id = v_caller_id;

    RETURN json_build_object(
      'contact_id', v_meet_request.user_id,
      'contact_name', COALESCE(v_contact_name, 'Unknown'),
      'group_id', v_meet_request.group_id,
      'group_name', v_group_name,
      'admitted', COALESCE(v_admitted, false)
    );
  END IF;

  RETURN json_build_object(
    'contact_id', v_meet_request.user_id,
    'contact_name', COALESCE(v_contact_name, 'Unknown')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
