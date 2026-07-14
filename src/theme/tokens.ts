import { Platform } from 'react-native';

export const colors = {
  canvas: '#09090B',
  canvasSoft: '#0F0F12',
  surface: '#151518',
  surfaceRaised: '#1C1C20',
  surfacePressed: '#242429',
  border: '#2A2A30',
  borderStrong: '#3A3A42',
  text: '#FAFAFA',
  textSecondary: '#A1A1AA',
  textMuted: '#71717A',
  brand: '#F5A524',
  brandSoft: '#F5A5241A',
  brandBorder: '#F5A5244D',
  ink: '#111113',
  success: '#34D399',
  successSoft: '#34D3991A',
  info: '#60A5FA',
  infoSoft: '#60A5FA1A',
  warning: '#FBBF24',
  warningSoft: '#FBBF241A',
  danger: '#FB7185',
  dangerSoft: '#FB71851A',
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
};

export const shadows = Platform.select({
  web: {
    boxShadow: '0 18px 50px rgba(0,0,0,0.28)',
  } as any,
  default: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.26,
    shadowRadius: 28,
    elevation: 10,
  },
});

export const layout = {
  contentMax: 1240,
  formMax: 480,
  mobileBreakpoint: 760,
  desktopBreakpoint: 1040,
};