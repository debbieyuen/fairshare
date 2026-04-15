-- ============================================================
-- DEVICE PUSH TOKENS (APNs for Capacitor iOS app)
-- Parallel to push_subscriptions (Web Push for PWA).
-- ============================================================

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null default 'ios' check (platform in ('ios', 'android')),
  created_at timestamptz default now(),
  unique(user_id, token)
);

alter table public.device_push_tokens enable row level security;

create policy "Users can manage own device tokens"
  on public.device_push_tokens for all
  using (auth.uid() = user_id);


-- ============================================================
-- UPDATE: send_push_to_group
-- Now also collects APNs device tokens and POSTs them to a
-- separate Edge Function for native delivery.
-- ============================================================
create or replace function public.send_push_to_group(
  p_group_id uuid,
  p_actor_id uuid,
  p_title text,
  p_body text,
  p_url text default '/',
  p_include_actor boolean default false
)
returns void as $$
declare
  v_edge_fn_url text;
  v_apns_edge_fn_url text;
  v_anon_key text;
  v_subscriptions jsonb;
  v_device_tokens jsonb;
begin
  -- 1) Web Push subscriptions (existing path)
  select jsonb_agg(jsonb_build_object(
    'endpoint', ps.endpoint,
    'keys', jsonb_build_object('p256dh', ps.keys_p256dh, 'auth', ps.keys_auth)
  ))
  into v_subscriptions
  from public.push_subscriptions ps
  join public.members m on m.user_id = ps.user_id
  join public.profiles p on p.id = ps.user_id
  where m.group_id = p_group_id
    and m.status = 'active'
    and (p_include_actor or ps.user_id <> p_actor_id)
    and (p.push_notifications is null or p.push_notifications = true);

  -- 2) APNs device tokens (new path)
  select jsonb_agg(jsonb_build_object('token', dt.token, 'platform', dt.platform))
  into v_device_tokens
  from public.device_push_tokens dt
  join public.members m on m.user_id = dt.user_id
  join public.profiles p on p.id = dt.user_id
  where m.group_id = p_group_id
    and m.status = 'active'
    and (p_include_actor or dt.user_id <> p_actor_id)
    and (p.push_notifications is null or p.push_notifications = true);

  -- Read secrets from Vault
  select decrypted_secret into v_anon_key
  from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1;

  -- Web Push delivery
  if v_subscriptions is not null then
    select decrypted_secret into v_edge_fn_url
    from vault.decrypted_secrets where name = 'push_edge_fn_url' limit 1;

    if v_edge_fn_url is not null and v_anon_key is not null then
      perform net.http_post(
        url     := v_edge_fn_url,
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_anon_key,
          'Content-Type',  'application/json'
        ),
        body    := jsonb_build_object(
          'subscriptions', v_subscriptions,
          'title', p_title,
          'body', p_body,
          'url', p_url
        )
      );
    end if;
  end if;

  -- APNs delivery
  if v_device_tokens is not null then
    select decrypted_secret into v_apns_edge_fn_url
    from vault.decrypted_secrets where name = 'apns_edge_fn_url' limit 1;

    if v_apns_edge_fn_url is not null and v_anon_key is not null then
      perform net.http_post(
        url     := v_apns_edge_fn_url,
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_anon_key,
          'Content-Type',  'application/json'
        ),
        body    := jsonb_build_object(
          'tokens', v_device_tokens,
          'title', p_title,
          'body', p_body,
          'url', p_url
        )
      );
    end if;
  end if;
end;
$$ language plpgsql security definer;


-- ============================================================
-- UPDATE: send_push_to_users
-- Now also sends APNs push to device tokens.
-- ============================================================
create or replace function public.send_push_to_users(
  p_user_ids uuid[],
  p_actor_id uuid,
  p_title text,
  p_body text,
  p_url text default '/'
)
returns void as $$
declare
  v_edge_fn_url text;
  v_apns_edge_fn_url text;
  v_anon_key text;
  v_subscriptions jsonb;
  v_device_tokens jsonb;
begin
  -- 1) Web Push subscriptions (existing path)
  select jsonb_agg(jsonb_build_object(
    'endpoint', ps.endpoint,
    'keys', jsonb_build_object('p256dh', ps.keys_p256dh, 'auth', ps.keys_auth)
  ))
  into v_subscriptions
  from public.push_subscriptions ps
  join public.profiles p on p.id = ps.user_id
  where ps.user_id = any(p_user_ids)
    and ps.user_id <> p_actor_id
    and (p.push_notifications is null or p.push_notifications = true);

  -- 2) APNs device tokens (new path)
  select jsonb_agg(jsonb_build_object('token', dt.token, 'platform', dt.platform))
  into v_device_tokens
  from public.device_push_tokens dt
  join public.profiles p on p.id = dt.user_id
  where dt.user_id = any(p_user_ids)
    and dt.user_id <> p_actor_id
    and (p.push_notifications is null or p.push_notifications = true);

  -- Read secrets from Vault
  select decrypted_secret into v_anon_key
  from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1;

  -- Web Push delivery
  if v_subscriptions is not null then
    select decrypted_secret into v_edge_fn_url
    from vault.decrypted_secrets where name = 'push_edge_fn_url' limit 1;

    if v_edge_fn_url is not null and v_anon_key is not null then
      perform net.http_post(
        url     := v_edge_fn_url,
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_anon_key,
          'Content-Type',  'application/json'
        ),
        body    := jsonb_build_object(
          'subscriptions', v_subscriptions,
          'title', p_title,
          'body', p_body,
          'url', p_url
        )
      );
    end if;
  end if;

  -- APNs delivery
  if v_device_tokens is not null then
    select decrypted_secret into v_apns_edge_fn_url
    from vault.decrypted_secrets where name = 'apns_edge_fn_url' limit 1;

    if v_apns_edge_fn_url is not null and v_anon_key is not null then
      perform net.http_post(
        url     := v_apns_edge_fn_url,
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || v_anon_key,
          'Content-Type',  'application/json'
        ),
        body    := jsonb_build_object(
          'tokens', v_device_tokens,
          'title', p_title,
          'body', p_body,
          'url', p_url
        )
      );
    end if;
  end if;
end;
$$ language plpgsql security definer;
