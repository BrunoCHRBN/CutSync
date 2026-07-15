import { Platform } from 'react-native';

export const colors = {
  canvas: '#F4F4F5',
  canvasSoft: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceRaised: '#F9FAFB',
  surfacePressed: '#F0F0F2',
  border: '#E4E4E7',
  borderStrong: '#D4D4D8',
  hairline: 'rgba(228,228,231,0.6)',
  labelSoft: '#88888F',
  accent: '#18181B',
  text: '#171717',
  textSecondary: '#52525B',
  textMuted: '#A1A1AA',
  brand: '#F5A524',
  brandSoft: '#F5A5241A',
  brandBorder: '#F5A5244D',
  ink: '#FFFFFF',
  success: '#16A34A',
  successSoft: '#16A34A1A',
  info: '#2563EB',
  infoSoft: '#2563EB1A',
  warning: '#D97706',
  warningSoft: '#D977061A',
  danger: '#DC2626',
  dangerSoft: '#DC26261A',
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

export const atmosphericShadow = Platform.select({
  web: { boxShadow: '0 8px 30px rgba(0,0,0,0.04)' } as any,
  default: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.04, shadowRadius: 20, elevation: 2 },
});

export const glassSurface = Platform.select({
  web: { backgroundColor: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' } as any,
  default: { backgroundColor: 'rgba(255,255,255,0.94)' },
});

export const shadows = Platform.select({
  web: {
    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  } as any,
  default: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
});

export const layout = {
  contentMax: 1240,
  formMax: 480,
  mobileBreakpoint: 760,
  desktopBreakpoint: 1040,
};