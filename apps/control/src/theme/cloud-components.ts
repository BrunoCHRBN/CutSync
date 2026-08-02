import {
  controlColors,
  controlLayout,
  controlRadii,
  controlSpacing,
  controlType,
} from '@/theme/tokens';

/** Visual contract for CutSync Cloud V5 primitives. */
export const cloudTheme = {
  colors: {
    ...controlColors,
    accentBlue: '#2F5B9C',
    accentBlueSoft: '#EAF1FB',
    accentGreen: '#2F7A4B',
    accentGreenSoft: '#E8F6EE',
    accentViolet: '#5B4B8A',
    accentVioletSoft: '#F1EDF8',
    accentAmber: '#9A6B1F',
    accentAmberSoft: '#FFF6E8',
    focusRing: '#1F6B45',
  },
  spacing: controlSpacing,
  radii: controlRadii,
  type: {
    ...controlType,
    caption: {
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '600' as const,
    },
    button: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '700' as const,
    },
  },
  layout: {
    ...controlLayout,
    topbarHeight: 64,
    bottomNavHeight: 64,
    moduleCardMinHeight: 168,
  },
  motion: {
    fastMs: 120,
    baseMs: 180,
    slowMs: 260,
  },
} as const;

export type CloudTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const cloudToneStyles: Record<
  CloudTone,
  { background: string; border: string; text: string }
> = {
  neutral: {
    background: cloudTheme.colors.surfaceMuted,
    border: cloudTheme.colors.border,
    text: cloudTheme.colors.text,
  },
  info: {
    background: cloudTheme.colors.infoSoft,
    border: cloudTheme.colors.info,
    text: cloudTheme.colors.info,
  },
  success: {
    background: cloudTheme.colors.successSoft,
    border: cloudTheme.colors.success,
    text: cloudTheme.colors.success,
  },
  warning: {
    background: cloudTheme.colors.warningSoft,
    border: cloudTheme.colors.warning,
    text: cloudTheme.colors.warning,
  },
  danger: {
    background: cloudTheme.colors.dangerSoft,
    border: cloudTheme.colors.danger,
    text: cloudTheme.colors.danger,
  },
};
