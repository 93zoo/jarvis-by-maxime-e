/**
 * Feather.tsx
 *
 * SVG-based Feather icon component — drop-in replacement for
 * `@expo/vector-icons` Feather, with ZERO font loading.
 *
 * Why: font-based icons in Expo Go are unreliable (font substitution,
 * codepoint mismatches → CJK/□ glyphs). These render as real vector
 * paths via react-native-svg (bundled in Expo Go), so they can never
 * break regardless of fonts, platforms, or bundlers.
 *
 * Same props as the font version: name, size, color, style.
 */

import React from 'react';
import Svg, { Path, Circle, Line, Polyline, Polygon, Rect } from 'react-native-svg';
import { FEATHER_GLYPHS } from './featherGlyphs';

export type FeatherIconName = keyof typeof FEATHER_GLYPHS;

export interface FeatherProps {
  name: FeatherIconName | string;
  size?: number;
  color?: string;
  style?: object;
}

export default function Feather({ name, size = 24, color = '#000000', style }: FeatherProps) {
  const els = FEATHER_GLYPHS[name as string] ?? FEATHER_GLYPHS['alert-circle'];
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style as never}
    >
      {els.map((el, i) => {
        switch (el.t) {
          case 'path':
            return <Path key={i} d={el.p.d} />;
          case 'circle':
            return <Circle key={i} cx={el.p.cx} cy={el.p.cy} r={el.p.r} />;
          case 'line':
            return <Line key={i} x1={el.p.x1} y1={el.p.y1} x2={el.p.x2} y2={el.p.y2} />;
          case 'polyline':
            return <Polyline key={i} points={el.p.points} />;
          case 'polygon':
            return <Polygon key={i} points={el.p.points} />;
          case 'rect':
            return (
              <Rect
                key={i}
                x={el.p.x}
                y={el.p.y}
                width={el.p.width}
                height={el.p.height}
                rx={el.p.rx}
              />
            );
          default:
            return null;
        }
      })}
    </Svg>
  );
}
