# CLAUDE.md

## Commands
```bash
npx expo start
npx expo install <pkg>
```

Rules:
- Use `npx expo install`, never `npm install`
- If `npx expo start` exits silently, ensure `index.js` contains:

```js
import 'expo/AppEntry';
```

## Repo map
Active files:
- `App.js` — nav + `RecordingContext`
- `CameraScreen.js` — record, save, upload
- `FeedScreen.js` — clip list, delete
- `VideoPlayer.js` — playback + stamp overlay
- `MapScreen.js` — map / placeholder
- `constants.js` — colors, helpers, stamp styles, `RecordingContext`

Ignore unless explicitly needed:
- `app/`
- `components/`
- `hooks/`

## Storage
Runtime local storage:
- `clips/clip_<timestamp>.mp4`
- `index.json` with `{ uri, timestamp, location, duration }`

## Critical implementation rules
- Use `expo-video`, not `expo-av`
- Use `expo-file-system/next` only: `File`, `Directory`, `Paths`
- In `expo-file-system/next`, `text()` is async and must be awaited
- `create()`, `move()`, `write()` are sync
- Do not use the legacy Expo file system API
- Supabase Storage uploads in React Native must use `ArrayBuffer`, not `blob`
- Follow the existing `uploadClip` pattern in `CameraScreen.js`

## Packages in use
- `expo-camera`
- `expo-video`
- `expo-location`
- `expo-file-system/next`
- `@react-navigation/bottom-tabs`

## UI
- Use existing design tokens from `constants.js`
- Style direction: warm, raw, minimal
- No gradients or gloss
- Stamp font: monospace