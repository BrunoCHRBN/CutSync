// Tipos base que espelham as tabelas do Supabase (snake_case).
// Substituem os Models do WatermelonDB que serão removidos.

export interface Establishment {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  banner_url?: string | null;
  slogan?: string | null;
  instagram?: string | null;
  primary_color: string;
  timezone: string;
  currency: string;
  description?: string | null;
  address?: string | null;
  phone?: string | null;
  opening_hours?: string | null;
  share_agendas?: boolean | null;
  gallery_urls?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  establishment_id?: string | null;
  name: string;
  role: 'client' | 'professional' | 'admin';
  email: string;
  phone?: string | null;
  avatar_url?: string | null;
  commission_rate?: number | null;
  push_token?: string | null;
  work_hours?: string | null;
  specialties?: string | null;
  instagram?: string | null;
  titulo_profissional?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  establishment_id: string;
  name: string;
  price: number;
  duration_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: string;
  establishment_id: string;
  client_id?: string | null;
  client_name?: string | null;
  professional_id: string;
  service_id: string;
  date_time: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  cancellation_reason?: string | null;
  cancelled_by_role?: 'client' | 'professional' | 'admin' | null;
  reschedule_count: number;
  original_date_time?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfessionalService {
  id: string;
  establishment_id: string;
  professional_id: string;
  service_id: string;
  price: number;
  duration_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfileEstablishment {
  id: string;
  profile_id: string;
  establishment_id: string;
  role: 'client' | 'professional' | 'admin';
  created_at: string;
  updated_at: string;
}

// Backward-compat aliases
export type Barbershop = Establishment;
export type BarberService = ProfessionalService;
export type ProfileBarbershop = ProfileEstablishment;

export interface RichAppointment extends Appointment {
  client?: Profile | null;
  professional?: Profile | null;
  service?: Service | null;
}
