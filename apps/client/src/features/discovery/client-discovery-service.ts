import type { Database, Json } from '@cutsync/database';

import { supabase } from '@/lib/supabase';

type DiscoveryRow = Database['public']['Functions']['list_client_discovery_establishments']['Returns'][number];
type EstablishmentRow = Database['public']['Functions']['get_client_discovery_establishment']['Returns'][number];

export interface ClientDiscoveryEstablishment {
  id: string;
  slug: string;
  name: string;
  slogan: string | null;
  description: string | null;
  address: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  galleryUrls: string[];
  latitude: number | null;
  longitude: number | null;
  distanceMeters: number | null;
  primaryColor: string;
  timezone: string;
  currency: string;
  openingHours: string | null;
  averageRating: number;
  reviewCount: number;
  averagePrice: number;
  priceLevel: number;
  instantBookingEnabled: boolean;
  serviceCount: number;
  professionalCount: number;
  serviceNames: string[];
  professionalNames: string[];
}

export interface ClientDiscoveryService {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
}

export interface ClientDiscoveryProfessional {
  id: string;
  name: string;
  avatarUrl: string | null;
  title: string | null;
  specialties: string | null;
  profileSlug: string | null;
}

export interface ClientDiscoveryDetail extends Omit<
  ClientDiscoveryEstablishment,
  'serviceCount' | 'professionalCount' | 'serviceNames' | 'professionalNames' | 'distanceMeters'
> {
  services: ClientDiscoveryService[];
  professionals: ClientDiscoveryProfessional[];
}

export interface ClientDiscoveryOrigin {
  latitude: number;
  longitude: number;
}

const isObject = (value: Json): value is { [key: string]: Json | undefined } => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const asString = (value: Json | undefined) => typeof value === 'string' ? value : null;
const asNumber = (value: Json | undefined) => typeof value === 'number' ? value : Number(value ?? 0);

const mapServices = (value: Json): ClientDiscoveryService[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isObject(item)) return [];
    const id = asString(item.id);
    const name = asString(item.name);
    if (!id || !name) return [];
    return [{
      id,
      name,
      price: asNumber(item.price),
      durationMinutes: asNumber(item.duration_minutes),
    }];
  });
};

const mapProfessionals = (value: Json): ClientDiscoveryProfessional[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isObject(item)) return [];
    const id = asString(item.id);
    const name = asString(item.name);
    if (!id || !name) return [];
    return [{
      id,
      name,
      avatarUrl: asString(item.avatar_url),
      title: asString(item.titulo_profissional),
      specialties: asString(item.specialties),
      profileSlug: asString(item.profile_slug),
    }];
  });
};

// The column stores a JSON array as text, but older records were saved as a
// comma-separated list, so both shapes are accepted.
const mapGalleryUrls = (value: string | null): string[] => {
  const raw = value?.trim();
  if (!raw) return [];
  let entries: unknown[];
  try {
    const parsed = JSON.parse(raw);
    entries = Array.isArray(parsed) ? parsed : [];
  } catch {
    entries = raw.split(',');
  }
  return entries
    .map((entry) => typeof entry === 'string' ? entry.trim() : '')
    .filter((entry) => entry.startsWith('http://') || entry.startsWith('https://'));
};

const asCoordinate = (value: number | null, limit: number) => (
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit ? value : null
);

const mapDiscoveryRow = (row: DiscoveryRow): ClientDiscoveryEstablishment => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  slogan: row.slogan,
  description: row.description,
  address: row.address,
  logoUrl: row.logo_url,
  bannerUrl: row.banner_url,
  galleryUrls: mapGalleryUrls(row.gallery_urls),
  latitude: asCoordinate(row.latitude, 90),
  longitude: asCoordinate(row.longitude, 180),
  distanceMeters: typeof row.distance_meters === 'number' && Number.isFinite(row.distance_meters)
    ? row.distance_meters
    : null,
  primaryColor: row.primary_color || '#2C4334',
  timezone: row.timezone,
  currency: row.currency,
  openingHours: row.opening_hours,
  averageRating: Number(row.average_rating || 0),
  reviewCount: Number(row.review_count || 0),
  averagePrice: Number(row.average_price || 0),
  priceLevel: Number(row.price_level || 1),
  instantBookingEnabled: row.instant_booking_enabled,
  serviceCount: Number(row.service_count || 0),
  professionalCount: Number(row.professional_count || 0),
  serviceNames: row.service_names ?? [],
  professionalNames: row.professional_names ?? [],
});

const mapDetailRow = (row: EstablishmentRow): ClientDiscoveryDetail => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  slogan: row.slogan,
  description: row.description,
  address: row.address,
  logoUrl: row.logo_url,
  bannerUrl: row.banner_url,
  galleryUrls: mapGalleryUrls(row.gallery_urls),
  latitude: asCoordinate(row.latitude, 90),
  longitude: asCoordinate(row.longitude, 180),
  primaryColor: row.primary_color || '#2C4334',
  timezone: row.timezone,
  currency: row.currency,
  openingHours: row.opening_hours,
  averageRating: Number(row.average_rating || 0),
  reviewCount: Number(row.review_count || 0),
  averagePrice: Number(row.average_price || 0),
  priceLevel: Number(row.price_level || 1),
  instantBookingEnabled: row.instant_booking_enabled,
  services: mapServices(row.services),
  professionals: mapProfessionals(row.professionals),
});

const requireClient = () => {
  if (!supabase) throw new Error('O aplicativo ainda não está conectado ao CutSync.');
  return supabase;
};

const friendlyDiscoveryError = (error: unknown) => {
  const value = error as { code?: string; message?: string };
  const message = value?.message?.toLowerCase() ?? '';
  if (value?.code === 'PGRST202' || message.includes('client_discovery')) {
    return 'A descoberta mobile ainda precisa da atualização mais recente do CutSync.';
  }
  if (message.includes('invalid_discovery_query')) return 'A busca informada não é válida.';
  if (message.includes('invalid_establishment_slug')) return 'Este estabelecimento não está disponível.';
  if (message.includes('network') || message.includes('fetch')) {
    return 'Não foi possível conectar. Verifique sua internet e tente novamente.';
  }
  return 'Não foi possível carregar a descoberta agora. Tente novamente.';
};

export const listClientDiscoveryEstablishments = async (
  query: string,
  origin: ClientDiscoveryOrigin | null = null,
) => {
  try {
    const { data, error } = await requireClient().rpc('list_client_discovery_establishments', {
      target_query: query,
      result_limit: 30,
      ...(origin ? { target_latitude: origin.latitude, target_longitude: origin.longitude } : {}),
    });
    if (error) throw error;
    return (data ?? []).map(mapDiscoveryRow);
  } catch (error) {
    throw new Error(friendlyDiscoveryError(error));
  }
};

export const getClientDiscoveryEstablishment = async (slug: string) => {
  try {
    const { data, error } = await requireClient()
      .rpc('get_client_discovery_establishment', { target_slug: slug })
      .maybeSingle();
    if (error) throw error;
    return data ? mapDetailRow(data) : null;
  } catch (error) {
    throw new Error(friendlyDiscoveryError(error));
  }
};
