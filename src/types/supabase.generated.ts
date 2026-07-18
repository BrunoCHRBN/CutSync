export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      appointments: {
        Row: { cancellation_reason: string | null; cancelled_by_role: string | null; client_id: string | null; client_name: string | null; created_at: string; date_time: string; deleted_at: string | null; establishment_id: string; id: string; original_date_time: string | null; professional_id: string; reschedule_count: number; service_id: string; status: string; updated_at: string };
        Insert: { cancellation_reason?: string | null; cancelled_by_role?: string | null; client_id?: string | null; client_name?: string | null; created_at?: string; date_time: string; deleted_at?: string | null; establishment_id: string; id?: string; original_date_time?: string | null; professional_id: string; reschedule_count?: number; service_id: string; status?: string; updated_at?: string };
        Update: { cancellation_reason?: string | null; cancelled_by_role?: string | null; client_id?: string | null; client_name?: string | null; created_at?: string; date_time?: string; deleted_at?: string | null; establishment_id?: string; id?: string; original_date_time?: string | null; professional_id?: string; reschedule_count?: number; service_id?: string; status?: string; updated_at?: string };
        Relationships: [
          { foreignKeyName: 'appointments_barbershop_id_fkey'; columns: ['establishment_id']; isOneToOne: false; referencedRelation: 'establishments'; referencedColumns: ['id'] },
          { foreignKeyName: 'appointments_client_id_fkey'; columns: ['client_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'appointments_barber_id_fkey'; columns: ['professional_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'appointments_service_id_fkey'; columns: ['service_id']; isOneToOne: false; referencedRelation: 'services'; referencedColumns: ['id'] },
        ];
      };
      authorization_audit_log: {
        Row: { action: string; actor_id: string | null; created_at: string; establishment_id: string | null; id: number; metadata: Json; target_profile_id: string | null };
        Insert: { action: string; actor_id?: string | null; created_at?: string; establishment_id?: string | null; id?: never; metadata?: Json; target_profile_id?: string | null };
        Update: { action?: string; actor_id?: string | null; created_at?: string; establishment_id?: string | null; id?: never; metadata?: Json; target_profile_id?: string | null };
        Relationships: [];
      };
      establishment_requests: {
        Row: { address: string | null; created_at: string; establishment_id: string | null; id: string; name: string; phone: string | null; primary_color: string; rejection_reason: string | null; requester_email: string; requester_id: string; requester_name: string; reviewed_at: string | null; reviewed_by: string | null; slug: string; status: string; updated_at: string };
        Insert: { address?: string | null; created_at?: string; establishment_id?: string | null; id?: string; name: string; phone?: string | null; primary_color?: string; rejection_reason?: string | null; requester_email: string; requester_id: string; requester_name: string; reviewed_at?: string | null; reviewed_by?: string | null; slug: string; status?: string; updated_at?: string };
        Update: { address?: string | null; created_at?: string; establishment_id?: string | null; id?: string; name?: string; phone?: string | null; primary_color?: string; rejection_reason?: string | null; requester_email?: string; requester_id?: string; requester_name?: string; reviewed_at?: string | null; reviewed_by?: string | null; slug?: string; status?: string; updated_at?: string };
        Relationships: [];
      };
      establishments: {
        Row: { address: string | null; banner_url: string | null; created_at: string; currency: string; description: string | null; gallery_urls: string | null; id: string; instagram: string | null; logo_url: string | null; name: string; opening_hours: string | null; phone: string | null; primary_color: string | null; share_agendas: boolean; slogan: string | null; slug: string; timezone: string; updated_at: string };
        Insert: { address?: string | null; banner_url?: string | null; created_at?: string; currency?: string; description?: string | null; gallery_urls?: string | null; id?: string; instagram?: string | null; logo_url?: string | null; name: string; opening_hours?: string | null; phone?: string | null; primary_color?: string | null; share_agendas?: boolean; slogan?: string | null; slug: string; timezone?: string; updated_at?: string };
        Update: { address?: string | null; banner_url?: string | null; created_at?: string; currency?: string; description?: string | null; gallery_urls?: string | null; id?: string; instagram?: string | null; logo_url?: string | null; name?: string; opening_hours?: string | null; phone?: string | null; primary_color?: string | null; share_agendas?: boolean; slogan?: string | null; slug?: string; timezone?: string; updated_at?: string };
        Relationships: [];
      };
      invitations: {
        Row: { accepted_at: string | null; accepted_by: string | null; created_at: string; created_by: string; establishment_id: string; expires_at: string; id: string; invited_email: string; revoked_at: string | null; role: string; status: string; token_hash: string };
        Insert: { accepted_at?: string | null; accepted_by?: string | null; created_at?: string; created_by: string; establishment_id: string; expires_at: string; id?: string; invited_email: string; revoked_at?: string | null; role: string; status?: string; token_hash: string };
        Update: { accepted_at?: string | null; accepted_by?: string | null; created_at?: string; created_by?: string; establishment_id?: string; expires_at?: string; id?: string; invited_email?: string; revoked_at?: string | null; role?: string; status?: string; token_hash?: string };
        Relationships: [];
      };
      memberships: {
        Row: { commission_rate: number; created_at: string; created_by: string | null; establishment_id: string; id: string; profile_id: string; revoked_at: string | null; role: string; status: string; updated_at: string };
        Insert: { commission_rate?: number; created_at?: string; created_by?: string | null; establishment_id: string; id?: string; profile_id: string; revoked_at?: string | null; role: string; status?: string; updated_at?: string };
        Update: { commission_rate?: number; created_at?: string; created_by?: string | null; establishment_id?: string; id?: string; profile_id?: string; revoked_at?: string | null; role?: string; status?: string; updated_at?: string };
        Relationships: [];
      };
      professional_services: {
        Row: { created_at: string; duration_minutes: number; establishment_id: string; id: string; is_active: boolean; price: number; professional_id: string; service_id: string; updated_at: string };
        Insert: { created_at?: string; duration_minutes: number; establishment_id: string; id?: string; is_active?: boolean; price: number; professional_id: string; service_id: string; updated_at?: string };
        Update: { created_at?: string; duration_minutes?: number; establishment_id?: string; id?: string; is_active?: boolean; price?: number; professional_id?: string; service_id?: string; updated_at?: string };
        Relationships: [];
      };
      profile_establishments: {
        Row: { created_at: string; establishment_id: string; profile_id: string; role: string; updated_at: string };
        Insert: { created_at?: string; establishment_id: string; profile_id: string; role: string; updated_at?: string };
        Update: { created_at?: string; establishment_id?: string; profile_id?: string; role?: string; updated_at?: string };
        Relationships: [];
      };
      profiles: {
        Row: { avatar_url: string | null; commission_rate: number; created_at: string; deleted_at: string | null; email: string; establishment_id: string | null; id: string; instagram: string | null; name: string; phone: string | null; push_token: string | null; role: string; specialties: string | null; titulo_profissional: string | null; updated_at: string; work_hours: string | null };
        Insert: { avatar_url?: string | null; commission_rate?: number; created_at?: string; deleted_at?: string | null; email: string; establishment_id?: string | null; id: string; instagram?: string | null; name: string; phone?: string | null; push_token?: string | null; role: string; specialties?: string | null; titulo_profissional?: string | null; updated_at?: string; work_hours?: string | null };
        Update: { avatar_url?: string | null; commission_rate?: number; created_at?: string; deleted_at?: string | null; email?: string; establishment_id?: string | null; id?: string; instagram?: string | null; name?: string; phone?: string | null; push_token?: string | null; role?: string; specialties?: string | null; titulo_profissional?: string | null; updated_at?: string; work_hours?: string | null };
        Relationships: [{ foreignKeyName: 'profiles_establishment_id_fkey'; columns: ['establishment_id']; isOneToOne: false; referencedRelation: 'establishments'; referencedColumns: ['id'] }];
      };
      services: {
        Row: { created_at: string; deleted_at: string | null; duration_minutes: number; establishment_id: string; id: string; is_active: boolean; name: string; price: number; updated_at: string };
        Insert: { created_at?: string; deleted_at?: string | null; duration_minutes: number; establishment_id: string; id?: string; is_active?: boolean; name: string; price: number; updated_at?: string };
        Update: { created_at?: string; deleted_at?: string | null; duration_minutes?: number; establishment_id?: string; id?: string; is_active?: boolean; name?: string; price?: number; updated_at?: string };
        Relationships: [{ foreignKeyName: 'services_establishment_id_fkey'; columns: ['establishment_id']; isOneToOne: false; referencedRelation: 'establishments'; referencedColumns: ['id'] }];
      };
      superadmins: {
        Row: { granted_at: string; granted_by: string | null; profile_id: string };
        Insert: { granted_at?: string; granted_by?: string | null; profile_id: string };
        Update: { granted_at?: string; granted_by?: string | null; profile_id?: string };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      accept_invitation: { Args: { invitation_token: string }; Returns: { accepted_establishment_id: string; accepted_role: string }[] };
      admin_update_professional: { Args: { target_establishment_id: string; target_profile_id: string; updates: Json }; Returns: undefined };
      approve_establishment_request: { Args: { target_request_id: string }; Returns: { establishment_id: string; expires_at: string; invitation_id: string; invited_email: string; raw_token: string }[] };
      can_view_profile: { Args: { target_profile_id: string }; Returns: boolean };
      create_invitation: { Args: { target_email: string; target_establishment_id: string; target_role: string }; Returns: { expires_at: string; invitation_id: string; raw_token: string }[] };
      get_establishment_team: { Args: { include_administrators?: boolean; target_establishment_id: string }; Returns: { avatar_url: string | null; commission_rate: number | null; email: string; establishment_id: string; id: string; instagram: string | null; name: string; phone: string | null; role: string; specialties: string | null; titulo_profissional: string | null; work_hours: string | null }[] };
      get_my_profile: { Args: Record<PropertyKey, never>; Returns: { avatar_url: string | null; commission_rate: number | null; deleted_at: string | null; email: string; establishment_id: string | null; id: string; instagram: string | null; name: string; phone: string | null; push_token: string | null; role: string; specialties: string | null; titulo_profissional: string | null; work_hours: string | null }[] };
      get_public_team: { Args: { target_establishment_id: string }; Returns: { avatar_url: string | null; commission_rate: number | null; email: string; establishment_id: string; id: string; instagram: string | null; name: string; phone: string | null; role: string; specialties: string | null; titulo_profissional: string | null; work_hours: string | null }[] };
      has_active_membership: { Args: { allowed_roles?: string[] | null; target_establishment_id: string }; Returns: boolean };
      inspect_invitation: { Args: { invitation_token: string }; Returns: { establishment_name: string; expiration: string; invitation_status: string; invited_email: string; invited_role: string }[] };
      is_superadmin: { Args: Record<PropertyKey, never>; Returns: boolean };
      list_establishment_invitations: { Args: { target_establishment_id: string }; Returns: { created_at: string; expires_at: string; id: string; invited_email: string; role: string; status: string }[] };
      reject_establishment_request: { Args: { reason: string; target_request_id: string }; Returns: undefined };
      remove_professional: { Args: { target_establishment_id: string; target_profile_id: string }; Returns: undefined };
      request_establishment: { Args: { requested_address?: string | null; requested_name: string; requested_phone?: string | null; requested_primary_color?: string; requested_slug: string }; Returns: string };
      switch_active_establishment: { Args: { target_establishment_id: string }; Returns: string };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database['public'];

export type Tables<TableName extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][TableName]['Row'];
export type TablesInsert<TableName extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][TableName]['Insert'];
export type TablesUpdate<TableName extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][TableName]['Update'];