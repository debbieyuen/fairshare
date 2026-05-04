# Web of Trust

FairShare includes a Web of Trust system that lets people periodically attest "Trust" or "Love" for contacts they have met in person. Over time, these attestations form a network of human relationships that can help people find and trust each other -- without exposing the details of who said what.

## How It Works

When you expand a contact's details, you'll see **Trust** and **Love** buttons alongside the existing Share button. Pressing either creates an attestation -- a private, one-way record that you trust or love that person. You can attest as many times as you like; each press is recorded as a separate event.

After pressing, the app simply replies **"Noted"**. There is no confirmation of past attestations, no history, and no way to see what you previously sent.

A red **heart icon** in the top bar lets you see your own aggregate attestation counts: how many distinct people have attested love or trust for you. The counts are deliberately imprecise (see Privacy Model below).

## Privacy Model

The attestation system is designed so that trust cannot be bought, sold, or coerced. Several properties enforce this:

### 1. Recipients never learn who vouched for them

A vouch's value comes from the recipient not knowing it was given. If they did, vouches could be traded for favours, sold, or coerced ("vouch for me or else"). To preserve this:

- No UI or API ever returns the identity of someone who attested for the caller. The "History together" timeline on a contact's details page only shows vouches the **caller** gave to that contact -- vouches in the reverse direction are deliberately excluded by `get_contact_history`.
- Aggregate counts of received attestations are exposed (see #3 below) but only via rounded-down values that hide the most recent activity.

### 2. Attestors can see vouches they gave to a specific contact

When viewing a contact's details, the caller can see entries like "You vouched (trust)" alongside the other shared history (selfies, nearby pings, shared groups). This helps people remember whether they have already vouched for someone and avoids accidentally re-prompting them. It does not break recipient-privacy because the contact never sees this list -- only the caller does, on their own device.

### 3. Only aggregate counts of received attestations are visible

The heart dialog shows messages like "You are loved by more than 20 people" rather than exact numbers or identities. The raw count is rounded down to the nearest 10 before display. This prevents someone from watching the number tick up by 1 immediately after meeting a new person, which would reveal that person's attestation.

### 4. Small counts are fully hidden

When fewer than 10 distinct people have attested, the message simply says "by others" with no number at all. This provides maximum privacy in the early stages when a single new attestation would be easy to detect.

### 5. No database reads on attestation rows

The `attestations` table has no SELECT policy. Individual rows are never readable through the REST API by anyone -- not even the person who created them. Only `SECURITY DEFINER` functions can read the table, and the only function that returns individual rows (`get_contact_history`) restricts its vouch arm to `from_user_id = caller`, so a row where the caller is the recipient is never returned to a client. Everything else (`get_my_attestation_counts`, `get_contact_trust_summary`, `get_shared_attesters_count`, `get_profile_picture_attesters_count`) returns only aggregate `COUNT(DISTINCT ...)` values.

## Display Rules

| Love count | Trust count | Message |
|-----------|-------------|---------|
| 0 | 0 | "No attestations yet." |
| 1-9 | 0 | "You are loved by others." |
| 0 | 1-9 | "You are trusted by others." |
| 1-9 | 1-9 | "You are loved and trusted by others." |
| 23 | 0 | "You are loved by more than 20 people." |
| 23 | 47 | "You are loved by more than 20 people, and trusted by more than 40." |
| 23 | 5 | "You are loved by more than 20 people, and trusted by others." |

Numbers >= 10 use `floor(count / 10) * 10` for the displayed value.

## Schema

See [`web-of-trust-schema.sql`](web-of-trust-schema.sql) for the full SQL (table, RLS policies, RPCs). Summary:

| Object | Purpose |
|--------|---------|
| `attestations` table | Stores attestation events (from_user, to_user, type, timestamp) |
| `create_attestation` RPC | Validates contact relationship, inserts attestation |
| `get_my_attestation_counts` RPC | Returns distinct attester counts per type for the caller |

## Future Directions

The web of trust is a foundation for richer social features:

- **Discovery**: help people find others who are widely trusted in the network
- **Transitive trust**: "trusted by people you trust" as a signal when meeting someone new
- **Group reputation**: attestation counts visible to group members during endorsement decisions
- **Decay**: older attestations could carry less weight, encouraging ongoing relationships
- **Additional attestation types**: beyond Trust and Love, other meaningful signals could be added
