#!/usr/bin/env node
/**
 * Migrates all Ionicons usages to Feather across the mobile app.
 * Ionicons is pre-bundled in Expo Go with older codepoints → broken glyphs.
 * Feather is not pre-bundled → loads correctly every time.
 */

const fs = require('fs');
const path = require('path');

// Complete Ionicons → Feather name mapping
const NAME_MAP = {
  'hammer': 'tool', 'hammer-outline': 'tool',
  'sparkles': 'star',
  'star-outline': 'star',
  'diamond': 'hexagon', 'diamond-outline': 'hexagon',
  'flash': 'zap', 'flash-outline': 'zap',
  'cash': 'dollar-sign', 'cash-outline': 'dollar-sign',
  'cube': 'box', 'cube-outline': 'box',
  'checkmark': 'check', 'checkmark-circle': 'check-circle',
  'skull': 'alert-octagon',
  'hourglass-outline': 'clock', 'hourglass': 'clock',
  'construct': 'tool',
  'time-outline': 'clock', 'time': 'clock',
  'trophy': 'award', 'trophy-outline': 'award',
  'gift-outline': 'gift',
  'flask': 'droplet', 'flask-outline': 'droplet',
  'flame': 'activity',
  'cut-outline': 'scissors', 'cut': 'scissors',
  'color-wand-outline': 'edit-3', 'color-wand': 'edit-3',
  'lock-closed': 'lock', 'lock-open': 'unlock',
  'close': 'x', 'close-circle': 'x-circle', 'close-outline': 'x',
  'add': 'plus', 'add-circle': 'plus-circle', 'add-circle-outline': 'plus-circle',
  'remove': 'minus', 'remove-circle': 'minus-circle',
  'arrow-back': 'arrow-left', 'arrow-forward': 'arrow-right',
  'arrow-up': 'arrow-up', 'arrow-down': 'arrow-down',
  'chevron-forward': 'chevron-right', 'chevron-back': 'chevron-left',
  'chevron-up': 'chevron-up', 'chevron-down': 'chevron-down',
  'ellipsis-horizontal': 'more-horizontal', 'ellipsis-vertical': 'more-vertical',
  'heart': 'heart', 'heart-outline': 'heart',
  'trash': 'trash-2', 'trash-outline': 'trash-2',
  'create': 'edit-2', 'create-outline': 'edit-2',
  'settings': 'settings', 'settings-outline': 'settings',
  'person': 'user', 'person-outline': 'user',
  'people': 'users', 'people-outline': 'users',
  'notifications': 'bell', 'notifications-outline': 'bell',
  'map': 'map', 'map-outline': 'map',
  'location': 'map-pin', 'location-outline': 'map-pin',
  'globe': 'globe', 'globe-outline': 'globe',
  'home': 'home', 'home-outline': 'home',
  'cart': 'shopping-cart', 'cart-outline': 'shopping-cart',
  'medal': 'award', 'medal-outline': 'award', 'ribbon': 'award',
  'shield': 'shield', 'shield-outline': 'shield',
  'color-palette': 'sliders', 'color-palette-outline': 'sliders',
  'layers': 'layers', 'layers-outline': 'layers',
  'grid': 'grid', 'grid-outline': 'grid',
  'clipboard': 'clipboard', 'clipboard-outline': 'clipboard',
  'bar-chart': 'bar-chart-2', 'bar-chart-outline': 'bar-chart-2', 'stats-chart': 'bar-chart-2',
  'swap-horizontal': 'repeat', 'swap-vertical': 'repeat',
  'refresh': 'refresh-cw', 'refresh-circle': 'refresh-cw', 'refresh-outline': 'refresh-cw',
  'share': 'share-2', 'share-outline': 'share-2', 'share-social': 'share-2', 'share-social-outline': 'share-2',
  'download': 'download', 'download-outline': 'download',
  'cloud-upload': 'upload-cloud', 'cloud-upload-outline': 'upload-cloud',
  'cloud-download': 'download-cloud', 'cloud-download-outline': 'download-cloud',
  'wallet': 'credit-card', 'wallet-outline': 'credit-card',
  'ticket': 'tag', 'ticket-outline': 'tag',
  'infinite': 'repeat', 'infinite-outline': 'repeat',
  'help': 'help-circle', 'help-circle': 'help-circle',
  'information': 'info', 'information-circle': 'info', 'information-circle-outline': 'info',
  'warning': 'alert-triangle', 'warning-outline': 'alert-triangle',
  'alert': 'alert-triangle', 'alert-circle': 'alert-circle',
  'alert-outline': 'alert-triangle', 'alert-circle-outline': 'alert-circle',
  'ban': 'slash',
  'eye': 'eye', 'eye-off': 'eye-off', 'eye-outline': 'eye', 'eye-off-outline': 'eye-off',
  'copy': 'copy',
  'list': 'list', 'list-outline': 'list',
  'menu': 'menu', 'menu-outline': 'menu',
  'options': 'sliders', 'options-outline': 'sliders',
  'book-outline': 'book-open', 'book': 'book-open',
  'storefront': 'shopping-bag', 'storefront-outline': 'shopping-bag',
  'snow': 'wind',
  'bag-add': 'plus-square', 'bag-add-outline': 'plus-square',
  'bag': 'shopping-bag', 'bag-outline': 'shopping-bag',
  'barbell-outline': 'activity', 'barbell': 'activity',
  'bookmark': 'bookmark', 'bookmark-outline': 'bookmark',
  'calendar': 'calendar', 'calendar-outline': 'calendar',
  'camera': 'camera', 'camera-outline': 'camera',
  'chatbubble': 'message-circle', 'chatbubble-outline': 'message-circle',
  'chatbubbles': 'message-circle', 'chatbubbles-outline': 'message-circle',
  'code': 'code', 'code-outline': 'code',
  'compass': 'compass', 'compass-outline': 'compass',
  'git-merge': 'git-merge',
  'image': 'image', 'image-outline': 'image',
  'key': 'key', 'key-outline': 'key',
  'layers-sharp': 'layers',
  'leaf': 'feather', 'leaf-outline': 'feather',
  'link': 'link', 'link-outline': 'link',
  'musical-note': 'music', 'musical-notes': 'music',
  'newspaper': 'file-text', 'newspaper-outline': 'file-text',
  'pencil': 'edit', 'pencil-outline': 'edit',
  'pin': 'map-pin', 'pin-outline': 'map-pin',
  'planet': 'circle', 'planet-outline': 'circle',
  'radio-button-off': 'circle', 'radio-button-on': 'disc',
  'receipt': 'file-text', 'receipt-outline': 'file-text',
  'scan': 'maximize', 'scan-outline': 'maximize',
  'send': 'send', 'send-outline': 'send',
  'server': 'server', 'server-outline': 'server',
  'shapes': 'box', 'shapes-outline': 'box',
  'speedometer': 'zap', 'speedometer-outline': 'zap',
  'sunny': 'sun', 'sunny-outline': 'sun',
  'swap-vertical-outline': 'repeat',
  'thumbs-up': 'thumbs-up', 'thumbs-up-outline': 'thumbs-up',
  'thumbs-down': 'thumbs-down', 'thumbs-down-outline': 'thumbs-down',
  'trending-up': 'trending-up', 'trending-down': 'trending-down',
  'trophy-sharp': 'award',
  'videocam': 'video', 'videocam-outline': 'video',
  'volume-high': 'volume-2', 'volume-low': 'volume-1', 'volume-mute': 'volume-x',
  'water': 'droplet', 'water-outline': 'droplet',
  'wine': 'droplet',
  'close-sharp': 'x',
  'lock-closed-outline': 'lock',
  'checkmark-done': 'check',
  'checkmark-done-circle': 'check-circle',
  'color-filter': 'filter', 'color-filter-outline': 'filter',
  'search': 'search', 'search-outline': 'search',
  'mic': 'mic', 'mic-outline': 'mic', 'mic-off': 'mic-off',
};

