// ── Design Tokens ───────────────────────────────────────────────
// "Indigo & marigold". Indigo ink carries text, primary actions and the
// home hero; marigold is the single warm accent, used as a fill (progress,
// today, the active tab) and never as body text. Surfaces are flat white
// on a cool chalk ground: hierarchy comes from colour and radius, not from
// a shadow under every card.
//
// Custom fonts register one family per weight, so type styles set
// `fontFamily` and never `fontWeight` (Android would fake-bold the regular
// cut). Use `fonts.*` when a screen needs a different weight.

export const fonts = {
  display: 'YoungSerif_400Regular',
  regular: 'Onest_400Regular',
  medium: 'Onest_500Medium',
  semibold: 'Onest_600SemiBold',
  bold: 'Onest_700Bold',
};

const palette = {
  indigo: '#1D2445',        // Ink: primary text, primary buttons, hero
  indigoRaised: '#2A3360',  // Raised surface on the indigo hero
  slate: '#4F5673',         // Secondary text (7:1 on white)
  dusk: '#6B7190',          // Tertiary text (4.8:1 on white)
  haze: '#9CA1B8',          // Placeholder, disabled, decorative
  line: '#DCDFE9',          // Hairlines, input borders
  lineStrong: '#C7CBDA',
  chalk: '#ECEEF3',         // App background
  chalkDeep: '#E2E5EE',     // Pressed / sunken
  white: '#FFFFFF',
  marigold: '#F4A722',      // Accent fill
  marigoldInk: '#9A5B00',   // Accent as text on light (5.2:1)
  marigoldSoft: '#FCEFD3',
  indigoSoft: '#E4E7F4',
};

export const colors = {
  // Surfaces
  background: palette.chalk,
  backgroundSecondary: palette.chalk,
  backgroundTertiary: palette.chalkDeep,

  surface: palette.white,
  surfaceElevated: palette.white,
  surfaceBorder: palette.line,
  surfaceBorderStrong: palette.lineStrong,
  surfaceHover: palette.chalkDeep,

  // Inverse / indigo surface (hero blocks, primary CTAs)
  inkSurface: palette.indigo,
  inkSurfaceElevated: palette.indigoRaised,
  inkBorder: 'rgba(255, 255, 255, 0.10)',
  inkBorderStrong: 'rgba(255, 255, 255, 0.18)',

  // Text
  textPrimary: palette.indigo,
  textSecondary: palette.slate,
  textTertiary: palette.dusk,
  textMuted: palette.haze,
  textInverse: palette.white,
  textInverseMuted: 'rgba(255, 255, 255, 0.74)',
  textInverseSubtle: 'rgba(255, 255, 255, 0.52)',

  // Accent — marigold. `accent` is a fill; use `accentText` for words.
  accent: palette.marigold,
  accentText: palette.marigoldInk,
  accentHover: '#E09612',
  accentSoft: palette.marigoldSoft,
  accentSoftBorder: 'rgba(244, 167, 34, 0.35)',
  accentMuted: 'rgba(244, 167, 34, 0.14)',
  accentGlow: 'rgba(244, 167, 34, 0.30)',

  // Indigo tint for selected states and secondary buttons
  selected: palette.indigoSoft,

  // Semantic status (only where information requires it)
  success: '#1F7A50',
  successSoft: '#DDF1E6',
  warning: '#B4530A',
  warningSoft: '#FBE7D6',
  error: '#B4322A',
  errorSoft: '#F8E0DE',

  // Misc
  divider: palette.line,
  dividerStrong: palette.lineStrong,
  skeleton: palette.chalkDeep,
  overlay: 'rgba(20, 24, 48, 0.55)',

  neutral: palette,

  // Legacy compat (do not introduce new usages)
  accentLight: palette.marigoldSoft,
  accentPrimary: palette.marigold,
  surfaceBg: palette.white,
  backgroundGradient: [palette.chalk, palette.chalk] as [string, string],
  surfaceGradient: [palette.white, palette.white] as [string, string],
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  screenPadding: 20,

  // Radius follows hierarchy: the hero is the softest, controls the tightest.
  cardRadius: 16,
  cardRadiusLg: 20,
  cardRadiusXl: 28,
  buttonRadius: 16,
  inputRadius: 14,
  chipRadius: 999,
};

// Minimum comfortable touch target.
export const HIT = 48;

// Typography — Young Serif for display and hero numerals, Onest for UI.
export const typography = {
  mega: { fontFamily: fonts.display, fontSize: 60, letterSpacing: -1.5, lineHeight: 64 },
  display: { fontFamily: fonts.display, fontSize: 40, letterSpacing: -1, lineHeight: 46 },
  largeTitle: { fontFamily: fonts.display, fontSize: 30, letterSpacing: -0.6, lineHeight: 36 },
  title: { fontFamily: fonts.display, fontSize: 22, letterSpacing: -0.3, lineHeight: 28 },
  subtitle: { fontFamily: fonts.semibold, fontSize: 18, letterSpacing: -0.2, lineHeight: 24 },
  headline: { fontFamily: fonts.semibold, fontSize: 16, letterSpacing: -0.1, lineHeight: 22 },
  body: { fontFamily: fonts.regular, fontSize: 16, letterSpacing: 0, lineHeight: 24 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 16, letterSpacing: 0, lineHeight: 24 },
  callout: { fontFamily: fonts.medium, fontSize: 14, letterSpacing: 0, lineHeight: 20 },
  caption: { fontFamily: fonts.medium, fontSize: 13, letterSpacing: 0, lineHeight: 18 },
  captionSmall: { fontFamily: fonts.medium, fontSize: 12, letterSpacing: 0.1, lineHeight: 16 },
  // Small label in sentence case. The name is kept for compatibility; it
  // is no longer an uppercase tracked eyebrow.
  overline: { fontFamily: fonts.semibold, fontSize: 13, letterSpacing: 0, lineHeight: 18 },
  numeric: { fontFamily: fonts.display, fontSize: 30, letterSpacing: -0.5, lineHeight: 34 },
  numericLarge: { fontFamily: fonts.display, fontSize: 48, letterSpacing: -1, lineHeight: 52 },
  mono: { fontFamily: fonts.regular, fontSize: 13, letterSpacing: 0, lineHeight: 20 },
};

const shadow = (height: number, radius: number, opacity: number, elevation: number) => ({
  shadowColor: palette.indigo,
  shadowOffset: { width: 0, height },
  shadowOpacity: opacity,
  shadowRadius: radius,
  elevation,
});

// Shadows are for things that float (sheets, the tab bar, toasts), not cards.
export const shadows = {
  none: shadow(0, 0, 0, 0),
  sm: shadow(0, 0, 0, 0),
  md: shadow(0, 0, 0, 0),
  lg: shadow(8, 24, 0.08, 6),
  xl: shadow(16, 40, 0.14, 12),
  glow: shadow(0, 0, 0, 0),
};
