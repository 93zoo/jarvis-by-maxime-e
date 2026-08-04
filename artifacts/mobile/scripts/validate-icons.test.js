#!/usr/bin/env node
/**
 * validate-icons.test.js
 *
 * Comprehensive unit + integration tests for every detection path in
 * validate-icons.js:
 *
 *   Unit tests (inline re-implementations, no filesystem I/O):
 *     • extractJsxNames        — JSX <Component name="..." /> props
 *     • findConstNames         — SCREAMING_SNAKE_CASE const discovery
 *     • findIconMapAnnotations — @icon-map annotation parsing
 *     • extractConstBlock      — typed/untyped/wrapped const extraction
 *     • extractNamedMapValues  — NAMED_MAPS-style value extraction
 *     • extractIconKeyValues   — icon-key with aliases
 *     • extractAllStringValues — colon-string pair extraction
 *
 *   Integration tests (child_process, synthetic fixtures, env-var overrides):
 *     • JSX props — true positive / true negative
 *     • NAMED_MAPS — true positive / true negative
 *     • Auto-discovery, icon-key mode — true positive / true negative
 *     • Auto-discovery, @icon-map annotation mode — Feather / union / block-comment
 *     • Auto-discovery, ICON_KEY_ALIASES — alias key detected
 *     • Auto-discovery, pure-value mode — confidence filter pass/fail
 *     • JSON explicit (JSON_ICON_FILES) — true positive / true negative
 *     • JSON auto-discovered — true positive / true negative
 *
 * Run:  node scripts/validate-icons.test.js
 * Exit: 0 = all tests pass, 1 = any failure
 */

'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// ── Inline the pure helper functions under test ────────────────────────────────
// Copied verbatim from validate-icons.js so the unit-test section has zero
// side effects (no glyphmap I/O, no file scanning, no process.exit).

function extractJsxNames(src, componentName) {
  const results = [];
  const re = new RegExp(
    `<${componentName}[^>]*?\\bname=(?:"([^"]+)"|'([^']+)'|\\{['"\`]([^'"\`]+)['"\`]\\})`,
    'gs',
  );
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[1] ?? m[2] ?? m[3];
    if (name) results.push(name);
  }

  const exprRe = new RegExp(`<${componentName}[^>]*?\\bname=\\{([^}]+)\\}`, 'gs');
  while ((m = exprRe.exec(src)) !== null) {
    const expr = m[1];
    if (/^\s*['"\`][^'"\`]+['"\`]\s*$/.test(expr)) continue;
    const branchRe = /[?:]\s*['"\`]([a-z][a-z0-9-]*)['"\`]/g;
    let b;
    while ((b = branchRe.exec(expr)) !== null) results.push(b[1]);
  }
  return results;
}

function findConstNames(src) {
  const names = [];
  const re = /(?:^|[\s;])(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*[=:]/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    names.push(m[1]);
  }
  return names;
}

function findIconMapAnnotations(src) {
  const result = new Map();
  const VALID_SETS = new Set(['Ionicons', 'Feather', 'MaterialCommunityIcons']);
  const re = /@icon-map(?:\s+(Ionicons|Feather|MaterialCommunityIcons))?/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const iconSet = (m[1] && VALID_SETS.has(m[1])) ? m[1] : null;
    const after = src.slice(m.index + m[0].length);
    const constMatch = /^\s*(?:(?:\*\/|-->)\s*)?(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*[=:]/.exec(after);
    if (constMatch) {
      result.set(constMatch[1], iconSet);
    }
  }
  return result;
}

function extractConstBlock(src, constName) {
  const startRe = new RegExp(`(?:const|export\\s+const)\\s+${constName}\\b`);
  const startMatch = startRe.exec(src);
  if (!startMatch) return null;

  let i = startMatch.index + startMatch[0].length;
  let bracketDepth = 0;
  let angleDepth = 0;
  let foundEq = false;

  while (i < src.length) {
    const ch = src[i];
    if (ch === '<' && bracketDepth === 0) { angleDepth++; i++; continue; }
    if (ch === '>' && bracketDepth === 0) { angleDepth = Math.max(0, angleDepth - 1); i++; continue; }
    if (angleDepth > 0) { i++; continue; }
    if (ch === '{' || ch === '[' || ch === '(') { bracketDepth++; i++; continue; }
    if (ch === '}' || ch === ']' || ch === ')') { bracketDepth--; i++; continue; }
    if (ch === '=' && bracketDepth === 0 && src[i + 1] !== '=' && src[i + 1] !== '>') {
      foundEq = true; i++; break;
    }
    if (ch === ';' && bracketDepth === 0) break;
    i++;
  }
  if (!foundEq) return null;

  while (i < src.length && /\s/.test(src[i])) i++;

  const freezeMatch = /^Object\.freeze\(/.exec(src.slice(i));
  if (freezeMatch) i += freezeMatch[0].length;

  const angleAssertMatch = /^\(<(?:[^<>]|<[^<>]*>)*>\s*/.exec(src.slice(i));
  if (angleAssertMatch) i += angleAssertMatch[0].length;

  while (i < src.length && /\s/.test(src[i])) i++;

  const opener = src[i];
  if (opener !== '{' && opener !== '[') return null;
  const closer = opener === '{' ? '}' : ']';

  let depth = 0;
  let blockSrc = '';
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === opener) depth++;
    else if (ch === closer) depth--;
    blockSrc += ch;
    if (depth === 0) break;
  }
  return blockSrc || null;
}

function extractAllStringValues(blockSrc) {
  const values = [];
  const re = /:\s*(?:'([^']+)'|"([^"]+)")/g;
  let m;
  while ((m = re.exec(blockSrc)) !== null) {
    const val = m[1] ?? m[2];
    if (val) values.push(val);
  }
  return values;
}

function extractIconKeyValues(blockSrc, extraKeys = []) {
  const allKeys = ['icon', ...extraKeys];
  const keyPat = allKeys.map(k => `\\b${k}\\b`).join('|');
  const values = [];
  const re = new RegExp(`(?:${keyPat})\\s*:\\s*(?:'([^']+)'|"([^"]+)")`, 'g');
  let m;
  while ((m = re.exec(blockSrc)) !== null) {
    const val = m[1] ?? m[2];
    if (val) values.push(val);
  }
  return values;
}

function extractNamedMapValues(src, constName, iconKey) {
  const blockSrc = extractConstBlock(src, constName);
  if (!blockSrc) return [];
  const values = [];
  if (iconKey === null) {
    const valRe = /:\s*(?:'([^']+)'|"([^"]+)")/g;
    let vm;
    while ((vm = valRe.exec(blockSrc)) !== null) {
      const val = vm[1] ?? vm[2];
      if (val) values.push(val);
    }
  } else {
    const keyRe = new RegExp(`\\b${iconKey}\\s*:\\s*(?:'([^']+)'|"([^"]+)")`, 'g');
    let km;
    while ((km = keyRe.exec(blockSrc)) !== null) {
      const val = km[1] ?? km[2];
      if (val) values.push(val);
    }
  }
  return values;
}

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`      expected: ${JSON.stringify(expected)}`);
    console.error(`      actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertNotNull(label, actual) {
  if (actual !== null && actual !== undefined) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label} — expected non-null, got ${actual}`);
    failed++;
  }
}

