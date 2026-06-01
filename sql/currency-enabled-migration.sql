-- Run once in Supabase SQL Editor (existing projects that already have public.groups).
-- New groups default to currency off; existing groups keep currency enabled.

alter table public.groups add column if not exists currency_enabled boolean not null default false;

-- One-time: turn on currency for groups that already existed before this column.
update public.groups set currency_enabled = true;
