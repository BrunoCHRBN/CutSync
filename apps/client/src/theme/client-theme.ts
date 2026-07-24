import { sharedBrand } from '@cutsync/brand';

export type ClientThemeTokens = typeof clientTheme;
export type ClientMotionPreference = 'full' | 'reduced';

export const clientTheme = {
  colors: {
    ...sharedBrand.colors,
    canvasRaised: '#F8F4EA',
    surfaceMuted: '#FCFAF5',
    overlay: 'rgba(24, 32, 27, 0.34)',
    glass: 'rgba(255, 255, 255, 0.68)',
    glassBorder: 'rgba(255, 255, 255, 0.58)',
    danger: '#8E2F26',
    dangerSoft: '#FFF2EF',
    dangerBorder: '#EBCAC4',
    success: '#2D633A',
    successSoft: '#E9F3EA',
    successBorder: '#C7DFC9',
    warning: '#6A5620',
    warningSoft: '#F7EFD5',
    warningBorder: '#E7D89F',
    info: '#315E99',
    infoSoft: '#E9F0FA',
    infoBorder: '#CEDCF0',
    white: '#FFFFFF',
  },
  spacing: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
    hero: 40,
    page: 48,
  },
  radii: {
    sm: 12,
    md: 16,
    lg: 22,
    card: 26,
    hero: 32,
    pill: 999,
  },
  typography: {
    display: {
      fontSize: 40,
      lineHeight: 44,
      fontWeight: '800' as const,
      letterSpacing: -1.35,
    },
    title: {
      fontSize: 28,
      lineHeight: 34,
      fontWeight: '800' as const,
      letterSpacing: -0.8,
    },
    heading: {
      fontSize: 20,
      lineHeight: 26,
      fontWeight: '800' as const,
      letterSpacing: -0.4,
    },
    body: {
      fontSize: 15,
      lineHeight: 23,
      fontWeight: '400' as const,
    },
    bodyStrong: {
      fontSize: 15,
      lineHeight: 22,
      fontWeight: '700' as const,
    },
    caption: {
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '500' as const,
    },
    eyebrow: {
      fontSize: 10,
      lineHeight: 14,
      fontWeight: '900' as const,
      letterSpacing: 1.5,
      textTransform: 'uppercase' as const,
    },
  },
  shadows: {
    card: '0 10px 26px rgba(20, 27, 23, 0.06)',
    elevated: '0 18px 44px rgba(20, 27, 23, 0.11)',
    floating: '0 12px 34px rgba(20, 27, 23, 0.16)',
  },
  motion: {
    fast: 180,
    standard: 240,
    emphasized: 300,
    stagger: 48,
  },
  opacity: {
    pressed: 0.72,
    disabled: 0.45,
    loading: 0.62,
  },
  sizing: {
    control: 54,
    touchTarget: 48,
    contentMaxWidth: 620,
  },
} as const;
