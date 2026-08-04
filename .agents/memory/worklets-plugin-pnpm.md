---
name: Worklets babel plugin under pnpm
description: babel-preset-expo auto-include of react-native-worklets/plugin silently fails under pnpm — explicit plugin declaration in babel.config.js is REQUIRED
---

In `artifacts/mobile/babel.config.js`, `plugins: ['react-native-worklets/plugin']` MUST stay declared explicitly.

**Why:** babel-preset-expo (SDK 54) tries to auto-include the worklets plugin, but its `hasModule('react-native-worklets')` check resolves from the preset's own location — under pnpm's strict node_modules, that resolution fails (verified: `require.resolve` from preset dir throws), so the plugin is silently skipped. Without it, NO file gets workletized and the app crashes at the first `react-native-reanimated` import with "[Worklets] Failed to create a worklet". Conversely, do NOT assume the preset already includes it and remove the explicit line.

**How to apply:** any time babel.config.js is regenerated, rolled back, or "Failed to create a worklet" / "updater is not a function" appears on device, check this line exists. Also clear Metro caches (`artifacts/mobile/.expo`, `node_modules/.cache`, `/tmp/metro-*`) after any babel config change — stale transformed bundles reproduce the same error.