const TARGET_FILES = [
  'app/boutique.tsx',
  'app/_layout.tsx',
  'app/(tabs)/codex.tsx',
  'app/(tabs)/collections.tsx',
  'app/(tabs)/index.tsx',
  'app/(tabs)/inventory.tsx',
  'app/(tabs)/profile.tsx',
  'app/(tabs)/world.tsx',
  'components/AchievementToast.tsx',
  'components/AlloyWorkshop.tsx',
  'components/AuctionHouseModal.tsx',
  'components/BetaWelcomeModal.tsx',
  'components/CraftingEnigma/index.tsx',
  'components/CraftingEnigma/RuneSequence.tsx',
  'components/FirstForgeTutorial.tsx',
  'components/ForgeEventBanner.tsx',
  'components/ForgeGuidedOverlay.tsx',
  'components/GemForgeModal.tsx',
  'components/GuildeSection.tsx',
  'components/HammeringMiniGame.tsx',
  'components/IntroCinematic.tsx',
  'components/ItemDetailSheet.tsx',
  'components/ItemModel3D.tsx',
  'components/MarketNotificationBanner.tsx',
  'components/SafeIcon.tsx',
  'components/SettingsModal.tsx',
  'components/WorkerReturnModal.tsx',
];

const ROOT = path.join(__dirname, '..');

