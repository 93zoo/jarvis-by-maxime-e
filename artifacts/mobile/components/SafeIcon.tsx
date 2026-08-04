/**
 * SafeIcon.tsx
 *
 * Drop-in wrappers around the SVG-based Feather component that validate the
 * requested glyph name at render time in dev builds, fall back to a known-good
 * icon, and log a clear warning so broken-icon bugs are caught immediately.
 *
 * The underlying icons are pure SVG (react-native-svg) — no font loading, no
 * Expo Go substitution, no codepoint mismatches. In production builds the
 * validation code is stripped (guarded by __DEV__).
 *
 * Usage:
 *   <SafeFeather name="tool" size={20} color="#fff" />
 */

import React from 'react';
import Feather, { type FeatherProps } from './Feather';
import { FEATHER_GLYPHS } from './featherGlyphs';

// ── Glyph access ───────────────────────────────────────────────────────────────

const _featherGlyphs: Set<string> | null = __DEV__
  ? new Set(Object.keys(FEATHER_GLYPHS))
  : null;

// ── Validation helper ─────────────────────────────────────────────────────────

const FEATHER_FALLBACK = 'alert-circle';

function warnIfMissing(name: string): void {
  if (!__DEV__ || !_featherGlyphs) return;
  if (!_featherGlyphs.has(name)) {
    console.warn(
      `[SafeIcon] ⚠️  "${name}" is not a valid Feather glyph name. ` +
        `Rendering fallback "${FEATHER_FALLBACK}" instead.`,
    );
  }
}

// ── SafeFeather ────────────────────────────────────────────────────────────────

/**
 * Feather wrapper with dev-time glyph validation.
 * Falls back to "alert-circle" if the name is missing from the icon set.
 */
export function SafeFeather(props: FeatherProps) {
  const { name, ...rest } = props;

  if (__DEV__) {
    warnIfMissing(name as string);
    const safeName =
      _featherGlyphs && !_featherGlyphs.has(name as string) ? FEATHER_FALLBACK : name;
    return <Feather name={safeName} {...rest} />;
  }

  return <Feather name={name} {...rest} />;
}

/**
 * Alias for SafeFeather — kept for backwards compatibility.
 */
export const SafeIonicons = SafeFeather;
