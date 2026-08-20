import { buildEstablishmentTheme, type EstablishmentTheme, meetsWcagAA, normalizeHex } from './establishment-theme';

export const BRAND_PRESET_IDS = [
  'classic',
  'editorial',
  'minimal',
] as const;

export type BrandPresetId = typeof BRAND_PRESET_IDS[number];
export type BrandValueSource = 'organization' | 'establishment' | 'system';
export type BrandDraftStatus = 'draft' | 'published' | 'archived';
export type BrandCapability = 'manage_brand' | 'publish_brand';

export interface BrandMediaItem {
  url: string;
  altText: string;
  consentConfirmed: boolean;
}

export interface BrandConfiguration {
  presetId: BrandPresetId;
  primaryColor: string;
  logoUrl: string | null;
  logoAltText: string | null;
  logoConsentConfirmed?: boolean;
  bannerUrl: string | null;
  bannerAltText: string | null;
  bannerConsentConfirmed?: boolean;
  gallery: BrandMediaItem[];
  description: string | null;
  slogan?: string | null;
  composition?: string | null;
}

export type BrandFieldSources = {
  readonly [Field in keyof BrandConfiguration]: BrandValueSource;
};

export interface ResolvedBrandTheme extends EstablishmentTheme {
  presetId: BrandPresetId;
  sources: BrandFieldSources;
  overriddenFields: readonly (keyof BrandConfiguration)[];
  publishedVersionId: string | null;
  meetsWcagAA: boolean;
}

export interface BrandDraft {
  id: string | null;
  organizationId: string | null;
  establishmentId: string | null;
  status: BrandDraftStatus;
  version: number;
  configuration: BrandConfiguration;
  validation: BrandDraftValidation;
}

export interface BrandDraftValidation {
  valid: boolean;
  accessibilityScore: number;
  errors: readonly string[];
  warnings: readonly string[];
}

export interface ExperienceCapabilities {
  role: string;
  scope: 'organization' | 'establishment' | 'professional' | 'client';
  allowedActions: readonly string[];
  manageBrand: boolean;
  publishBrand: boolean;
}

const isNonEmpty = (value: string | null | undefined) => Boolean(value?.trim());

export function validateBrandConfiguration(configuration: BrandConfiguration): BrandDraftValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const normalizedColor = normalizeHex(configuration.primaryColor);
  const theme = buildEstablishmentTheme(normalizedColor);

  if (!BRAND_PRESET_IDS.includes(configuration.presetId)) errors.push('brand_invalid_preset');
  if (!normalizedColor) errors.push('brand_invalid_primary_color');
  if (!meetsWcagAA(theme)) errors.push('brand_insufficient_contrast');
  if (configuration.gallery.length > 12) errors.push('brand_gallery_limit');
  if (configuration.description && configuration.description.length > 600) errors.push('brand_description_limit');
  if (configuration.slogan && configuration.slogan.length > 140) errors.push('brand_slogan_limit');
  const mediaUrls = [configuration.logoUrl, configuration.bannerUrl, ...configuration.gallery.map((item) => item.url)]
    .filter((url): url is string => Boolean(url));
  if (mediaUrls.some((url) => !/^https:\/\//i.test(url))) errors.push('brand_media_https_required');
  if (configuration.logoUrl && !isNonEmpty(configuration.logoAltText)) errors.push('brand_logo_alt_required');
  if (configuration.logoUrl && !configuration.logoConsentConfirmed) errors.push('brand_logo_consent_required');
  if (configuration.bannerUrl && !isNonEmpty(configuration.bannerAltText)) errors.push('brand_banner_alt_required');
  if (configuration.bannerUrl && !configuration.bannerConsentConfirmed) errors.push('brand_banner_consent_required');
  if (configuration.gallery.some((item) => !isNonEmpty(item.altText))) errors.push('brand_gallery_alt_required');
  if (configuration.gallery.some((item) => !item.consentConfirmed)) errors.push('brand_gallery_consent_required');
  if (!configuration.logoUrl) warnings.push('brand_logo_recommended');
  if (!configuration.bannerUrl) warnings.push('brand_banner_recommended');
  if (!isNonEmpty(configuration.description)) warnings.push('brand_description_recommended');

  const accessibleFields = 5 - errors.filter((error) => error.includes('alt') || error.includes('contrast')).length;

  return {
    valid: errors.length === 0,
    accessibilityScore: Math.max(0, Math.round((accessibleFields / 5) * 100)),
    errors,
    warnings,
  };
}

export function resolveBrandTheme({
  organization,
  establishment,
  publishedVersionId = null,
}: {
  organization?: Partial<BrandConfiguration> | null;
  establishment?: Partial<BrandConfiguration> | null;
  publishedVersionId?: string | null;
}): ResolvedBrandTheme {
  const primaryColor = normalizeHex(establishment?.primaryColor)
    ?? normalizeHex(organization?.primaryColor)
    ?? buildEstablishmentTheme().primary;
  const theme = buildEstablishmentTheme(primaryColor);
  const source = <K extends keyof BrandConfiguration>(field: K): BrandValueSource => (
    establishment?.[field] !== undefined && establishment?.[field] !== null
      ? 'establishment'
      : organization?.[field] !== undefined && organization?.[field] !== null
        ? 'organization'
        : 'system'
  );

  const sources: BrandFieldSources = {
    presetId: source('presetId'),
    primaryColor: source('primaryColor'),
    logoUrl: source('logoUrl'),
    logoAltText: source('logoAltText'),
    logoConsentConfirmed: source('logoConsentConfirmed'),
    bannerUrl: source('bannerUrl'),
    bannerAltText: source('bannerAltText'),
    bannerConsentConfirmed: source('bannerConsentConfirmed'),
    gallery: source('gallery'),
    description: source('description'),
    slogan: source('slogan'),
    composition: source('composition'),
  };

  return {
    ...theme,
    presetId: establishment?.presetId ?? organization?.presetId ?? 'classic',
    sources,
    overriddenFields: Object.entries(sources)
      .filter(([, value]) => value === 'establishment')
      .map(([field]) => field as keyof BrandConfiguration),
    publishedVersionId,
    meetsWcagAA: meetsWcagAA(theme),
  };
}