function assertNull(label, actual) {
  if (actual === null || actual === undefined) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label} — expected null, got: ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertIncludes(label, haystack, needle) {
  if (typeof haystack === 'string' && haystack.includes(needle)) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`      expected to include: ${JSON.stringify(needle)}`);
    console.error(`      actual: ${JSON.stringify(typeof haystack === 'string' ? haystack.slice(0, 200) : haystack)}`);
    failed++;
  }
}

function assertMapEntry(label, map, key, expectedValue) {
  if (!map.has(key)) {
    console.error(`  ✗ ${label} — map has no key ${JSON.stringify(key)}`);
    failed++;
    return;
  }
  const actual = map.get(key);
  const ok = JSON.stringify(actual) === JSON.stringify(expectedValue);
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`      key: ${JSON.stringify(key)}`);
    console.error(`      expected value: ${JSON.stringify(expectedValue)}`);
    console.error(`      actual value:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertMapSize(label, map, expectedSize) {
  if (map.size === expectedSize) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label} — expected map.size=${expectedSize}, got ${map.size}`);
    failed++;
  }
}

// ── Unit tests: extractJsxNames ───────────────────────────────────────────────

console.log('\nextractJsxNames');

assert(
  'extracts double-quoted name from Ionicons',
  extractJsxNames(`<Ionicons name="home" size={24} />`, 'Ionicons'),
  ['home'],
);

assert(
  'extracts single-quoted name from Feather',
  extractJsxNames(`<Feather name='tool' size={16} />`, 'Feather'),
  ['tool'],
);

assert(
  'extracts template-literal-in-braces name',
  extractJsxNames(`<MaterialCommunityIcons name={\`sword\`} />`, 'MaterialCommunityIcons'),
  ['sword'],
);

assert(
  'extracts curly-string name  name={"star"}',
  extractJsxNames(`<Feather name={"star"} color="white" />`, 'Feather'),
  ['star'],
);

assert(
  'extracts multiple instances from same file',
  extractJsxNames(
    `<Ionicons name="home" />\n<Ionicons name="star" />\n<Ionicons name="heart" />`,
    'Ionicons',
  ),
  ['home', 'star', 'heart'],
);

assert(
  'does not extract from a different component',
  extractJsxNames(`<Feather name="home" />`, 'Ionicons'),
  [],
);

assert(
  'returns empty when component not present in source',
  extractJsxNames(`const x = 1;`, 'Feather'),
  [],
);

assert(
  'extracts both branches of a ternary  name={cond ? "a" : "b"}',
  extractJsxNames(`<Feather name={active ? 'zap' : 'tool'} />`, 'Feather'),
  ['zap', 'tool'],
);

assert(
  'extracts nullish fallback  name={MAP[k] ?? "fallback"}',
  extractJsxNames(`<Feather name={(ICONS[id] ?? 'box') as any} />`, 'Feather'),
  ['box'],
);

assert(
  'ternary: does not extract comparison operand',
  extractJsxNames(`<Feather name={base === 'miner' ? 'tool' : 'scissors'} />`, 'Feather'),
  ['tool', 'scissors'],
);

assert(
  'handles multiline JSX tag',
  extractJsxNames(
    `<Ionicons\n  name="heart"\n  size={20}\n  color="red"\n/>`,
    'Ionicons',
  ),
  ['heart'],
);

assert(
  'handles name= with surrounding whitespace in surrounding props',
  extractJsxNames(
    `<Feather size={16} name="check" color="#fff" />`,
    'Feather',
  ),
  ['check'],
);

// ── Unit tests: findConstNames ────────────────────────────────────────────────

console.log('\nfindConstNames');

assert(
  'finds a single SCREAMING_SNAKE_CASE const',
  findConstNames(`const RESOURCE_ICONS = { iron: 'hammer' };`),
  ['RESOURCE_ICONS'],
);

assert(
  'finds export const',
  findConstNames(`export const SKILL_ICONS = { fight: 'sword' };`),
  ['SKILL_ICONS'],
);

assert(
  'finds multiple consts in a file',
  findConstNames(
    `const ICON_A = { a: 'x' };\nconst ICON_B = { b: 'y' };`,
  ),
  ['ICON_A', 'ICON_B'],
);

assert(
  'skips camelCase identifier',
  findConstNames(`const myIcons = { a: 'x' };`),
  [],
);

assert(
  'skips lowercase identifier',
  findConstNames(`const icons = { a: 'x' };`),
  [],
);

assert(
  'finds const with type annotation  const X: Type = ...',
  findConstNames(`const AVATAR_PRESETS: Array<{ icon: string }> = [];`),
  ['AVATAR_PRESETS'],
);

assert(
  'does not include partial SCREAMING prefix (mixed-case) identifier',
  findConstNames(`const ICONs = {};`),
  [],
);

// ── Unit tests: findIconMapAnnotations ────────────────────────────────────────

console.log('\nfindIconMapAnnotations');

{
  const src = `// @icon-map Feather\nconst MY_ICONS = { x: 'tool' };`;
  const ann = findIconMapAnnotations(src);
  assertMapSize('line comment @icon-map Feather — map size 1', ann, 1);
  assertMapEntry('line comment @icon-map Feather — correct set', ann, 'MY_ICONS', 'Feather');
}

{
  const src = `// @icon-map\nconst MY_ICONS = { x: 'home' };`;
  const ann = findIconMapAnnotations(src);
  assertMapSize('line comment @icon-map (no set) — map size 1', ann, 1);
  assertMapEntry('line comment @icon-map (no set) — value is null (union)', ann, 'MY_ICONS', null);
}

