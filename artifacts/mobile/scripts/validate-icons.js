#!/usr/bin/env node
/**
 * validate-icons.js
 *
 * Cross-references every icon name used in the codebase against the bundled
 * @expo/vector-icons glyph maps (Ionicons, Feather, MaterialCommunityIcons).
 *
 * Run:  node scripts/validate-icons.js
 * Exit: 0 = all good, 1 = missing glyphs found
 *
 * ── What it checks ────────────────────────────────────────────────────────────
 *  • JSX name props:  <Ionicons name="..." />  <Feather name="..." />  <MaterialCommunityIcons name="..." />
 *  • Known icon-data constants (add new ones to NAMED_MAPS below to pin them
 *    to a specific icon set for stricter validation):
 *      - RESOURCE_ICONS  → Ionicons
 *      - AVATAR_PRESETS  → Ionicons  (the `icon` field)
 *      - SKILL_ICONS     → Feather
 *      - TREE_INFO       → Feather   (the `icon` field)
 *  • TS/JS constants auto-discovered from scanned source files: any
 *    `const X = { … }` block NOT already in NAMED_MAPS is inspected with two
 *    heuristics and validated against the union of all known glyph sets:
 *      – icon-key mode: the block contains at least one `icon: 'kebab-name'`
 *        (or any key in ICON_KEY_ALIASES such as `iconName`, `glyph`, `sprite`)
 *        pattern (same semantic signal as the JSON auto-discovery).
 *      – pure-value mode: ALL string values in the block are kebab-case AND
 *        at least half of them exist in the glyph-union (confidence filter to
 *        suppress false positives from non-icon maps such as ID maps).
 *    You do NOT need to register these constants manually — they are validated
 *    automatically as soon as they appear in the scanned source tree.
 *  • @icon-map annotation: place `// @icon-map [IconSet]` on the line
 *    immediately before a `const` declaration to opt it into validation
 *    unconditionally (bypasses the confidence heuristic).  The icon set is
 *    optional; omit it to validate against the union of all sets:
 *      // @icon-map Feather          ← validate against Feather only
 *      // @icon-map                  ← validate against union of all sets
 *      const MY_ICONS = { ... }
 *    When an @icon-map annotation is present, ALL string values in the block
 *    that look like icon names are validated, regardless of which property key
 *    they are stored under.
 *  • JSON data files with explicit icon-set registration (add new ones to
 *    JSON_ICON_FILES below when you need to pin validation to a specific set):
 *      - data/talents.json → Feather (the `icon` field on each talent)
 *  • JSON data files auto-discovered from the data/ directory: any .json file
 *    that contains an "icon" field (or any key listed in ICON_KEY_ALIASES such
 *    as "iconName", "glyph", "sprite") and is NOT already in JSON_ICON_FILES
 *    is validated automatically against the union of all known glyph sets.
 *    You do NOT need to register these files manually — they are picked up
 *    as soon as they appear in data/.  To activate validation for a
 *    non-standard key, add it to ICON_KEY_ALIASES (project-wide) or add an
 *    explicit JSON_ICON_FILES entry with `iconKey` set to that key name.
 *
 * ── Adding new icon maps ──────────────────────────────────────────────────────
 * In most cases you do NOT need to do anything — the auto-discovery heuristics
 * above will catch broken icon names in new constants automatically.
 *
 * If a constant uses a non-standard key name (e.g. `iconName`, `glyph`),
 * either add that key to ICON_KEY_ALIASES below (project-wide) or annotate
 * the constant with `// @icon-map [IconSet]` (per-constant, no config change).
 *
 * Add an entry to NAMED_MAPS only when you need to pin a constant to a
 * specific icon set (stricter than the union check) or when the auto-discovery
 * heuristics produce false positives for that constant.
 *
 * If the icons live in a JSON data file and you want to pin validation to a
 * specific icon set (stricter), add an entry to JSON_ICON_FILES below.
 * Otherwise, just drop the file in data/ and it will be auto-discovered.
 */

