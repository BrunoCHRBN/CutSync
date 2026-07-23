import { Platform } from 'react-native';

export const colors = {
  brandPrimary: '#2C4334',
  brandPrimaryPressed: '#203327',
  brandSecondary: '#DAD2B6',
  brandSecondarySoft: '#F0ECE0',
  canvas: '#F5F5F2',
  canvasSubtle: '#EFEEE9',
  canvasSoft: '#F8F8F5',
  surface: '#FFFFFF',
  surfaceMuted: '#F8F8F5',
  surfaceRaised: '#FFFFFF',
  surfacePressed: '#ECEDE8',
  borderSubtle: '#E4E5DF',
  border: '#E4E5DF',
  borderStrong: '#CBCDCA',
  hairline: 'rgba(203,205,202,0.7)',
  labelSoft: '#7D857F',
  accent: '#2C4334',
  textPrimary: '#18201B',
  text: '#18201B',
  textSecondary: '#59615B',
  textMuted: '#7D857F',
  brand: '#2C4334',
  brandSoft: '#F0ECE0',
  brandBorder: '#DAD2B6',
  ink: '#FFFFFF',
  success: '#3F7A4C',
  successSoft: '#E9F2EA',
  info: '#315C9B',
  infoSoft: '#EAF0F8',
  warning: '#B66A13',
  warningSoft: '#F8EEE1',
  danger: '#B84A4A',
  dangerSoft: '#F8EAEA',
  white: '#FFFFFF',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  huge: 48,
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
};

export const typography = {
  display: 'Montserrat_700Bold',
  body: 'Inter_400Regular',
  bodyStrong: 'Inter_600SemiBold',
  serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Times New Roman", serif' }) as string,
};

export const typeScale = {
  displayLarge: { fontFamily: typography.display, fontSize: 34, lineHeight: 40, letterSpacing: -1.4 },
  pageTitle: { fontFamily: typography.display, fontSize: 30, lineHeight: 36, letterSpacing: -1.1 },
  sectionTitle: { fontFamily: typography.display, fontSize: 22, lineHeight: 28, letterSpacing: -0.7 },
  cardTitle: { fontFamily: typography.bodyStrong, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: typography.body, fontSize: 14, lineHeight: 21 },
  bodyStrong: { fontFamily: typography.bodyStrong, fontSize: 14, lineHeight: 21 },
  small: { fontFamily: typography.body, fontSize: 12, lineHeight: 17 },
  label: { fontFamily: typography.bodyStrong, fontSize: 11, lineHeight: 14, letterSpacing: 0.3 },
  metric: { fontFamily: typography.display, fontSize: 30, lineHeight: 34, letterSpacing: -1, fontVariant: ['tabular-nums'] as const },
};

export const elevations = {
  flat: {} as any,
  panel: { boxShadow: '0 1px 2px rgba(24,32,27,0.05)' } as any,
  overlay: { boxShadow: '0 18px 48px rgba(24,32,27,0.14)' } as any,
};

export const atmosphericShadow = elevations.panel;

export const glassSurface = Platform.select({
  web: { backgroundColor: 'rgba(255, 255, 255, 0.72)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' } as any,
  default: { backgroundColor: 'rgba(255, 255, 255, 0.94)' },
});

export const glassHeader = Platform.select({
  web: {
    position: 'sticky' as any,
    top: 0,
    backgroundColor: 'rgba(245, 245, 242, 0.78)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    boxShadow: '0 4px 20px rgba(24, 32, 27, 0.04)',
  } as any,
  default: { backgroundColor: 'rgba(245, 245, 242, 0.95)' },
});

export const glassBadge = Platform.select({
  web: {
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderColor: 'rgba(228, 229, 223, 0.6)',
  } as any,
  default: { backgroundColor: 'rgba(255, 255, 255, 0.9)' },
});

export const shadows = elevations.panel;

export const layout = {
  operationalMax: 1440,
  contentMax: 1200,
  formMax: 760,
  mobileBreakpoint: 760,
  desktopBreakpoint: 1040,
};

export const motion = {
  fast: 120,
  standard: 160,
  slow: 180,
};
