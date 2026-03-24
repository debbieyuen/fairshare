-- ============================================================
-- Admin RPCs for FairShare
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- Admin UUID — the only user allowed to call these functions
-- Philip Rosedale: a8253eea-e76a-46d1-a92d-6fe36911f038

-- Delete a profile (and its auth user) by display_name.
-- Many tables reference profiles(id) without ON DELETE CASCADE,
-- so we clean those up explicitly before deleting the auth user
-- (which cascades to profiles, members, contacts, endorsements, votes).
create or replace function public.admin_delete_profile(p_display_name text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_admin_id uuid := 'a8253eea-e76a-46d1-a92d-6fe36911f038';
  v_target_id uuid;
  v_target_name text;
begin
  if auth.uid() is null or auth.uid() != v_admin_id then
    raise exception 'Unauthorized: admin access required';
  end if;

  select id, display_name into v_target_id, v_target_name
    from public.profiles
   where display_name = p_display_name;

  if v_target_id is null then
    return jsonb_build_object('error', 'No profile found with display_name: ' || p_display_name);
  end if;

  if v_target_id = v_admin_id then
    return jsonb_build_object('error', 'Cannot delete the admin account');
  end if;

  -- Clean up non-cascading FK references to profiles(id) / auth.users(id).
  -- Nullable columns: set to NULL.  NOT NULL columns: delete the row.
  update public.profiles        set sponsor_id  = null where sponsor_id  = v_target_id;
  update public.groups          set created_by  = null where created_by  = v_target_id;
  update public.group_events    set actor_id    = null where actor_id    = v_target_id;
  update public.group_documents set updated_by  = null where updated_by  = v_target_id;
  update public.sponsorships    set candidate_id = null where candidate_id = v_target_id;
  update public.transactions    set from_user   = null where from_user   = v_target_id;
  update public.meet_requests   set used_by     = null where used_by     = v_target_id;

  delete from public.transactions     where to_user     = v_target_id;
  delete from public.sponsorships     where sponsor_id  = v_target_id;
  delete from public.amendments       where proposed_by = v_target_id;
  delete from public.amendment_votes  where user_id     = v_target_id;
  delete from public.chat_messages    where user_id     = v_target_id;
  delete from public.document_history where user_id     = v_target_id;

  -- Now safe to delete the auth user; cascades to profiles, members,
  -- contacts, endorsements, votes, attestations, push_subscriptions, etc.
  delete from auth.users where id = v_target_id;

  return jsonb_build_object(
    'success', true,
    'deleted_id', v_target_id,
    'deleted_name', v_target_name
  );
end;
$$;

-- Delete a group by name.
-- Cascade handles: members, transactions, endorsements,
-- sponsorships, amendments, chat_messages, group_documents, etc.
create or replace function public.admin_delete_group(p_group_name text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_admin_id uuid := 'a8253eea-e76a-46d1-a92d-6fe36911f038';
  v_target_id uuid;
  v_target_name text;
begin
  if auth.uid() is null or auth.uid() != v_admin_id then
    raise exception 'Unauthorized: admin access required';
  end if;

  select id, name into v_target_id, v_target_name
    from public.groups
   where name = p_group_name;

  if v_target_id is null then
    return jsonb_build_object('error', 'No group found with name: ' || p_group_name);
  end if;

  delete from public.groups where id = v_target_id;

  return jsonb_build_object(
    'success', true,
    'deleted_id', v_target_id,
    'deleted_name', v_target_name
  );
end;
$$;
