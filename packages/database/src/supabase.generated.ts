// Gerado pelo Supabase. Atualize com: npm run types:supabase
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          cancellation_reason: string | null
          cancelled_by_role: string | null
          client_id: string | null
          client_name: string | null
          created_at: string
          date_time: string
          deleted_at: string | null
          duration_minutes: number
          ends_at: string
          establishment_id: string
          id: string
          original_date_time: string | null
          professional_id: string
          reschedule_count: number
          service_id: string
          status: string
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_by_role?: string | null
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          date_time: string
          deleted_at?: string | null
          duration_minutes?: number
          ends_at: string
          establishment_id: string
          id?: string
          original_date_time?: string | null
          professional_id: string
          reschedule_count?: number
          service_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_by_role?: string | null
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          date_time?: string
          deleted_at?: string | null
          duration_minutes?: number
          ends_at?: string
          establishment_id?: string
          id?: string
          original_date_time?: string | null
          professional_id?: string
          reschedule_count?: number
          service_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_barber_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_barbershop_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      authorization_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          establishment_id: string | null
          id: number
          metadata: Json
          target_profile_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          establishment_id?: string | null
          id?: never
          metadata?: Json
          target_profile_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          establishment_id?: string | null
          id?: never
          metadata?: Json
          target_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "authorization_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorization_audit_log_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorization_audit_log_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      establishment_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          establishment_id: string
          expires_at: string
          id: string
          lgpd_accepted: boolean | null
          revoked_at: string | null
          role: string
          status: Database["public"]["Enums"]["invite_status_enum"] | null
          target_contact: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by: string
          establishment_id: string
          expires_at: string
          id?: string
          lgpd_accepted?: boolean | null
          revoked_at?: string | null
          role: string
          status?: Database["public"]["Enums"]["invite_status_enum"] | null
          target_contact: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          establishment_id?: string
          expires_at?: string
          id?: string
          lgpd_accepted?: boolean | null
          revoked_at?: string | null
          role?: string
          status?: Database["public"]["Enums"]["invite_status_enum"] | null
          target_contact?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "establishment_invites_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_invites_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      establishment_requests: {
        Row: {
          address: string | null
          created_at: string
          establishment_id: string | null
          id: string
          name: string
          phone: string | null
          primary_color: string
          rejection_reason: string | null
          requester_email: string
          requester_id: string
          requester_name: string
          reviewed_at: string | null
          reviewed_by: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          establishment_id?: string | null
          id?: string
          name: string
          phone?: string | null
          primary_color?: string
          rejection_reason?: string | null
          requester_email: string
          requester_id: string
          requester_name: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          establishment_id?: string | null
          id?: string
          name?: string
          phone?: string | null
          primary_color?: string
          rejection_reason?: string | null
          requester_email?: string
          requester_id?: string
          requester_name?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "establishment_requests_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      establishment_reviews: {
        Row: {
          appointment_id: string
          client_id: string
          comment: string | null
          created_at: string
          establishment_id: string
          id: string
          rating: number
          updated_at: string
        }
        Insert: {
          appointment_id: string
          client_id: string
          comment?: string | null
          created_at?: string
          establishment_id: string
          id?: string
          rating: number
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          client_id?: string
          comment?: string | null
          created_at?: string
          establishment_id?: string
          id?: string
          rating?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "establishment_reviews_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_reviews_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_reviews_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      establishments: {
        Row: {
          account_status: string | null
          address: string | null
          average_price: number
          average_rating: number
          banner_url: string | null
          created_at: string
          currency: string
          description: string | null
          document_number: string | null
          document_type: string | null
          email_verified: boolean | null
          gallery_urls: string | null
          id: string
          instagram: string | null
          instant_booking_enabled: boolean
          kyc_document_url: string | null
          kyc_status: string | null
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          min_cancellation_hours: number | null
          name: string
          no_show_fee_percent: number | null
          opening_hours: string | null
          phone: string | null
          price_level: number
          primary_color: string | null
          professional_pix_allowed: boolean
          review_count: number
          share_agendas: boolean | null
          slogan: string | null
          slug: string
          timezone: string
          updated_at: string
          verification_level: number | null
          whatsapp_verified: boolean | null
        }
        Insert: {
          account_status?: string | null
          address?: string | null
          average_price?: number
          average_rating?: number
          banner_url?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          document_number?: string | null
          document_type?: string | null
          email_verified?: boolean | null
          gallery_urls?: string | null
          id?: string
          instagram?: string | null
          instant_booking_enabled?: boolean
          kyc_document_url?: string | null
          kyc_status?: string | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          min_cancellation_hours?: number | null
          name: string
          no_show_fee_percent?: number | null
          opening_hours?: string | null
          phone?: string | null
          price_level?: number
          primary_color?: string | null
          professional_pix_allowed?: boolean
          review_count?: number
          share_agendas?: boolean | null
          slogan?: string | null
          slug: string
          timezone?: string
          updated_at?: string
          verification_level?: number | null
          whatsapp_verified?: boolean | null
        }
        Update: {
          account_status?: string | null
          address?: string | null
          average_price?: number
          average_rating?: number
          banner_url?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          document_number?: string | null
          document_type?: string | null
          email_verified?: boolean | null
          gallery_urls?: string | null
          id?: string
          instagram?: string | null
          instant_booking_enabled?: boolean
          kyc_document_url?: string | null
          kyc_status?: string | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          min_cancellation_hours?: number | null
          name?: string
          no_show_fee_percent?: number | null
          opening_hours?: string | null
          phone?: string | null
          price_level?: number
          primary_color?: string | null
          professional_pix_allowed?: boolean
          review_count?: number
          share_agendas?: boolean | null
          slogan?: string | null
          slug?: string
          timezone?: string
          updated_at?: string
          verification_level?: number | null
          whatsapp_verified?: boolean | null
        }
        Relationships: []
      }
      governance_kb_attachments: {
        Row: {
          alt_text: string
          created_at: string
          height: number | null
          id: string
          mime_type: string
          original_name: string
          reply_id: string | null
          size_bytes: number
          storage_path: string
          topic_id: string
          updated_at: string
          upload_status: string
          uploaded_by: string
          width: number | null
        }
        Insert: {
          alt_text: string
          created_at?: string
          height?: number | null
          id?: string
          mime_type: string
          original_name: string
          reply_id?: string | null
          size_bytes: number
          storage_path: string
          topic_id: string
          updated_at?: string
          upload_status?: string
          uploaded_by: string
          width?: number | null
        }
        Update: {
          alt_text?: string
          created_at?: string
          height?: number | null
          id?: string
          mime_type?: string
          original_name?: string
          reply_id?: string | null
          size_bytes?: number
          storage_path?: string
          topic_id?: string
          updated_at?: string
          upload_status?: string
          uploaded_by?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "governance_kb_attachments_reply_id_fkey"
            columns: ["reply_id"]
            isOneToOne: false
            referencedRelation: "governance_kb_replies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "governance_kb_attachments_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "governance_kb_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "governance_kb_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      governance_kb_categories: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "governance_kb_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      governance_kb_replies: {
        Row: {
          author_id: string
          body_markdown: string
          created_at: string
          id: string
          last_change_summary: string | null
          published_at: string | null
          removed_at: string | null
          status: string
          topic_id: string
          updated_at: string
          version: number
        }
        Insert: {
          author_id: string
          body_markdown: string
          created_at?: string
          id?: string
          last_change_summary?: string | null
          published_at?: string | null
          removed_at?: string | null
          status?: string
          topic_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          author_id?: string
          body_markdown?: string
          created_at?: string
          id?: string
          last_change_summary?: string | null
          published_at?: string | null
          removed_at?: string | null
          status?: string
          topic_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "governance_kb_replies_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "governance_kb_replies_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "governance_kb_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      governance_kb_revisions: {
        Row: {
          change_summary: string
          changed_by: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: number
          revision_number: number
          snapshot: Json
        }
        Insert: {
          change_summary: string
          changed_by?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: never
          revision_number: number
          snapshot: Json
        }
        Update: {
          change_summary?: string
          changed_by?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: never
          revision_number?: number
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "governance_kb_revisions_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      governance_kb_topics: {
        Row: {
          accepted_reply_id: string | null
          archived_at: string | null
          author_id: string | null
          body_markdown: string
          category_id: string
          created_at: string
          id: string
          is_official: boolean
          is_pinned: boolean
          kind: string
          last_change_summary: string | null
          publication_status: string
          published_at: string | null
          resolution_status: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          search_document: unknown
          slug: string
          tags: string[]
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          accepted_reply_id?: string | null
          archived_at?: string | null
          author_id?: string | null
          body_markdown?: string
          category_id: string
          created_at?: string
          id?: string
          is_official?: boolean
          is_pinned?: boolean
          kind: string
          last_change_summary?: string | null
          publication_status?: string
          published_at?: string | null
          resolution_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          search_document?: unknown
          slug: string
          tags?: string[]
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          accepted_reply_id?: string | null
          archived_at?: string | null
          author_id?: string | null
          body_markdown?: string
          category_id?: string
          created_at?: string
          id?: string
          is_official?: boolean
          is_pinned?: boolean
          kind?: string
          last_change_summary?: string | null
          publication_status?: string
          published_at?: string | null
          resolution_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          search_document?: unknown
          slug?: string
          tags?: string[]
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "governance_kb_topics_accepted_reply_fkey"
            columns: ["accepted_reply_id"]
            isOneToOne: false
            referencedRelation: "governance_kb_replies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "governance_kb_topics_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "governance_kb_topics_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "governance_kb_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "governance_kb_topics_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      governance_users: {
        Row: {
          granted_at: string
          granted_by: string | null
          profile_id: string
          role: Database["public"]["Enums"]["governance_role_enum"]
          updated_at: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          profile_id: string
          role: Database["public"]["Enums"]["governance_role_enum"]
          updated_at?: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          profile_id?: string
          role?: Database["public"]["Enums"]["governance_role_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "governance_users_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "governance_users_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          establishment_id: string
          expires_at: string
          id: string
          invited_email: string
          revocation_reason: string | null
          revoked_at: string | null
          role: string
          status: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by: string
          establishment_id: string
          expires_at: string
          id?: string
          invited_email: string
          revocation_reason?: string | null
          revoked_at?: string | null
          role: string
          status?: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          establishment_id?: string
          expires_at?: string
          id?: string
          invited_email?: string
          revocation_reason?: string | null
          revoked_at?: string | null
          role?: string
          status?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          commission_rate: number
          created_at: string
          created_by: string | null
          establishment_id: string
          id: string
          professional_profile_id: string | null
          profile_id: string
          revocation_reason: string | null
          revoked_at: string | null
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          commission_rate?: number
          created_at?: string
          created_by?: string | null
          establishment_id: string
          id?: string
          professional_profile_id?: string | null
          profile_id: string
          revocation_reason?: string | null
          revoked_at?: string | null
          role: string
          status?: string
          updated_at?: string
        }
        Update: {
          commission_rate?: number
          created_at?: string
          created_by?: string | null
          establishment_id?: string
          id?: string
          professional_profile_id?: string | null
          profile_id?: string
          revocation_reason?: string | null
          revoked_at?: string | null
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_professional_profile_id_fkey"
            columns: ["professional_profile_id"]
            isOneToOne: false
            referencedRelation: "professional_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_profiles: {
        Row: {
          bio: string | null
          created_at: string
          gallery_urls: Json
          id: string
          instagram_url: string | null
          is_public: boolean
          portfolio_url: string | null
          slug: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          gallery_urls?: Json
          id?: string
          instagram_url?: string | null
          is_public?: boolean
          portfolio_url?: string | null
          slug: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          gallery_urls?: Json
          id?: string
          instagram_url?: string | null
          is_public?: boolean
          portfolio_url?: string | null
          slug?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_services: {
        Row: {
          created_at: string
          duration_minutes: number
          establishment_id: string
          id: string
          is_active: boolean
          price: number
          professional_id: string
          service_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_minutes: number
          establishment_id: string
          id?: string
          is_active?: boolean
          price: number
          professional_id: string
          service_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          establishment_id?: string
          id?: string
          is_active?: boolean
          price?: number
          professional_id?: string
          service_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "barber_services_barber_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barber_services_barbershop_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barber_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_establishments: {
        Row: {
          created_at: string
          establishment_id: string
          profile_id: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          establishment_id: string
          profile_id: string
          role: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          establishment_id?: string
          profile_id?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_barbershops_barbershop_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_barbershops_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          commission_rate: number | null
          created_at: string
          deleted_at: string | null
          email: string
          establishment_id: string | null
          id: string
          instagram: string | null
          lgpd_accepted_at: string | null
          lgpd_marketing_accepted: boolean | null
          lgpd_terms_accepted: boolean | null
          name: string
          notification_channels: string[] | null
          phone: string | null
          pix_key: string | null
          push_token: string | null
          role: string
          specialties: string | null
          titulo_profissional: string | null
          updated_at: string
          work_hours: string | null
        }
        Insert: {
          avatar_url?: string | null
          commission_rate?: number | null
          created_at?: string
          deleted_at?: string | null
          email: string
          establishment_id?: string | null
          id: string
          instagram?: string | null
          lgpd_accepted_at?: string | null
          lgpd_marketing_accepted?: boolean | null
          lgpd_terms_accepted?: boolean | null
          name: string
          notification_channels?: string[] | null
          phone?: string | null
          pix_key?: string | null
          push_token?: string | null
          role: string
          specialties?: string | null
          titulo_profissional?: string | null
          updated_at?: string
          work_hours?: string | null
        }
        Update: {
          avatar_url?: string | null
          commission_rate?: number | null
          created_at?: string
          deleted_at?: string | null
          email?: string
          establishment_id?: string | null
          id?: string
          instagram?: string | null
          lgpd_accepted_at?: string | null
          lgpd_marketing_accepted?: boolean | null
          lgpd_terms_accepted?: boolean | null
          name?: string
          notification_channels?: string[] | null
          phone?: string | null
          pix_key?: string | null
          push_token?: string | null
          role?: string
          specialties?: string | null
          titulo_profissional?: string | null
          updated_at?: string
          work_hours?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_barbershop_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      push_devices: {
        Row: {
          app_kind: string
          created_at: string
          enabled: boolean
          expo_push_token: string
          id: string
          last_seen_at: string
          platform: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          app_kind: string
          created_at?: string
          enabled?: boolean
          expo_push_token: string
          id?: string
          last_seen_at?: string
          platform: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          app_kind?: string
          created_at?: string
          enabled?: boolean
          expo_push_token?: string
          id?: string
          last_seen_at?: string
          platform?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_devices_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_blocks: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          ends_at: string
          establishment_id: string
          id: string
          kind: string
          professional_id: string
          reason: string | null
          starts_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          ends_at: string
          establishment_id: string
          id?: string
          kind: string
          professional_id: string
          reason?: string | null
          starts_at: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          ends_at?: string
          establishment_id?: string
          id?: string
          kind?: string
          professional_id?: string
          reason?: string | null
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_blocks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_blocks_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_blocks_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      security_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          changes: Json
          client_ip: string
          created_at: string
          id: number
          target_id: string
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          changes?: Json
          client_ip?: string
          created_at?: string
          id?: never
          target_id: string
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: Json
          client_ip?: string
          created_at?: string
          id?: never
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          created_at: string
          deleted_at: string | null
          duration_minutes: number
          establishment_id: string
          id: string
          is_active: boolean
          name: string
          price: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          duration_minutes: number
          establishment_id: string
          id?: string
          is_active?: boolean
          name: string
          price: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          duration_minutes?: number
          establishment_id?: string
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_barbershop_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      superadmins: {
        Row: {
          granted_at: string
          granted_by: string | null
          profile_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          profile_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "superadmins_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "superadmins_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_shifts: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          profile_id: string
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          profile_id: string
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          profile_id?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_shifts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      active_establishment_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string | null
          created_by: string | null
          establishment_id: string | null
          expires_at: string | null
          id: string | null
          lgpd_accepted: boolean | null
          revoked_at: string | null
          role: string | null
          status: Database["public"]["Enums"]["invite_status_enum"] | null
          target_contact: string | null
          token_hash: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string | null
          created_by?: string | null
          establishment_id?: string | null
          expires_at?: string | null
          id?: string | null
          lgpd_accepted?: boolean | null
          revoked_at?: string | null
          role?: string | null
          status?: Database["public"]["Enums"]["invite_status_enum"] | null
          target_contact?: string | null
          token_hash?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string | null
          created_by?: string | null
          establishment_id?: string | null
          expires_at?: string | null
          id?: string | null
          lgpd_accepted?: boolean | null
          revoked_at?: string | null
          role?: string | null
          status?: Database["public"]["Enums"]["invite_status_enum"] | null
          target_contact?: string | null
          token_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "establishment_invites_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_invites_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_my_lgpd_terms: {
        Args: { target_marketing_accepted: boolean }
        Returns: boolean
      }
      accept_governance_kb_solution: {
        Args: { target_reply_id?: string; target_topic_id: string }
        Returns: undefined
      }
      accept_invitation: {
        Args: { invitation_token: string }
        Returns: {
          accepted_establishment_id: string
          accepted_role: string
        }[]
      }
      accept_invitation_v2: {
        Args: { invitation_token: string }
        Returns: {
          accepted_establishment_id: string
          accepted_role: string
        }[]
      }
      admin_report_available_minutes: {
        Args: {
          target_establishment_id: string
          target_professional_id?: string
          target_range_end: string
          target_range_start: string
        }
        Returns: number
      }
      admin_update_professional: {
        Args: {
          target_establishment_id: string
          target_profile_id: string
          updates: Json
        }
        Returns: undefined
      }
      anonymize_user_profile: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      approve_establishment_request: {
        Args: { target_request_id: string }
        Returns: {
          establishment_id: string
          expires_at: string
          invitation_id: string
          invited_email: string
          raw_token: string
        }[]
      }
      bootstrap_superadmins_from_config: { Args: never; Returns: number }
      can_upload_professional_gallery_image: { Args: never; Returns: boolean }
      can_view_private_profile: {
        Args: { target_profile_id: string }
        Returns: boolean
      }
      can_view_profile: {
        Args: { target_profile_id: string }
        Returns: boolean
      }
      cancel_appointment: {
        Args: { reason: string; target_appointment_id: string }
        Returns: undefined
      }
      complete_appointment: {
        Args: { target_appointment_id: string }
        Returns: undefined
      }
      compute_available_slots: {
        Args: {
          ignored_appointment_id?: string
          target_establishment_id: string
          target_local_date: string
          target_professional_id: string
          target_service_id: string
        }
        Returns: {
          available: boolean
          duration_minutes: number
          local_time: string
          starts_at: string
          unavailable_reason: string
        }[]
      }
      compute_available_slots_before_schedule_blocks: {
        Args: {
          ignored_appointment_id?: string
          target_establishment_id: string
          target_local_date: string
          target_professional_id: string
          target_service_id: string
        }
        Returns: {
          available: boolean
          duration_minutes: number
          local_time: string
          starts_at: string
          unavailable_reason: string
        }[]
      }
      confirm_appointment: {
        Args: { target_appointment_id: string }
        Returns: undefined
      }
      create_appointment: {
        Args: {
          target_client_id?: string
          target_client_name?: string
          target_date_time: string
          target_establishment_id: string
          target_professional_id: string
          target_service_id: string
        }
        Returns: string
      }
      create_appointment_before_schedule_blocks: {
        Args: {
          target_client_id?: string
          target_client_name?: string
          target_date_time: string
          target_establishment_id: string
          target_professional_id: string
          target_service_id: string
        }
        Returns: string
      }
      create_client_appointment: {
        Args: {
          target_date_time: string
          target_establishment_id: string
          target_professional_id: string
          target_service_id: string
        }
        Returns: {
          appointment_id: string
          appointment_status: string
        }[]
      }
      create_establishment_and_promote_owner: {
        Args: {
          requested_address: string
          requested_name: string
          requested_phone: string
          requested_primary_color: string
          requested_slug: string
          target_cnpj: string
          target_user_id: string
        }
        Returns: string
      }
      create_establishment_cpf: {
        Args: {
          requested_address: string
          requested_name: string
          requested_phone: string
          requested_primary_color: string
          requested_slug: string
          target_cpf: string
          target_user_id: string
        }
        Returns: string
      }
      create_establishment_invite_v2: {
        Args: {
          target_contact: string
          target_establishment_id: string
          target_role: string
        }
        Returns: {
          expires_at: string
          invitation_id: string
          raw_token: string
        }[]
      }
      create_invitation: {
        Args: {
          target_email: string
          target_establishment_id: string
          target_role: string
        }
        Returns: {
          expires_at: string
          invitation_id: string
          raw_token: string
        }[]
      }
      create_schedule_block: {
        Args: {
          requested_end: string
          requested_kind: string
          requested_reason?: string
          requested_start: string
          target_establishment_id: string
          target_professional_id: string
        }
        Returns: string
      }
      delete_schedule_block: {
        Args: { target_block_id: string }
        Returns: string
      }
      finalize_governance_kb_attachment: {
        Args: { target_attachment_id: string }
        Returns: undefined
      }
      get_admin_report: {
        Args: {
          target_establishment_id: string
          target_range_end: string
          target_range_start: string
        }
        Returns: Json
      }
      get_appointment_participant_names: {
        Args: { target_appointment_ids: string[] }
        Returns: {
          appointment_id: string
          client_name: string
          professional_name: string
        }[]
      }
      get_available_slots: {
        Args: {
          target_appointment_id?: string
          target_establishment_id: string
          target_local_date: string
          target_professional_id: string
          target_service_id: string
        }
        Returns: {
          available: boolean
          duration_minutes: number
          local_time: string
          starts_at: string
          unavailable_reason: string
        }[]
      }
      get_client_discovery_establishment: {
        Args: { target_slug: string }
        Returns: {
          address: string | null
          average_price: number
          average_rating: number
          banner_url: string | null
          currency: string
          description: string | null
          id: string
          instant_booking_enabled: boolean
          logo_url: string | null
          name: string
          opening_hours: string | null
          price_level: number
          primary_color: string | null
          professionals: Json
          review_count: number
          services: Json
          slogan: string | null
          slug: string
          timezone: string
        }[]
      }
      get_client_booking_options: {
        Args: { target_slug: string }
        Returns: {
          establishment_address: string | null
          establishment_currency: string
          establishment_id: string
          establishment_name: string
          establishment_slug: string
          establishment_timezone: string
          instant_booking_enabled: boolean
          professional_services: Json
          professionals: Json
          services: Json
        }[]
      }
      get_client_appointment: {
        Args: { target_appointment_id: string }
        Returns: {
          appointment_id: string
          appointment_status: string
          can_cancel: boolean
          can_reschedule: boolean
          cancel_block_reason: string | null
          cancellation_deadline: string
          cancellation_reason: string | null
          cancelled_by_role: string | null
          created_at: string
          duration_minutes: number
          ends_at: string
          establishment_address: string | null
          establishment_currency: string
          establishment_id: string
          establishment_name: string
          establishment_phone: string | null
          establishment_slug: string
          establishment_timezone: string
          instant_booking_enabled: boolean
          min_cancellation_hours: number
          original_starts_at: string | null
          professional_avatar_url: string | null
          professional_id: string
          professional_name: string
          reschedule_block_reason: string | null
          reschedule_count: number
          service_id: string
          service_name: string
          starts_at: string
          updated_at: string
        }[]
      }
      get_client_appointments: {
        Args: never
        Returns: {
          appointment_id: string
          appointment_status: string
          can_cancel: boolean
          can_reschedule: boolean
          cancel_block_reason: string | null
          cancellation_deadline: string
          cancellation_reason: string | null
          cancelled_by_role: string | null
          created_at: string
          duration_minutes: number
          ends_at: string
          establishment_address: string | null
          establishment_currency: string
          establishment_id: string
          establishment_name: string
          establishment_phone: string | null
          establishment_slug: string
          establishment_timezone: string
          instant_booking_enabled: boolean
          min_cancellation_hours: number
          original_starts_at: string | null
          professional_avatar_url: string | null
          professional_id: string
          professional_name: string
          reschedule_block_reason: string | null
          reschedule_count: number
          service_id: string
          service_name: string
          starts_at: string
          updated_at: string
        }[]
      }
      get_establishment_client_contacts: {
        Args: { target_establishment_id: string }
        Returns: {
          email: string
          id: string
          name: string
          phone: string
        }[]
      }
      get_establishment_team: {
        Args: {
          include_administrators?: boolean
          target_establishment_id: string
        }
        Returns: {
          avatar_url: string
          commission_rate: number
          email: string
          establishment_id: string
          id: string
          instagram: string
          name: string
          phone: string
          role: string
          specialties: string
          titulo_profissional: string
          work_hours: string
        }[]
      }
      get_governance_kb_topic: {
        Args: { target_topic_id: string }
        Returns: Json
      }
      get_my_client_profile: {
        Args: never
        Returns: {
          avatar_url: string | null
          email: string | null
          id: string
          lgpd_marketing_accepted: boolean
          name: string
          notification_channels: string[]
          phone: string | null
        }[]
      }
      get_my_operational_contexts: {
        Args: never
        Returns: {
          commission_rate: number
          establishment_id: string
          establishment_name: string
          establishment_slug: string
          establishment_status: string
          membership_id: string
          membership_role: string
          membership_status: string
        }[]
      }
      get_my_professional_profile: {
        Args: never
        Returns: {
          bio: string
          created_at: string
          gallery_urls: Json
          id: string
          instagram_url: string
          is_public: boolean
          portfolio_url: string
          slug: string
          updated_at: string
        }[]
      }
      get_my_profile: {
        Args: never
        Returns: {
          avatar_url: string
          commission_rate: number
          deleted_at: string
          email: string
          establishment_id: string
          id: string
          instagram: string
          name: string
          phone: string
          push_token: string
          role: string
          specialties: string
          titulo_profissional: string
          work_hours: string
        }[]
      }
      get_public_busy_slots: {
        Args: {
          range_end: string
          range_start: string
          target_professional_id: string
        }
        Returns: {
          date_time: string
          duration_minutes: number
        }[]
      }
      get_public_professional_profile: {
        Args: { profile_slug: string }
        Returns: {
          avatar_url: string
          bio: string
          gallery_urls: Json
          id: string
          instagram_url: string
          name: string
          portfolio_url: string
          slug: string
          specialties: string
          titulo_profissional: string
        }[]
      }
      get_public_team: {
        Args: { target_establishment_id: string }
        Returns: {
          avatar_url: string
          id: string
          name: string
          professional_profile_slug: string
          specialties: string
          titulo_profissional: string
        }[]
      }
      get_schedule_blocks: {
        Args: {
          range_end: string
          range_start: string
          target_establishment_id: string
          target_professional_id?: string
        }
        Returns: {
          created_at: string
          created_by: string
          ends_at: string
          establishment_id: string
          id: string
          kind: string
          professional_id: string
          reason: string
          starts_at: string
          updated_at: string
        }[]
      }
      has_active_membership: {
        Args: { allowed_roles?: string[]; target_establishment_id: string }
        Returns: boolean
      }
      immutable_array_to_string: {
        Args: { arr: string[]; sep: string }
        Returns: string
      }
      inspect_invitation: {
        Args: { invitation_token: string }
        Returns: {
          establishment_name: string
          expiration: string
          invitation_status: string
          invited_email: string
          invited_role: string
        }[]
      }
      inspect_invitation_v2: {
        Args: { invitation_token: string }
        Returns: {
          establishment_name: string
          expiration: string
          invitation_status: string
          invited_contact: string
          invited_role: string
        }[]
      }
      is_active_establishment_professional: {
        Args: { target_establishment_id: string; target_profile_id: string }
        Returns: boolean
      }
      is_active_establishment_service: {
        Args: { target_establishment_id: string; target_service_id: string }
        Returns: boolean
      }
      is_establishment_active: {
        Args: { target_establishment_id: string }
        Returns: boolean
      }
      is_governance_user: {
        Args: {
          allowed_roles?: Database["public"]["Enums"]["governance_role_enum"][]
        }
        Returns: boolean
      }
      is_safe_client_profile_text: {
        Args: { target_value: string }
        Returns: boolean
      }
      is_safe_public_url: { Args: { value: string }; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      is_valid_professional_gallery: { Args: { value: Json }; Returns: boolean }
      list_establishment_invitations: {
        Args: { target_establishment_id: string }
        Returns: {
          created_at: string
          expires_at: string
          id: string
          invited_email: string
          role: string
          status: string
        }[]
      }
      list_client_discovery_establishments: {
        Args: { result_limit?: number; target_query?: string }
        Returns: {
          address: string | null
          average_price: number
          average_rating: number
          banner_url: string | null
          currency: string
          description: string | null
          id: string
          instant_booking_enabled: boolean
          logo_url: string | null
          name: string
          opening_hours: string | null
          price_level: number
          primary_color: string | null
          professional_count: number
          professional_names: string[]
          review_count: number
          service_count: number
          service_names: string[]
          slogan: string | null
          slug: string
          timezone: string
        }[]
      }
      list_establishment_invites_v2: {
        Args: { target_establishment_id: string }
        Returns: {
          created_at: string
          expires_at: string
          id: string
          role: string
          status: string
          target_contact: string
        }[]
      }
      moderate_governance_kb_topic: {
        Args: { requested_action: string; target_topic_id: string }
        Returns: undefined
      }
      pull_changes: { Args: { last_pulled_at: number }; Returns: Json }
      push_changes: { Args: { changes: Json }; Returns: undefined }
      register_push_device: {
        Args: {
          target_app_kind: string
          target_expo_push_token: string
          target_platform: string
        }
        Returns: string
      }
      reject_establishment_request: {
        Args: { reason: string; target_request_id: string }
        Returns: undefined
      }
      remove_professional: {
        Args: {
          reason: string
          target_establishment_id: string
          target_profile_id: string
        }
        Returns: undefined
      }
      reorder_service: {
        Args: {
          direction: string
          target_establishment_id: string
          target_service_id: string
        }
        Returns: undefined
      }
      request_establishment: {
        Args: {
          requested_address?: string
          requested_name: string
          requested_phone?: string
          requested_primary_color?: string
          requested_slug: string
        }
        Returns: string
      }
      reschedule_appointment: {
        Args: {
          requested_date_time: string
          requested_professional_id: string
          requested_service_id: string
          target_appointment_id: string
        }
        Returns: string
      }
      reschedule_appointment_before_schedule_blocks: {
        Args: {
          requested_date_time: string
          requested_professional_id: string
          requested_service_id: string
          target_appointment_id: string
        }
        Returns: string
      }
      reserve_governance_kb_attachment: {
        Args: {
          requested_alt_text: string
          requested_height: number
          requested_mime_type: string
          requested_original_name: string
          requested_size_bytes: number
          requested_width: number
          target_reply_id: string
          target_topic_id: string
        }
        Returns: {
          attachment_id: string
          storage_path: string
        }[]
      }
      restore_governance_kb_revision: {
        Args: { requested_change_summary: string; target_revision_id: number }
        Returns: undefined
      }
      revoke_invitation: {
        Args: { reason: string; target_invitation_id: string }
        Returns: undefined
      }
      search_governance_kb_topics: {
        Args: {
          filter_category?: string
          filter_kind?: string
          filter_status?: string
          page_number?: number
          page_size?: number
          search_query?: string
        }
        Returns: {
          author_name: string
          category_id: string
          category_name: string
          category_slug: string
          created_at: string
          excerpt: string
          id: string
          is_official: boolean
          is_pinned: boolean
          kind: string
          publication_status: string
          reply_count: number
          resolution_status: string
          reviewed_at: string
          slug: string
          tags: string[]
          title: string
          total_count: number
          updated_at: string
          version: number
        }[]
      }
      switch_active_establishment: {
        Args: { target_establishment_id: string }
        Returns: string
      }
      text_array_has_duplicates: {
        Args: { target_values: string[] }
        Returns: boolean
      }
      unregister_push_device: {
        Args: { target_expo_push_token: string }
        Returns: boolean
      }
      update_appointment_status: {
        Args: {
          new_cancellation_reason?: string
          new_status: string
          target_appointment_id: string
        }
        Returns: string
      }
      update_my_client_avatar: {
        Args: { target_avatar_url: string | null }
        Returns: {
          avatar_url: string | null
          email: string | null
          id: string
          lgpd_marketing_accepted: boolean
          name: string
          notification_channels: string[]
          phone: string | null
        }[]
      }
      update_my_client_preferences: {
        Args: {
          target_lgpd_marketing_accepted: boolean
          target_notification_channels: string[]
        }
        Returns: {
          avatar_url: string | null
          email: string | null
          id: string
          lgpd_marketing_accepted: boolean
          name: string
          notification_channels: string[]
          phone: string | null
        }[]
      }
      update_my_client_profile: {
        Args: { target_name: string; target_phone: string }
        Returns: {
          avatar_url: string | null
          email: string | null
          id: string
          lgpd_marketing_accepted: boolean
          name: string
          notification_channels: string[]
          phone: string | null
        }[]
      }
      upsert_my_professional_profile: {
        Args: {
          requested_bio?: string
          requested_gallery_urls?: Json
          requested_instagram_url?: string
          requested_is_public?: boolean
          requested_portfolio_url?: string
          requested_slug: string
        }
        Returns: {
          profile_id: string
          profile_slug: string
        }[]
      }
    }
    Enums: {
      governance_role_enum: "SaaS_Viewer" | "SaaS_Editor" | "SaaS_Owner"
      invite_status_enum: "pending" | "accepted" | "revoked" | "expired"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      governance_role_enum: ["SaaS_Viewer", "SaaS_Editor", "SaaS_Owner"],
      invite_status_enum: ["pending", "accepted", "revoked", "expired"],
    },
  },
} as const
