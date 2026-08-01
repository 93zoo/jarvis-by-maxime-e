---
name: Animated mixed-driver crash
description: Never animate color (JS driver) on an element also driven by useNativeDriver:true
---

Rule: on native (Expo Go/Hermes), do not animate a `color`/non-native prop with `useNativeDriver:false` on an element whose other styles (opacity, transform) are animated with `useNativeDriver:true`. Starting a native animation converts the whole AnimatedProps graph to native; the later JS-driven timing then throws "Attempting to run JS driven animation on animated node that has been moved to 'native'".

**Why:** crashed the launch intro (letter color "cooling" effect) on Android while web silently worked (web falls back to JS driver, masking the bug).

**How to apply:** for color transitions, stack two layers (hot/cold color) and cross-fade their opacities with a single native-driven value (`Animated.multiply(visibility, cooled)` / inverse interpolation). Web preview never catches this class of bug — check Expo Go/Android logs.
