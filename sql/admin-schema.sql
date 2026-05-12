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

-- Look up an account by email (reads auth.users, which clients can't query directly).
-- Returns the matching profile info + group membership count for the admin UI preview.
create or replace function public.admin_lookup_account_by_email(p_email text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_admin_id uuid := 'a8253eea-e76a-46d1-a92d-6fe36911f038';
  v_target_id uuid;
  v_target_email text;
  v_display_name text;
  v_created_at timestamptz;
  v_group_count int;
begin
  if auth.uid() is null or auth.uid() != v_admin_id then
    raise exception 'Unauthorized: admin access required';
  end if;

  select id, email into v_target_id, v_target_email
    from auth.users
   where lower(email) = lower(trim(p_email));

  if v_target_id is null then
    return jsonb_build_object('error', 'No account found with email: ' || p_email);
  end if;

  select display_name, created_at into v_display_name, v_created_at
    from public.profiles
   where id = v_target_id;

  select count(*) into v_group_count
    from public.members
   where user_id = v_target_id and status in ('active', 'pending');

  return jsonb_build_object(
    'id', v_target_id,
    'email', v_target_email,
    'display_name', v_display_name,
    'created_at', v_created_at,
    'group_count', v_group_count
  );
end;
$$;

-- Resolve a user from a single pasted value: UUID, email, or exact display_name.
create or replace function public.admin_lookup_user(p_query text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := 'a8253eea-e76a-46d1-a92d-6fe36911f038';
  v_q text := trim(p_query);
  v_target_id uuid;
  v_target_email text;
  v_display_name text;
  v_sponsor_name text;
  v_contact_count int;
  v_profile_count int;
begin
  if auth.uid() is null or auth.uid() != v_admin_id then
    raise exception 'Unauthorized: admin access required';
  end if;

  if v_q = '' then
    return jsonb_build_object('error', 'Enter a display name, email, or user ID.');
  end if;

  -- 1) User ID (UUID)
  if v_q ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    begin
      select u.id, u.email into v_target_id, v_target_email
        from auth.users u
       where u.id = v_q::uuid;
    exception when invalid_text_representation then
      v_target_id := null;
      v_target_email := null;
    end;
  end if;

  -- 2) Email
  if v_target_id is null and position('@' in v_q) > 0 then
    select u.id, u.email into v_target_id, v_target_email
      from auth.users u
     where lower(u.email) = lower(v_q);
  end if;

  -- 3) Exact display name
  if v_target_id is null then
    select count(*)::int into v_profile_count
      from public.profiles p
     where p.display_name = v_q;

    if v_profile_count > 1 then
      return jsonb_build_object(
        'error',
        'Multiple accounts share that display name; use email or user ID instead.'
      );
    end if;

    if v_profile_count = 1 then
      select p.id into v_target_id
        from public.profiles p
       where p.display_name = v_q;

      select u.email into v_target_email
        from auth.users u
       where u.id = v_target_id;
    end if;
  end if;

  if v_target_id is null then
    return jsonb_build_object('error', 'No user found matching: ' || v_q);
  end if;

  select p.display_name, s.display_name
    into v_display_name, v_sponsor_name
    from public.profiles p
    left join public.profiles s on s.id = p.sponsor_id
   where p.id = v_target_id;

  select count(*)::int into v_contact_count
    from public.contacts c
   where c.user_id = v_target_id;

  return jsonb_build_object(
    'id', v_target_id,
    'email', coalesce(v_target_email, ''),
    'display_name', v_display_name,
    'sponsor_name', v_sponsor_name,
    'contact_count', coalesce(v_contact_count, 0)
  );
end;
$$;

