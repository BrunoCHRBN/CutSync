export interface EstablishmentColorPreset {
  id: string;
  hex: string;
  label: string;
}

/** Curated palette with WCAG AA contrast for onPrimary text. */
export const ESTABLISHMENT_COLOR_PRESETS: readonly EstablishmentColorPreset[] = [
  { id: 'forest', hex: '#2C4334', label: 'Verde floresta' },
  { id: 'amber', hex: '#F5A524', label: 'Âmbar' },
  { id: 'navy', hex: '#1B3A5C', label: 'Azul naval' },
  { id: 'burgundy', hex: '#6B2737', label: 'Bordô' },
  { id: 'charcoal', hex: '#2D2D2D', label: 'Carvão' },
  { id: 'teal', hex: '#0D6E6E', label: 'Teal' },
  { id: 'plum', hex: '#5C2D5E', label: 'Ameixa' },
  { id: 'copper', hex: '#B45309', label: 'Cobre' },
  { id: 'slate', hex: '#334155', label: 'Ardósia' },
  { id: 'olive', hex: '#4A5D23', label: 'Oliva' },
  { id: 'rose', hex: '#9F1239', label: 'Rosa escuro' },
  { id: 'indigo', hex: '#3730A3', label: 'Índigo' },
  { id: 'espresso', hex: '#3E2723', label: 'Espresso' },
  { id: 'moss', hex: '#365314', label: 'Musgo' },
  { id: 'steel', hex: '#1E3A5F', label: 'Aço' },
  { id: 'gold', hex: '#D4AF37', label: 'Dourado' },
] as const;
