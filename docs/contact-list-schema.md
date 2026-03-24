# Contact list backend schema (Supabase)

The contact list and preferences features expect the following. Apply in Supabase SQL editor or migrations as needed.

## Profiles (extend existing)

Add columns to `profiles` if not present:

- `phone` – text, nullable
- `email` – text, nullable (may already exist from auth; can be a copy for “contact card”)
- `profile_image_url` – text, nullable (URL of profile photo shown to new contacts)

## Contacts (extend existing)

- Ensure `contacts` has `created_at` (timestamptz, default `now()`) for sorting.
- Add `selfie_url` – text, nullable (URL of optional selfie for this contact pair).

## contact_shared

Stores what each user has shared with each contact (so the other side can see phone/email).

```sql
CREATE TABLE IF NOT EXISTS contact_shared (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_phone text,
  shared_email text,
  PRIMARY KEY (user_id, contact_id)
);

ALTER TABLE contact_shared ENABLE ROW LEVEL SECURITY;

-- Users can read/write only their own rows (where they are user_id)
CREATE POLICY "Users manage own shared data" ON contact_shared
  FOR ALL USING (auth.uid() = user_id);
```

## contact_shares

Used for Realtime notifications when someone shares with you (“X shared phone number with you”).

```sql
CREATE TABLE IF NOT EXISTS contact_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_type text NOT NULL CHECK (shared_type IN ('phone', 'email')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE contact_shares ENABLE ROW LEVEL SECURITY;

-- Users can insert when they are the sender
CREATE POLICY "Users insert own shares" ON contact_shares
  FOR INSERT WITH CHECK (auth.uid() = from_user_id);

-- Users can read rows where they are the recipient (for Realtime)
CREATE POLICY "Users read received shares" ON contact_shares
  FOR SELECT USING (auth.uid() = to_user_id);
```

Enable Realtime for `contact_shares` in Supabase Dashboard (Database → Replication) so the app can subscribe to INSERTs and show toasts.