{
  const src = `// @icon-map Ionicons\nconst AVATAR_ICONS = { a: 'person' };`;
  const ann = findIconMapAnnotations(src);
  assertMapEntry('line comment @icon-map Ionicons', ann, 'AVATAR_ICONS', 'Ionicons');
}

{
  const src = `/* @icon-map MaterialCommunityIcons */\nconst WEAPON_ICONS = { sword: 'sword' };`;
  const ann = findIconMapAnnotations(src);
  assertMapEntry('block comment @icon-map MaterialCommunityIcons', ann, 'WEAPON_ICONS', 'MaterialCommunityIcons');
}

{
  // When the set name doesn't match the Ionicons|Feather|MaterialCommunityIcons
  // alternation the regex matches only `@icon-map` (without consuming the
  // unknown word), leaving `InvalidSet\nconst MY_ICONS …` as the `after`
  // slice.  The constMatch regex requires `const` immediately after optional
  // whitespace, so it never fires — the annotation has no effect.
  const src = `// @icon-map InvalidSet\nconst MY_ICONS = { x: 'home' };`;
  const ann = findIconMapAnnotations(src);
  assertMapSize('invalid set name — annotation silently ignored, map empty', ann, 0);
}

{
  const src = `const MY_ICONS = { x: 'home' };`;
  const ann = findIconMapAnnotations(src);
  assertMapSize('no annotation — empty map', ann, 0);
}

{
  const src = `// @icon-map Feather\nexport const EXPORT_ICONS = { box: 'box' };`;
  const ann = findIconMapAnnotations(src);
  assertMapEntry('@icon-map before export const', ann, 'EXPORT_ICONS', 'Feather');
}

// ── Unit tests: extractConstBlock ────────────────────────────────────────────

console.log('\nextractConstBlock — untyped forms');

assert(
  'plain object literal',
  extractConstBlock(`const ENEMY_ICONS = { goblin: 'skull', dragon: 'dragon' };`, 'ENEMY_ICONS'),
  `{ goblin: 'skull', dragon: 'dragon' }`,
);

assert(
  'export const object literal',
  extractConstBlock(`export const SKILL_ICONS = { fight: 'sword', magic: 'star' };`, 'SKILL_ICONS'),
  `{ fight: 'sword', magic: 'star' }`,
);

assert(
  'array of objects',
  extractConstBlock(`const PRESETS = [{ id: 'a', icon: 'home' }, { id: 'b', icon: 'star' }];`, 'PRESETS'),
  `[{ id: 'a', icon: 'home' }, { id: 'b', icon: 'star' }]`,
);

assert(
  'Object.freeze wrapper',
  extractConstBlock(`const REGION_ICONS = Object.freeze({ forest: 'tree', cave: 'mountain' });`, 'REGION_ICONS'),
  `{ forest: 'tree', cave: 'mountain' }`,
);

console.log('\nextractConstBlock — TypeScript typed forms');

assert(
  'simple type annotation  const X: string = ...',
  extractConstBlock("const ICONS: string = 'tree';", 'ICONS'),
  null, // string literal, not an object/array — should return null
);

assert(
  'Record<string,string> type annotation',
  extractConstBlock(
    `const ENEMY_ICONS: Record<string, string> = { goblin: 'skull', dragon: 'dragon' };`,
    'ENEMY_ICONS',
  ),
  `{ goblin: 'skull', dragon: 'dragon' }`,
);

assert(
  'inline object type annotation  const X: { k: string } = ...',
  extractConstBlock(
    `const ENEMY_ICONS: { [key: string]: string } = { goblin: 'skull' };`,
    'ENEMY_ICONS',
  ),
  `{ goblin: 'skull' }`,
);

assert(
  'array type annotation  const X: Foo[] = [...]',
  extractConstBlock(
    `const PRESETS: Array<{ id: string; icon: string }> = [{ id: 'a', icon: 'home' }];`,
    'PRESETS',
  ),
  `[{ id: 'a', icon: 'home' }]`,
);

assert(
  'export const with Record type',
  extractConstBlock(
    `export const REGION_ICONS: Record<string, string> = { forest: 'tree', cave: 'mountain' };`,
    'REGION_ICONS',
  ),
  `{ forest: 'tree', cave: 'mountain' }`,
);

assert(
  'type annotation with nested generic  Partial<Record<K, V>>',
  extractConstBlock(
    `const ICONS: Partial<Record<EnemyId, string>> = { goblin: 'skull' };`,
    'ICONS',
  ),
  `{ goblin: 'skull' }`,
);

console.log('\nextractConstBlock — Object.freeze and TypeScript assertion wrappers');

assert(
  'Object.freeze wrapper — extracts inner object',
  extractConstBlock(`const REGION_ICONS = Object.freeze({ forest: 'tree', cave: 'mountain' });`, 'REGION_ICONS'),
  `{ forest: 'tree', cave: 'mountain' }`,
);

assert(
  'Object.freeze wrapper with type annotation',
  extractConstBlock(
    `const REGION_ICONS: Record<string, string> = Object.freeze({ forest: 'tree', cave: 'mountain' });`,
    'REGION_ICONS',
  ),
  `{ forest: 'tree', cave: 'mountain' }`,
);

assert(
  '`as const` suffix — extracts object before suffix',
  extractConstBlock(`const ICONS = { sword: 'sword', bow: 'bow' } as const;`, 'ICONS'),
  `{ sword: 'sword', bow: 'bow' }`,
);

assert(
  '`as const` suffix with export',
  extractConstBlock(`export const ICONS = { sword: 'sword', bow: 'bow' } as const;`, 'ICONS'),
  `{ sword: 'sword', bow: 'bow' }`,
);

assert(
  '(<Type>{ }) — angle-bracket type assertion',
  extractConstBlock(`const ICONS = (<Record<string, string>>{ sword: 'sword', bow: 'bow' });`, 'ICONS'),
  `{ sword: 'sword', bow: 'bow' }`,
);

assert(
  '(<Type[]>[ ]) — angle-bracket assertion wrapping an array',
  extractConstBlock(
    `const PRESETS = (<Array<{ icon: string }>>[{ id: 'a', icon: 'home' }]);`,
    'PRESETS',
  ),
  `[{ id: 'a', icon: 'home' }]`,
);

assert(
  '(<SimpleType>{ }) — plain type name without generics',
  extractConstBlock(`const ICONS = (<IconMap>{ star: 'star', home: 'home' });`, 'ICONS'),
  `{ star: 'star', home: 'home' }`,
);

