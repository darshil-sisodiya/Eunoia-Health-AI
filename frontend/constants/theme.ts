// ── Design Tokens ───────────────────────────────────────────────
// Monochrome-first luxury system. Black, white, and a refined
// grayscale dominate the interface. A single deep cobalt accent
// is reserved for focal elements; semantic status colors are used
// only where information requires it.

// Neutral scale (the backbone of the system)
const neutral = {
  ink: '#0A0A0A',         // Primary text, primary buttons
  graphite: '#171717',    // Dense surfaces, hero blocks
  charcoal: '#262626',    // Tertiary dark surface
  slate: '#404040',       // Heavy secondary text
  steel: '#525252',       // Secondary text
  ash: '#737373',         // Muted text
  fog: '#A3A3A3',         // Hint, disabled-on-light
  mist: '#D4D4D4',        // Strong borders, dividers
  cloud: '#E5E5E5',       // Borders, hairline rules
  pearl: '#F5F5F5',       // Elevated tinted surface
  snow: '#FAFAFA',        // Secondary background
  white: '#FFFFFF',
};

export const colors = {
  // Surfaces
  background: neutral.white,
  backgroundSecondary: neutral.snow,
  backgroundTertiary: neutral.pearl,

  surface: neutral.white,
  surfaceElevated: neutral.snow,
  surfaceBorder: neutral.cloud,
  surfaceBorderStrong: neutral.mist,
  surfaceHover: neutral.snow,

  // Inverse / dark surface (used for hero blocks, primary CTAs)
  inkSurface: neutral.ink,
  inkSurfaceElevated: neutral.graphite,
  inkBorder: 'rgba(255, 255, 255, 0.08)',
  inkBorderStrong: 'rgba(255, 255, 255, 0.14)',

  // Text
  textPrimary: neutral.ink,
  textSecondary: neutral.steel,
  textTertiary: neutral.ash,
  textMuted: neutral.fog,
  textInverse: neutral.white,
  textInverseMuted: 'rgba(255, 255, 255, 0.64)',
  textInverseSubtle: 'rgba(255, 255, 255, 0.42)',

  // Accent — deep cobalt, used sparingly as a focal highlight
  accent: '#1F4FE5',
  accentHover: '#1640C2',
  accentSoft: '#EEF2FF',
  accentSoftBorder: 'rgba(31, 79, 229, 0.18)',
  accentMuted: 'rgba(31, 79, 229, 0.08)',
  accentGlow: 'rgba(31, 79, 229, 0.25)',

  // Semantic status (used only where information requires it)
  success: '#10B981',
  successSoft: 'rgba(16, 185, 129, 0.10)',
  warning: '#F59E0B',
  warningSoft: 'rgba(245, 158, 11, 0.10)',
  error: '#DC2626',
  errorSoft: 'rgba(220, 38, 38, 0.10)',

  // Misc
  divider: neutral.cloud,
  dividerStrong: neutral.mist,
  skeleton: neutral.cloud,
  overlay: 'rgba(10, 10, 10, 0.55)',

  // Neutral palette exposed for components that need a custom blend
  neutral,

  // Legacy compat (do not introduce new usages)
  accentLight: '#EEF2FF',
  accentPrimary: '#1F4FE5',
  surfaceBg: neutral.white,
  backgroundGradient: [neutral.white, neutral.snow] as [string, string],
  surfaceGradient: [neutral.white, neutral.snow] as [string, string],
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  screenPadding: 24,

  // Brutalist-modern radii: smaller, more architectural
  cardRadius: 14,
  cardRadiusLg: 18,
  cardRadiusXl: 22,
  buttonRadius: 12,
  inputRadius: 12,
  chipRadius: 999,
};

// Typography — oversized clean display, editorial hierarchy
export const typography = {
  // Mega — cinematic hero numerics
  mega: {
    fontSize: 56,
    fontWeight: '800' as const,
    letterSpacing: -2.5,
    lineHeight: 60,
  },
  // Display — hero text
  display: {
    fontSize: 44,
    fontWeight: '800' as const,
    letterSpacing: -2,
    lineHeight: 48,
  },
  // Large Title — page headers
  largeTitle: {
    fontSize: 32,
    fontWeight: '800' as const,
    letterSpacing: -1.2,
    lineHeight: 36,
  },
  // Title — section headers
  title: {
    fontSize: 22,
    fontWeight: '700' as const,
    letterSpacing: -0.6,
    lineHeight: 28,
  },
  // Subtitle — supporting headers
  subtitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  // Headline — card titles, emphasis
  headline: {
    fontSize: 16,
    fontWeight: '600' as const,
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  // Body — main content
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
    letterSpacing: -0.1,
    lineHeight: 22,
  },
  bodyMedium: {
    fontSize: 15,
    fontWeight: '500' as const,
    letterSpacing: -0.1,
    lineHeight: 22,
  },
  // Callout — secondary content
  callout: {
    fontSize: 14,
    fontWeight: '500' as const,
    letterSpacing: -0.1,
    lineHeight: 20,
  },
  // Caption — labels, metadata
  caption: {
    fontSize: 13,
    fontWeight: '500' as const,
    letterSpacing: 0,
    lineHeight: 18,
  },
  captionSmall: {
    fontSize: 12,
    fontWeight: '500' as const,
    letterSpacing: 0.1,
    lineHeight: 16,
  },
  // Overline — categorical labels (uppercase tracked)
  overline: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1.4,
    lineHeight: 14,
    textTransform: 'uppercase' as const,
  },
  // Numeric — data display
  numeric: {
    fontSize: 28,
    fontWeight: '800' as const,
    letterSpacing: -0.8,
    lineHeight: 32,
  },
  numericLarge: {
    fontSize: 44,
    fontWeight: '800' as const,
    letterSpacing: -1.6,
    lineHeight: 48,
  },
  // Mono — for technical/extracted text
  mono: {
    fontSize: 12,
    fontWeight: '500' as const,
    letterSpacing: 0,
    lineHeight: 18,
  },
};

// Shadows — refined, low-opacity, layered
export const shadows = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#0A0A0A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#0A0A0A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  lg: {
    shadowColor: '#0A0A0A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 5,
  },
  xl: {
    shadowColor: '#0A0A0A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.10,
    shadowRadius: 32,
    elevation: 10,
  },
  // Used on dark surfaces for inner glow / lift
  glow: {
    shadowColor: '#1F4FE5',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.30,
    shadowRadius: 16,
    elevation: 6,
  },
};
