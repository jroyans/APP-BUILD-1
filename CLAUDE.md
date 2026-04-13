# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

---

## Commands
```bash
npx expo start          # start dev server
npx expo install <pkg>  # ALWAYS use this — never plain npm install
```

NEVER run plain `npm install` — it upgrades packages beyond Expo Go compatibility and breaks the dev server.

If `npx expo start` silently exits with no output, check `index.js` — if empty, fix with:
```bash
printf "import 'expo/AppEntry';" > index.js
```

---

## Architecture

Entry point is `App.js` → `index.js`. The `app/`, `components/`, `hooks/`, `constants/` directories are unused scaffolding — ignore them.

**File structure:**
- `App.js` — navigation wrapper, RecordingContext, tab bar
- `CameraScreen.js` — camera, recording, stamps
- `FeedScreen.js` — clip list, delete
- `VideoPlayer.js` — fullscreen playback, stamp overlay
- `MapScreen.js` — placeholder
- `constants.js` — COLORS, shared helpers, stampStyles, RecordingContext

**Storage** (written to `FileSystem.documentDirectory` at runtime):
- `clips/clip_<timestamp>.mp4` — saved video clips
- `index.json` — array of `{ uri, timestamp, location, duration }` records

**Key packages:**
- `expo-camera` — `CameraView`, `mode="video"`, `useCameraPermissions` / `useMicrophonePermissions`
- `expo-file-system/next` — NEW API only: `File`, `Directory`, `Paths`. `text()` is async (must `await`). `create()`, `move()`, `write()` are sync. Legacy API throws hard errors.
- `expo-video` — `useVideoPlayer` + `VideoView`. Do NOT use expo-av.
- `expo-location` — `useForegroundPermissions` + `Location.getCurrentPositionAsync`
- `@react-navigation/bottom-tabs` — three tab navigation: Feed, Record, Map
CRITICAL: All binary file uploads to Supabase Storage must use ArrayBuffer approach — 
blob uploads produce empty files in React Native. See uploadClip in CameraScreen.js 
for the working pattern.

---

## Brand

- Background: `#1F1F1F`
- Accent / record button: `#C86A4A`
- Secondary / borders: `#7A5C4D`
- Text: `#F5F1E8`
- Surface / cards: `#2a2a2a`
- REC indicator: `#E63946`
- Map land: `#2E2E2B`

Aesthetic: warm, raw, minimal. No gradients, no gloss. Empty space is intentional.
Stamp font: `Courier New, Courier, monospace`

---

## Build Status

### Version 1 — Complete
- Slice 1 ✅ — recording, local storage, feed, delete, location, dates, duration
- Slice 8 ⏸️ — EAS production build pending Apple Developer account

### Version 2 
- V2 Slice 1 — design polish, three-tab nav, camcorder stamps, component split
- V2 Slice 2 — Supabase setup and user accounts (next)
- V2 Slice 3 — cloud clip storage
- V2 Slice 4 — map screen
- V2 Slice 5 — camcorder stamp burned into clips
- V2 Slice 6 — Circle connection system
- V2 Slice 7 — Here Too mechanic
- V2 Slice 8 — feed scroll and map transition
- V2 Slice 9 — TestFlight distribution
- V2 Slice 10 — onboarding