import { Database, Json, Tables } from './supabase.generated';

export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';
export type ProfileRole = 'client' | 'professional' | 'admin';

type EstablishmentRow = Tables<'establishments'>;
type ProfileRow = Tables<'profiles'>;
type ServiceRow = Tables<'services'>;
type TeamRow = Database['public']['Functions']['get_establishment_team']['Returns'][number];
type PublicTeamRow = Database['public']['Functions']['get_public_team']['Returns'][number];

export type AppointmentQueryRow = Tables<'appointments'> & {
  client: Pick<ProfileRow, 'id' | 'name' | 'phone'> | null;
  professional: Pick<ProfileRow, 'id' | 'name' | 'phone'> | null;
  service: Pick<ServiceRow, 'id' | 'establishment_id' | 'name' | 'price' | 'duration_minutes' | 'is_active'> | null;
  establishment: Pick<EstablishmentRow, 'id' | 'name' | 'slug' | 'address' | 'phone' | 'timezone' | 'currency'> | null;
};

export interface Establishment {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  slogan?: string | null;
  instagram?: string | null;
  primaryColor: string;
  timezone: string;
  currency: string;
  description?: string | null;
  address?: string | null;
  phone?: string | null;
  openingHours?: string | null;
  shareAgendas?: boolean;
  galleryUrls?: string | null;
  accountStatus?: 'pending_verification' | 'active' | 'delinquent' | 'blocked';
  averageRating?: number;
  reviewCount?: number;
  averagePrice?: number;
  priceLevel?: number;
  instantBookingEnabled?: boolean;
  minCancellationHours?: number | null;
  noShowFeePercent?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  professionalPixAllowed?: boolean;
  pixKey?: string | null;
}

export interface ProfileRecord {
  id: string;
  establishmentId?: string | null;
  name: string;
  role: ProfileRole;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  commissionRate?: number | null;
  workHours?: string | null;
  specialties?: string | null;
  instagram?: string | null;
  tituloProfissional?: string | null;
  pixKey?: string | null;
  notificationChannels?: string[] | null;
}

export interface ServiceRecord {
  id: string;
  establishmentId: string;
  name: string;
  price: number;
  durationMinutes: number;
  isActive: boolean;
  sortOrder: number;
}

export interface ProfessionalGalleryItem {
  [key: string]: Json | undefined;
  url: string;
  alt: string;
}

export interface ProfessionalPublicProfile {
  id: string;
  slug: string;
  name: string;
  avatarUrl?: string | null;
  tituloProfissional?: string | null;
  specialties?: string | null;
  bio?: string | null;
  portfolioUrl?: string | null;
  instagramUrl?: string | null;
  gallery: ProfessionalGalleryItem[];
}

export interface AppointmentRecord {
  id: string;
  establishmentId: string;
  clientId?: string | null;
  clientName?: string | null;
  professionalId: string;
  serviceId: string;
  dateTime: Date;
  status: AppointmentStatus;
  cancellationReason?: string | null;
  cancelledByRole?: 'client' | 'professional' | 'admin' | null;
  rescheduleCount: number;
  originalDateTime?: Date | null;
  client?: Pick<ProfileRecord, 'id' | 'name' | 'phone'> | null;
  professional?: Pick<ProfileRecord, 'id' | 'name' | 'phone'> | null;
  service?: Pick<ServiceRecord, 'id' | 'name' | 'price' | 'durationMinutes'> | null;
  establishment?: Pick<Establishment, 'id' | 'name' | 'slug' | 'address' | 'phone' | 'timezone' | 'currency'> | null;
}

const toProfileRole = (role: string): ProfileRole => {
  if (role === 'professional' || role === 'admin') return role;
  return 'client';
};

const toAppointmentStatus = (status: string): AppointmentStatus => {
  if (status === 'confirmed' || status === 'cancelled' || status === 'completed') return status;
  return 'pending';
};

