-- ============================================================
-- User-initiated account deletion (Apple Guideline 5.1.1(v))
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================
--
-- Lets a signed-in user permanently delete their own auth user and
-- all associated profile data. Mirrors the admin_delete_* family in
-- admin-schema.sql but requires no admin: it only deletes the row
-- belonging to auth.uid().
--
-- Many tables reference profiles(id) without ON DELETE CASCADE, so
-- we explicitly NULL nullable references and DELETE rows in NOT NULL
-- columns before removing the auth user (which cascades to profiles
-- and the rest).
--
-- This is exposed to the `authenticated` role only. There is no way
-- for an unauthenticated client to call it, and a malicious client
-- can only delete their own data.

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_display_name text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Pull a couple of identifying fields so we can return them in the
  -- success payload (useful for client-side toasts / logging).
  select email into v_email from auth.users where id = v_user_id;
  select display_name into v_display_name from public.profiles where id = v_user_id;

  -- Same non-cascading FK cleanup the admin RPCs do. Keep this list
  -- in sync with sql/admin-schema.sql admin_delete_account_by_email.
  update public.profiles        set sponsor_id   = null where sponsor_id   = v_user_id;
  update public.groups          set created_by   = null where created_by   = v_user_id;
  update public.group_events    set actor_id     = null where actor_id     = v_user_id;
  update public.group_documents set updated_by   = null where updated_by   = v_user_id;
  update public.sponsorships    set candidate_id = null where candidate_id = v_user_id;
  update public.transactions    set from_user    = null where from_user    = v_user_id;
  update public.meet_requests   set used_by      = null where used_by      = v_user_id;

  delete from public.transactions     where to_user     = v_user_id;
  delete from public.sponsorships     where sponsor_id  = v_user_id;
  delete from public.amendments       where proposed_by = v_user_id;
  delete from public.amendment_votes  where user_id     = v_user_id;
  delete from public.chat_messages    where user_id     = v_user_id;
  delete from public.document_history where user_id     = v_user_id;

  -- auth.users delete cascades to profiles, members, contacts,
  -- endorsements, votes, attestations, push_subscriptions, etc.
  delete from auth.users where id = v_user_id;

  return jsonb_build_object(
    'success', true,
    'deleted_id', v_user_id,
    'deleted_email', v_email,
    'deleted_name', v_display_name
  );
end;
$$;

-- Anyone who is signed in can call this; it will only ever touch their
-- own row because it keys off auth.uid().
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
