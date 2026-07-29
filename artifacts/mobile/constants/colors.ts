/**
 * Forge & Kingdoms — Dark Fantasy color palette.
 * Both light and dark use the same immersive dark theme (this is a game).
 */

const forgePalette = {
  // Core surfaces
  background: '#0A0810',
  foreground: '#F2E4C4',

  // Cards / elevated surfaces
  card: '#16101E',
  cardForeground: '#F2E4C4',

  // Primary — forge amber
  primary: '#D4851A',
  primaryForeground: '#0A0810',

  // Secondary — dark wood
  secondary: '#2E1E12',
  secondaryForeground: '#F2E4C4',

  // Muted — dark purple-grey
  muted: '#1E1830',
  mutedForeground: '#8A7A6A',

  // Accent — bright gold
  accent: '#E8A83A',
  accentForeground: '#0A0810',

  // Destructive — ember red
  destructive: '#C0392B',
  destructiveForeground: '#F2E4C4',

  // Borders and inputs
  border: '#3D2E1A',
  input: '#1E1830',

  // Legacy aliases kept for compatibility
  text: '#F2E4C4',
  tint: '#D4851A',
};

const colors = {
  light: forgePalette,
  dark: forgePalette,
  radius: 10,
};

export default colors;
