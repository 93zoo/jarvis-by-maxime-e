---
name: vector-icons v15 font loading
description: @expo/vector-icons v15 dropped the .font static property; useFonts spreads are silent no-ops.
---

## Rule
Do NOT use `...Feather.font` or `...MaterialCommunityIcons.font` spreads in `useFonts`. In v15 these properties no longer exist — the spread is a silent no-op and icons render as □ on Android.

**Why:** `@expo/vector-icons` v15 changed font packaging. `Feather.js` ends with `createIconSet(glyphMap, 'feather', font)` and exposes no `.font` static property. The font family names are lowercase and non-obvious.

**How to apply:** Load TTF files directly in `useFonts` using the exact family name each `createIconSet` registers:
```js
'feather': require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Feather.ttf'),
'material-community': require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf'),
```
Verify the family name by checking the second argument of `createIconSet(glyphMap, '<name>', font)` in the icon set's `.js` file.
