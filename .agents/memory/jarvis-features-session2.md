---
name: JARVIS session 2 — features implemented
description: TTS OpenAI, GPS navigation, Tasks/Notes agenda, news, user profile — patterns and pitfalls
---

## TTS OpenAI (expo-av + FileSystem)

**Route:** `GET /api/tts?text=...&voice=onyx` — mounted in `index.ts` as `router.use('/tts', ttsRouter)` with `router.get('/')` inside `tts.ts` (NOT `/tts` inside — that makes `/api/tts/tts`).

**Mobile playback chain:** `FileSystem.downloadAsync(TTS_URL, cacheDir + 'jarvis_tts_<ts>.mp3')` → `Audio.Sound.createAsync({ uri })` → `sound.setOnPlaybackStatusUpdate` to detect `didJustFinish` → `unloadAsync()` + `FileSystem.deleteAsync(uri, { idempotent: true })` to clean up.

**Why:** Leaving temp MP3 files and Sound instances loaded causes native resource accumulation over long sessions.

**How to apply:** Always `stopAsync` + `unloadAsync` before replacing a Sound ref. Use `soundRef.current` pattern with nulling before async calls to avoid double-cleanup race.

## GPS Navigation

**Pattern:** `Location.requestForegroundPermissionsAsync()` → if granted, `getCurrentPositionAsync` → deep-link to `maps://` (iOS) or `google.com/maps` (Android). Falls back to destination-only URL if permission denied.

## Tasks/Notes Context

**Notification lifecycle:** When due date removed or task marked done, always clear `notificationId` synchronously in state *before* persisting. Async reschedule result always updates the ID (even to `undefined` on failure) to prevent stale IDs.

**Persistence:** AsyncStorage keys `@jarvis_tasks` and `@jarvis_notes`.

## expo-notifications API compatibility shim

`requestPermissionsAsync()` result shape varies across SDK versions. Safe pattern:
```typescript
const r = result as unknown as { granted?: boolean; status?: string };
return r.granted === true || r.status === 'granted';
```

## expo-file-system cacheDirectory

In some version configs, `FileSystem.cacheDirectory` isn't typed. Use:
```typescript
const fsAny = FileSystem as unknown as { cacheDirectory?: string };
const uri = (fsAny.cacheDirectory ?? '') + 'filename.mp3';
```

## Route type safety (expo-router typedRoutes)

New screens added to Stack must also appear in the typed routes. Until the type is regenerated, use `router.push('/tasks' as never)` to avoid TS errors.
