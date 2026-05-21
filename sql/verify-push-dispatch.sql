-- Run in Supabase SQL Editor to verify native (FCM/APNs) push dispatch is wired.

-- 1) send_push_to_users must reference device_push_tokens and apns_edge_fn_url.
--    If this returns 0 rows, only Web Push is wired (re-apply sql/apns-push-schema.sql).
select
  case
    when prosrc like '%device_push_tokens%' and prosrc like '%apns_edge_fn_url%'
      then 'OK: native push dispatch is installed'
    else 'MISSING: run sql/apns-push-schema.sql in SQL Editor (replaces send_push_to_users / send_push_to_group)'
  end as send_push_to_users_status
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname = 'send_push_to_users';

-- 2) Vault secrets for pg_net -> edge function
select name,
       case when decrypted_secret is null or decrypted_secret = '' then 'MISSING' else 'set' end as status
from vault.decrypted_secrets
where name in ('apns_edge_fn_url', 'supabase_anon_key', 'push_edge_fn_url')
order by name;

-- 3) Your Android tokens (replace user id if needed)
select left(token, 28) || '…' as token_prefix, platform, created_at
from public.device_push_tokens
where user_id = '457367d0-0753-40d1-b745-72d637c4c181'
  and platform = 'android'
order by created_at desc;
