---
name: vector-icons v15 font loading / Android icon rendering
description: Why MDI fails on Android and how to fix it — BMP codepoints only work reliably.
---

## Rule
**Use Feather ONLY in this project.** Never MaterialCommunityIcons (MDI, non-BMP codepoints break Android) and never Ionicons (pre-bundled in Expo Go SDK 54 with an older codepoint table → CJK/□ glyphs even though Font.isLoaded('ionicons') is true). All icons migrated to Feather; validate-icons pins the icon maps to Feather and also checks dynamic `name={cond ? 'a' : 'b'}` / `?? 'fallback'` expressions.

MDI has been fully replaced with Ionicons across all 22 source files. Do not re-introduce MDI imports.

## Root Cause (confirmed empirically)
MDI uses **Supplementary Private Use Area-A** codepoints (U+F0000–U+FFFFF, Plane 15):
- 7447 / 7448 MDI glyphs are above the BMP → require **UTF-16 surrogate pairs**
- Android's native Text renderer does not correctly resolve custom fonts loaded via `expo-font` for surrogate-pair characters → falls back to system/emoji font → wrong glyphs (emoji, hieroglyphs, middle-finger, etc.)
- Feather: all 287 glyphs in BMP (0xF100–0xF21E) ✓
- Ionicons: all 1357 glyphs in BMP (0xF100–0xF64C) ✓

**iOS** handles surrogate pairs correctly (CoreText) — MDI would work on iOS but not Android.

## Font Loading Rule — use `.font` spread in useFonts
**Always pre-load Feather and Ionicons via `...Ionicons.font` / `...Feather.font` spread in `useFonts`.**

`Ionicons.js` imports the TTF directly: `import font from './vendor/.../Ionicons.ttf'`.
`Ionicons.font` = `{ 'ionicons': <that exact Metro asset reference> }`.
Spreading it in useFonts registers the font under the same key the library uses → `Font.isLoaded('ionicons')` returns true after a real native registration → icons render correctly on both Android and web.

**Why NOT explicit `require()` paths**: even though the path resolves to the same file, the Metro asset ID can differ from what the library's internal `import` produces (ESM vs CJS resolution), causing the native registration to succeed under a different hash while the component's `Font.isLoaded()` check uses the library's hash → mismatch.

**Why NOT no-preload**: icons flash blank on first render; and on Android Expo Go a full JS restart is needed each time (no Fast Refresh benefit).

Do NOT add `material-community` back. Do NOT use explicit `require()` paths for icon fonts.

## NativeTabLayout guard (iOS 26+)
`isLiquidGlassAvailable()` returns `true` in Expo Go on iOS 26+ → activates NativeTabLayout with SF Symbols (not available in Expo Go → □ icons).
Guard: `const IS_EXPO_GO = Constants.executionEnvironment === 'storeClient'` → only use `NativeTabLayout` when `!IS_EXPO_GO`.

## Icônes dans les maps non-typées (pièges fréquents)
Ces noms MDI apparaissaient dans des `Record<string, any>` ou `Record<string, string>` non vérifiés par TypeScript — ils ne déclenchent aucune erreur de compilation mais cassent à l'exécution sur Android :

| Fichier | Nom MDI | Remplacement Ionicons |
|---------|---------|----------------------|
| FirstForgeTutorial | map-marker-radius | map-outline |
| AlloyWorkshop | view-list | list-outline |
| inventory tab | pickaxe | hammer-outline |
| world tab | moon-waning-crescent | moon-outline |
| world tab | weather-sunset-up | partly-sunny-outline |
| world tab | weather-sunny | sunny-outline |
| world tab | weather-sunset-down | cloudy-night-outline |
| index tab | weather-tornado | thunderstorm-outline |
| profile | bow-arrow | fitness-outline |
| profile | crystal-ball | globe-outline |
| profile | knife | cut-outline |
| profile | star-shooting | sparkles |
| profile | arm-flex | fitness-outline |
| profile | diamond-stone | diamond |
| revenuecat | anvil | hammer |

**Comment les trouver :** `grep -rn "icon: '" <dir>` sur tous les fichiers .tsx/.ts, puis valider chaque valeur contre les deux glyph maps Feather.json + Ionicons.json. Le warning Expo `"X" is not a valid icon name for family "ionicons"` confirme les noms cassés en runtime.

## MDI → Ionicons name mapping (key entries)
| MDI | Ionicons |
|-----|----------|
| anvil | hammer-outline |
| auto-fix | color-wand-outline |
| bag-personal | bag |
| chevron-right | chevron-forward |
| crown | ribbon |
| diamond | diamond |
| fire | flame |
| flask-empty-outline | flask-outline |
| gift-open-outline | gift-outline |
| gold | cash |
| hammer-wrench | construct |
| lightning-bolt | flash |
| lock | lock-closed |
| magnify | search |
| merge | git-merge |
| package-down | download-outline |
| package-variant | cube-outline |
| pine-tree | leaf-outline |
| star-circle | star |
| star-four-points | sparkles |
| sword | cut-outline |
| sword-cross | skull |
| timer-sand | hourglass-outline |
| treasure-chest | gift-outline |
| trophy | trophy |
| weight | barbell-outline |

**Why:** This mapping was validated against the live Ionicons glyph map (all BMP).
