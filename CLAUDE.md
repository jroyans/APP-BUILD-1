# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

```bash
npx expo start          # start dev server (scan QR with Expo Go or simulator)
npx expo start --ios    # open directly in iOS simulator
npx expo start --android
npx expo install <pkg>  # always use this instead of npm install for Expo packages
```

NEVER run plain `npm install` — it can upgrade packages beyond Expo Go compatibility and break the dev server. Always use `npx expo install`.

If `npx expo start` silently exits with no output, check `index.js` — if empty, recreate with:
```bash
printf "import 'expo/AppEntry';" > index.js
```

There are no tests and no linter scripts configured.

---

## Architecture

**Entry point is `App.js`, not the `app/` directory.** The `main` field in `package.json` points to `index.js` → `App.js`. The `app/`, `components/`, `hooks/`, and `constants/` directories are unused Expo template scaffolding and can be ignored.

The entire app lives in `App.js` as a multi-screen component using React Navigation bottom tabs. Two screens — `CameraScreen` and `FeedScreen` — plus a `VideoPlayer` modal component.

**Persistent storage layout** (written to `FileSystem.documentDirectory` at runtime):
- `clips/clip_<timestamp>.mp4` — permanently saved video clips
- `index.json` — array of `{ uri, timestamp, location: { latitude, longitude }, duration }` records

**Key packages:**
- `expo-camera` — `CameraView` with `mode="video"`, permissions via `useCameraPermissions` / `useMicrophonePermissions`
- `expo-file-system/next` — use the NEW API only: `File`, `Directory`, `Paths`. The legacy string-based API throws hard errors in this project. `text()` is async (must `await`); `create()`, `move()`, `write()` are sync.
- `expo-video` — `useVideoPlayer` hook + `VideoView` component for playback. Do NOT use expo-av, it is deprecated.
- `expo-location` — `useForegroundPermissions` + `Location.getCurrentPositionAsync` with `Accuracy.Balanced`
- `@react-navigation/bottom-tabs` — tab bar navigation between CameraScreen and FeedScreen

---

## Brand

### Colours
- Background: `#1F1F1F` (deep charcoal)
- Primary accent / record button / active states: `#C86A4A` (terracotta)
- Secondary / subtle UI / borders: `#7A5C4D` (film brown)
- All text: `#F5F1E8` (warm off-white)
- Map land: `#2E2E2B` (warm grey)
- REC indicator: `#E63946` (red)

### Aesthetic
Warm, raw, minimal. No gradients, no gloss, no bright whites. Default to less — empty space is intentional. Think old camcorder meets modern minimalism. Every design decision should reduce the temptation to pose, edit, or overthink.

### Typography
- UI text: system sans-serif (`-apple-system, sans-serif`)
- Camcorder stamp: `'Courier New', Courier, monospace`
- Never use fonts below 11px

---

## Camcorder Stamp Spec

The stamp is burned into clips at the moment of recording. Three distinct states:

### State 1 — Idle (screen open, not recording)
Top left only:
- Time: `Courier New`, `13px`, weight `500`, letter-spacing `0.05em`, `#C86A4A`, opacity `100%`
- Coordinates: `Courier New`, `11px`, weight `400`, letter-spacing `0.04em`, `#C86A4A`, opacity `85%`

### State 2 — Recording (button held)
Top left — REC dot added above time and coordinates:
- REC dot: `7px` red circle (`#E63946`), flashing animation `1s ease-in-out infinite`
- REC text: `Courier New`, `11px`, weight `500`, letter-spacing `0.08em`, `#E63946`
- Time and coordinates remain as State 1

### State 3 — Saved/uploaded clip
All four positions active:
- Top left: time + coordinates (as State 1, no REC dot)
- Bottom left: clip number — `■ 0003`, `Courier New`, `12px`, weight `400`, letter-spacing `0.06em`, `#C86A4A`, opacity `85%`
- Bottom right: date — `JUL 20 2024`, `Courier New`, `12px`, weight `400`, letter-spacing `0.06em`, `#C86A4A`, opacity `85%`

Location is captured on screen entry — not at press. Stamps are live the moment the record screen opens.

---

## Screen Specs

### Record Screen
- Full screen camera preview, `#1F1F1F` background
- Camcorder stamps visible on screen entry (State 1)
- Record button: centred near bottom, above tab bar
  - Idle: `72px` circle, `3px` terracotta border, terracotta filled inner dot (`52px`), transparent gap between
  - Recording: outer ring and gap fill solid terracotta, inner dot separated by `3px` dark border
- Tab bar: visible when idle, disappears when recording starts, reappears on release
- Recording state additions:
  - Thin terracotta border pulses around entire screen edge
  - REC dot appears top left (State 2 stamp)
  - Clip number and date do NOT appear until clip is saved (State 3)

