import { Platform } from 'react-native';

export const landingColors = {
  canvas: '#F7F6F2',
  canvasWarm: '#EEEAE1',
  surface: '#FFFEFC',
  surfaceSoft: '#F4F2EC',
  ink: '#142119',
  inkSecondary: '#526057',
  inkMuted: '#748078',
  textSecondary: '#526057',
  textMuted: '#748078',
  brand: '#294B3A',
  brandStrong: '#193628',
  brandSoft: '#E3ECE6',
  accent: '#C5A66D',
  accentSoft: '#F3EBDD',
  border: '#DCDED8',
  borderStrong: '#BBC2BC',
  success: '#2E7148',
  successSoft: '#E4F1E8',
  warning: '#9A5B13',
  warningSoft: '#F8EEDD',
  warningBorder: '#E4C79D',
  danger: '#A53E3E',
  focus: '#275C46',
  onBrand: '#DCE8E0',
  onBrandMuted: '#BFD5C8',
  onBrandSubtle: '#9EB9AA',
  white: '#FFFFFF',
} as const;

export const landingTypography = {
  displaySemiBold: 'Fraunces_600SemiBold',
  displayBold: 'Fraunces_700Bold',
  body: 'Geist_400Regular',
  bodyMedium: 'Geist_500Medium',
  bodySemiBold: 'Geist_600SemiBold',
  mono: 'GeistMono_500Medium',
} as const;

export const landingMotion = {
  fast: 120,
  standard: 180,
  editorial: 280,
  easingIn: [0.16, 1, 0.3, 1] as const,
  easingOut: [0.4, 0, 1, 1] as const,
} as const;

export const landingLayout = {
  maxWidth: 1240,
  copyWidth: 680,
  mobileBreakpoint: 760,
  desktopBreakpoint: 1040,
} as const;

export const landingRadii = {
  sm: 10,
  md: 16,
  lg: 24,
  xl: 34,
  pill: 999,
} as const;

export type LandingGlassVariant = 'header' | 'search' | 'preview' | 'control';

const glassMap = {
  header: { alpha: 0.86, blur: 16, borderAlpha: 0.1 },
  search: { alpha: 0.78, blur: 20, borderAlpha: 0.14 },
  preview: { alpha: 0.72, blur: 24, borderAlpha: 0.14 },
  control: { alpha: 0.82, blur: 18, borderAlpha: 0.12 },
} as const;

export const landingGlassStyle = (variant: LandingGlassVariant) => {
  const token = glassMap[variant];
  return Platform.select({
    web: {
      backgroundColor: `rgba(255,254,252,${token.alpha})`,
      backdropFilter: `blur(${token.blur}px)`,
      WebkitBackdropFilter: `blur(${token.blur}px)`,
      borderColor: `rgba(41,75,58,${token.borderAlpha})`,
    } as never,
    default: {
      backgroundColor: landingColors.surface,
      borderColor: `rgba(41,75,58,${token.borderAlpha})`,
    },
  });
};

export const landingShadows = {
  soft: { boxShadow: '0 10px 36px rgba(20,33,25,0.06)' } as never,
  raised: { boxShadow: '0 24px 70px rgba(20,33,25,0.11)' } as never,
} as const;