let totalChanges = 0;
let unmapped = new Set();

for (const rel of TARGET_FILES) {
  const fpath = path.join(ROOT, rel);
  if (!fs.existsSync(fpath)) { console.log('SKIP (not found):', rel); continue; }

  let src = fs.readFileSync(fpath, 'utf-8');
  let changed = false;

  // 1. Replace icon name values in JSX props (name="..." name={'...'} name={"..."})
  src = src.replace(/\bname=(['"])([a-z][a-z0-9-]*)(\1)/g, (match, q, name) => {
    if (NAME_MAP[name]) {
      changed = true;
      return `name=${q}${NAME_MAP[name]}${q}`;
    }
    return match;
  });

  // 2. Replace icon names in curly braces: name={'x'} name={"x"}
  src = src.replace(/\bname=\{(['"])([a-z][a-z0-9-]*)(\1)\}/g, (match, q, name) => {
    if (NAME_MAP[name]) {
      changed = true;
      return `name={${q}${NAME_MAP[name]}${q}}`;
    }
    return match;
  });

  // 3. Replace Ionicons string values in objects/maps: 'icon-name' or "icon-name" after : or =
  src = src.replace(/:\s*(['"])([a-z][a-z0-9-]*)(\1)(\s*[,}\n])/g, (match, q, name, q2, end) => {
    if (NAME_MAP[name]) {
      changed = true;
      return `: ${q}${NAME_MAP[name]}${q2}${end}`;
    }
    return match;
  });

  // 4. Replace <Ionicons with <Feather
  if (src.includes('<Ionicons')) {
    src = src.replace(/<Ionicons\b/g, '<Feather');
    src = src.replace(/<\/Ionicons>/g, '</Feather>');
    changed = true;
  }

  // 5. Fix imports: replace Ionicons in destructure, add Feather if missing
  //    Handle: import { Ionicons } from '@expo/vector-icons'
  //            import { Ionicons, Feather } from '@expo/vector-icons'
  src = src.replace(
    /import\s*\{([^}]*)\}\s*from\s*['"]@expo\/vector-icons['"]/g,
    (match, imports) => {
      const parts = imports.split(',').map(s => s.trim()).filter(Boolean);
      const hadIonicons = parts.includes('Ionicons');
      const hadFeather = parts.includes('Feather');
      if (hadIonicons) {
        const filtered = parts.filter(p => p !== 'Ionicons');
        if (!filtered.includes('Feather')) filtered.unshift('Feather');
        changed = true;
        return `import { ${filtered.join(', ')} } from '@expo/vector-icons'`;
      }
      return match;
    }
  );

  // 6. Fix TypeScript type references
  src = src.replace(/ComponentProps<typeof Ionicons>\['name'\]/g, "ComponentProps<typeof Feather>['name']");
  src = src.replace(/React\.ComponentProps<typeof Ionicons>/g, 'React.ComponentProps<typeof Feather>');

  // 7. Fix ForgeIcon / any icon type aliases that reference Ionicons
  src = src.replace(/typeof Ionicons/g, 'typeof Feather');

  // 8. Look for remaining Ionicons references to report
  const remainingIon = (src.match(/Ionicons/g) || []).length;
  if (remainingIon > 0 && rel !== 'components/SafeIcon.tsx') {
    console.warn(`  ⚠️  ${rel}: ${remainingIon} Ionicons ref(s) remaining`);
  }

  if (changed) {
    fs.writeFileSync(fpath, src, 'utf-8');
    totalChanges++;
    console.log('✓', rel);
  } else {
    console.log('·', rel, '(no changes)');
  }
}

console.log(`\nDone. ${totalChanges} files updated.`);
if (unmapped.size > 0) {
  console.log('Unmapped icons:', [...unmapped].join(', '));
}