assert(
  'Object.freeze([…]) — array literal',
  extractConstBlock(
    `const PRESETS = Object.freeze([{ id: 'a', icon: 'home' }, { id: 'b', icon: 'star' }]);`,
    'PRESETS',
  ),
  `[{ id: 'a', icon: 'home' }, { id: 'b', icon: 'star' }]`,
);

assert(
  'export const Object.freeze([…]) — exported array literal',
  extractConstBlock(
    `export const PRESETS = Object.freeze([{ id: 'a', icon: 'home' }, { id: 'b', icon: 'star' }]);`,
    'PRESETS',
  ),
  `[{ id: 'a', icon: 'home' }, { id: 'b', icon: 'star' }]`,
);

assert(
  'Object.freeze((<Type>[…])) — combined Object.freeze + angle-bracket assertion wrapping array',
  extractConstBlock(
    `const PRESETS = Object.freeze((<Array<{ icon: string }>>[{ id: 'a', icon: 'home' }]));`,
    'PRESETS',
  ),
  `[{ id: 'a', icon: 'home' }]`,
);

assert(
  'export const Object.freeze((<Type>[…])) — exported combined wrapper',
  extractConstBlock(
    `export const PRESETS = Object.freeze((<Array<{ icon: string }>>[{ id: 'x', icon: 'star' }]));`,
    'PRESETS',
  ),
  `[{ id: 'x', icon: 'star' }]`,
);

console.log('\nextractConstBlock — does not pick up wrong constant');

assertNull(
  'returns null when constant not present in source',
  extractConstBlock(`const OTHER = { a: 'b' };`, 'MISSING'),
);

// ── Unit tests: extractNamedMapValues ─────────────────────────────────────────

console.log('\nextractNamedMapValues');

assert(
  'iconKey null — extracts all colon-string values',
  extractNamedMapValues(
    `const RESOURCE_ICONS = { iron: 'hammer', wood: 'tree-outline' };`,
    'RESOURCE_ICONS', null,
  ),
  ['hammer', 'tree-outline'],
);

assert(
  'iconKey "icon" — extracts only icon field values from array',
  extractNamedMapValues(
    `const AVATAR_PRESETS = [{ id: 'dwarf', icon: 'person', bg: '#333' }, { id: 'elf', icon: 'star', bg: '#444' }];`,
    'AVATAR_PRESETS', 'icon',
  ),
  ['person', 'star'],
);

assert(
  'iconKey "icon" — skips non-icon fields',
  extractNamedMapValues(
    `const TREE_INFO = { fight: { label: 'Combat', icon: 'sword', color: 'red' } };`,
    'TREE_INFO', 'icon',
  ),
  ['sword'],
);

assert(
  'with TypeScript type annotation — extracts correctly',
  extractNamedMapValues(
    `const SKILL_ICONS: Record<string, string> = { slash: 'tool', pierce: 'box' };`,
    'SKILL_ICONS', null,
  ),
  ['tool', 'box'],
);

assert(
  'with Object.freeze wrapper — extracts inner values',
  extractNamedMapValues(
    `const RESOURCE_ICONS = Object.freeze({ fire: 'flame', water: 'drop' });`,
    'RESOURCE_ICONS', null,
  ),
  ['flame', 'drop'],
);

assert(
  'returns empty array when const not found',
  extractNamedMapValues(`const OTHER = { x: 'y' };`, 'RESOURCE_ICONS', null),
  [],
);

// ── Unit tests: extractIconKeyValues ─────────────────────────────────────────

console.log('\nextractIconKeyValues');

assert(
  'extracts icon field from flat object',
  extractIconKeyValues(`{ goblin: 'skull', icon: 'skull' }`),
  ['skull'],
);

assert(
  'extracts icon fields from array of objects',
  extractIconKeyValues(`[{ id: 'a', icon: 'home' }, { id: 'b', icon: 'star' }]`),
  ['home', 'star'],
);

assert(
  'returns empty when no icon field',
  extractIconKeyValues(`{ goblin: 'skull', dragon: 'dragon' }`),
  [],
);

assert(
  'extracts alias key "iconName" when passed as extraKey',
  extractIconKeyValues(`{ id: 'x', iconName: 'tool' }`, ['iconName']),
  ['tool'],
);

assert(
  'extracts alias key "glyph" when passed as extraKey',
  extractIconKeyValues(`[{ id: 'a', glyph: 'check' }, { id: 'b', glyph: 'box' }]`, ['glyph']),
  ['check', 'box'],
);

assert(
  'extracts both standard icon and alias key when both present',
  extractIconKeyValues(`{ icon: 'home', iconName: 'star' }`, ['iconName']),
  ['home', 'star'],
);

assert(
  'alias key not extracted without extraKeys arg',
  extractIconKeyValues(`{ iconName: 'tool' }`),
  [],
);

// ── Unit tests: extractAllStringValues ────────────────────────────────────────

console.log('\nextractAllStringValues');

assert(
  'extracts all colon-string pairs',
  extractAllStringValues(`{ goblin: 'skull', dragon: 'dragon' }`),
  ['skull', 'dragon'],
);

assert(
  'extracts both single and double quoted strings',
  extractAllStringValues(`{ a: 'single', b: "double" }`),
  ['single', 'double'],
);

assert(
  'non-icon string values are included (caller filters)',
  extractAllStringValues(`{ id: 'goblin', label: 'Goblin King', icon: 'skull' }`),
  ['goblin', 'Goblin King', 'skull'],
);

assert(
  'returns empty for block with no colon-string pairs',
  extractAllStringValues(`{ count: 42, active: true }`),
  [],
);

// ── Integration tests ─────────────────────────────────────────────────────────
// Each integration test:
//   1. Creates a temp directory with mini glyphmap JSON files
//   2. Writes a synthetic source file (or data file)
//   3. Runs validate-icons.js via env-var overrides
//   4. Checks exit code (and optionally stderr content)

console.log('\n── Integration tests ────────────────────────────────────────────');

const SCRIPT_PATH = path.join(__dirname, 'validate-icons.js');

// Mini glyph maps — only include a handful of known valid names.
// Any name NOT listed here is considered broken.
const MINI_GLYPHMAPS = {
  Ionicons:               { home: 0, star: 0, person: 0, heart: 0, 'checkmark-circle': 0 },
  Feather:                { tool: 0, box: 0, star: 0, user: 0, check: 0 },
  MaterialCommunityIcons: { sword: 0, shield: 0, castle: 0, dragon: 0 },
};
const VALID_UNION_NAME  = 'home';   // exists in Ionicons (and therefore the union)
const VALID_FEATHER     = 'tool';   // exists in Feather
const VALID_IONICONS    = 'person'; // exists in Ionicons
const VALID_MCI         = 'sword';  // exists in MaterialCommunityIcons
const BROKEN_NAME       = 'broken-icon-xyz';   // not in any set
const BROKEN_FEATHER    = 'no-such-feather';   // not in Feather

