// ── Design tokens ──────────────────────────────────────────────
// A refined, modern palette with improved typography system.

export const colors = {
  // Backgrounds
  background: '#FFFFFF',
  backgroundSecondary: '#F8FAFC',
  backgroundTertiary: '#F1F5F9',

  // Surfaces (cards, modals)
  surface: '#FFFFFF',
  surfaceBorder: '#E2E8F0',
  surfaceHover: '#F8FAFC',

  // Text
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  textInverse: '#FFFFFF',

  // Accent – a calm, confident indigo
  accent: '#4F46E5',
  accentHover: '#4338CA',
  accentLight: '#EEF2FF',
  accentMuted: 'rgba(79, 70, 229, 0.08)',

  // Semantic
  success: '#059669',
  successLight: '#ECFDF5',
  warning: '#D97706',
  warningLight: '#FFFBEB',
  error: '#DC2626',
  errorLight: '#FEF2F2',

  // Misc
  divider: '#E2E8F0',
  skeleton: '#E2E8F0',
  overlay: 'rgba(15, 23, 42, 0.4)',

  // Legacy compat
  backgroundGradient: ['#FFFFFF', '#F8FAFC'] as [string, string],
  surfaceGradient: ['#FFFFFF', '#F8FAFC'] as [string, string],
  surfaceBg: '#FFFFFF',
  accentPrimary: '#4F46E5',
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
  cardRadius: 16,
  cardRadiusLg: 20,
  buttonRadius: 14,
  inputRadius: 14,
};

// Typography system with clear hierarchy
export const typography = {
  // Display - Hero text, large numbers
  display: {
    fontSize: 40,
    fontWeight: '800' as const,
    letterSpacing: -1.5,
    lineHeight: 44,
  },
  // Large Title - Page headers
  largeTitle: {
    fontSize: 28,
    fontWeight: '800' as const,
    letterSpacing: -0.8,
    lineHeight: 34,
  },
  // Title - Section headers
  title: {
    fontSize: 22,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  // Headline - Card titles, emphasis
  headline: {
    fontSize: 17,
    fontWeight: '600' as const,
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  // Body - Main content text
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
    letterSpacing: 0,
    lineHeight: 22,
  },
  // Body Medium - Slightly emphasized body
  bodyMedium: {
    fontSize: 15,
    fontWeight: '500' as const,
    letterSpacing: 0,
    lineHeight: 22,
  },
  // Callout - Secondary content, lists
  callout: {
    fontSize: 14,
    fontWeight: '500' as const,
    letterSpacing: 0,
    lineHeight: 20,
  },
  // Caption - Labels, metadata
  caption: {
    fontSize: 13,
    fontWeight: '500' as const,
    letterSpacing: 0.1,
    lineHeight: 18,
  },
  // Caption Small - Timestamps, hints
  captionSmall: {
    fontSize: 12,
    fontWeight: '500' as const,
    letterSpacing: 0.2,
    lineHeight: 16,
  },
  // Overline - Category labels, badges
  overline: {
    fontSize: 11,
    fontWeight: '600' as const,
    letterSpacing: 0.8,
    lineHeight: 14,
    textTransform: 'uppercase' as const,
  },
  // Numeric - Stats, counts
  numeric: {
    fontSize: 24,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  // Numeric Large - Hero numbers
  numericLarge: {
    fontSize: 36,
    fontWeight: '800' as const,
    letterSpacing: -1,
    lineHeight: 40,
  },
};

export const shadows = {
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  lg: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
  },
};
