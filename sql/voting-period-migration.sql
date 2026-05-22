-- Voting period mode: vote_rounds + updated tally/endorsement/amendment functions
-- Run in Supabase SQL Editor

create table if not exists public.vote_rounds (
  group_id uuid not null references public.groups(id) on delete cascade,
  round_key text not null,
  opened_at timestamptz not null default now(),
  primary key (group_id, round_key)
);

alter table public.vote_rounds enable row level security;

drop policy if exists "Group members can view vote rounds" on public.vote_rounds;
create policy "Group members can view vote rounds"
  on public.vote_rounds for select
  using (public.is_group_member(group_id));

create or replace function public.get_voting_period_days(p_constitution text)
returns int as $$
declare
  v_match text[];
begin
  if p_constitution is null then
    return null;
  end if;
  v_match := regexp_match(p_constitution, '(\d+)\s*days?\s*\$VOTING_PERIOD_DAYS', 'i');
  if v_match is not null and v_match[1]::int > 0 then
    return v_match[1]::int;
  end if;
  return null;
end;
$$ language plpgsql immutable;

-- Paste compute_tally, check_endorsements, resolve_amendment, finalize_expired_voting
-- from fairshare-schema.sql (search for get_voting_period_days through finalize_expired_voting)
