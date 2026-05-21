-- Run in Supabase SQL Editor to verify native push backend wiring.
-- Expect apns_edge_fn_url and supabase_anon_key to be non-null for delivery.

select name,
       case when decrypted_secret is null or decrypted_secret = '' then 'MISSING' else 'set' end as status
from vault.decrypted_secrets
where name in ('apns_edge_fn_url', 'supabase_anon_key', 'push_edge_fn_url')
order by name;

-- Show actual apns_edge_fn_url and whether it matches this project (safe to read — it is a URL).
select
  name,
  decrypted_secret as url,
  case
    when decrypted_secret = 'https://vdpqgmrfvlaieqpvpdcr.supabase.co/functions/v1/send-push-apns'
      then 'OK: correct send-push-apns URL'
    else 'MISMATCH: update vault secret apns_edge_fn_url'
  end as url_check
from vault.decrypted_secrets
where name = 'apns_edge_fn_url';

-- Optional: list recent Android device tokens (requires authenticated context or service role).
-- select user_id, left(token, 12) || '…' as token_prefix, platform, created_at
-- from public.device_push_tokens
-- where platform = 'android'
-- order by created_at desc
-- limit 10;