-- Delete an account (and its auth user) by email.
-- Mirrors admin_delete_profile but keys off auth.users.email instead of profile display_name.
create or replace function public.admin_delete_account_by_email(p_email text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_admin_id uuid := 'a8253eea-e76a-46d1-a92d-6fe36911f038';
  v_target_id uuid;
  v_target_email text;
  v_target_name text;
begin
  if auth.uid() is null or auth.uid() != v_admin_id then
    raise exception 'Unauthorized: admin access required';
  end if;

  select id, email into v_target_id, v_target_email
    from auth.users
   where lower(email) = lower(trim(p_email));

  if v_target_id is null then
    return jsonb_build_object('error', 'No account found with email: ' || p_email);
  end if;

  if v_target_id = v_admin_id then
    return jsonb_build_object('error', 'Cannot delete the admin account');
  end if;

  select display_name into v_target_name
    from public.profiles
   where id = v_target_id;

  -- Same non-cascading FK cleanup as admin_delete_profile.
  update public.profiles        set sponsor_id   = null where sponsor_id   = v_target_id;
  update public.groups          set created_by   = null where created_by   = v_target_id;
  update public.group_events    set actor_id     = null where actor_id     = v_target_id;
  update public.group_documents set updated_by   = null where updated_by   = v_target_id;
  update public.sponsorships    set candidate_id = null where candidate_id = v_target_id;
  update public.transactions    set from_user    = null where from_user    = v_target_id;
  update public.meet_requests   set used_by      = null where used_by      = v_target_id;

  delete from public.transactions     where to_user     = v_target_id;
  delete from public.sponsorships     where sponsor_id  = v_target_id;
  delete from public.amendments       where proposed_by = v_target_id;
  delete from public.amendment_votes  where user_id     = v_target_id;
  delete from public.chat_messages    where user_id     = v_target_id;
  delete from public.document_history where user_id     = v_target_id;

  delete from auth.users where id = v_target_id;

  return jsonb_build_object(
    'success', true,
    'deleted_id', v_target_id,
    'deleted_email', v_target_email,
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

-- Summary metrics for the admin dashboard (rolling: last week = 7 days, last day = 24 hours, UTC).
create or replace function public.admin_get_summary_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := 'a8253eea-e76a-46d1-a92d-6fe36911f038';
  t0 timestamptz := now();
  t_week timestamptz := t0 - interval '7 days';
  t_day timestamptz := t0 - interval '1 day';
begin
  if auth.uid() is null or auth.uid() != v_admin_id then
    raise exception 'Unauthorized: admin access required';
  end if;

  return jsonb_build_object(
    'people', jsonb_build_object(
      'total', (select count(*)::int from public.profiles),
      'week', (select count(*)::int from public.profiles p where p.created_at >= t_week),
      'day', (select count(*)::int from public.profiles p where p.created_at >= t_day)
    ),
    'newPeople', jsonb_build_object(
      'total', (select count(*)::int from public.contacts c where c.user_id < c.contact_id),
      'week', (select count(*)::int from public.contacts c
               where c.user_id < c.contact_id
                 and coalesce(c.created_at, c.met_at) >= t_week),
      'day', (select count(*)::int from public.contacts c
              where c.user_id < c.contact_id
                and coalesce(c.created_at, c.met_at) >= t_day)
    ),
    'vouches', jsonb_build_object(
      'total', (select count(*)::int from public.attestations),
      'week', (select count(*)::int from public.attestations a where a.created_at >= t_week),
      'day', (select count(*)::int from public.attestations a where a.created_at >= t_day)
    ),
    'selfies', jsonb_build_object(
      'total', (select count(*)::int from public.contact_selfies s where s.user_id < s.contact_id),
      'week', (select count(*)::int from public.contact_selfies s
               where s.user_id < s.contact_id and s.created_at >= t_week),
      'day', (select count(*)::int from public.contact_selfies s
              where s.user_id < s.contact_id and s.created_at >= t_day)
    ),
    'suggestPic', jsonb_build_object(
      'total', (select count(*)::int from public.contact_notifications n
                where n.notification_type = 'profile_picture_suggested'),
      'week', (select count(*)::int from public.contact_notifications n
               where n.notification_type = 'profile_picture_suggested' and n.created_at >= t_week),
      'day', (select count(*)::int from public.contact_notifications n
              where n.notification_type = 'profile_picture_suggested' and n.created_at >= t_day)
    ),
    'locationShares', jsonb_build_object(
      'total', (select count(*)::int from public.location_shares),
      'week', (select count(*)::int from public.location_shares ls where ls.started_at >= t_week),
      'day', (select count(*)::int from public.location_shares ls where ls.started_at >= t_day)
    ),
    'notifyNearby', jsonb_build_object(
      'total', (select count(*)::int from public.contacts c where c.notify_nearby = true),
      'week', (select count(*)::int from public.contact_notifications n
               where n.notification_type = 'nearby_alert' and n.created_at >= t_week),
      'day', (select count(*)::int from public.contact_notifications n
              where n.notification_type = 'nearby_alert' and n.created_at >= t_day)
    )
  );
end;
$$;

grant execute on function public.admin_get_summary_stats() to authenticated;
grant execute on function public.admin_lookup_user(text) to authenticated;
