-- Migration: add leave_group RPC
-- Allows a member to leave a group (sets status to 'removed') and logs the event.
-- Must run as a SECURITY DEFINER since there is no UPDATE policy on the members table.

create or replace function public.leave_group(p_group_id uuid)
returns void as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text;
begin
  if v_user_id is null then
    raise exception 'You must be logged in';
  end if;

  if not exists (
    select 1 from public.members
    where group_id = p_group_id and user_id = v_user_id and status in ('active', 'pending')
  ) then
    raise exception 'You are not a member of this group';
  end if;

  select display_name into v_display_name
  from public.profiles where id = v_user_id;

  insert into public.group_events (group_id, event_type, summary, actor_id, metadata)
  values (
    p_group_id,
    'member_left',
    coalesce(v_display_name, 'Someone') || ' has left group',
    v_user_id,
    '{}'::jsonb
  );

  update public.members
  set status = 'removed'
  where group_id = p_group_id and user_id = v_user_id;
end;
$$ language plpgsql security definer;
