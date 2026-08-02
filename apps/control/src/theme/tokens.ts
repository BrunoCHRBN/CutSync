export const controlColors = {
  canvas: '#F3F5F1',
  background: '#F3F5F1',
  canvasMuted: '#EEF2ED',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceMuted: '#F9FAF8',
  surfacePressed: '#EDF1EC',
  text: '#17231C',
  textPrimary: '#17231C',
  textSecondary: '#667269',
  textMuted: '#7B857E',
  border: '#D8DFD8',
  borderSubtle: '#D8DFD8',
  borderStrong: '#CBD4CC',
  brand: '#173D2B',
  brandPrimary: '#173D2B',
  brandPressed: '#102E20',
  brandPrimaryPressed: '#102E20',
  brandSoft: '#E4F2E9',
  brandDark: '#12271C',
  brandPanel: '#27523B',
  brandLine: '#31503D',
  accent: '#347452',
  accentSoft: '#E4F2E9',
  sidebarText: '#B8C6BC',
  sidebarTextStrong: '#FFFFFF',
  sidebarTextMuted: '#9FB2A5',
  success: '#28754B',
  successSoft: '#F0FAF4',
  warning: '#8B641D',
  warningSoft: '#FFFBF1',
  danger: '#A33A31',
  dangerSoft: '#FFF7F6',
  info: '#315C9B',
  infoSoft: '#EEF4FC',
} as const;

export const controlSpacing = {
  xxs: 4,
  xs: 7,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
} as const;

export const controlRadii = {
  sm: 8,
  md: 10,
  lg: 14,
  xl: 18,
  pill: 999,
} as const;

export const controlType = {
  // Cloud V5 floor: no type style below 12px except uppercase eyebrows.
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800' as const,
    letterSpacing: 1.2,
  },
  pageTitle: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800' as const,
    letterSpacing: -0.6,
  },
  pageTitleCompact: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800' as const,
    letterSpacing: -0.4,
  },
  sectionTitle: {
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '800' as const,
  },
  body: {
    fontSize: 14,
    lineHeight: 22,
  },
  bodyStrong: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700' as const,
  },
  cardTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700' as const,
  },
  small: {
    fontSize: 12,
    lineHeight: 18,
  },
  smallStrong: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700' as const,
  },
  label: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
  },
  metric: {
    fontSize: 30,
    lineHeight: 35,
    fontWeight: '800' as const,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
};

export const controlLayout = {
  contentMax: 1180,
  formMax: 720,
  sidebarWidth: 264,
  compactBreakpoint: 900,
  mobileBreakpoint: 600,
  touchTarget: 48,
} as const;

// Aliases keep feature code concise while the `control*` names make imports
// unambiguous in files that also consume domain-level tokens.
export const colors = controlColors;
export const spacing = controlSpacing;
export const radii = controlRadii;
export const typeScale = controlType;
export const layout = controlLayout;
