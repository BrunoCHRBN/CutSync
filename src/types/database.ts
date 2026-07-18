import { Database, Tables } from './supabase.generated';

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
}

export interface ProfileRecord {
  id: string;
  establishmentId?: string | null;
  name: string;
<<<<<<< HEAD
  role: 'client' | 'professional' | 'admin';
  email?: string;
=======
  role: ProfileRole;
  email: string;
>>>>>>> 0db30e48a38ddb3067d579076acfc5084504c7f9
  phone?: string | null;
  avatarUrl?: string | null;
  commissionRate?: number | null;
  workHours?: string | null;
  specialties?: string | null;
  instagram?: string | null;
  tituloProfissional?: string | null;
  professionalProfileSlug?: string | null;
}

export interface ServiceRecord {
  id: string;
  establishmentId: string;
  name: string;
  price: number;
  durationMinutes: number;
  isActive: boolean;
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
  professional?: Pick<ProfileRecord, 'id' | 'name'> | null;
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
});

export const mapProfile = (row: ProfileRow | TeamRow | PublicTeamRow): ProfileRecord => ({
  id: row.id,
  establishmentId: row.establishment_id,
  name: row.name,
<<<<<<< HEAD
  role: row.role || 'professional',
=======
  role: toProfileRole(row.role),
>>>>>>> 0db30e48a38ddb3067d579076acfc5084504c7f9
  email: row.email,
  phone: row.phone,
  avatarUrl: row.avatar_url,
  commissionRate: row.commission_rate == null ? null : Number(row.commission_rate),
  workHours: row.work_hours,
  specialties: row.specialties,
  instagram: row.instagram,
  tituloProfissional: row.titulo_profissional,
  professionalProfileSlug: row.professional_profile_slug,
});

export const mapService = (row: ServiceRow): ServiceRecord => ({
  id: row.id,
  establishmentId: row.establishment_id,
  name: row.name,
  price: Number(row.price),
  durationMinutes: Number(row.duration_minutes),
  isActive: Boolean(row.is_active),
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
<<<<<<< HEAD
  client: row.client ? mapProfile(row.client) : null,
  professional: row.professional ? mapProfile(row.professional) : null,
  service: row.service ? mapService(row.service) : null,
  establishment: row.establishment ? mapEstablishment(row.establishment) : null,
});

export interface ProfessionalGalleryItem {
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
  isPublic?: boolean;
}

export type Profile = ProfileRecord;
export type Service = ServiceRecord;
export type RichAppointment = AppointmentRecord;
=======
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
>>>>>>> 0db30e48a38ddb3067d579076acfc5084504c7f9
