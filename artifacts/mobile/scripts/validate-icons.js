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
 *  • Known icon-data constants (add new ones to NAMED_MAPS below):
 *      - RESOURCE_ICONS  → Ionicons
 *      - AVATAR_PRESETS  → Ionicons  (the `icon` field)
 *      - SKILL_ICONS     → Feather
 *      - TREE_INFO       → Feather   (the `icon` field)
 *
 * ── Adding new icon maps ──────────────────────────────────────────────────────
 * If you create a new constant that stores icon names as string values, add an
 * entry to NAMED_MAPS below specifying the constant name and its icon set.
 * The script will then validate those names automatically.
 */

const fs = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────

const GLYPHMAP_DIR = path.join(
  __dirname,
  '../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps',
);

const SCAN_DIRS = [
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
  { name: 'RESOURCE_ICONS', iconSet: 'Ionicons',  iconKey: null     },  // { resourceId: 'icon-name' }
  { name: 'AVATAR_PRESETS', iconSet: 'Ionicons',  iconKey: 'icon'   },  // [{ id, label, icon, bg, accent }]
  { name: 'SKILL_ICONS',    iconSet: 'Feather',   iconKey: null     },  // { skillId: 'icon-name' }
  { name: 'TREE_INFO',      iconSet: 'Feather',   iconKey: 'icon'   },  // { key: { label, icon, color } }
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
  return results;
}

/**
 * Extract the full source block for a named constant declaration.
 * Returns the text from the opening `{` to the matching `}` (inclusive).
 */
function extractConstBlock(src, constName) {
  const startRe = new RegExp(`(?:const|export\\s+const)\\s+${constName}\\s*[=:]`);
  const startMatch = startRe.exec(src);
  if (!startMatch) return null;

  let depth = 0;
  let inBlock = false;
  let blockSrc = '';
  for (let i = startMatch.index; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') { depth++; inBlock = true; }
    if (ch === '}') { depth--; }
    if (inBlock) blockSrc += ch;
    if (inBlock && depth === 0) break;
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

  // 2. Named constant maps
  for (const { name: constName, iconSet, iconKey } of NAMED_MAPS) {
    const glyphmap = GLYPHMAPS[iconSet];
    if (!glyphmap) continue;

    // Only scan files that declare this constant
    if (!src.includes(constName)) continue;

    const values = extractNamedMapValues(src, constName, iconKey);
    for (const name of values) {
      // Skip non-icon strings (colors, labels, css values, etc.)
      // Heuristic: valid icon names are lowercase kebab-case and ≤ 60 chars
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 60) continue;
      if (!glyphmap.has(name)) {
        fileErrors.push(`  [${iconSet} via ${constName}] "${name}" — not found in glyphmap`);
      }
    }
  }

  if (fileErrors.length > 0) {
    report.push(`\n${relPath}:`);
    report.push(...fileErrors);
    totalErrors += fileErrors.length;
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

If you added a new icon-name constant, register it in NAMED_MAPS inside:
  scripts/validate-icons.js
`);
  process.exit(1);
}
