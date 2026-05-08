-- Migration: persist contact list sort preferences on the profile
-- Run in Supabase SQL Editor.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contacts_sort_mode text DEFAULT 'trust',
  ADD COLUMN IF NOT EXISTS contacts_sort_order jsonb DEFAULT NULL;

-- Earlier installs created the column with DEFAULT 'recent'. Re-set the
-- default so brand-new profile rows land on 'trust' (the in-memory JS default
-- in js/contacts.js was changed to match). Existing rows keep whatever value
-- they were saved with -- this only affects future inserts that omit the
-- column.
ALTER TABLE public.profiles
  ALTER COLUMN contacts_sort_mode SET DEFAULT 'trust';