### Feed Screen
- Full screen vertical scroll — one clip per screen, plays on entry
- Background: `#1F1F1F`
- Camcorder stamp on each clip (State 3 — all four positions)
- Map transition between clips: zoom out to map (~0.5s) → hold on map with pin pulsing (~1s) → zoom into next clip (~0.5s). Total ~2 seconds.
- Username strip above tab bar:
  - Left: avatar circle (`28px`, film brown bg, initials) + username (`-apple-system`, `15px`, weight `500`, `#F5F1E8`) + `→`
  - Right: Here Too button — `42px` circular button, `1.5px` terracotta border, `rgba(200,106,74,0.12)` background, terracotta location pin icon inside. No text label.
- Tab bar visible at all times on feed screen
- Empty state: curated featured clips populate the feed with a subtle prompt at top — `"Vora is better with your people. Add someone to your Circle."` — `#7A5C4D`, tappable to search. Disappears permanently after first Circle connection.

### Map Screen (Profile)
- Full screen map — deep charcoal (`#1F1F1F`) water, warm grey (`#2E2E2B`) land, subtle street lines (`#383835` at 40-60% opacity). No labels, no text on map.
- Profile tab: floating at top, `12px` margin left and right (map visible behind). `rgba(31,31,31,0.92)` background, `0.5px solid #333330` border, `14px` border radius. Contains: name (`#F5F1E8`, `15px`, weight `500`) + home location (`#7A5C4D`, `12px`) + Circle indicator button (terracotta checkmark, film brown border).
- Clip pins: `38x38px` square, `8px` border radius, `1.5px solid #C86A4A` border, thumbnail of clip inside. Centred stem (`2px` wide, `8px` tall, `#C86A4A`) + dot anchor (`6px` circle, `#C86A4A`). Slight random rotation for organic feel.
- Cluster pins: same as clip pin but `42x42px`. Terracotta circle top left (`15px`) with white clip count number inside.
- Here Too pins: `38x38px` square, `8px` border radius, `1.5px solid #7A5C4D` border, `rgba(122,92,77,0.12)` background, location pin icon in `#7A5C4D`. Same stem and dot in `#7A5C4D`.
- Cluster behaviour: tap opens swipe view (side to side). Default oldest to newest. Filter to reverse. Remembers position on re-entry.
- Map tab active in terracotta when on this screen.

### Navigation (Tab Bar)
Three tabs, always visible except during active recording:
```
[ Feed ]  [ ◉ Record ]  [ Map ]
```
- Record button: `52px` circle, `2px solid #C86A4A` border, `36px` terracotta filled inner dot. Ring gap visible between border and dot.
- Active tab: terracotta (`#C86A4A`)
- Inactive tabs: `#F5F1E8` at `40%` opacity
- Tab bar background: `#1F1F1F`, `0.5px solid #2a2a2a` top border
- Tab bar height: `60px`

---

## The Circle System
Mutual connection system. Both users must accept for a connection to exist. One-sided follows do not exist. Circle connections unlock the Feed tab content and map visibility.

## "Here Too" mechanic
Tap Here Too on a Circle member's clip. Original poster receives notification: `"[Name] said they were here too — approve or decline?"`. If approved, clip appears on the tapper's map at that location. Never reposted. Original poster retains full ownership.

---

## Build Status

### Version 1 — COMPLETE
- Slice 1 ✅ — camera screen, press and hold recording, brand colours
- Slice 2 ✅ — permanent local storage, index.json `{ uri, timestamp, location, duration }`
- Slice 3 ✅ — feed screen, clip list, fullscreen playback via expo-video
- Slice 4 ✅ — delete with native confirmation
- Slice 5 ✅ — automatic GPS location tagging at moment of press
- Slice 6 ✅ — human readable dates and duration on feed cards
- Slice 7 ✅ — skipped, camera recovery working natively on device
- Slice 8 ⏸️ — EAS production build pending Apple Developer account

### Version 2 — IN PROGRESS
Design review complete. Build begins next session.
- V2 Slice 1 — design polish on all existing screens
- V2 Slice 2 — Supabase setup and user accounts
- V2 Slice 3 — cloud clip storage
- V2 Slice 4 — map screen
- V2 Slice 5 — camcorder stamp burned into clips
- V2 Slice 6 — Circle connection system
- V2 Slice 7 — Here Too mechanic
- V2 Slice 8 — feed scroll and map transition
- V2 Slice 9 — TestFlight distribution
- V2 Slice 10 — onboarding (partner leading design)

---

## What Vora Never Does
- No likes, view counts, or engagement metrics
- No comments
- No editing or filters after recording
- No algorithmic content ranking
- No advertising
- No For You page
- Nothing that makes the user feel like a content creator