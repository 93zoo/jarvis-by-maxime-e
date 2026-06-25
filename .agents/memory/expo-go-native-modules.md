---
name: Expo Go native module compatibility
description: Which Expo packages crash Expo Go SDK54 vs which are safe to use
---

## Rule
Any Expo package that calls `requireNativeModule('...')` at **module import time** will crash Expo Go if that native module isn't in Expo Go's binary, regardless of whether the package is listed as SDK-compatible.

**Why:** `requireNativeModule` from `expo-modules-core` throws synchronously when the module name isn't registered. Since imports run at bundle evaluation, the crash happens before any UI renders, producing Expo Go's "Something went wrong" screen with no JS stack shown.

**How to apply:** Before adding any Expo package to the mobile app that will run in Expo Go, check its `build/Expo*.android.js`:
- If it contains `requireNativeModule(...)` → it WILL crash Expo Go if not bundled
- If it exports `{}` or uses `NativeModules.X` with a fallback → likely safe

**Known crashers in this project (Expo SDK 54 / Expo Go):**
- `expo-contacts@15.0.11` — `requireNativeModule('ExpoContacts')` at import
- `expo-intent-launcher@13.0.8` — `requireNativeModule('ExpoIntentLauncher')` on Android at import

**Safe alternatives (zero native modules):**
- `Linking` (React Native built-in) — opens tel:, sms:, content://contacts, contacts://
- `expo-haptics` — included in Expo Go
- All React Native core APIs

**ContactsPicker pattern:** Use `Linking.openURL('content://contacts/people')` (Android) or `contacts://` (iOS) to open the system contacts app. Full in-app contact list requires APK/dev-build where native modules load properly.
