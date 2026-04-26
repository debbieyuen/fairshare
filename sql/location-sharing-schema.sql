-- Location sharing schema for Union
-- Run this in Supabase SQL Editor.

-- 1. location_shares: tracks who is sharing their live location with whom
CREATE TABLE IF NOT EXISTS public.location_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz DEFAULT now(),
  expires_at timestamptz, -- NULL = indefinitely
  source_instance_id text,
  source_platform text,
  source_user_agent text,
  UNIQUE(from_user_id, to_user_id)
);

ALTER TABLE public.location_shares
  ADD COLUMN IF NOT EXISTS source_instance_id text,
  ADD COLUMN IF NOT EXISTS source_platform text,
  ADD COLUMN IF NOT EXISTS source_user_agent text;

ALTER TABLE public.user_locations
  ADD COLUMN IF NOT EXISTS source_instance_id text,
  ADD COLUMN IF NOT EXISTS source_platform text,
  ADD COLUMN IF NOT EXISTS source_user_agent text;

ALTER TABLE public.location_shares ENABLE ROW LEVEL SECURITY;

-- Users can see shares they are part of (either direction)
CREATE POLICY "Users can read own location shares"
  ON public.location_shares FOR SELECT
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY "Users can create own location shares"
  ON public.location_shares FOR INSERT
  WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "Users can update own location shares"
  ON public.location_shares FOR UPDATE
  USING (auth.uid() = from_user_id);

CREATE POLICY "Users can delete own location shares"
  ON public.location_shares FOR DELETE
  USING (auth.uid() = from_user_id);

-- 2. Enable Realtime on location_shares so clients get live updates
ALTER TABLE public.location_shares REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.location_shares;

-- 3. Add 'location_share_started' to the contact notification type constraint
ALTER TABLE public.contact_notifications
  DROP CONSTRAINT IF EXISTS contact_notifications_notification_type_check;

ALTER TABLE public.contact_notifications
  ADD CONSTRAINT contact_notifications_notification_type_check
  CHECK (notification_type IN (
    'profile_picture_updated',
    'profile_updated',
    'met_date_set',
    'profile_picture_suggested',
    'nearby_alert',
    'new_selfie',
    'location_share_started'
  ));

-- 3. Allow contacts to read the sharer's location when an active share exists.
--    (The existing "Users can read own location" policy from nearby-schema.sql
--     already covers auth.uid() = user_id; Postgres OR's all SELECT policies.)
DROP POLICY IF EXISTS "Contacts can read shared locations" ON public.user_locations;
CREATE POLICY "Contacts can read shared locations"
  ON public.user_locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.location_shares ls
      WHERE ls.from_user_id = user_locations.user_id
        AND ls.to_user_id = auth.uid()
        AND (ls.expires_at IS NULL OR ls.expires_at > now())
    )
  );

-- During active sharing, only the device instance that owns the outbound share
-- may update the sharer's single public location row. This prevents another
-- logged-in device from the same account from overwriting live sharing.
DROP POLICY IF EXISTS "Users can insert own location" ON public.user_locations;
CREATE POLICY "Users can insert own location"
  ON public.user_locations FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.location_shares ls
        WHERE ls.from_user_id = auth.uid()
          AND (ls.expires_at IS NULL OR ls.expires_at > now())
          AND ls.source_instance_id IS NOT NULL
      )
      OR EXISTS (
        SELECT 1 FROM public.location_shares ls
        WHERE ls.from_user_id = auth.uid()
          AND (ls.expires_at IS NULL OR ls.expires_at > now())
          AND ls.source_instance_id = user_locations.source_instance_id
      )
    )
  );

DROP POLICY IF EXISTS "Users can update own location" ON public.user_locations;
CREATE POLICY "Users can update own location"
  ON public.user_locations FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.location_shares ls
        WHERE ls.from_user_id = auth.uid()
          AND (ls.expires_at IS NULL OR ls.expires_at > now())
          AND ls.source_instance_id IS NOT NULL
      )
      OR EXISTS (
        SELECT 1 FROM public.location_shares ls
        WHERE ls.from_user_id = auth.uid()
          AND (ls.expires_at IS NULL OR ls.expires_at > now())
          AND ls.source_instance_id = user_locations.source_instance_id
      )
    )
  );

-- 4. Enable Realtime on user_locations so viewers receive the sharer's live
--    position updates. RLS above already limits which rows each viewer is
--    permitted to receive, so publishing the whole table is safe.
ALTER TABLE public.user_locations REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_locations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.user_locations';
  END IF;
END $$;