export const mapEstablishment = (row: EstablishmentRow): Establishment => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  logoUrl: row.logo_url,
  bannerUrl: row.banner_url,
  slogan: row.slogan,
  instagram: row.instagram,
  primaryColor: row.primary_color || '#D4AF37',
  timezone: row.timezone || 'America/Sao_Paulo',
  currency: row.currency || 'BRL',
  description: row.description,
  address: row.address,
  phone: row.phone,
  openingHours: row.opening_hours,
  shareAgendas: row.share_agendas !== false,
  galleryUrls: row.gallery_urls,
  accountStatus: row.account_status as any,
  averageRating: 'average_rating' in row ? Number((row as any).average_rating || 0) : 0,
  reviewCount: 'review_count' in row ? Number((row as any).review_count || 0) : 0,
  averagePrice: 'average_price' in row ? Number((row as any).average_price || 0) : 0,
  priceLevel: 'price_level' in row ? Number((row as any).price_level || 1) : 1,
  instantBookingEnabled: row.instant_booking_enabled !== false,
  minCancellationHours: 'min_cancellation_hours' in row ? (row as any).min_cancellation_hours : null,
  noShowFeePercent: 'no_show_fee_percent' in row ? Number((row as any).no_show_fee_percent || 0) : null,
  latitude: 'latitude' in row ? Number((row as any).latitude || 0) : null,
  longitude: 'longitude' in row ? Number((row as any).longitude || 0) : null,
  professionalPixAllowed: 'professional_pix_allowed' in row ? (row as any).professional_pix_allowed !== false : true,
});

export const mapProfile = (row: ProfileRow | TeamRow | PublicTeamRow): ProfileRecord => ({
  id: row.id,
  establishmentId: 'establishment_id' in row ? row.establishment_id : null,
  name: row.name,
  role: 'role' in row ? toProfileRole(row.role) : 'professional',
  email: 'email' in row ? row.email : '',
  phone: 'phone' in row ? row.phone : null,
  avatarUrl: row.avatar_url,
  commissionRate: 'commission_rate' in row && row.commission_rate != null ? Number(row.commission_rate) : null,
  workHours: 'work_hours' in row ? row.work_hours : null,
  specialties: row.specialties,
  instagram: 'instagram' in row ? row.instagram : null,
  tituloProfissional: row.titulo_profissional,
  pixKey: 'pix_key' in row ? (row as any).pix_key : null,
  notificationChannels: 'notification_channels' in row ? (row as any).notification_channels : null,
});

export const mapService = (row: ServiceRow): ServiceRecord => ({
  id: row.id,
  establishmentId: row.establishment_id,
  name: row.name,
  price: Number(row.price),
  durationMinutes: Number(row.duration_minutes),
  isActive: Boolean(row.is_active),
  sortOrder: Number(row.sort_order || 0),
});

export const mapAppointment = (row: AppointmentQueryRow): AppointmentRecord => ({
  id: row.id,
  establishmentId: row.establishment_id,
  clientId: row.client_id,
  clientName: row.client_name,
  professionalId: row.professional_id,
  serviceId: row.service_id,
  dateTime: new Date(row.date_time),
  status: toAppointmentStatus(row.status),
  cancellationReason: row.cancellation_reason,
  cancelledByRole: row.cancelled_by_role === 'client' || row.cancelled_by_role === 'professional' || row.cancelled_by_role === 'admin'
    ? row.cancelled_by_role
    : null,
  rescheduleCount: Number(row.reschedule_count || 0),
  originalDateTime: row.original_date_time ? new Date(row.original_date_time) : null,
  client: row.client,
  professional: row.professional,
  service: row.service ? {
    id: row.service.id,
    name: row.service.name,
    price: Number(row.service.price),
    durationMinutes: Number(row.service.duration_minutes),
  } : null,
  establishment: row.establishment ? {
    id: row.establishment.id,
    name: row.establishment.name,
    slug: row.establishment.slug,
    address: row.establishment.address,
    phone: row.establishment.phone,
    timezone: row.establishment.timezone,
    currency: row.establishment.currency,
  } : null,
});
