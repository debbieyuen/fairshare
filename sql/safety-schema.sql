-- ============================================================
-- User safety: Report content + Block users
-- (Apple Guideline 1.2 — Safety / User-Generated Content)
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================
--
-- Two backing tables:
--
--   reports        — content reports filed by one user about another
--                    (chat message, profile photo, group logo, selfie, profile)
--   blocked_users  — directional block: blocker no longer sees blocked
--
-- Plus a small set of RPCs the iOS / web client calls:
--
--   report_content(target_user_id, content_type, content_id, reason)
--   block_user(target_user_id)
--   unblock_user(target_user_id)
--   list_blocked_users()
--
-- All RPCs are SECURITY DEFINER and key off auth.uid(), so an
-- unauthenticated client can't call them and a malicious client can
-- only file reports / blocks as themselves.
--
-- Apple cares that:
--   1. Users can flag objectionable content   -> reports table
--   2. Users can block another user           -> blocked_users table
--   3. Reports are acted on within 24 hours   -> separate ops process
--      (reviewed via the admin panel; we surface only the data here)

-- ----- reports ------------------------------------------------

create table if not exists public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid references auth.users(id) on delete set null,
  content_type    text not null check (content_type in (
                    'profile', 'profile_photo', 'chat_message', 'group_logo',
                    'group_name', 'selfie', 'display_name', 'other'
                  )),
  content_id      text,                 -- e.g. chat_messages.id, group_id, contact_id
  reason          text not null check (char_length(reason) between 1 and 2000),
  status          text not null default 'open'
                  check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  resolution_note text,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);

create index if not exists reports_reporter_idx       on public.reports(reporter_id);
create index if not exists reports_reported_user_idx  on public.reports(reported_user_id);
create index if not exists reports_status_idx         on public.reports(status, created_at desc);

alter table public.reports enable row level security;

-- Users can only see their own filed reports.
drop policy if exists reports_select_own on public.reports;
create policy reports_select_own on public.reports
  for select to authenticated
  using (reporter_id = auth.uid());

-- All inserts go through the report_content() RPC, which validates
-- content_type / target. We deliberately do NOT grant direct INSERT
-- to authenticated, to keep the validation in one place.
revoke insert, update, delete on public.reports from authenticated;

-- ----- blocked_users ------------------------------------------

create table if not exists public.blocked_users (
  blocker_id  uuid not null references auth.users(id) on delete cascade,
  blocked_id  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists blocked_users_blocker_idx on public.blocked_users(blocker_id);
create index if not exists blocked_users_blocked_idx on public.blocked_users(blocked_id);

alter table public.blocked_users enable row level security;

drop policy if exists blocked_users_select_own on public.blocked_users;
create policy blocked_users_select_own on public.blocked_users
  for select to authenticated
  using (blocker_id = auth.uid());

revoke insert, update, delete on public.blocked_users from authenticated;

-- ----- RPCs ---------------------------------------------------

create or replace function public.report_content(
  p_reported_user_id uuid,
  p_content_type     text,
  p_content_id       text,
  p_reason           text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_report_id uuid;
  v_clean_reason text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_clean_reason := trim(coalesce(p_reason, ''));
  if length(v_clean_reason) = 0 then
    return jsonb_build_object('error', 'A reason is required');
  end if;
  if length(v_clean_reason) > 2000 then
    v_clean_reason := substring(v_clean_reason from 1 for 2000);
  end if;

  if p_content_type is null or p_content_type not in (
    'profile', 'profile_photo', 'chat_message', 'group_logo',
    'group_name', 'selfie', 'display_name', 'other'
  ) then
    return jsonb_build_object('error', 'Invalid content type');
  end if;

  -- Don't allow reporting yourself; that's never useful and would let
  -- a user spam their own reports row.
  if p_reported_user_id is not null and p_reported_user_id = v_user_id then
    return jsonb_build_object('error', 'You cannot report yourself');
  end if;

  insert into public.reports (
    reporter_id, reported_user_id, content_type, content_id, reason
  ) values (
    v_user_id, p_reported_user_id, p_content_type, p_content_id, v_clean_reason
  )
  returning id into v_report_id;

  return jsonb_build_object('success', true, 'report_id', v_report_id);
end;
$$;

revoke all on function public.report_content(uuid, text, text, text) from public;
grant execute on function public.report_content(uuid, text, text, text) to authenticated;


create or replace function public.block_user(p_target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if p_target_id is null then
    return jsonb_build_object('error', 'Missing target user id');
  end if;
  if p_target_id = v_user_id then
    return jsonb_build_object('error', 'You cannot block yourself');
  end if;

  insert into public.blocked_users (blocker_id, blocked_id)
       values (v_user_id, p_target_id)
  on conflict (blocker_id, blocked_id) do nothing;

  -- Drop the relationship from the contact list (both directions),
  -- so the blocked user no longer appears in lists, nearby, globe,
  -- selfies, etc. The contacts table cascades from auth.users; we
  -- delete the rows directly because the user themselves still
  -- exists.
  delete from public.contacts
   where (user_id = v_user_id and contact_id = p_target_id)
      or (user_id = p_target_id and contact_id = v_user_id);

  -- Likewise stop any active location sharing in either direction.
  begin
    delete from public.location_shares
     where (from_user_id = v_user_id and to_user_id = p_target_id)
        or (from_user_id = p_target_id and to_user_id = v_user_id);
  exception when undefined_table then
    -- location_shares may not exist on older deploys; ignore.
    null;
  end;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.block_user(uuid) from public;
grant execute on function public.block_user(uuid) to authenticated;


create or replace function public.unblock_user(p_target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if p_target_id is null then
    return jsonb_build_object('error', 'Missing target user id');
  end if;

  delete from public.blocked_users
   where blocker_id = v_user_id
     and blocked_id = p_target_id;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.unblock_user(uuid) from public;
grant execute on function public.unblock_user(uuid) to authenticated;


create or replace function public.list_blocked_users()
returns table (
  blocked_id    uuid,
  display_name  text,
  profile_image_url text,
  created_at    timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    bu.blocked_id,
    p.display_name,
    p.profile_image_url,
    bu.created_at
  from public.blocked_users bu
  left join public.profiles p on p.id = bu.blocked_id
  where bu.blocker_id = auth.uid()
  order by bu.created_at desc;
$$;

revoke all on function public.list_blocked_users() from public;
grant execute on function public.list_blocked_users() to authenticated;