/**
 * Create a self-contained temp fixture:
 *   tmpDir/glyphmaps/{Ionicons,Feather,MaterialCommunityIcons}.json
 *   tmpDir/src/   (source .tsx files go here)
 *   tmpDir/data/  (JSON data files go here)
 * Returns { tmpDir, glyphmapDir, srcDir, dataDir }.
 */
function createFixture() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vi-test-'));
  const glyphmapDir = path.join(tmpDir, 'glyphmaps');
  const srcDir      = path.join(tmpDir, 'src');
  const dataDir     = path.join(tmpDir, 'data');
  fs.mkdirSync(glyphmapDir, { recursive: true });
  fs.mkdirSync(srcDir,      { recursive: true });
  fs.mkdirSync(dataDir,     { recursive: true });
  for (const [name, glyphs] of Object.entries(MINI_GLYPHMAPS)) {
    fs.writeFileSync(path.join(glyphmapDir, `${name}.json`), JSON.stringify(glyphs));
  }
  return { tmpDir, glyphmapDir, srcDir, dataDir };
}

/**
 * Run validate-icons.js with path overrides pointing at the fixture.
 * Returns the spawnSync result (status, stdout, stderr).
 */
function runScript({ glyphmapDir, srcDir, dataDir, extraEnv = {}, jsonIconFiles = [] }) {
  return spawnSync('node', [SCRIPT_PATH], {
    env: {
      ...process.env,
      VALIDATE_ICONS_GLYPHMAP_DIR:      glyphmapDir,
      VALIDATE_ICONS_SCAN_DIRS:         srcDir,
      VALIDATE_ICONS_DATA_DIR:          dataDir,
      VALIDATE_ICONS_JSON_ICON_FILES:   JSON.stringify(jsonIconFiles),
      ...extraEnv,
    },
    encoding: 'utf8',
  });
}

