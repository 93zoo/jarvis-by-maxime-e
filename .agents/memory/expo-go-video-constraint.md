---
name: Video in Expo Go SDK 54
description: Neither expo-video nor expo-av Video works for video playback in Expo Go SDK 54.
---

**Rule:** Do not attempt video playback in Expo Go SDK 54.

**Why:** Both `expo-video` (requires native build) and `expo-av`'s `Video` component (deprecated, native module stripped from Expo Go in SDK 54) cause the app to crash at module initialization — the JS bundle loads but the app silently dies before React renders anything.

**How to apply:**
- For the StudioSplash intro: use the pure-animation version (no video). The `.mp4` file lives at `assets/videos/intro.mp4` and can be integrated via `expo-video` in a future standalone/development build.
- If a feature requires video, gate it on `Constants.appOwnership !== 'expo'` and provide an animated fallback for Expo Go.
- When the user is ready to publish a standalone build, `expo-video` with `require('../assets/videos/intro.mp4')` is the correct approach.
