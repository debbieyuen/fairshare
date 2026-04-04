-- Migration: persist contact list sort preferences on the profile
-- Run in Supabase SQL Editor.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contacts_sort_mode text DEFAULT 'recent',
  ADD COLUMN IF NOT EXISTS contacts_sort_order jsonb DEFAULT NULL;
