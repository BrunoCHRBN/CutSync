import { getContrastRatio, readableForeground } from './color-utils';

export const DEFAULT_ESTABLISHMENT_COLOR = '#2C4334';

export interface EstablishmentTheme {
  primary: string;
  onPrimary: string;
  soft: string;
  muted: string;
  ring: string;
  pressed: string;
}

const HEX6 = /^#[0-9A-Fa-f]{6}$/;

export function normalizeHex(input?: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (!HEX6.test(withHash)) return null;
  return withHash.toUpperCase();
}

const withAlpha = (hex: string, alphaHex: string): string => `${hex}${alphaHex}`;

const darkenHex = (hex: string, amount: number): string => {
  const normalized = hex.replace('#', '');
  const channels = [0, 2, 4].map((index) => {
    const value = parseInt(normalized.slice(index, index + 2), 16);
    return Math.max(0, Math.round(value * (1 - amount)));
  });
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};

export function buildEstablishmentTheme(hex?: string | null): EstablishmentTheme {
  const primary = normalizeHex(hex) ?? DEFAULT_ESTABLISHMENT_COLOR;
  const onPrimary = readableForeground(primary);

  return {
    primary,
    onPrimary,
    soft: withAlpha(primary, '1F'),
    muted: withAlpha(primary, '59'),
    ring: withAlpha(primary, '33'),
    pressed: darkenHex(primary, 0.08),
  };
}

export function meetsWcagAA(theme: EstablishmentTheme): boolean {
  return getContrastRatio(theme.onPrimary, theme.primary) >= 4.5;
}

export function establishmentThemeCssVars(theme: EstablishmentTheme): Record<string, string> {
  return {
    '--establishment-primary': theme.primary,
    '--establishment-on-primary': theme.onPrimary,
    '--establishment-soft': theme.soft,
    '--establishment-muted': theme.muted,
    '--establishment-ring': theme.ring,
    '--establishment-pressed': theme.pressed,
  };
}
