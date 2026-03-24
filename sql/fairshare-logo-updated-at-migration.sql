-- Run once in Supabase SQL Editor (existing projects that already have public.groups).
-- Keeps group logo URLs stable while giving the app a server-side cache-bust token.

alter table public.groups add column if not exists logo_updated_at timestamptz;

-- One-time: existing logos get a timestamp so clients append ?v=... and bypass stale CDN/browser cache.
update public.groups
set logo_updated_at = now()
where logo_url is not null and btrim(logo_url) <> '' and logo_updated_at is null;

-- Redeploy app function from fairshare-schema.sql:
--   create or replace function public.update_group_logo( ... )
