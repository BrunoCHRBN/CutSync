export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

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
  role: 'client' | 'professional' | 'admin';
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  commissionRate?: number | null;
  workHours?: string | null;
  specialties?: string | null;
  instagram?: string | null;
  tituloProfissional?: string | null;
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
  professional?: Pick<ProfileRecord, 'id' | 'name' | 'phone'> | null;
  service?: Pick<ServiceRecord, 'id' | 'name' | 'price' | 'durationMinutes'> | null;
  establishment?: Pick<Establishment, 'id' | 'name' | 'slug' | 'address' | 'phone' | 'timezone' | 'currency'> | null;
}

export const mapEstablishment = (row: any): Establishment => ({
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

export const mapProfile = (row: any): ProfileRecord => ({
  id: row.id,
  establishmentId: row.establishment_id,
  name: row.name,
  role: row.role,
  email: row.email,
  phone: row.phone,
  avatarUrl: row.avatar_url,
  commissionRate: row.commission_rate == null ? null : Number(row.commission_rate),
  workHours: row.work_hours,
  specialties: row.specialties,
  instagram: row.instagram,
  tituloProfissional: row.titulo_profissional,
});

export const mapService = (row: any): ServiceRecord => ({
  id: row.id,
  establishmentId: row.establishment_id,
  name: row.name,
  price: Number(row.price),
  durationMinutes: Number(row.duration_minutes),
  isActive: Boolean(row.is_active),
});

export const mapAppointment = (row: any): AppointmentRecord => ({
  id: row.id,
  establishmentId: row.establishment_id,
  clientId: row.client_id,
  clientName: row.client_name,
  professionalId: row.professional_id,
  serviceId: row.service_id,
  dateTime: new Date(row.date_time),
  status: row.status,
  cancellationReason: row.cancellation_reason,
  cancelledByRole: row.cancelled_by_role,
  rescheduleCount: Number(row.reschedule_count || 0),
  originalDateTime: row.original_date_time ? new Date(row.original_date_time) : null,
  client: row.client ? mapProfile(row.client) : null,
  professional: row.professional ? mapProfile(row.professional) : null,
  service: row.service ? mapService(row.service) : null,
  establishment: row.establishment ? mapEstablishment(row.establishment) : null,
});