-- Sponsor ID at Signup migration for FairShare
-- Run this in Supabase SQL Editor.
--
-- Goal: ensure every new account has a non-NULL sponsor_id atomically with
-- account creation, and enforce that any given handshake (meet or invite
-- token) can be used to create at most one account.
--
-- How it works: the signup form embeds the sponsor token in the Supabase
-- auth user_metadata (raw_user_meta_data->>'meet_token' or 'invite_token').
-- The handle_new_user() trigger looks up the sponsor from that token at
-- INSERT time on auth.users, sets profiles.sponsor_id, and writes the token
-- into profiles.signup_token. A UNIQUE constraint on profiles.signup_token
-- means a second signup with the same token raises a constraint violation,
-- which rolls back the entire auth.users insert and rejects the signup.
--
-- This decouples sponsor assignment from the post-login claim flow, which
-- previously failed silently when the user confirmed email or logged in from
-- a different browser/origin than where they clicked the handshake link
-- (e.g. clicked the link in mobile Safari but logged in via the iOS app, or
-- vice versa - the two have different localStorage origins). complete_meet
-- and claim_sponsorship still run post-login to do the membership and
-- contact side effects; they are unchanged.


-- 1. Add signup_token column to profiles. Nullable so demo / admin signups
--    without a token (e.g. App Review demo account) are unaffected; Postgres
--    treats multiple NULLs in a UNIQUE column as distinct.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signup_token text UNIQUE;


-- 2. Replace handle_new_user() so the trigger:
--    - Reads meet_token / invite_token from raw_user_meta_data
--    - Looks up the sponsor (rejecting expired / already-consumed tokens)
--    - Rejects a duplicate signup_token with a friendly message before
--      hitting the UNIQUE index (which is the actual structural guard)
--    - INSERTs profile with sponsor_id and signup_token populated
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_meet_token   text := new.raw_user_meta_data->>'meet_token';
  v_invite_token text := new.raw_user_meta_data->>'invite_token';
  v_token        text;
  v_sponsor_id   uuid;
BEGIN
  IF v_meet_token IS NOT NULL THEN
    SELECT user_id INTO v_sponsor_id
    FROM public.meet_requests
    WHERE token = v_meet_token
      AND expires_at > now()
      AND used_by IS NULL;
    IF v_sponsor_id IS NULL THEN
      RAISE EXCEPTION 'Handshake link is invalid, expired, or already used';
    END IF;
    -- Friendly message for the common race; the UNIQUE index is the actual guard.
    IF EXISTS (SELECT 1 FROM public.profiles WHERE signup_token = v_meet_token) THEN
      RAISE EXCEPTION 'This handshake has already been used to create an account';
    END IF;
    v_token := v_meet_token;
  ELSIF v_invite_token IS NOT NULL THEN
    SELECT sponsor_id INTO v_sponsor_id
    FROM public.sponsorships
    WHERE token = v_invite_token
      AND status = 'pending'
      AND expires_at > now();
    IF v_sponsor_id IS NULL THEN
      RAISE EXCEPTION 'Invitation is invalid, expired, or already used';
    END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE signup_token = v_invite_token) THEN
      RAISE EXCEPTION 'This invitation has already been used to create an account';
    END IF;
    v_token := v_invite_token;
  END IF;

  INSERT INTO public.profiles (id, display_name, sponsor_id, signup_token)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    v_sponsor_id,
    v_token
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. (Optional, run separately) Backfill existing orphaned profiles whose
--    sponsor_id is NULL because they signed up before this migration.
--    The query below surfaces every NULL-sponsor profile alongside any
--    handshake metadata that may still be on the auth user; for each one,
--    decide on the right sponsor and run the per-user UPDATE / INSERT
--    block underneath (replacing the placeholder UUIDs).
--
-- SELECT p.id, p.display_name, p.created_at, u.email,
--        u.raw_user_meta_data->>'meet_token'   AS meet_token,
--        u.raw_user_meta_data->>'invite_token' AS invite_token,
--        (SELECT user_id FROM public.meet_requests
--           WHERE token = u.raw_user_meta_data->>'meet_token') AS meet_sponsor,
--        (SELECT sponsor_id FROM public.sponsorships
--           WHERE token = u.raw_user_meta_data->>'invite_token') AS invite_sponsor
-- FROM public.profiles p
-- JOIN auth.users u ON u.id = p.id
-- WHERE p.sponsor_id IS NULL
--   AND p.id <> 'a8253eea-e76a-46d1-a92d-6fe36911f038'
-- ORDER BY p.created_at DESC;
--
-- -- Per-user patch (replace the UUIDs with the real values from above):
-- UPDATE public.profiles
--   SET sponsor_id = '<sponsor uuid>'
-- WHERE id = '<orphan uuid>';
--
-- INSERT INTO public.contacts (user_id, contact_id, met_at)
-- VALUES ('<orphan uuid>',  '<sponsor uuid>', now()),
--        ('<sponsor uuid>', '<orphan uuid>',  now())
-- ON CONFLICT (user_id, contact_id) DO NOTHING;


-- 4. (Future, DO NOT RUN YET) Enforce NOT NULL on profiles.sponsor_id and
--    have the trigger reject signups without a valid handshake token.
--    Ship this only after the Part 1 / 2 changes above have been live for a
--    release cycle and we are confident every new signup picks up a sponsor.
--    Running this prematurely will hard-fail any in-flight or demo signups
--    that don't carry a token, and will reject any pre-existing NULL row.
--
--    Steps when ready:
--    a) Confirm no remaining orphaned profiles:
--         SELECT count(*) FROM public.profiles
--          WHERE sponsor_id IS NULL
--            AND id <> 'a8253eea-e76a-46d1-a92d-6fe36911f038';
--       (Backfill any remaining via the queries in section 3.)
--
--    b) Add the NOT NULL constraint:
--         ALTER TABLE public.profiles
--           ALTER COLUMN sponsor_id SET NOT NULL;
--
--    c) (Optional) Tighten the trigger so it raises when no token is present
--       (any account creation without a valid handshake will fail). Replace
--       the trigger body with one that adds:
--         IF v_sponsor_id IS NULL THEN
--           RAISE EXCEPTION 'Sign-up requires a valid sponsor handshake link';
--         END IF;
--       just before the INSERT. Demo / admin accounts must then be created
--       via the Supabase admin API or a temporary bypass.
