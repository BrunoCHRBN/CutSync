import type { BrandConfiguration } from '@cutsync/brand';

import { createMobileRequestId } from '@/lib/mobile-request-id';
import { supabase } from '@/lib/supabase';

type BrandScope = 'organization' | 'establishment';

interface WireMedia {
  url: string;
  altText: string;
  consentConfirmed: boolean;
}

interface WireConfiguration {
  preset?: string;
  primaryColor?: string;
  logo?: WireMedia | null;
  banner?: WireMedia | null;
  gallery?: WireMedia[];
  description?: string | null;
  slogan?: string | null;
  composition?: string | null;
}

interface WireVersion {
  id: string;
  version_number: number;
  configuration: WireConfiguration;
  override_fields?: string[];
  published_at?: string | null;
  created_at?: string;
  restored_from_version_id?: string | null;
}

export interface BusinessBrandContext {
  capabilities: {
    organizationId: string | null;
    manageBrand: boolean;
    publishBrand: boolean;
    manageOrganizationBrand: boolean;
    publishOrganizationBrand: boolean;
  };
  resolved: WireConfiguration;
  sources: Record<string, 'organization' | 'establishment'>;
  organizationPublished: WireVersion | null;
  organizationDraft: WireVersion | null;
  establishmentPublished: WireVersion | null;
  establishmentDraft: WireVersion | null;
  organizationHistory: WireVersion[];
  establishmentHistory: WireVersion[];
}

const rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
  if (!supabase) throw new Error('brand_client_unavailable');
  const { data, error } = await (supabase.rpc as unknown as (
    rpcName: string,
    rpcArgs: Record<string, unknown>,
  ) => Promise<{ data: T | null; error: unknown }>)(name, args);
  if (error) throw error;
  if (data == null) throw new Error('brand_invalid_response');
  return data;
};

export const mapBusinessBrandConfiguration = (wire: WireConfiguration): BrandConfiguration => ({
  presetId: wire.preset === 'editorial' || wire.preset === 'minimal' ? wire.preset : 'classic',
  primaryColor: wire.primaryColor || '#0F766E',
  logoUrl: wire.logo?.url || null,
  logoAltText: wire.logo?.altText || null,
  logoConsentConfirmed: wire.logo?.consentConfirmed ?? false,
  bannerUrl: wire.banner?.url || null,
  bannerAltText: wire.banner?.altText || null,
  bannerConsentConfirmed: wire.banner?.consentConfirmed ?? false,
  gallery: wire.gallery || [],
  description: wire.description || null,
  slogan: wire.slogan || null,
  composition: wire.composition || 'balanced',
});

const toWire = (configuration: BrandConfiguration): WireConfiguration => ({
  preset: configuration.presetId,
  primaryColor: configuration.primaryColor.toUpperCase(),
  logo: configuration.logoUrl ? {
    url: configuration.logoUrl,
    altText: configuration.logoAltText || '',
    consentConfirmed: configuration.logoConsentConfirmed ?? false,
  } : null,
  banner: configuration.bannerUrl ? {
    url: configuration.bannerUrl,
    altText: configuration.bannerAltText || '',
    consentConfirmed: configuration.bannerConsentConfirmed ?? false,
  } : null,
  gallery: configuration.gallery,
  description: configuration.description,
  slogan: configuration.slogan,
  composition: configuration.composition,
});

export const businessBrandApi = {
  context(establishmentId: string) {
    return rpc<BusinessBrandContext>('get_brand_editor_context', {
      target_establishment_id: establishmentId,
    });
  },
  save(establishmentId: string, scope: BrandScope, configuration: BrandConfiguration, inherit: boolean) {
    return rpc<{ versionId: string; version: number }>('save_brand_draft', {
      target_establishment_id: establishmentId,
      target_scope: scope,
      target_configuration: toWire(configuration),
      target_override_fields: scope === 'establishment' && !inherit
        ? ['preset', 'primaryColor', 'logo', 'banner', 'gallery', 'description', 'slogan', 'composition']
        : [],
      target_request_id: createMobileRequestId(),
    });
  },
  publish(establishmentId: string, scope: BrandScope, versionId: string) {
    return rpc<{ versionId: string; status: string }>('publish_brand_version', {
      target_establishment_id: establishmentId,
      target_scope: scope,
      target_version_id: versionId,
      target_request_id: createMobileRequestId(),
    });
  },
  restore(establishmentId: string, scope: BrandScope, versionId: string) {
    return rpc<{ versionId: string; status: string }>('restore_brand_version', {
      target_establishment_id: establishmentId,
      target_scope: scope,
      target_version_id: versionId,
      target_request_id: createMobileRequestId(),
    });
  },
};

export type { BrandScope };
