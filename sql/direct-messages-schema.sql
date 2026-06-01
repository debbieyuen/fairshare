-- ============================================================
-- DIRECT MESSAGES: one-to-one chat between contacts
-- ============================================================

create or replace function public.dm_conversation_key(p_user_a uuid, p_user_b uuid)
returns text as $$
begin
  if p_user_a is null or p_user_b is null then
    raise exception 'Both users are required';
  end if;
  if p_user_a = p_user_b then
    raise exception 'Cannot create a conversation with yourself';
  end if;
  return case
    when p_user_a::text < p_user_b::text then p_user_a::text || ':' || p_user_b::text
    else p_user_b::text || ':' || p_user_a::text
  end;
end;
$$ language plpgsql immutable;

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_key text not null,
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) > 0 and char_length(body) <= 2000),
  created_at timestamptz not null default now(),
  check (from_user_id <> to_user_id),
  check (conversation_key = public.dm_conversation_key(from_user_id, to_user_id))
);

create index if not exists idx_direct_messages_conversation_time
  on public.direct_messages (conversation_key, created_at desc);

alter table public.direct_messages enable row level security;

create policy "Users can read own direct messages"
  on public.direct_messages for select
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

create policy "Users can send direct messages to contacts"
  on public.direct_messages for insert
  with check (
    auth.uid() = from_user_id
    and exists (
      select 1
      from public.contacts c
      where c.user_id = auth.uid()
        and c.contact_id = to_user_id
    )
  );

create table if not exists public.direct_message_typing (
  user_id uuid not null references public.profiles(id) on delete cascade,
  peer_user_id uuid not null references public.profiles(id) on delete cascade,
  is_typing boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, peer_user_id),
  check (user_id <> peer_user_id)
);

alter table public.direct_message_typing enable row level security;

create policy "Users can read typing rows they participate in"
  on public.direct_message_typing for select
  using (auth.uid() = user_id or auth.uid() = peer_user_id);

create policy "Users can upsert own typing rows"
  on public.direct_message_typing for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.contacts c
      where c.user_id = auth.uid()
        and c.contact_id = peer_user_id
    )
  );

create policy "Users can update own typing rows"
  on public.direct_message_typing for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.contacts c
      where c.user_id = auth.uid()
        and c.contact_id = peer_user_id
    )
  );

create table if not exists public.direct_message_reactions (
  message_id uuid not null references public.direct_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.direct_message_reactions enable row level security;

create policy "Users can read reactions on own direct messages"
  on public.direct_message_reactions for select
  using (
    exists (
      select 1
      from public.direct_messages dm
      where dm.id = direct_message_reactions.message_id
        and (dm.from_user_id = auth.uid() or dm.to_user_id = auth.uid())
    )
  );

create policy "Users can set own direct-message reaction"
  on public.direct_message_reactions for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.direct_messages dm
      where dm.id = direct_message_reactions.message_id
        and (dm.from_user_id = auth.uid() or dm.to_user_id = auth.uid())
    )
  );

create policy "Users can update own direct-message reaction"
  on public.direct_message_reactions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own direct-message reaction"
  on public.direct_message_reactions for delete
  using (auth.uid() = user_id);

alter publication supabase_realtime add table public.direct_messages;
alter publication supabase_realtime add table public.direct_message_typing;
alter publication supabase_realtime add table public.direct_message_reactions;

create or replace function public.trigger_push_on_direct_message()
returns trigger as $$
declare
  v_sender_name text;
  v_preview text;
  v_body text;
begin
  select display_name into v_sender_name
  from public.profiles
  where id = NEW.from_user_id;

  if NEW.body like '📷image:%' then
    v_body := coalesce(v_sender_name, 'Someone') || ' sent a photo';
  elsif NEW.body like '📍location:%' then
    v_body := coalesce(v_sender_name, 'Someone') || ' shared a location';
  else
    v_preview := left(NEW.body, 80);
    if length(NEW.body) > 80 then
      v_preview := v_preview || '...';
    end if;
    v_body := coalesce(v_sender_name, 'Someone') || ': ' || v_preview;
  end if;

  perform public.send_push_to_users(
    array[NEW.to_user_id],
    NEW.from_user_id,
    'Union',
    v_body,
    '/?action=view_dm&contact=' || NEW.from_user_id::text
  );
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists on_direct_message_push on public.direct_messages;
create trigger on_direct_message_push
  after insert on public.direct_messages
  for each row execute function public.trigger_push_on_direct_message();