const fs = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────
//
// Environment-variable overrides (used by the test suite — do not set in
// production):
//   VALIDATE_ICONS_GLYPHMAP_DIR  — absolute path to a directory of glyph-map
//                                   JSON files (one per icon set).
//   VALIDATE_ICONS_SCAN_DIRS     — path.delimiter-separated list of source
//                                   directories to scan instead of the defaults.
//   VALIDATE_ICONS_DATA_DIR      — absolute path to the data/ directory for
//                                   JSON auto-discovery.
//   VALIDATE_ICONS_JSON_ICON_FILES — JSON-encoded array that replaces the
//                                   built-in JSON_ICON_FILES list.
//   VALIDATE_ICONS_ICON_KEY_ALIASES — comma-separated extra icon-key aliases
//                                   that extend ICON_KEY_ALIASES.

const GLYPHMAP_DIR = process.env.VALIDATE_ICONS_GLYPHMAP_DIR || path.join(
  __dirname,
  '../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps',
);

const _rawScanDirs = process.env.VALIDATE_ICONS_SCAN_DIRS;
const SCAN_DIRS = _rawScanDirs
  ? _rawScanDirs.split(path.delimiter)
  : [
  path.join(__dirname, '../app'),
  path.join(__dirname, '../components'),
  path.join(__dirname, '../lib'),
  path.join(__dirname, '../context'),
  path.join(__dirname, '../utils'),
  path.join(__dirname, '../hooks'),
];

/**
 * Named constants whose values are icon names.
 *
 * iconSet  — which glyph set to validate against
 * iconKey  — if the constant holds an array/object of objects, only look at
 *            values under this specific property key. If null, every string
 *            value in the constant block is treated as an icon name.
 *
 * ADD YOUR NEW ICON MAPS HERE.
 */
const NAMED_MAPS = [
  { name: 'RESOURCE_ICONS', iconSet: 'Feather',   iconKey: null     },  // { resourceId: 'icon-name' }
  { name: 'AVATAR_PRESETS', iconSet: 'Feather',   iconKey: 'icon'   },  // [{ id, label, icon, bg, accent }]
  { name: 'SKILL_ICONS',    iconSet: 'Feather',   iconKey: null     },  // { skillId: 'icon-name' }
  { name: 'TREE_INFO',      iconSet: 'Feather',   iconKey: 'icon'   },  // { key: { label, icon, color } }
  { name: 'RESOURCE_PRODUCTS', iconSet: 'Feather', iconKey: 'icon'  },  // { productId: { icon, … } } — rendered via <Feather> in boutique.tsx
];

/**
 * Extra property-key aliases treated as icon-name fields during auto-discovery
 * (step 3).  The standard key `'icon'` is always included; add any project-
 * specific variants here.
 *
 * Examples of keys you might add:  'iconName', 'glyph', 'sprite'
 */
const _rawAliases = process.env.VALIDATE_ICONS_ICON_KEY_ALIASES;
const ICON_KEY_ALIASES = _rawAliases
  ? _rawAliases.split(',').map(s => s.trim()).filter(Boolean)
  : [
  // 'iconName',
  // 'glyph',
  // 'sprite',
];

/**
 * JSON data files that contain icon name fields.
 * Each entry is validated independently (not part of the source-file scan).
 *
 * file    — absolute path to the JSON file
 * iconKey — property name on each array element that holds the icon name
 * iconSet — which glyph set to validate against
 *
 * ADD NEW JSON DATA FILES HERE.
 */
const _rawJsonIconFiles = process.env.VALIDATE_ICONS_JSON_ICON_FILES;
const JSON_ICON_FILES = _rawJsonIconFiles
  ? JSON.parse(_rawJsonIconFiles)
  : [
  {
    file:    path.join(__dirname, '../data/talents.json'),
    iconKey: 'icon',
    iconSet: 'Feather',
  },
];

// ── Load glyphmaps ────────────────────────────────────────────────────────────

