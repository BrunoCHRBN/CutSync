import { type EstablishmentTheme } from '@cutsync/brand';

export function selectedSurface(theme: EstablishmentTheme) {
  return {
    borderColor: theme.primary,
    borderWidth: 2,
    backgroundColor: theme.soft,
  } as const;
}

export function selectedChip(theme: EstablishmentTheme) {
  return {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  } as const;
}

export function selectedChipText(theme: EstablishmentTheme) {
  return { color: theme.onPrimary } as const;
}

export function accentText(theme: EstablishmentTheme) {
  return { color: theme.primary } as const;
}

export function primaryButton(theme: EstablishmentTheme) {
  return {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  } as const;
}

export function iconSoftBackground(theme: EstablishmentTheme) {
  return { backgroundColor: theme.soft } as const;
}

export function logoRing(theme: EstablishmentTheme) {
  return {
    backgroundColor: theme.soft,
    borderColor: theme.muted,
  } as const;
}
