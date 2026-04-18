# Handoff: Contact Details (Variation A — Trust-Forward)

## Overview
Redesigned Contact Details screen for the Union app. This screen shows a single contact (e.g., Capri Rosedale) with a prominent Trust card, quick actions (Vouch/Share/Call/Message), selfies gallery, proximity/location toggles, and history timeline.

## About the Design Files
The `.jsx` and `.html` files in this bundle are **design references created in HTML** — a prototype showing intended look and behavior, not production code to ship directly. Your task is to **recreate this design in the Union codebase's existing environment** (JS + Capacitor) using its established patterns, component conventions, and styling approach.

The prototype uses React + inline styles to make the design portable and readable. You are free to translate to whatever component framework and styling system the Union app already uses (vanilla JS + CSS, React, Vue, Tailwind, CSS modules — whatever's there).

## Fidelity
**High-fidelity.** Colors, spacing, typography, radii, and shadows are final. Match pixel-for-pixel. Interactions (confetti on Vouch, toggle animations, ring fill transition, bottom-sheet share) should be implemented as specified.

## Screens / Views

### 1. Contact Details (primary)
- **Purpose**: Show a contact's relationship, trust, shared memories, and quick ways to connect
- **Layout** (top to bottom, within a mobile viewport):
  1. Union header (blue, 56px top padding for status bar + 14px bottom padding) — user avatar left, contact name centered, heart button right
  2. Back row with "Contacts" link (left, Union blue) + "Last seen 28d ago" text (right, gray)
  3. **Hero card**: white card, 16px radius, 16px margin, avatar (68px) + name (22px/700) + "Known 18 years, 10 months" sparkle row + "Met on June 2, 2007". Row of 4 action buttons: Vouch / Share / Call / Message
  4. **Trust card** (the headline element): gradient `#2D5F7D → #3B7CA0`, 16px radius, white text. Contains a 100×100 circular trust ring (gold, 92/100 score), stats grid (Shared contacts, Shared groups, Attestations, Vouches), and a vouched-by avatar stack ("Vouched by Michael, Lou and 3 others")
  5. **Selfies strip**: horizontal scroll, 120×164px cards with image + date + location. Ends with a dashed "Take selfie" button
  6. **Toggles card**: two rows — "Notify if nearby" and "Share My Location", each with icon tile + label/sub + toggle
  7. **History card**: vertical timeline with colored dots (nearby=blue, selfie=gold, vouch=green, group=purple), event text + type + when. "View all activity" link

- **Components**: See Design Tokens below for exact values.

### 2. Share Sheet (modal)
Triggered by tapping Share. Bottom-sheet, slides up from 100%. Drag handle, "Share Capri" title, contact preview card, "Pick from contacts" primary button. Backdrop is `rgba(0,0,0,0.4)` tap-to-dismiss.

### 3. Confetti (transient overlay)
Triggered by tapping Vouch. 30 rotating rectangular pieces fall from ~30% height with randomized x position, delay (0–0.3s), and rotation, using keyframe `confetti` (1.4s ease-out). Pieces cycle through gold, blue, green, red. Non-blocking (pointer-events: none).

## Interactions & Behavior

| Trigger | Behavior |
|---|---|
| Tap **Vouch** | Button fills blue, label → "Vouched", confetti fires for 1.6s. Haptic: `Haptics.impact({ style: 'medium' })` |
| Tap **Share** | Open share sheet (see above). In Capacitor, use `@capacitor/share` for the native share API *or* show the in-app sheet first then chain to it |
| Tap **Call** | `window.open('tel:+1...')` — Capacitor passes through |
| Tap **Message** | `window.open('sms:+1...')` |
| Tap toggles | Animate knob (transform + bg color transition, 0.2s ease). Persist to backend. |
| Tap selfie card | (Future) Open lightbox |
| Tap "Take selfie" | `Camera.getPhoto({ source: CameraSource.Camera })` via `@capacitor/camera` |
| Tap **View all activity** | Navigate to full activity log |
| Tap **back** | Return to contacts list |
| Tap Union header avatar | Navigate to own profile |
| Tap heart button | Navigate to Share/QR page |

### Animations
- **Confetti**: `confetti` keyframe, 1.4s ease-out, `translateY(0→500px) rotate(0→720deg)`, opacity 1→0
- **Trust ring fill**: `stroke-dashoffset` transition, 1s ease on mount
- **Toggle**: background 0.2s, knob transform 0.2s
- **Share sheet**: slide up from 100%, 0.25s ease; backdrop fade-in 0.2s

## State Management

Per-contact view state:
- `vouched: boolean` — optimistic toggle after Vouch; persist to backend
- `notifyIfNearby: boolean` — synced with backend/device
- `shareLocation: boolean` — synced with backend/device
- `showShare: boolean` — local modal state
- `showConfetti: boolean` — local transient, auto-clears after 1.6s

## Design Tokens

### Colors
```js
export const tokens = {
  colors: {
    unionBlue: '#3B7CA0',
    unionBlueDark: '#2D5F7D',
    unionGold: '#E3AD4F',          // trust ring, sparkle
    text: '#1A2433',
    textMuted: '#5E6B7A',
    textSubtle: '#8792A0',
    textHint: '#9AA6B0',
    bgCanvas: '#F2F4F7',
    bgCard: '#FFFFFF',
    bgChip: '#F2F4F7',
    bgChipActive: '#EAF2F8',
    border: '#E5E8EC',
    borderSoft: '#EAEDF1',
    borderDashed: '#C7CFD9',
    toggleOff: '#D7DBE0',
    historyNearby: '#3B7CA0',
    historySelfie: '#E3AD4F',
    historyVouch: '#5CA68A',
    historyGroup: '#A7729F',
    trustGradientFrom: '#2D5F7D',
    trustGradientTo: '#3B7CA0',
  },
  radius: { sm: 8, md: 10, lg: 12, xl: 16, full: 9999 },
  spacing: { 1: 4, 2: 8, 3: 12, 4: 14, 5: 16, 6: 20 },
  type: {
    family: "'Inter', system-ui, -apple-system, sans-serif",
    h1: { size: 22, weight: 700, tracking: -0.4 },
    h2: { size: 18, weight: 700, tracking: -0.3 },
    body: { size: 14, weight: 500 },
    bodyLg: { size: 15, weight: 500 },
    caption: { size: 12, weight: 500 },
    overline: { size: 11, weight: 600, tracking: 1, transform: 'uppercase' },
  },
  shadows: {
    card: '0 1px 3px rgba(0,0,0,0.05)',
    trust: '0 4px 14px rgba(59,124,160,0.28)',
    sheet: '0 20px 50px rgba(0,0,0,0.2)',
  },
};
```

### Hit targets
- All tappable elements ≥ 44px tall on primary axis
- Icon buttons inside action row: 64px wide × ~56px tall

## Capacitor Integration Notes

| Feature | Plugin |
|---|---|
| Selfie capture | `@capacitor/camera` |
| Haptic feedback on Vouch | `@capacitor/haptics` |
| Share sheet (native) | `@capacitor/share` |
| Call / Message | `tel:` / `sms:` links — no plugin needed |
| Notify if nearby | `@capacitor/geolocation` + `@capacitor/local-notifications` (background loc via community plugin) |
| Share My Location | `@capacitor/geolocation` |
| Safe-area padding | `@capacitor/status-bar` + CSS `env(safe-area-inset-top/bottom)` |

## Assets
- `app/img/avatar-capri.png`, `avatar-philip.png`, `avatar-emily.png` — placeholder avatars (gradient + initial). Replace with real photos from your backend.
- `app/img/selfie-1.png` through `selfie-5.png` — placeholder selfies. Replace with real images from your backend.
- Icons are inline SVG in `app/icons.jsx`. Feel free to swap for your existing icon set (e.g., Lucide, Phosphor).

## Files in this handoff
- `Contact Details.html` — the full interactive prototype (open in any browser)
- `app/data.jsx` — example contact + trust data shape
- `app/icons.jsx` — inline SVG icon components
- `app/shell.jsx` — Union header + tab bar + avatar
- `app/detail-a.jsx` — **Variation A (ship this one)** — the full Contact Details screen
- `app/contacts-list.jsx` — Contacts list (for navigation context)
- `app/img/` — placeholder image assets

Open `Contact Details.html` locally to interact with the exact design. The variant switcher in the Tweaks panel is for design review only — you are only shipping Variation A.

## Suggested Opus prompt (paste into Cursor)

```
I'm implementing the Contact Details screen from /design_handoff_contact_details/.

Read README.md first. The canonical visual reference is Contact Details.html —
open it in a browser to see interactions live. Ship Variation A only (see
app/detail-a.jsx).

Follow the Union app's existing patterns for:
- component structure and file layout
- styling (match whatever's already used — don't introduce new tooling)
- state management and API calls
- routing/navigation

Use Capacitor plugins per CAPACITOR_NOTES in the README for camera, haptics,
share, and geolocation. Match tokens exactly.

Start by proposing the file layout and the minimal data contract for the
Contact Details API, then wait for my confirmation before writing code.
```
