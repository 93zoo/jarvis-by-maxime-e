---
name: expo-audio native sounds
description: How native audio works in Forge & Kingdoms — expo-audio version, lazy import pattern, ambience limitation.
---

The correct expo-audio version for expo SDK 54 is `~1.1.1` (not 57.x).

**Why:** expo-audio is versioned independently from expo SDK. Running `expo install expo-audio` installs the latest (57.x) which mismatches. Always pin `~1.1.1` for SDK 54.

**How to apply:** Use `require('expo-audio').createAudioPlayer` lazily (not a top-level import) wrapped in try/catch so a missing native module doesn't crash the app. The helper `getCreateAudioPlayer()` in AudioManager.ts implements this pattern.

**Ambience on native:** hammer_strike.mp3 is looped at low volume as a stand-in forge ambience. A proper ambience track (task #77) would replace this. The `nativeAmbiencePlayer` field on AudioManagerClass manages this loop.

**Volume on native:** set `player.volume` directly (0–1 range) instead of calling `setVolumeAsync`.
