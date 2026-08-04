/**
 * LinearGradientSafe — drop-in replacement for expo-linear-gradient.
 *
 * expo-linear-gradient v15 crashes Android inside Expo Go with:
 *   'ViewManagerAdapter_ExpoLinearGradient must be a function (received undefined)'
 *
 * On web the real LinearGradient works fine. On native (Expo Go) we fall back
 * to a plain View tinted with the average of the gradient colors — visually
 * close, zero native dependency. In a standalone build the real component can
 * be re-enabled later.
 */
import React from 'react';
import { Platform, StyleSheet, View, ViewStyle, StyleProp, ColorValue } from 'react-native';
import { LinearGradient as RealLinearGradient } from '@/lib/LinearGradientSafe';

export interface LinearGradientProps {
  colors: readonly (ColorValue | string)[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  locations?: readonly number[];
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto';
}

/** Blend two hex colors at 50% to approximate the gradient's mid tone. */
function midColor(colors: readonly (ColorValue | string)[]): string {
  const hexes = colors
    .map((c) => (typeof c === 'string' ? c : ''))
    .filter((c) => /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c));
  if (hexes.length < 2) return hexes[0] ?? 'rgba(0,0,0,0.4)';
  const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = parse(hexes[0]);
  const [r2, g2, b2] = parse(hexes[hexes.length - 1]);
  const m = (a: number, b: number) => Math.round((a + b) / 2).toString(16).padStart(2, '0');
  return `#${m(r1, r2)}${m(g1, g2)}${m(b1, b2)}`;
}

export function LinearGradient({ colors, style, children, pointerEvents }: LinearGradientProps) {
  if (Platform.OS === 'web') {
    return (
      <RealLinearGradient colors={colors as any} style={style} pointerEvents={pointerEvents}>
        {children}
      </RealLinearGradient>
    );
  }
  // Native fallback: solid tint approximating the gradient
  return (
    <View style={[style, { backgroundColor: midColor(colors) }]} pointerEvents={pointerEvents}>
      {children}
    </View>
  );
}

export default LinearGradient;