/** Clean up temp directory created by createFixture(). */
function removeFixture(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// ── Path A: JSX name props ────────────────────────────────────────────────────

console.log('\nIntegration — JSX name props');

{
  const fix = createFixture();
  fs.writeFileSync(path.join(fix.srcDir, 'Icons.tsx'),
    `import { Ionicons } from '@expo/vector-icons';\nexport const A = () => <Ionicons name="${BROKEN_NAME}" size={24} />;`,
  );
  const r = runScript(fix);
  assert('JSX broken name → exit 1', r.status, 1);
  assertIncludes('JSX broken name → error mentions the broken name', r.stderr, BROKEN_NAME);
  removeFixture(fix.tmpDir);
}

{
  const fix = createFixture();
  fs.writeFileSync(path.join(fix.srcDir, 'Icons.tsx'),
    `import { Ionicons } from '@expo/vector-icons';\nexport const A = () => <Ionicons name="${VALID_IONICONS}" size={24} />;`,
  );
  const r = runScript(fix);
  assert('JSX valid name → exit 0', r.status, 0);
  removeFixture(fix.tmpDir);
}

{
  const fix = createFixture();
  // Multiple JSX components — one broken each
  fs.writeFileSync(path.join(fix.srcDir, 'Multi.tsx'), [
    `import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';`,
    `export const A = () => <Ionicons name="${BROKEN_NAME}" />;`,
    `export const B = () => <Feather name="${VALID_FEATHER}" />;`,
    `export const C = () => <MaterialCommunityIcons name="${VALID_MCI}" />;`,
  ].join('\n'));
  const r = runScript(fix);
  assert('JSX mixed (one broken) → exit 1', r.status, 1);
  assertIncludes('JSX mixed → stderr mentions broken name', r.stderr, BROKEN_NAME);
  removeFixture(fix.tmpDir);
}

// ── Path B: NAMED_MAPS (explicit constant pinned to a specific set) ────────────
// NAMED_MAPS entries are hardcoded in validate-icons.js:
//   RESOURCE_ICONS → Feather   (iconKey: null — all values are icon names)
//   SKILL_ICONS    → Feather   (iconKey: null)
//   AVATAR_PRESETS → Feather   (iconKey: 'icon')
//   TREE_INFO      → Feather   (iconKey: 'icon')
// Integration tests exercise the pinned-set check end-to-end by declaring
// these exact constant names in synthetic source files.

console.log('\nIntegration — NAMED_MAPS (explicit pinned constant)');

{
  // RESOURCE_ICONS is pinned to Feather.
  // VALID_IONICONS ("person") exists in Ionicons but NOT in Feather → must fail.
  const fix = createFixture();
  fs.writeFileSync(path.join(fix.srcDir, 'constants.ts'),
    `const RESOURCE_ICONS = { iron: '${VALID_IONICONS}' };`,
  );
  const r = runScript(fix);
  assert('NAMED_MAPS (RESOURCE_ICONS→Feather): Ionicons-only name → exit 1', r.status, 1);
  assertIncludes('NAMED_MAPS (RESOURCE_ICONS→Feather): stderr mentions the name', r.stderr, VALID_IONICONS);
  removeFixture(fix.tmpDir);
}

{
  // RESOURCE_ICONS pinned to Feather: a valid Feather name → exit 0.
  const fix = createFixture();
  fs.writeFileSync(path.join(fix.srcDir, 'constants.ts'),
    `const RESOURCE_ICONS = { ore: '${VALID_FEATHER}' };`,   // "tool" — in Feather
  );
  const r = runScript(fix);
  assert('NAMED_MAPS (RESOURCE_ICONS→Feather): valid Feather name → exit 0', r.status, 0);
  removeFixture(fix.tmpDir);
}

{
  // SKILL_ICONS is pinned to Feather.
  // VALID_IONICONS ("person") exists in Ionicons but NOT Feather → must fail.
  const fix = createFixture();
  fs.writeFileSync(path.join(fix.srcDir, 'constants.ts'),
    `const SKILL_ICONS = { block: '${VALID_IONICONS}' };`,
  );
  const r = runScript(fix);
  assert('NAMED_MAPS (SKILL_ICONS→Feather): Ionicons-only name → exit 1', r.status, 1);
  assertIncludes('NAMED_MAPS (SKILL_ICONS→Feather): stderr mentions the name', r.stderr, VALID_IONICONS);
  removeFixture(fix.tmpDir);
}

{
  // SKILL_ICONS pinned to Feather: a valid Feather name → exit 0.
  const fix = createFixture();
  fs.writeFileSync(path.join(fix.srcDir, 'constants.ts'),
    `const SKILL_ICONS = { craft: '${VALID_FEATHER}' };`,   // "tool" — in Feather
  );
  const r = runScript(fix);
  assert('NAMED_MAPS (SKILL_ICONS→Feather): valid Feather name → exit 0', r.status, 0);
  removeFixture(fix.tmpDir);
}

{
  // AVATAR_PRESETS is pinned to Ionicons with iconKey:'icon'.
  // Only the `icon` field is validated; non-icon fields (bg, accent) are skipped.
  // Use a completely broken icon name to verify it IS caught.
  const fix = createFixture();
  fs.writeFileSync(path.join(fix.srcDir, 'presets.ts'),
    `const AVATAR_PRESETS = [{ id: 'hero', icon: '${BROKEN_NAME}', bg: '#333' }];`,
  );
  const r = runScript(fix);
  assert('NAMED_MAPS (AVATAR_PRESETS→Ionicons, iconKey:icon): broken icon → exit 1', r.status, 1);
  assertIncludes('NAMED_MAPS AVATAR_PRESETS: stderr mentions broken icon', r.stderr, BROKEN_NAME);
  removeFixture(fix.tmpDir);
}

{
  // AVATAR_PRESETS: valid Feather icon name → exit 0; non-icon strings ignored.
  const fix = createFixture();
  fs.writeFileSync(path.join(fix.srcDir, 'presets.ts'),
    `const AVATAR_PRESETS = [{ id: 'hero', icon: '${VALID_FEATHER}', bg: '#c00' }];`,
  );
  const r = runScript(fix);
  assert('NAMED_MAPS (AVATAR_PRESETS→Feather, iconKey:icon): valid icon → exit 0', r.status, 0);
  removeFixture(fix.tmpDir);
}

// ── Path C: Auto-discovery, icon-key mode ─────────────────────────────────────

console.log('\nIntegration — auto-discovery, icon-key mode');

{
  const fix = createFixture();
  fs.writeFileSync(path.join(fix.srcDir, 'constants.ts'), [
    `const ENEMY_ICONS = [`,
    `  { id: 'goblin', icon: '${BROKEN_NAME}' },`,
    `  { id: 'dragon', icon: '${VALID_UNION_NAME}' },`,
    `];`,
  ].join('\n'));
  const r = runScript(fix);
  assert('icon-key mode broken name → exit 1', r.status, 1);
  assertIncludes('icon-key mode → stderr mentions broken name', r.stderr, BROKEN_NAME);
  removeFixture(fix.tmpDir);
}

{
  const fix = createFixture();
  fs.writeFileSync(path.join(fix.srcDir, 'constants.ts'), [
    `const ENEMY_ICONS = [`,
    `  { id: 'goblin', icon: '${VALID_UNION_NAME}' },`,
    `  { id: 'dragon', icon: '${VALID_FEATHER}' },`,
    `];`,
  ].join('\n'));
  const r = runScript(fix);
  assert('icon-key mode all valid names → exit 0', r.status, 0);
  removeFixture(fix.tmpDir);
}

{
  const fix = createFixture();
  fs.writeFileSync(path.join(fix.srcDir, 'constants.ts'), [
    `const AVATAR_DATA = [`,
    `  { id: 'hero', iconName: '${BROKEN_NAME}' },`,
    `];`,
  ].join('\n'));
  const r = runScript({
    ...fix,
    extraEnv: { VALIDATE_ICONS_ICON_KEY_ALIASES: 'iconName' },
  });
  assert('icon-key mode alias "iconName" broken → exit 1', r.status, 1);
  assertIncludes('icon-key mode alias → stderr mentions broken name', r.stderr, BROKEN_NAME);
  removeFixture(fix.tmpDir);
}

{
  const fix = createFixture();
  fs.writeFileSync(path.join(fix.srcDir, 'constants.ts'), [
    `const AVATAR_DATA = [`,
    `  { id: 'hero', iconName: '${VALID_UNION_NAME}' },`,
    `];`,
  ].join('\n'));
  const r = runScript({
    ...fix,
    extraEnv: { VALIDATE_ICONS_ICON_KEY_ALIASES: 'iconName' },
  });
  assert('icon-key mode alias "iconName" valid → exit 0', r.status, 0);
  removeFixture(fix.tmpDir);
}

// ── Path D: Auto-discovery, @icon-map annotation mode ────────────────────────

console.log('\nIntegration — auto-discovery, @icon-map annotation mode');

{
  const fix = createFixture();
  // @icon-map Feather — every kebab-case value is validated against Feather
  // Use VALID_IONICONS ("person") which exists in Ionicons but NOT Feather
  fs.writeFileSync(path.join(fix.srcDir, 'mappings.ts'), [
    `// @icon-map Feather`,
    `const ITEM_ICONS = { hero: '${VALID_IONICONS}' };`,
  ].join('\n'));
  const r = runScript(fix);
  // "person" is not in Feather → should fail
  assert('@icon-map Feather: name valid in union but not Feather → exit 1', r.status, 1);
  assertIncludes('@icon-map Feather: error mentions the name', r.stderr, VALID_IONICONS);
  removeFixture(fix.tmpDir);
}

{
  const fix = createFixture();
  fs.writeFileSync(path.join(fix.srcDir, 'mappings.ts'), [
    `// @icon-map Feather`,
    `const ITEM_ICONS = { hero: '${VALID_FEATHER}' };`,
  ].join('\n'));
  const r = runScript(fix);
  assert('@icon-map Feather: valid Feather name → exit 0', r.status, 0);
  removeFixture(fix.tmpDir);
}

{
  const fix = createFixture();
  // @icon-map with no set: validates against union of all sets
  fs.writeFileSync(path.join(fix.srcDir, 'mappings.ts'), [
    `// @icon-map`,
    `const ITEM_ICONS = { a: '${BROKEN_NAME}' };`,
  ].join('\n'));
  const r = runScript(fix);
  assert('@icon-map (union): broken name → exit 1', r.status, 1);
  removeFixture(fix.tmpDir);
}

{
  const fix = createFixture();
  fs.writeFileSync(path.join(fix.srcDir, 'mappings.ts'), [
    `// @icon-map`,
    `const ITEM_ICONS = { a: '${VALID_UNION_NAME}' };`,
  ].join('\n'));
  const r = runScript(fix);
  assert('@icon-map (union): valid name → exit 0', r.status, 0);
  removeFixture(fix.tmpDir);
}

{
  const fix = createFixture();
  // Block-comment form: /* @icon-map Feather */
  fs.writeFileSync(path.join(fix.srcDir, 'mappings.ts'), [
    `/* @icon-map Feather */`,
    `const SPELL_ICONS = { fireball: '${BROKEN_FEATHER}' };`,
  ].join('\n'));
  const r = runScript(fix);
  assert('block-comment @icon-map Feather: broken Feather name → exit 1', r.status, 1);
  removeFixture(fix.tmpDir);
}

// ── Path E: Auto-discovery, pure-value mode ───────────────────────────────────

console.log('\nIntegration — auto-discovery, pure-value mode');

{
  const fix = createFixture();
  // All values are kebab-case; 2/3 known in union (≥50% threshold) → confidence passes.
  // One value is broken → should be reported.
  fs.writeFileSync(path.join(fix.srcDir, 'constants.ts'), [
    `const REGION_ICONS = {`,
    `  forest: '${VALID_UNION_NAME}',`,   // known
    `  cave:   '${VALID_FEATHER}',`,       // known
    `  ruins:  '${BROKEN_NAME}',`,         // broken
    `};`,
  ].join('\n'));
  const r = runScript(fix);
  assert('pure-value mode: 2/3 known, 1 broken → exit 1', r.status, 1);
  assertIncludes('pure-value mode: stderr mentions broken name', r.stderr, BROKEN_NAME);
  removeFixture(fix.tmpDir);
}

{
  const fix = createFixture();
  // All values valid and all kebab-case → exit 0
  fs.writeFileSync(path.join(fix.srcDir, 'constants.ts'), [
    `const REGION_ICONS = {`,
    `  forest: '${VALID_UNION_NAME}',`,
    `  cave:   '${VALID_FEATHER}',`,
    `  peak:   '${VALID_MCI}',`,
    `};`,
  ].join('\n'));
  const r = runScript(fix);
  assert('pure-value mode: all known → exit 0', r.status, 0);
  removeFixture(fix.tmpDir);
}

{
  const fix = createFixture();
  // Confidence filter: 0/3 values in union → treated as non-icon map → NOT reported.
  // All values are kebab-case but none exist in the mini glyphmaps.
  const unknownA = 'xeno-alpha';
  const unknownB = 'xeno-beta';
  const unknownC = 'xeno-gamma';
  fs.writeFileSync(path.join(fix.srcDir, 'constants.ts'), [
    `const ROUTE_MAP = {`,
    `  home:     '${unknownA}',`,
    `  profile:  '${unknownB}',`,
    `  settings: '${unknownC}',`,
    `};`,
  ].join('\n'));
  const r = runScript(fix);
  // 0/3 < 50% → confidence filter rejects → no errors → exit 0
  assert('pure-value mode: 0/3 known (below threshold) → exit 0 (not an icon map)', r.status, 0);
  removeFixture(fix.tmpDir);
}

{
  const fix = createFixture();
  // Mixed: some values are NOT kebab-case → pure-value mode does NOT trigger.
  // The block has a label ("Goblin King") that fails looksLikeIconName.
  fs.writeFileSync(path.join(fix.srcDir, 'constants.ts'), [
    `const ENEMY_LABELS = {`,
    `  goblin: 'Goblin King',`,           // contains uppercase and space
    `  dragon: '${VALID_UNION_NAME}',`,
    `};`,
  ].join('\n'));
  const r = runScript(fix);
  // Not all values are kebab-case → pure-value mode skipped → exit 0
  assert('pure-value mode: non-kebab value disables mode → exit 0', r.status, 0);
  removeFixture(fix.tmpDir);
}

// ── Path F: JSON auto-discovered (data/ directory) ────────────────────────────

console.log('\nIntegration — JSON auto-discovered (data/ directory)');

{
  const fix = createFixture();
  // data/weapons.json has an "icon" field with a broken name
  fs.writeFileSync(path.join(fix.dataDir, 'weapons.json'), JSON.stringify([
    { id: 'sword', name: 'Iron Sword', icon: BROKEN_NAME },
  ]));
  const r = runScript(fix);
  assert('JSON auto-discovered: broken icon → exit 1', r.status, 1);
  assertIncludes('JSON auto-discovered: stderr mentions broken name', r.stderr, BROKEN_NAME);
  removeFixture(fix.tmpDir);
}

{
  const fix = createFixture();
  fs.writeFileSync(path.join(fix.dataDir, 'weapons.json'), JSON.stringify([
    { id: 'sword', name: 'Iron Sword', icon: VALID_UNION_NAME },
  ]));
  const r = runScript(fix);
  assert('JSON auto-discovered: valid icon → exit 0', r.status, 0);
  removeFixture(fix.tmpDir);
}

{
  const fix = createFixture();
  // JSON file with no "icon" field at all — should be silently skipped
  fs.writeFileSync(path.join(fix.dataDir, 'npcs.json'), JSON.stringify([
    { id: 'blacksmith', name: 'Silas', job: 'forge' },
  ]));
  const r = runScript(fix);
  assert('JSON auto-discovered: file with no icon field → exit 0', r.status, 0);
  removeFixture(fix.tmpDir);
}

{
  const fix = createFixture();
  // JSON file where icon is an emoji string — looksLikeIconName rejects it
  fs.writeFileSync(path.join(fix.dataDir, 'items.json'), JSON.stringify([
    { id: 'ring', icon: '💍' },
  ]));
  const r = runScript(fix);
  assert('JSON auto-discovered: emoji icon skipped (not kebab-case) → exit 0', r.status, 0);
  removeFixture(fix.tmpDir);
}

{
  const fix = createFixture();
  // JSON file using an object map (not an array) — Object.values() should work
  fs.writeFileSync(path.join(fix.dataDir, 'objects.json'), JSON.stringify({
    axe:  { name: 'Battle Axe', icon: BROKEN_NAME },
    helm: { name: 'Iron Helm',  icon: VALID_MCI   },
  }));
  const r = runScript(fix);
  assert('JSON auto-discovered: object-map format with broken icon → exit 1', r.status, 1);
  assertIncludes('JSON auto-discovered object-map: stderr mentions broken name', r.stderr, BROKEN_NAME);
  removeFixture(fix.tmpDir);
}

// ── Path F2: JSON auto-discovered with ICON_KEY_ALIASES ──────────────────────

console.log('\nIntegration — JSON auto-discovered, ICON_KEY_ALIASES');

{
  // JSON file using "glyph" key (not "icon") — should be detected when alias is set.
  const fix = createFixture();
  fs.writeFileSync(path.join(fix.dataDir, 'spells.json'), JSON.stringify([
    { id: 'fireball', name: 'Fireball', glyph: BROKEN_NAME },
  ]));
  const r = runScript({
    ...fix,
    extraEnv: { VALIDATE_ICONS_ICON_KEY_ALIASES: 'glyph' },
  });
  assert('JSON auto-discovered: alias key "glyph" broken → exit 1', r.status, 1);
  assertIncludes('JSON auto-discovered alias: stderr mentions broken name', r.stderr, BROKEN_NAME);
  removeFixture(fix.tmpDir);
}

{
  // JSON file using "glyph" key with a valid name — should pass.
  const fix = createFixture();
  fs.writeFileSync(path.join(fix.dataDir, 'spells.json'), JSON.stringify([
    { id: 'fireball', name: 'Fireball', glyph: VALID_UNION_NAME },
  ]));
  const r = runScript({
    ...fix,
    extraEnv: { VALIDATE_ICONS_ICON_KEY_ALIASES: 'glyph' },
  });
  assert('JSON auto-discovered: alias key "glyph" valid → exit 0', r.status, 0);
  removeFixture(fix.tmpDir);
}

{
  // JSON file uses "glyph" key but no alias is registered — must be silently skipped.
  const fix = createFixture();
  fs.writeFileSync(path.join(fix.dataDir, 'spells.json'), JSON.stringify([
    { id: 'fireball', name: 'Fireball', glyph: BROKEN_NAME },
  ]));
  // No VALIDATE_ICONS_ICON_KEY_ALIASES — "glyph" is unknown, file has no "icon" field.
  const r = runScript(fix);
  assert('JSON auto-discovered: unknown alias key without registration → exit 0 (silently skipped)', r.status, 0);
  removeFixture(fix.tmpDir);
}

{
  // JSON file uses "iconName" alias; the item also has a non-icon "name" field.
  // Only the alias value should be validated.
  const fix = createFixture();
  fs.writeFileSync(path.join(fix.dataDir, 'regions.json'), JSON.stringify([
    { id: 'forest', name: 'Dark Forest', iconName: BROKEN_NAME },
    { id: 'cave',   name: 'Crystal Cave', iconName: VALID_UNION_NAME },
  ]));
  const r = runScript({
    ...fix,
    extraEnv: { VALIDATE_ICONS_ICON_KEY_ALIASES: 'iconName' },
  });
  assert('JSON auto-discovered: alias "iconName" — broken entry flagged, valid skipped → exit 1', r.status, 1);
  assertIncludes('JSON auto-discovered iconName: stderr mentions broken name', r.stderr, BROKEN_NAME);
  removeFixture(fix.tmpDir);
}

// ── Path G: JSON explicit (JSON_ICON_FILES override) ─────────────────────────

console.log('\nIntegration — JSON explicit (JSON_ICON_FILES)');

{
  const fix = createFixture();
  const jsonFile = path.join(fix.dataDir, 'talents.json');
  // Pinned to Feather: use a name valid in Ionicons but NOT Feather
  fs.writeFileSync(jsonFile, JSON.stringify([
    { id: 'leap', icon: VALID_IONICONS },  // "person" — in Ionicons, not Feather
  ]));
  const r = runScript({
    ...fix,
    jsonIconFiles: [{ file: jsonFile, iconKey: 'icon', iconSet: 'Feather' }],
  });
  assert('JSON explicit (Feather): name valid in Ionicons but not Feather → exit 1', r.status, 1);
  assertIncludes('JSON explicit: stderr mentions the name', r.stderr, VALID_IONICONS);
  removeFixture(fix.tmpDir);
}

{
  const fix = createFixture();
  const jsonFile = path.join(fix.dataDir, 'talents.json');
  fs.writeFileSync(jsonFile, JSON.stringify([
    { id: 'slash', icon: VALID_FEATHER },
  ]));
  const r = runScript({
    ...fix,
    jsonIconFiles: [{ file: jsonFile, iconKey: 'icon', iconSet: 'Feather' }],
  });
  assert('JSON explicit (Feather): valid Feather name → exit 0', r.status, 0);
  removeFixture(fix.tmpDir);
}

{
  const fix = createFixture();
  const jsonFile = path.join(fix.dataDir, 'talents.json');
  fs.writeFileSync(jsonFile, JSON.stringify([
    { id: 'slash', icon: BROKEN_NAME },
  ]));
  const r = runScript({
    ...fix,
    jsonIconFiles: [{ file: jsonFile, iconKey: 'icon', iconSet: 'Ionicons' }],
  });
  assert('JSON explicit (Ionicons): broken name → exit 1', r.status, 1);
  removeFixture(fix.tmpDir);
}

{
  // File listed in JSON_ICON_FILES should NOT also appear in auto-discovery
  // (no double-reporting). Test: register a file explicitly with Feather, put
  // a name valid in Feather but not Ionicons.  If it were double-reported via
  // auto-discovery (union check) it would pass, but since it's only checked
  // via explicit Feather check it should also pass (valid Feather name).
  const fix = createFixture();
  const jsonFile = path.join(fix.dataDir, 'registered.json');
  fs.writeFileSync(jsonFile, JSON.stringify([
    { id: 'x', icon: VALID_FEATHER },
  ]));
  const r = runScript({
    ...fix,
    jsonIconFiles: [{ file: jsonFile, iconKey: 'icon', iconSet: 'Feather' }],
  });
  assert('JSON explicit file not double-counted in auto-discovery → exit 0', r.status, 0);
  removeFixture(fix.tmpDir);
}

// ── Smoke test: real project data files pass validation ───────────────────────

console.log('\nSmoke test — real project icon data');

{
  // Run the script with its default paths — confirms the real project has no
  // broken icon names at this point in time.
  const r = spawnSync('node', [SCRIPT_PATH], { encoding: 'utf8' });
  assert('real project: validate-icons exits 0 (no broken icons)', r.status, 0);
  if (r.status !== 0) {
    console.error('    stdout:', r.stdout.slice(0, 500));
    console.error('    stderr:', r.stderr.slice(0, 500));
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} test(s): ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
