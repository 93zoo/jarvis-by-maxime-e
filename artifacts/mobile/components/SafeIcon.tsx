/**
 * SafeIcon.tsx
 *
 * Drop-in wrappers around Ionicons and Feather that validate the requested
 * glyph name at render time in dev builds, fall back to a known-good icon,
 * and log a clear warning so broken-square bugs are caught immediately.
 *
 * In production builds the validation code is stripped (guarded by __DEV__)
 * so there is zero runtime overhead in released apps.
 *
 * Usage — replace bare icon components:
 *   Before:  <Ionicons  name="hammer-outline" size={20} color="#fff" />
 *   After:   <SafeIonicons name="hammer-outline" size={20} color="#fff" />
 *
 *   Before:  <Feather name="tool" size={16} color="#fff" />
 *   After:   <SafeFeather name="tool" size={16} color="#fff" />
 *
 * The fallback icon rendered when a name is invalid:
 *   Ionicons → "help-circle-outline"
 *   Feather  → "alert-circle"
 */

import React from 'react';
import { Ionicons, Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

// ── Glyphmap access ────────────────────────────────────────────────────────────
// @expo/vector-icons exposes getRawGlyphMap() as a static method on each class.
// We call it once at module load to avoid repeated work.

const _ioniconsGlyphs: Set<string> | null = (() => {
  if (!__DEV__) return null;
  try {
    return new Set(Object.keys((Ionicons as any).getRawGlyphMap?.() ?? {}));
  } catch {
    return null;
  }
})();

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

// ── SafeIonicons ──────────────────────────────────────────────────────────────

const IONICONS_FALLBACK = 'help-circle-outline' as const;

type IoniconProps = ComponentProps<typeof Ionicons>;

/**
 * Ionicons wrapper with dev-time glyph validation.
 * Falls back to "help-circle-outline" if the name is missing from the font.
 */
export function SafeIonicons(props: IoniconProps) {
  const { name, ...rest } = props;

  if (__DEV__) {
    warnIfMissing('Ionicons', name as string, _ioniconsGlyphs, IONICONS_FALLBACK);
    const safeName =
      _ioniconsGlyphs && !_ioniconsGlyphs.has(name as string)
        ? IONICONS_FALLBACK
        : name;
    return <Ionicons name={safeName as IoniconProps['name']} {...rest} />;
  }

  return <Ionicons name={name} {...rest} />;
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
