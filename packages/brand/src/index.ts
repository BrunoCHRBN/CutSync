export const sharedBrand = {
  colors: {
    forest: '#2C4334',
    forestDark: '#18201B',
    forestBright: '#3F7A5B',
    forestSoft: '#EAF2E8',
    sand: '#DAD2B6',
    sandSoft: '#F5EFDF',
    canvas: '#FBF8F2',
    surface: '#FFFFFF',
    ink: '#141B17',
    inkSoft: '#5B665D',
    inkMuted: '#8A9089',
    border: '#EAE4D3',
    amber: '#C88B2A',
    amberSoft: '#F7EBD1',
  },
} as const;

export { designSystem, type DesignSystem } from './design-system';

export {
  BRAND_PRESET_IDS,
  resolveBrandTheme,
  validateBrandConfiguration,
  type BrandCapability,
  type BrandConfiguration,
  type BrandDraft,
  type BrandDraftStatus,
  type BrandDraftValidation,
  type BrandFieldSources,
  type BrandMediaItem,
  type BrandPresetId,
  type BrandValueSource,
  type ExperienceCapabilities,
  type ResolvedBrandTheme,
} from './brand-contracts';

export const products = {
  web: {
    name: 'CutSync Web',
    purpose: 'Descoberta pública e administração completa.',
  },
  client: {
    name: 'CutSync',
    purpose: 'Descobrir, agendar e acompanhar atendimentos.',
  },
  business: {
    name: 'CutSync Business',
    purpose: 'Operar agenda, equipe e serviços do estabelecimento.',
  },
} as const;

export {
  readableForeground,
  initialsOf,
  getLuminance,
  getContrastRatio,
} from './color-utils';

export {
  ESTABLISHMENT_COLOR_PRESETS,
  type EstablishmentColorPreset,
} from './color-presets';

export {
  DEFAULT_ESTABLISHMENT_COLOR,
  buildEstablishmentTheme,
  normalizeHex,
  meetsWcagAA,
  establishmentThemeCssVars,
  type EstablishmentTheme,
} from './establishment-theme';
