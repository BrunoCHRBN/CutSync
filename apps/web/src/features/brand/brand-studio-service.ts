import type { BrandConfiguration, BrandMediaItem } from '@cutsync/brand';
import { createMobileRequestId } from '@cutsync/domain';

import { supabase } from '../../services/supabase';

export type BrandScope = 'organization' | 'establishment';

interface WireMedia {
  url: string;
  altText: string;
  consentConfirmed: boolean;
}

export interface WireConfiguration {
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
  status: 'draft' | 'published' | 'archived';
  configuration: WireConfiguration;
  override_fields?: string[];
  published_at?: string | null;
  created_at?: string;
  restored_from_version_id?: string | null;
}

export interface BrandEditorContext {
  establishmentId: string;
  capabilities: {
    organizationId: string | null;
    organizationRole: string | null;
    unitAdmin: boolean;
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
  const { data, error } = await (supabase.rpc as unknown as (
    functionName: string,
    parameters: Record<string, unknown>,
  ) => Promise<{ data: T | null; error: unknown }>)(name, args);
  if (error) throw error;
  if (data == null) throw new Error('brand_invalid_response');
  return data;
};

export const fromWireBrandConfiguration = (wire: WireConfiguration): BrandConfiguration => ({
  presetId: wire.preset === 'editorial' || wire.preset === 'minimal' ? wire.preset : 'classic',
  primaryColor: wire.primaryColor || '#0F766E',
  logoUrl: wire.logo?.url || null,
  logoAltText: wire.logo?.altText || null,
  logoConsentConfirmed: wire.logo?.consentConfirmed ?? false,
  bannerUrl: wire.banner?.url || null,
  bannerAltText: wire.banner?.altText || null,
  bannerConsentConfirmed: wire.banner?.consentConfirmed ?? false,
  gallery: Array.isArray(wire.gallery) ? wire.gallery : [],
  description: wire.description || null,
  slogan: wire.slogan || null,
  composition: wire.composition || 'balanced',
});

const media = (
  url: string | null,
  altText: string | null,
  consentConfirmed: boolean,
): BrandMediaItem | null => url ? { url, altText: altText?.trim() || '', consentConfirmed } : null;

const toWireBrandConfiguration = (configuration: BrandConfiguration): WireConfiguration => ({
  preset: configuration.presetId,
  primaryColor: configuration.primaryColor.toUpperCase(),
  logo: media(configuration.logoUrl, configuration.logoAltText, configuration.logoConsentConfirmed ?? false),
  banner: media(configuration.bannerUrl, configuration.bannerAltText, configuration.bannerConsentConfirmed ?? false),
  gallery: configuration.gallery,
  description: configuration.description?.trim() || null,
  slogan: configuration.slogan?.trim() || null,
  composition: configuration.composition || 'balanced',
});

export const brandStudioService = {
  getContext(establishmentId: string) {
    return rpc<BrandEditorContext>('get_brand_editor_context', {
      target_establishment_id: establishmentId,
    });
  },

  saveDraft(input: {
    establishmentId: string;
    scope: BrandScope;
    configuration: BrandConfiguration;
    overrideFields: string[];
    requestId?: string;
  }) {
    return rpc<{ versionId: string; version: number; status: 'draft' }>('save_brand_draft', {
      target_establishment_id: input.establishmentId,
      target_scope: input.scope,
      target_configuration: toWireBrandConfiguration(input.configuration),
      target_override_fields: input.overrideFields,
      target_request_id: input.requestId || createMobileRequestId(),
    });
  },

  publish(input: { establishmentId: string; scope: BrandScope; versionId: string; requestId?: string }) {
    return rpc<{ versionId: string; status: 'published'; replayed: boolean }>('publish_brand_version', {
      target_establishment_id: input.establishmentId,
      target_scope: input.scope,
      target_version_id: input.versionId,
      target_request_id: input.requestId || createMobileRequestId(),
    });
  },

  restore(input: { establishmentId: string; scope: BrandScope; versionId: string; requestId?: string }) {
    return rpc<{ versionId: string; status: 'published'; replayed: boolean }>('restore_brand_version', {
      target_establishment_id: input.establishmentId,
      target_scope: input.scope,
      target_version_id: input.versionId,
      target_request_id: input.requestId || createMobileRequestId(),
    });
  },
};