function loadGlyphmap(name) {
  const file = path.join(GLYPHMAP_DIR, `${name}.json`);
  if (!fs.existsSync(file)) {
    console.error(`ERROR: Glyphmap not found: ${file}`);
    process.exit(1);
  }
  return new Set(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8'))));
}

const GLYPHMAPS = {
  Ionicons:               loadGlyphmap('Ionicons'),
  Feather:                loadGlyphmap('Feather'),
  MaterialCommunityIcons: loadGlyphmap('MaterialCommunityIcons'),
};

// ── File discovery ────────────────────────────────────────────────────────────

function collectFiles(dirs) {
  const files = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...collectFiles([full]));
      } else if (/\.(tsx?|js)$/.test(entry.name)) {
        files.push(full);
      }
    }
  }
  return files;
}

// ── Extraction helpers ─────────────────────────────────────────────────────────

/**
 * Extract icon names from JSX name props.
 * Handles:  name="foo"   name={'foo'}
 */
function extractJsxNames(src, componentName) {
  const results = [];
  // Match  <ComponentName … name="foo"  or  name={'foo'}
  // We look for the component name somewhere before the name=... attribute on the same logical "tag".
  // Simple line-by-line approach: scan for  name="..."  or  name={'...'}  that appear after the
  // component name on the same or adjacent lines.
  const re = new RegExp(
    `<${componentName}[^>]*?\\bname=(?:"([^"]+)"|'([^']+)'|\\{['"\`]([^'"\`]+)['"\`]\\})`,
    'gs',
  );
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[1] ?? m[2] ?? m[3];
    if (name) results.push(name);
  }

  // Also catch dynamic expressions:  name={cond ? 'a' : 'b'}  and
  // name={MAP[key] ?? 'fallback'}. We extract string literals that appear
  // as ternary/nullish branches inside the braces — identifiers and
  // comparison operands (e.g. `x === 'foo' ? …`) are NOT matched because
  // they are not directly preceded by `?`, `??` or `:`.
  const exprRe = new RegExp(`<${componentName}[^>]*?\\bname=\\{([^}]+)\\}`, 'gs');
  while ((m = exprRe.exec(src)) !== null) {
    const expr = m[1];
    // Skip plain string literals — already handled above.
    if (/^\s*['"\`][^'"\`]+['"\`]\s*$/.test(expr)) continue;
    const branchRe = /[?:]\s*['"\`]([a-z][a-z0-9-]*)['"\`]/g;
    let b;
    while ((b = branchRe.exec(expr)) !== null) results.push(b[1]);
  }
  return results;
}

/**
 * Extract the full source block for a named constant declaration.
 *
 * Returns the text of the assigned value literal — from the opening `{`/`[`
 * to its matching `}`/`]` (inclusive).
 *
 * Correctly handles TypeScript type annotations before the `=`:
 *   const X: Type = { ... }
 *   const X: { k: string } = { ... }
 *   const X: Record<string, string> = { ... }
 *   const X: Array<{ icon: string }> = [ ... ]
 *   export const X: Foo[] = [ ... ]
 *
 * Strategy: scan past the const name for a top-level `=` (depth-tracked so
 * we skip `{…}`, `[…]`, `(…)`, and `<…>` in type annotations), then grab
 * the `{…}` or `[…]` block that follows.
 */
function extractConstBlock(src, constName) {
  const startRe = new RegExp(`(?:const|export\\s+const)\\s+${constName}\\b`);
  const startMatch = startRe.exec(src);
  if (!startMatch) return null;

  // ── Step 1: find the top-level `=` assignment ─────────────────────────────
  // We track bracket depth ({}, [], ()) and angle-bracket depth (<>) so that
  // `=` inside a type annotation is ignored.
  let i = startMatch.index + startMatch[0].length;
  let bracketDepth = 0;
  let angleDepth = 0;
  let foundEq = false;

  while (i < src.length) {
    const ch = src[i];

    // Angle brackets for generics — only when not inside brackets
    if (ch === '<' && bracketDepth === 0) { angleDepth++; i++; continue; }
    if (ch === '>' && bracketDepth === 0) { angleDepth = Math.max(0, angleDepth - 1); i++; continue; }

    // Skip everything inside angle brackets (generic params in type annotation)
    if (angleDepth > 0) { i++; continue; }

    if (ch === '{' || ch === '[' || ch === '(') { bracketDepth++; i++; continue; }
    if (ch === '}' || ch === ']' || ch === ')') { bracketDepth--; i++; continue; }

    // Top-level `=` that is not `==`, `===`, or `=>`
    if (
      ch === '=' &&
      bracketDepth === 0 &&
      src[i + 1] !== '=' &&
      src[i + 1] !== '>'
    ) {
      foundEq = true;
      i++;
      break;
    }

    // End of statement without finding `=` — bail
    if (ch === ';' && bracketDepth === 0) break;

    i++;
  }

  if (!foundEq) return null;

  // ── Step 2: skip whitespace + optional initializer wrappers ─────────────
  // Handles:
  //   Object.freeze({ … })         — common JS pattern
  //   (<SomeType>{ … })            — TypeScript angle-bracket type assertion
  //   { … } as const               — TypeScript const assertion (suffix; no
  //                                   special handling needed — the block
  //                                   extractor stops at the matching `}`)
  while (i < src.length && /\s/.test(src[i])) i++;

  // Support `Object.freeze({ … })` — skip to the inner `{`
  const freezeMatch = /^Object\.freeze\(/.exec(src.slice(i));
  if (freezeMatch) i += freezeMatch[0].length;

  // Support `(<SomeType>{ … })` — TypeScript angle-bracket type assertion.
  // Skip the `(<Type>` prefix so we land directly on the `{` or `[`.
  // The pattern allows one level of nested generics, e.g. (<Record<K,V>>).
  const angleAssertMatch = /^\(<(?:[^<>]|<[^<>]*>)*>\s*/.exec(src.slice(i));
  if (angleAssertMatch) i += angleAssertMatch[0].length;

  // Skip whitespace again after any wrapper
  while (i < src.length && /\s/.test(src[i])) i++;

  // ── Step 3: extract the `{…}` or `[…]` literal ───────────────────────────
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

/**
 * Extract icon names from a constant block.
 *
 * iconKey = null  → every string value in the block is an icon name
 *                   (e.g. RESOURCE_ICONS: { iron: 'hammer-outline' })
 * iconKey = 'foo' → only values whose key is exactly 'foo' are icon names
 *                   (e.g. AVATAR_PRESETS: [{ id: 'dwarf', icon: 'hammer-outline' }])
 */
function extractNamedMapValues(src, constName, iconKey) {
  const blockSrc = extractConstBlock(src, constName);
  if (!blockSrc) return [];

  const values = [];

  if (iconKey === null) {
    // Every  : 'value'  or  : "value"  in the block
    const valRe = /:\s*(?:'([^']+)'|"([^"]+)")/g;
    let vm;
    while ((vm = valRe.exec(blockSrc)) !== null) {
      const val = vm[1] ?? vm[2];
      if (val) values.push(val);
    }
  } else {
    // Only  icon: 'value'  or  icon: "value"  pairs
    const keyRe = new RegExp(
      `\\b${iconKey}\\s*:\\s*(?:'([^']+)'|"([^"]+)")`,
      'g',
    );
    let km;
    while ((km = keyRe.exec(blockSrc)) !== null) {
      const val = km[1] ?? km[2];
      if (val) values.push(val);
    }
  }

  return values;
}

/**
 * Return all `const NAME` / `export const NAME` identifiers declared in src.
 */
function findConstNames(src) {
  const names = [];
  const re = /(?:^|[\s;])(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*[=:]/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    names.push(m[1]);
  }
  return names;
}

/**
 * Extract values of every `<key>: 'value'` or `<key>: "value"` pair in a
 * block, where `<key>` is one of the provided keys array.
 *
 * The standard key `'icon'` is always checked; pass ICON_KEY_ALIASES to
 * include project-specific aliases such as `iconName`, `glyph`, `sprite`.
 *
 * @param {string}   blockSrc  — source text of the constant block
 * @param {string[]} [extraKeys=[]] — additional key names beyond 'icon'
 */
function extractIconKeyValues(blockSrc, extraKeys = []) {
  const allKeys = ['icon', ...extraKeys];
  // Build alternation:  \b(?:icon|iconName|glyph)\s*:
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

/**
 * Scan a source file for `// @icon-map [IconSet]` (or block-comment variant)
 * annotations that appear immediately before a SCREAMING_SNAKE_CASE `const`
 * declaration.
 *
 * Returns a Map<constName, iconSetOrNull> where:
 *   iconSetOrNull = 'Feather' | 'Ionicons' | 'MaterialCommunityIcons' | null
 *   null means "validate against the union of all sets".
 *
 * Supported syntax (on the line(s) directly preceding the const):
 *   // @icon-map Feather
 *   // @icon-map
 *   /* @icon-map Ionicons *\/
 */
function findIconMapAnnotations(src) {
  const result = new Map();
  // Match the annotation token, capturing the optional icon-set name.
  const VALID_SETS = new Set(['Ionicons', 'Feather', 'MaterialCommunityIcons']);
  const re = /@icon-map(?:\s+(Ionicons|Feather|MaterialCommunityIcons))?/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const iconSet = (m[1] && VALID_SETS.has(m[1])) ? m[1] : null;
    // Look for the next const UPPER_CASE within 300 characters
    const after = src.slice(m.index + m[0].length);
    const constMatch = /^\s*(?:(?:\*\/|-->)\s*)?(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*[=:]/.exec(after);
    if (constMatch) {
      result.set(constMatch[1], iconSet);
    }
  }
  return result;
}

/**
 * Extract ALL  : 'value'  or  : "value"  pairs from a block.
 */
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

// ── Shared glyph union (used by both TS/JS and JSON auto-discovery) ───────────

const ALL_GLYPHS = new Set([
  ...GLYPHMAPS.Ionicons,
  ...GLYPHMAPS.Feather,
  ...GLYPHMAPS.MaterialCommunityIcons,
]);

/** Icon names are lowercase kebab-case and ≤ 60 chars. */
const ICON_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const looksLikeIconName = v => ICON_NAME_RE.test(v) && v.length <= 60;

/** Constant names that are already pinned to a specific set — skip in auto-discovery. */
const registeredConstNames = new Set(NAMED_MAPS.map(m => m.name));

// ── Main ──────────────────────────────────────────────────────────────────────

const files = collectFiles(SCAN_DIRS);
let totalErrors = 0;
const report = [];

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const relPath = path.relative(path.join(__dirname, '..'), file);
  const fileErrors = [];

  // 1. JSX name props for each tracked icon component
  for (const [component, glyphmap] of Object.entries(GLYPHMAPS)) {
    const names = extractJsxNames(src, component);
    for (const name of names) {
      if (!glyphmap.has(name)) {
        fileErrors.push(`  [${component}] "${name}" — not found in glyphmap`);
      }
    }
  }

  // 2. Named constant maps (pinned to a specific icon set)
  for (const { name: constName, iconSet, iconKey } of NAMED_MAPS) {
    const glyphmap = GLYPHMAPS[iconSet];
    if (!glyphmap) continue;

    // Only scan files that declare this constant
    if (!src.includes(constName)) continue;

    const values = extractNamedMapValues(src, constName, iconKey);
    for (const name of values) {
      // Skip non-icon strings (colors, labels, css values, etc.)
      // Heuristic: valid icon names are lowercase kebab-case and ≤ 60 chars
      if (!looksLikeIconName(name)) continue;
      if (!glyphmap.has(name)) {
        fileErrors.push(`  [${iconSet} via ${constName}] "${name}" — not found in glyphmap`);
      }
    }
  }

  // 3. Auto-discovered TS/JS icon constants
  // For every SCREAMING_SNAKE_CASE const declared in this file that is NOT
  // already in NAMED_MAPS, apply the following checks in order:
  //
  //  • @icon-map mode — the constant is preceded by a `// @icon-map [IconSet]`
  //    annotation.  All kebab-case string values in the block are validated
  //    unconditionally against the specified set (or the union when no set is
  //    given).  The heuristic confidence filters are skipped.
  //
  //  • icon-key mode  — the block has at least one entry under the `icon` key
  //    or any key listed in ICON_KEY_ALIASES (e.g. `iconName`, `glyph`).
  //    Low false-positive rate: these keys are unambiguous semantic signals.
  //
  //  • pure-value mode — ALL string values in the block are kebab-case AND at
  //    least half of them already exist in the glyph union (confidence filter
  //    that suppresses false positives from non-icon string maps such as ID or
  //    route maps).

  // Collect @icon-map annotations once per file (cheap regex scan)
  const iconMapAnnotations = findIconMapAnnotations(src);

  // Combined key list: standard 'icon' + any project aliases
  const allIconKeys = ['icon', ...ICON_KEY_ALIASES];

  for (const constName of findConstNames(src)) {
    if (registeredConstNames.has(constName)) continue;

    const blockSrc = extractConstBlock(src, constName);
    if (!blockSrc) continue;

    // ── @icon-map annotation mode ──────────────────────────────────────────
    if (iconMapAnnotations.has(constName)) {
      const annotatedSet = iconMapAnnotations.get(constName); // null = union
      const glyphmap = annotatedSet ? GLYPHMAPS[annotatedSet] : ALL_GLYPHS;
      const setLabel = annotatedSet ?? 'any icon set';
      const iconLike = extractAllStringValues(blockSrc).filter(looksLikeIconName);
      for (const name of iconLike) {
        if (!glyphmap.has(name)) {
          fileErrors.push(
            `  [${setLabel} via @icon-map ${constName}] "${name}" — not found in glyph map`,
          );
        }
      }
      continue; // annotation takes full ownership — don't run heuristics
    }

    // ── icon-key mode ─────────────────────────────────────────────────────
    const iconKeyVals = extractIconKeyValues(blockSrc, ICON_KEY_ALIASES).filter(looksLikeIconName);
    if (iconKeyVals.length > 0) {
      const matchedKeys = allIconKeys.join('|');
      for (const name of iconKeyVals) {
        if (!ALL_GLYPHS.has(name)) {
          fileErrors.push(
            `  [any icon set via ${constName}.{${matchedKeys}}] "${name}" — not found in any glyph map`,
          );
        }
      }
      continue; // already handled this constant — don't double-report
    }

    // ── pure-value mode ───────────────────────────────────────────────────
    const allVals = extractAllStringValues(blockSrc);
    if (allVals.length < 2) continue; // too few values to be meaningful

    const iconLike = allVals.filter(looksLikeIconName);
    // All values must look like icon names
    if (iconLike.length !== allVals.length) continue;
    // Confidence filter: at least half must actually exist in the glyph union
    const knownCount = iconLike.filter(v => ALL_GLYPHS.has(v)).length;
    if (knownCount < Math.ceil(iconLike.length / 2)) continue;

    for (const name of iconLike) {
      if (!ALL_GLYPHS.has(name)) {
        fileErrors.push(
          `  [any icon set via ${constName}] "${name}" — not found in any glyph map`,
        );
      }
    }
  }

  if (fileErrors.length > 0) {
    report.push(`\n${relPath}:`);
    report.push(...fileErrors);
    totalErrors += fileErrors.length;
  }
}

// ── JSON data files ───────────────────────────────────────────────────────────

for (const { file, iconKey, iconSet } of JSON_ICON_FILES) {
  const relPath = path.relative(path.join(__dirname, '..'), file);
  if (!fs.existsSync(file)) {
    report.push(`\n${relPath}:`);
    report.push(`  [${iconSet}] file not found — skipping`);
    continue;
  }

  const glyphmap = GLYPHMAPS[iconSet];
  if (!glyphmap) continue;

  const items = JSON.parse(fs.readFileSync(file, 'utf8'));
  const arr = Array.isArray(items) ? items : Object.values(items);
  const fileErrors = [];

  for (const item of arr) {
    const iconName = item[iconKey];
    if (typeof iconName !== 'string' || iconName.trim() === '') continue;
    if (!glyphmap.has(iconName)) {
      const label = item.id ? `id="${item.id}"` : JSON.stringify(item).slice(0, 60);
      fileErrors.push(`  [${iconSet} via ${relPath}] "${iconName}" (${label}) — not found in glyphmap`);
    }
  }

  if (fileErrors.length > 0) {
    report.push(`\n${relPath}:`);
    report.push(...fileErrors);
    totalErrors += fileErrors.length;
  }
}

// ── Auto-discovered JSON data files ──────────────────────────────────────────
// Scan data/ for any .json files that contain an "icon" field (or any key in
// ICON_KEY_ALIASES) and are not already covered by JSON_ICON_FILES above.
// Validate against the union of all known glyph sets — an icon is only flagged
// when it is absent from every set, which handles files that mix icon libraries.

// Paths already explicitly registered — skip them in auto-discovery.
const explicitlyRegistered = new Set(
  JSON_ICON_FILES.map(({ file }) => path.resolve(file)),
);

const DATA_DIR = process.env.VALIDATE_ICONS_DATA_DIR || path.join(__dirname, '../data');

if (fs.existsSync(DATA_DIR)) {
  const jsonFiles = fs.readdirSync(DATA_DIR)
    .filter(name => name.endsWith('.json'))
    .map(name => path.join(DATA_DIR, name))
    .filter(fullPath => !explicitlyRegistered.has(path.resolve(fullPath)));

  for (const fullPath of jsonFiles) {
    const relPath = path.relative(path.join(__dirname, '..'), fullPath);

    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch {
      report.push(`\n${relPath}:`);
      report.push(`  [auto-discover] failed to parse JSON — skipping`);
      continue;
    }

    const items = Array.isArray(parsed) ? parsed : Object.values(parsed);

    // Keys to check: the standard 'icon' key plus any project-wide aliases.
    const allJsonIconKeys = ['icon', ...ICON_KEY_ALIASES];

    // Only process files that actually have one of the known icon-key fields.
    const hasIconField = items.some(
      item => item && typeof item === 'object' && allJsonIconKeys.some(k => k in item),
    );
    if (!hasIconField) continue;

    const fileErrors = [];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      for (const key of allJsonIconKeys) {
        const iconName = item[key];
        if (typeof iconName !== 'string' || iconName.trim() === '') continue;
        // Skip non-icon strings (emoji, labels, hex colours, etc.)
        if (!looksLikeIconName(iconName)) continue;
        if (!ALL_GLYPHS.has(iconName)) {
          const label = item.id ? `id="${item.id}"` : JSON.stringify(item).slice(0, 60);
          fileErrors.push(
            `  [any icon set via ${relPath}] "${iconName}" (key "${key}") (${label}) — not found in any glyph map`,
          );
        }
      }
    }

    if (fileErrors.length > 0) {
      report.push(`\n${relPath}:`);
      report.push(...fileErrors);
      totalErrors += fileErrors.length;
    }
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

const fileCount = files.length;

if (totalErrors === 0) {
  console.log(`✓ Icon validation passed — scanned ${fileCount} file(s), all icon names resolve correctly.`);
  process.exit(0);
} else {
  console.error(`✗ Icon validation FAILED — ${totalErrors} missing glyph(s) across ${report.filter(l => !l.startsWith('  ')).length} file(s):`);
  console.error(report.join('\n'));
  console.error(`
How to fix:
  1. Open the file(s) listed above.
  2. Replace the broken icon name with a valid one from:
       Ionicons  → https://ionic.io/ionicons
       Feather   → https://feathericons.com
       MCIcons   → https://pictogrammers.com/library/mdi/
     Or check the local glyphmap JSON in:
       node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/
  3. Run this script again to confirm the fix.

If a new constant was auto-detected but the values are NOT icon names (false
positive), add the constant to NAMED_MAPS in scripts/validate-icons.js with
iconSet: null to suppress it, or rename the constant to avoid SCREAMING_SNAKE_CASE.

If a constant was MISSED because it uses a non-standard key (e.g. iconName,
glyph, sprite), either:
  • Add the key to ICON_KEY_ALIASES in scripts/validate-icons.js  (project-wide), or
  • Annotate the constant:  // @icon-map [IconSet]  (per-constant, no config change)
    Example:  // @icon-map Feather
              const MY_GLYPHS = { sword: 'sword', ... }
`);
  process.exit(1);
}
