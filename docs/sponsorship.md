# Sponsorship and Membership System

## Overview

FairShare uses an invite-only membership model. There is no "join" button — new members must be sponsored by an existing active member. This ensures every candidate has at least one advocate within the group and gives the group control over its membership.

## How It Works

### Creating an Invite

1. An active group member clicks the **Sponsor** button
2. They enter an optional message describing the person they'd like to sponsor
3. The system generates a unique invite URL containing a random token
4. The sponsor shares this link with the candidate (via email, chat, etc.)
5. Links expire after 7 days

### Claiming an Invite

1. The candidate clicks the invite link
2. If not logged in, they see the auth screen with a banner: *"[Sponsor Name] is offering to sponsor your candidacy for [Group Name]"*
3. The candidate creates an account (or logs in to an existing one)
4. The `claim_sponsorship` function atomically:
   - Marks the sponsorship as claimed
   - Creates a pending membership
   - Auto-inserts an endorsement from the sponsor
   - Adds **bidirectional contacts** (sponsor ↔ candidate), same as a meet handshake
   - Checks if the endorsement threshold is already met (and admits immediately if so)

### Endorsement and Admission

- Active members can view pending candidates via the **Candidates** button
- Each candidate shows their sponsor's name and message, plus the current endorsement count
- Members can **Endorse** or **Unendorse** candidates
- After each endorsement, `check_endorsements` checks if the threshold is met
- The threshold is defined by `$NEW_MEMBER_PERCENTAGE` in the group's constitution (default: 100%)
- When the threshold is reached, the candidate is admitted immediately as an active member

## Schema

### Sponsorships table

```sql
create table public.sponsorships (
  id uuid primary key default gen_random_uuid(),
  token text unique not null default encode(gen_random_bytes(16), 'hex'),
  group_id uuid not null references public.groups(id) on delete cascade,
  sponsor_id uuid not null references public.profiles(id),
  message text,
  candidate_id uuid references public.profiles(id),  -- filled when claimed
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'expired', 'revoked')),
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '7 days')
);
```

### Key Functions

| Function | Purpose |
|----------|---------|
| `get_sponsorship_by_token(token)` | Public lookup for the invite landing page (no auth required, returns sponsor name/avatar + group info) |
| `claim_sponsorship(token)` | Validates token, creates pending member, auto-endorses, adds mutual contacts, checks threshold |
| `check_endorsements(group_id, candidate_id)` | Counts endorsements, reads threshold from constitution, admits if met |

## Client-Side Flow

The invite token is preserved across the authentication flow using `localStorage` (with a JSON wrapper containing a timestamp):

1. `?invite=TOKEN` in the URL → stored in `localStorage` as `{ token, savedAt }`
2. URL parameter is cleaned via `history.replaceState`
3. After login/signup, `handlePendingInvite()` reads from `localStorage` and calls `claim_sponsorship`
4. Token is cleared from `localStorage` regardless of success/failure
5. Tokens older than 7 days (matching server-side expiry) are discarded

**Why `localStorage` instead of `sessionStorage`?** When a new user signs up, they must confirm their email. The confirmation link opens in a new browser tab, where `sessionStorage` would be empty — causing the sponsorship claim to silently fail. `localStorage` persists across tabs within the same origin.

## Security

- Invite tokens are 16 random bytes (hex-encoded, 32 characters) — not guessable
- Each token can only be claimed once (status transitions from `pending` to `claimed`)
- The `claim_sponsorship` function uses `FOR UPDATE` row locking to prevent race conditions
- RLS policies ensure only active group members can create sponsorships
- The `get_sponsorship_by_token` function is `SECURITY DEFINER` to allow unauthenticated lookup of safe public info only
