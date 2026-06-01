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

-- Updated check_endorsements: uses min(endorsement.created_at) for vote window start
-- to avoid timing race when endorsement INSERT and check are in separate transactions.
create or replace function public.check_endorsements(
  p_group_id uuid,
  p_candidate_id uuid
)
returns json as $$
declare
  v_active_count int;
  v_endorsement_count int;
  v_participants int;
  v_threshold int;
  v_constitution text;
  v_pct_match text[];
  v_pct numeric;
  v_sponsor_name text;
  v_period_days int;
  v_round_key text;
  v_opened_at timestamptz;
  v_window_end timestamptz;
begin
  select count(*) into v_active_count
  from public.members
  where group_id = p_group_id and status = 'active';

  select constitution into v_constitution
  from public.groups
  where id = p_group_id;

  v_pct := 1.0;
  if v_constitution is not null then
    v_pct_match := regexp_match(v_constitution, ':\s*(\d+)%\s*(?:members?\s*)?\$NEW_MEMBER_PERCENTAGE');
    if v_pct_match is not null then
      v_pct := v_pct_match[1]::numeric / 100.0;
    end if;
  end if;

  v_period_days := public.get_voting_period_days(v_constitution);
  v_round_key := 'candidate:' || p_candidate_id::text;

  if v_period_days is not null and v_period_days > 0 then
    insert into public.vote_rounds (group_id, round_key, opened_at)
    values (p_group_id, v_round_key,
      coalesce(
        (select min(created_at) from public.endorsements
         where group_id = p_group_id and candidate_id = p_candidate_id),
        now()
      )
    )
    on conflict do nothing;

    select opened_at into v_opened_at
    from public.vote_rounds
    where group_id = p_group_id and round_key = v_round_key;

    v_window_end := v_opened_at + (v_period_days || ' days')::interval;

    select count(*) into v_endorsement_count
    from public.endorsements
    where group_id = p_group_id
      and candidate_id = p_candidate_id
      and created_at >= v_opened_at
      and created_at < v_window_end;

    select count(distinct endorser_id) into v_participants
    from public.endorsements
    where group_id = p_group_id
      and candidate_id = p_candidate_id
      and created_at >= v_opened_at
      and created_at < v_window_end;

    if now() >= v_window_end then
      -- Voting period expired: threshold from those who actually voted
      v_threshold := greatest(1, ceil(v_participants * v_pct));
    else
      -- Voting period still open: only admit early if all active members endorsed
      v_threshold := greatest(1, ceil(v_active_count * v_pct));
    end if;
  else
    select count(*) into v_endorsement_count
    from public.endorsements
    where group_id = p_group_id and candidate_id = p_candidate_id;

    v_participants := null;
    v_threshold := greatest(1, ceil(v_active_count * v_pct));
  end if;

  if v_endorsement_count >= v_threshold then
    update public.members
    set status = 'active', joined_at = now()
    where group_id = p_group_id and user_id = p_candidate_id and status = 'pending';

    delete from public.endorsements
    where group_id = p_group_id and candidate_id = p_candidate_id;

    if v_period_days is not null and v_period_days > 0 then
      delete from public.vote_rounds
      where group_id = p_group_id and round_key = v_round_key;
    end if;

    select p.display_name into v_sponsor_name
    from public.sponsorships s
    join public.profiles p on p.id = s.sponsor_id
    where s.group_id = p_group_id
      and s.candidate_id = p_candidate_id
      and s.status = 'claimed'
    limit 1;

    insert into public.group_events (group_id, event_type, summary, actor_id, metadata)
    values (
      p_group_id,
      'member_joined',
      'New member '
        || (select display_name from public.profiles where id = p_candidate_id)
        || ' accepted'
        || case when v_sponsor_name is not null then ', sponsored by ' || v_sponsor_name else '' end,
      p_candidate_id,
      json_build_object('user_id', p_candidate_id)::jsonb
    );

    return json_build_object(
      'admitted', true,
      'endorsements', v_endorsement_count,
      'threshold', v_threshold,
      'participants', v_participants,
      'voting_period', v_period_days is not null
    );
  end if;

  return json_build_object(
    'admitted', false,
    'endorsements', v_endorsement_count,
    'threshold', v_threshold,
    'participants', v_participants,
    'voting_period', v_period_days is not null
  );
end;
$$ language plpgsql security definer;

-- Updated finalize_expired_voting: now handles expired candidate rounds
create or replace function public.finalize_expired_voting(p_group_id uuid)
returns json as $$
declare
  v_constitution text;
  v_period_days int;
  v_round record;
  v_amendment record;
  v_amendment_ids uuid[] := '{}';
  v_currency_rounds text[] := '{}';
  v_candidate_ids uuid[] := '{}';
  v_candidate_id uuid;
begin
  select constitution into v_constitution
  from public.groups
  where id = p_group_id;

  v_period_days := public.get_voting_period_days(v_constitution);

  if v_period_days is null then
    return json_build_object('finalized', false, 'reason', 'full_population_mode');
  end if;

  for v_round in
    select round_key
    from public.vote_rounds
    where group_id = p_group_id
      and round_key in ('fee_rate', 'daily_income')
      and opened_at + (v_period_days || ' days')::interval <= now()
  loop
    perform public.compute_tally(p_group_id, v_round.round_key, true);
    delete from public.vote_rounds
    where group_id = p_group_id and round_key = v_round.round_key;
    v_currency_rounds := array_append(v_currency_rounds, v_round.round_key);
  end loop;

  for v_amendment in
    select id
    from public.amendments
    where group_id = p_group_id
      and status = 'voting'
      and expires_at <= now()
  loop
    perform public.resolve_amendment(v_amendment.id);
    v_amendment_ids := array_append(v_amendment_ids, v_amendment.id);
  end loop;

  for v_round in
    select round_key
    from public.vote_rounds
    where group_id = p_group_id
      and round_key like 'candidate:%'
      and opened_at + (v_period_days || ' days')::interval <= now()
  loop
    v_candidate_id := substring(v_round.round_key from 11)::uuid;
    perform public.check_endorsements(p_group_id, v_candidate_id);
    v_candidate_ids := array_append(v_candidate_ids, v_candidate_id);
  end loop;

  -- Also handle pending candidates that have endorsements but no vote_rounds row
  -- (e.g. sponsored before the voting-period function was deployed)
  for v_candidate_id in
    select m.user_id
    from public.members m
    where m.group_id = p_group_id
      and m.status = 'pending'
      and not exists (
        select 1 from public.vote_rounds vr
        where vr.group_id = p_group_id
          and vr.round_key = 'candidate:' || m.user_id::text
      )
      and exists (
        select 1 from public.endorsements e
        where e.group_id = p_group_id
          and e.candidate_id = m.user_id
      )
  loop
    perform public.check_endorsements(p_group_id, v_candidate_id);
    v_candidate_ids := array_append(v_candidate_ids, v_candidate_id);
  end loop;

  return json_build_object(
    'finalized', true,
    'currency_rounds', to_json(v_currency_rounds),
    'amendments', to_json(v_amendment_ids),
    'candidates', to_json(v_candidate_ids)
  );
end;
$$ language plpgsql security definer;
