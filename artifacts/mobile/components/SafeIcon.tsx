/**
 * SafeIcon.tsx
 *
 * Drop-in wrappers around Feather that validate the requested glyph name at
 * render time in dev builds, fall back to a known-good icon, and log a clear
 * warning so broken-square bugs are caught immediately.
 *
 * In production builds the validation code is stripped (guarded by __DEV__)
 * so there is zero runtime overhead in released apps.
 *
 * Usage:
 *   <SafeFeather name="tool" size={20} color="#fff" />
 *
 * NOTE: All Ionicons have been migrated to Feather. Ionicons is pre-bundled in
 * Expo Go with older codepoints that don't match @expo/vector-icons v15 →
 * broken/CJK glyphs on Android. Feather is NOT pre-bundled and loads correctly.
 * SafeIonicons is kept as a Feather alias for backwards compat with any call sites.
 */

import React from 'react';
import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

// ── Glyphmap access ────────────────────────────────────────────────────────────

const _featherGlyphs: Set<string> | null = (() => {
  if (!__DEV__) return null;
  try {
    return new Set(Object.keys((Feather as any).getRawGlyphMap?.() ?? {}));
  } catch {
    return null;
  }
})();

// ── Validation helper ─────────────────────────────────────────────────────────

function warnIfMissing(
  iconSet: string,
  name: string,
  glyphs: Set<string> | null,
  fallback: string,
): void {
  if (!__DEV__ || !glyphs) return;
  if (!glyphs.has(name)) {
    console.warn(
      `[SafeIcon] ⚠️  "${name}" is not a valid ${iconSet} glyph name. ` +
      `Rendering fallback "${fallback}" instead. ` +
      `Run \`pnpm --filter @workspace/mobile validate-icons\` to find all broken names.`,
    );
  }
}

// ── SafeFeather ────────────────────────────────────────────────────────────────

const FEATHER_FALLBACK = 'alert-circle' as const;

type FeatherProps = ComponentProps<typeof Feather>;

/**
 * Feather wrapper with dev-time glyph validation.
 * Falls back to "alert-circle" if the name is missing from the font.
 */
export function SafeFeather(props: FeatherProps) {
  const { name, ...rest } = props;

  if (__DEV__) {
    warnIfMissing('Feather', name as string, _featherGlyphs, FEATHER_FALLBACK);
    const safeName =
      _featherGlyphs && !_featherGlyphs.has(name as string)
        ? FEATHER_FALLBACK
        : name;
    return <Feather name={safeName as FeatherProps['name']} {...rest} />;
  }

  return <Feather name={name} {...rest} />;
}

/**
 * Alias for SafeFeather — kept for backwards compatibility.
 * All icons previously using Ionicons have been migrated to Feather.
 */
export const SafeIonicons = SafeFeather;
