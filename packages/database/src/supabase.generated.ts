// Gerado pelo Supabase CLI. Atualize com: npm run types:supabase
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      appointments: {
        Row: {
          cancellation_note_internal: string | null
          cancellation_reason: string | null
          cancellation_reason_code: string | null
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
          cancellation_note_internal?: string | null
          cancellation_reason?: string | null
          cancellation_reason_code?: string | null
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
          cancellation_note_internal?: string | null
          cancellation_reason?: string | null
          cancellation_reason_code?: string | null
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
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_professional_id_fkey"
            columns: ["professional_id"]
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
      billing_accounts: {
        Row: {
          billing_email: string | null
          billing_owner_profile_id: string | null
          courtesy_ends_at: string | null
          created_at: string
          establishment_id: string
          fiscal_address: Json
          id: string
          legal_entity_id: string | null
          municipal_registration: string | null
          operationally_activated_at: string | null
          owner_resolution_status: string
          plan_id: string
          taxpayer_document: string | null
          taxpayer_name: string | null
          transition_ends_at: string | null
          trial_ends_at: string | null
          trial_started_at: string | null
          updated_at: string
        }
        Insert: {
          billing_email?: string | null
          billing_owner_profile_id?: string | null
          courtesy_ends_at?: string | null
          created_at?: string
          establishment_id: string
          fiscal_address?: Json
          id?: string
          legal_entity_id?: string | null
          municipal_registration?: string | null
          operationally_activated_at?: string | null
          owner_resolution_status?: string
          plan_id: string
          taxpayer_document?: string | null
          taxpayer_name?: string | null
          transition_ends_at?: string | null
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_email?: string | null
          billing_owner_profile_id?: string | null
          courtesy_ends_at?: string | null
          created_at?: string
          establishment_id?: string
          fiscal_address?: Json
          id?: string
          legal_entity_id?: string | null
          municipal_registration?: string | null
          operationally_activated_at?: string | null
          owner_resolution_status?: string
          plan_id?: string
          taxpayer_document?: string | null
          taxpayer_name?: string | null
          transition_ends_at?: string | null
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_accounts_billing_owner_profile_id_fkey"
            columns: ["billing_owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_accounts_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: true
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_accounts_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "legal_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_accounts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_coverage_assignments: {
        Row: {
          billing_account_id: string | null
          created_at: string
          created_by: string | null
          effective_from: string
          effective_until: string | null
          establishment_id: string
          id: string
          organization_subscription_id: string | null
          reason: string
          source_scope: string
          status: string
          updated_at: string
        }
        Insert: {
          billing_account_id?: string | null
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_until?: string | null
          establishment_id: string
          id?: string
          organization_subscription_id?: string | null
          reason?: string
          source_scope: string
          status?: string
          updated_at?: string
        }
        Update: {
          billing_account_id?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_until?: string | null
          establishment_id?: string
          id?: string
          organization_subscription_id?: string | null
          reason?: string
          source_scope?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_coverage_assignments_billing_account_id_fkey"
            columns: ["billing_account_id"]
            isOneToOne: false
            referencedRelation: "billing_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_coverage_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_coverage_assignments_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_coverage_assignments_organization_subscription_id_fkey"
            columns: ["organization_subscription_id"]
            isOneToOne: false
            referencedRelation: "organization_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_cutover_requests: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          created_at: string
          cutover_at: string
          establishment_ids: string[]
          failure_code: string | null
          id: string
          organization_subscription_id: string
          requested_by: string
          status: string
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          cutover_at: string
          establishment_ids: string[]
          failure_code?: string | null
          id?: string
          organization_subscription_id: string
          requested_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          cutover_at?: string
          establishment_ids?: string[]
          failure_code?: string | null
          id?: string
          organization_subscription_id?: string
          requested_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_cutover_requests_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_cutover_requests_organization_subscription_id_fkey"
            columns: ["organization_subscription_id"]
            isOneToOne: false
            referencedRelation: "organization_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_cutover_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          attempts: number
          available_at: string
          created_at: string
          event_type: string
          external_event_id: string
          id: number
          last_error_code: string | null
          locked_at: string | null
          locked_by: string | null
          payload: Json
          processed_at: string | null
          provider: string
          provider_created_at: string
          status: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          created_at?: string
          event_type: string
          external_event_id: string
          id?: never
          last_error_code?: string | null
          locked_at?: string | null
          locked_by?: string | null
          payload: Json
          processed_at?: string | null
          provider: string
          provider_created_at: string
          status?: string
        }
        Update: {
          attempts?: number
          available_at?: string
          created_at?: string
          event_type?: string
          external_event_id?: string
          id?: never
          last_error_code?: string | null
          locked_at?: string | null
          locked_by?: string | null
          payload?: Json
          processed_at?: string | null
          provider?: string
          provider_created_at?: string
          status?: string
        }
        Relationships: []
      }
      billing_invoices: {
        Row: {
          billing_account_id: string
          billing_subscription_id: string | null
          created_at: string
          currency: string
          due_at: string | null
          external_invoice_id: string
          hosted_invoice_url: string | null
          id: string
          invoice_pdf_url: string | null
          number: string | null
          paid_at: string | null
          paid_cents: number
          provider: string
          provider_event_created_at: string | null
          refunded_cents: number
          status: string
          subtotal_cents: number
          total_cents: number
          updated_at: string
        }
        Insert: {
          billing_account_id: string
          billing_subscription_id?: string | null
          created_at?: string
          currency: string
          due_at?: string | null
          external_invoice_id: string
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf_url?: string | null
          number?: string | null
          paid_at?: string | null
          paid_cents?: number
          provider: string
          provider_event_created_at?: string | null
          refunded_cents?: number
          status: string
          subtotal_cents?: number
          total_cents?: number
          updated_at?: string
        }
        Update: {
          billing_account_id?: string
          billing_subscription_id?: string | null
          created_at?: string
          currency?: string
          due_at?: string | null
          external_invoice_id?: string
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf_url?: string | null
          number?: string | null
          paid_at?: string | null
          paid_cents?: number
          provider?: string
          provider_event_created_at?: string | null
          refunded_cents?: number
          status?: string
          subtotal_cents?: number
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_invoices_billing_account_id_fkey"
            columns: ["billing_account_id"]
            isOneToOne: false
            referencedRelation: "billing_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_invoices_billing_subscription_id_fkey"
            columns: ["billing_subscription_id"]
            isOneToOne: false
            referencedRelation: "billing_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_plans: {
        Row: {
          active: boolean
          code: string
          created_at: string
          currency: string
          entitlements: Json
          id: string
          interval_count: number
          interval_unit: string
          is_public: boolean
          name: string
          price_cents: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          currency: string
          entitlements?: Json
          id?: string
          interval_count?: number
          interval_unit: string
          is_public?: boolean
          name: string
          price_cents: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          currency?: string
          entitlements?: Json
          id?: string
          interval_count?: number
          interval_unit?: string
          is_public?: boolean
          name?: string
          price_cents?: number
          updated_at?: string
        }
        Relationships: []
      }
      billing_provider_products: {
        Row: {
          active: boolean
          created_at: string
          environment: string
          external_price_id: string
          external_product_id: string
          id: string
          plan_id: string
          provider: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          environment: string
          external_price_id: string
          external_product_id: string
          id?: string
          plan_id: string
          provider: string
        }
        Update: {
          active?: boolean
          created_at?: string
          environment?: string
          external_price_id?: string
          external_product_id?: string
          id?: string
          plan_id?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_provider_products_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_subscriptions: {
        Row: {
          billing_account_id: string
          cancel_at_period_end: boolean
          cancelled_at: string | null
          created_at: string
          current_period_ends_at: string | null
          current_period_starts_at: string | null
          ended_at: string | null
          external_customer_id: string | null
          external_subscription_id: string | null
          grace_ends_at: string | null
          grace_started_at: string | null
          id: string
          provider: string
          provider_event_created_at: string | null
          status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          billing_account_id: string
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_ends_at?: string | null
          current_period_starts_at?: string | null
          ended_at?: string | null
          external_customer_id?: string | null
          external_subscription_id?: string | null
          grace_ends_at?: string | null
          grace_started_at?: string | null
          id?: string
          provider: string
          provider_event_created_at?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_account_id?: string
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_ends_at?: string | null
          current_period_starts_at?: string | null
          ended_at?: string | null
          external_customer_id?: string | null
          external_subscription_id?: string | null
          grace_ends_at?: string | null
          grace_started_at?: string | null
          id?: string
          provider?: string
          provider_event_created_at?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_subscriptions_billing_account_id_fkey"
            columns: ["billing_account_id"]
            isOneToOne: false
            referencedRelation: "billing_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_push_deliveries: {
        Row: {
          appointment_id: string
          attempts: number
          available_at: string
          body: string
          created_at: string
          event_key: string
          event_type: string
          expo_ticket_id: string | null
          id: string
          last_error_code: string | null
          locked_at: string | null
          payload: Json
          profile_id: string
          push_device_id: string
          receipt_checked_at: string | null
          sent_at: string | null
          status: string
          ticketed_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          appointment_id: string
          attempts?: number
          available_at?: string
          body: string
          created_at?: string
          event_key: string
          event_type: string
          expo_ticket_id?: string | null
          id?: string
          last_error_code?: string | null
          locked_at?: string | null
          payload?: Json
          profile_id: string
          push_device_id: string
          receipt_checked_at?: string | null
          sent_at?: string | null
          status?: string
          ticketed_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          attempts?: number
          available_at?: string
          body?: string
          created_at?: string
          event_key?: string
          event_type?: string
          expo_ticket_id?: string | null
          id?: string
          last_error_code?: string | null
          locked_at?: string | null
          payload?: Json
          profile_id?: string
          push_device_id?: string
          receipt_checked_at?: string | null
          sent_at?: string | null
          status?: string
          ticketed_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_push_deliveries_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_push_deliveries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_push_deliveries_push_device_id_fkey"
            columns: ["push_device_id"]
            isOneToOne: false
            referencedRelation: "push_devices"
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
          document_number: string | null
          document_type: string | null
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
          document_number?: string | null
          document_type?: string | null
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
          document_number?: string | null
          document_type?: string | null
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
          discovery_status: string
          document_number: string | null
          document_type: string | null
          email_verified: boolean | null
          gallery_urls: string | null
          id: string
          instagram: string | null
          instant_booking_enabled: boolean
          kyc_document_path: string | null
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
          published_at: string | null
          review_count: number
          share_agendas: boolean
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
          discovery_status?: string
          document_number?: string | null
          document_type?: string | null
          email_verified?: boolean | null
          gallery_urls?: string | null
          id?: string
          instagram?: string | null
          instant_booking_enabled?: boolean
          kyc_document_path?: string | null
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
          published_at?: string | null
          review_count?: number
          share_agendas?: boolean
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
          discovery_status?: string
          document_number?: string | null
          document_type?: string | null
          email_verified?: boolean | null
          gallery_urls?: string | null
          id?: string
          instagram?: string | null
          instant_booking_enabled?: boolean
          kyc_document_path?: string | null
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
          published_at?: string | null
          review_count?: number
          share_agendas?: boolean
          slogan?: string | null
          slug?: string
          timezone?: string
          updated_at?: string
          verification_level?: number | null
          whatsapp_verified?: boolean | null
        }
        Relationships: []
      }
      fiscal_documents: {
        Row: {
          billing_invoice_id: string | null
          cancelled_at: string | null
          created_at: string
          external_document_id: string | null
          external_reference: string
          id: string
          issued_at: string | null
          last_error_code: string | null
          manual_review_reason: string | null
          number: string | null
          organization_billing_invoice_id: string | null
          provider: string
          status: string
          updated_at: string
          verification_code: string | null
        }
        Insert: {
          billing_invoice_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          external_document_id?: string | null
          external_reference: string
          id?: string
          issued_at?: string | null
          last_error_code?: string | null
          manual_review_reason?: string | null
          number?: string | null
          organization_billing_invoice_id?: string | null
          provider?: string
          status?: string
          updated_at?: string
          verification_code?: string | null
        }
        Update: {
          billing_invoice_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          external_document_id?: string | null
          external_reference?: string
          id?: string
          issued_at?: string | null
          last_error_code?: string | null
          manual_review_reason?: string | null
          number?: string | null
          organization_billing_invoice_id?: string | null
          provider?: string
          status?: string
          updated_at?: string
          verification_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_documents_billing_invoice_id_fkey"
            columns: ["billing_invoice_id"]
            isOneToOne: true
            referencedRelation: "billing_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_documents_organization_billing_invoice_id_fkey"
            columns: ["organization_billing_invoice_id"]
            isOneToOne: false
            referencedRelation: "organization_billing_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_events: {
        Row: {
          attempts: number
          available_at: string
          created_at: string
          external_event_id: string
          external_reference: string | null
          id: number
          last_error_code: string | null
          locked_at: string | null
          locked_by: string | null
          payload: Json
          processed_at: string | null
          provider: string
          status: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          created_at?: string
          external_event_id: string
          external_reference?: string | null
          id?: never
          last_error_code?: string | null
          locked_at?: string | null
          locked_by?: string | null
          payload: Json
          processed_at?: string | null
          provider?: string
          status?: string
        }
        Update: {
          attempts?: number
          available_at?: string
          created_at?: string
          external_event_id?: string
          external_reference?: string | null
          id?: never
          last_error_code?: string | null
          locked_at?: string | null
          locked_by?: string | null
          payload?: Json
          processed_at?: string | null
          provider?: string
          status?: string
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
      governance_privacy_requests: {
        Row: {
          attempt_count: number
          auth_deleted_at: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          executed_at: string | null
          id: string
          last_error_code: string | null
          processing_started_at: string | null
          profile_anonymized_at: string | null
          request_reason: string
          requested_by: string
          status: string
          target_profile_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          auth_deleted_at?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          executed_at?: string | null
          id?: string
          last_error_code?: string | null
          processing_started_at?: string | null
          profile_anonymized_at?: string | null
          request_reason: string
          requested_by: string
          status?: string
          target_profile_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          auth_deleted_at?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          executed_at?: string | null
          id?: string
          last_error_code?: string | null
          processing_started_at?: string | null
          profile_anonymized_at?: string | null
          request_reason?: string
          requested_by?: string
          status?: string
          target_profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "governance_privacy_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "governance_privacy_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "governance_privacy_requests_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      governance_users: {
        Row: {
          expires_at: string | null
          granted_at: string
          granted_by: string | null
          is_active: boolean
          profile_id: string
          revoked_at: string | null
          revoked_by: string | null
          role: Database["public"]["Enums"]["governance_role_enum"]
          updated_at: string
        }
        Insert: {
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          is_active?: boolean
          profile_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          role: Database["public"]["Enums"]["governance_role_enum"]
          updated_at?: string
        }
        Update: {
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          is_active?: boolean
          profile_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
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
          {
            foreignKeyName: "governance_users_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      governance_verification_reviews: {
        Row: {
          created_at: string
          decision: string
          document_path: string | null
          establishment_id: string
          id: string
          previous_status: string
          reason: string
          reviewer_id: string | null
        }
        Insert: {
          created_at?: string
          decision: string
          document_path?: string | null
          establishment_id: string
          id?: string
          previous_status: string
          reason: string
          reviewer_id?: string | null
        }
        Update: {
          created_at?: string
          decision?: string
          document_path?: string | null
          establishment_id?: string
          id?: string
          previous_status?: string
          reason?: string
          reviewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "governance_verification_reviews_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "governance_verification_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_migration_conflicts: {
        Row: {
          created_at: string
          document_last4: string | null
          document_type: string | null
          id: string
          legacy_record_id: string | null
          legacy_source: string
          legal_entity_id: string | null
          organization_id: string | null
          reason_code: string
          requester_profile_id: string | null
          resolution_reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          document_last4?: string | null
          document_type?: string | null
          id?: string
          legacy_record_id?: string | null
          legacy_source: string
          legal_entity_id?: string | null
          organization_id?: string | null
          reason_code: string
          requester_profile_id?: string | null
          resolution_reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          document_last4?: string | null
          document_type?: string | null
          id?: string
          legacy_record_id?: string | null
          legacy_source?: string
          legal_entity_id?: string | null
          organization_id?: string | null
          reason_code?: string
          requester_profile_id?: string | null
          resolution_reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "identity_migration_conflicts_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "legal_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_migration_conflicts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_migration_conflicts_requester_profile_id_fkey"
            columns: ["requester_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_migration_conflicts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
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
      legal_entities: {
        Row: {
          created_at: string
          created_by: string
          document_fingerprint: string
          document_last4: string
          document_type: string
          encrypted_document: string
          encryption_iv: string
          encryption_key_version: string
          entity_type: string
          id: string
          updated_at: string
          verification_status: string
        }
        Insert: {
          created_at?: string
          created_by: string
          document_fingerprint: string
          document_last4: string
          document_type: string
          encrypted_document: string
          encryption_iv: string
          encryption_key_version: string
          entity_type: string
          id?: string
          updated_at?: string
          verification_status?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          document_fingerprint?: string
          document_last4?: string
          document_type?: string
          encrypted_document?: string
          encryption_iv?: string
          encryption_key_version?: string
          entity_type?: string
          id?: string
          updated_at?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_entities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      organization_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          establishment_id: string | null
          id: number
          metadata: Json
          organization_id: string
          target_profile_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          establishment_id?: string | null
          id?: never
          metadata?: Json
          organization_id: string
          target_profile_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          establishment_id?: string | null
          id?: never
          metadata?: Json
          organization_id?: string
          target_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_audit_log_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_audit_log_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_billing_accounts: {
        Row: {
          billing_email: string | null
          billing_owner_profile_id: string | null
          created_at: string
          display_name: string
          fiscal_address: Json
          id: string
          legal_entity_id: string | null
          municipal_registration: string | null
          organization_id: string
          status: string
          taxpayer_name: string | null
          updated_at: string
        }
        Insert: {
          billing_email?: string | null
          billing_owner_profile_id?: string | null
          created_at?: string
          display_name: string
          fiscal_address?: Json
          id?: string
          legal_entity_id?: string | null
          municipal_registration?: string | null
          organization_id: string
          status?: string
          taxpayer_name?: string | null
          updated_at?: string
        }
        Update: {
          billing_email?: string | null
          billing_owner_profile_id?: string | null
          created_at?: string
          display_name?: string
          fiscal_address?: Json
          id?: string
          legal_entity_id?: string | null
          municipal_registration?: string | null
          organization_id?: string
          status?: string
          taxpayer_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_billing_accounts_billing_owner_profile_id_fkey"
            columns: ["billing_owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_billing_accounts_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "legal_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_billing_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_billing_events: {
        Row: {
          actor_id: string | null
          billing_account_id: string
          created_at: string
          event_type: string
          id: number
          invoice_id: string | null
          metadata: Json
          subscription_id: string | null
        }
        Insert: {
          actor_id?: string | null
          billing_account_id: string
          created_at?: string
          event_type: string
          id?: never
          invoice_id?: string | null
          metadata?: Json
          subscription_id?: string | null
        }
        Update: {
          actor_id?: string | null
          billing_account_id?: string
          created_at?: string
          event_type?: string
          id?: never
          invoice_id?: string | null
          metadata?: Json
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_billing_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_billing_events_billing_account_id_fkey"
            columns: ["billing_account_id"]
            isOneToOne: false
            referencedRelation: "organization_billing_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_billing_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "organization_billing_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_billing_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "organization_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_billing_invoices: {
        Row: {
          created_at: string
          currency: string
          discount_cents: number
          due_date: string
          external_invoice_id: string | null
          hosted_invoice_url: string | null
          id: string
          invoice_pdf_url: string | null
          issued_at: string
          issued_by: string | null
          number: string | null
          paid_at: string | null
          paid_cents: number
          period_end: string
          period_start: string
          plan_snapshot: Json
          provider: string
          provider_event_created_at: string | null
          refunded_cents: number
          status: string
          subscription_id: string
          subtotal_cents: number
          total_cents: number
          unit_snapshot: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency: string
          discount_cents: number
          due_date: string
          external_invoice_id?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf_url?: string | null
          issued_at?: string
          issued_by?: string | null
          number?: string | null
          paid_at?: string | null
          paid_cents?: number
          period_end: string
          period_start: string
          plan_snapshot: Json
          provider?: string
          provider_event_created_at?: string | null
          refunded_cents?: number
          status?: string
          subscription_id: string
          subtotal_cents: number
          total_cents: number
          unit_snapshot: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          discount_cents?: number
          due_date?: string
          external_invoice_id?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf_url?: string | null
          issued_at?: string
          issued_by?: string | null
          number?: string | null
          paid_at?: string | null
          paid_cents?: number
          period_end?: string
          period_start?: string
          plan_snapshot?: Json
          provider?: string
          provider_event_created_at?: string | null
          refunded_cents?: number
          status?: string
          subscription_id?: string
          subtotal_cents?: number
          total_cents?: number
          unit_snapshot?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_billing_invoices_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_billing_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "organization_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_billing_plans: {
        Row: {
          active: boolean
          base_price_cents: number | null
          code: string
          created_at: string
          currency: string
          entitlements: Json
          id: string
          is_network: boolean
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_price_cents?: number | null
          code: string
          created_at?: string
          currency?: string
          entitlements?: Json
          id?: string
          is_network?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_price_cents?: number | null
          code?: string
          created_at?: string
          currency?: string
          entitlements?: Json
          id?: string
          is_network?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      organization_establishments: {
        Row: {
          created_at: string
          effective_from: string
          effective_until: string | null
          establishment_id: string
          id: string
          linked_by: string | null
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          establishment_id: string
          id?: string
          linked_by?: string | null
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          establishment_id?: string
          id?: string
          linked_by?: string | null
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_establishments_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_establishments_linked_by_fkey"
            columns: ["linked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_establishments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          expires_at: string
          id: string
          invited_email: string
          organization_id: string
          role: string
          status: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          invited_email: string
          organization_id: string
          role: string
          status?: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          invited_email?: string
          organization_id?: string
          role?: string
          status?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_legal_entities: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          legal_entity_id: string
          organization_id: string
          relationship: string
          revoked_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          legal_entity_id: string
          organization_id: string
          relationship?: string
          revoked_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          legal_entity_id?: string
          organization_id?: string
          relationship?: string
          revoked_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_legal_entities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_legal_entities_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "legal_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_legal_entities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          profile_id: string
          revoked_at: string | null
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          profile_id: string
          revoked_at?: string | null
          role: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          profile_id?: string
          revoked_at?: string | null
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_subscriptions: {
        Row: {
          billing_account_id: string
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string
          current_period_start: string
          enforcement_enabled: boolean
          external_customer_id: string | null
          external_subscription_id: string | null
          grace_ends_at: string | null
          id: string
          plan_id: string
          provider: string
          provider_event_created_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          billing_account_id: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          enforcement_enabled?: boolean
          external_customer_id?: string | null
          external_subscription_id?: string | null
          grace_ends_at?: string | null
          id?: string
          plan_id: string
          provider?: string
          provider_event_created_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          billing_account_id?: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          enforcement_enabled?: boolean
          external_customer_id?: string | null
          external_subscription_id?: string | null
          grace_ends_at?: string | null
          id?: string
          plan_id?: string
          provider?: string
          provider_event_created_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_subscriptions_billing_account_id_fkey"
            columns: ["billing_account_id"]
            isOneToOne: true
            referencedRelation: "organization_billing_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "organization_billing_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_unit_tiers: {
        Row: {
          created_at: string
          id: string
          percentage_basis_points: number
          plan_id: string
          unit_from: number
          unit_price_cents: number | null
          unit_to: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          percentage_basis_points: number
          plan_id: string
          unit_from: number
          unit_price_cents?: number | null
          unit_to?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          percentage_basis_points?: number
          plan_id?: string
          unit_from?: number
          unit_price_cents?: number | null
          unit_to?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_unit_tiers_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "organization_billing_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_fiscal_settings: {
        Row: {
          accountant_approved_at: string | null
          approved_by: string | null
          cnae: string | null
          document_number: string | null
          environment: string
          id: boolean
          legal_name: string | null
          municipal_registration: string | null
          production_enabled: boolean
          retention_rules: Json
          service_code: string | null
          tax_rate: number | null
          tax_regime: string | null
          updated_at: string
        }
        Insert: {
          accountant_approved_at?: string | null
          approved_by?: string | null
          cnae?: string | null
          document_number?: string | null
          environment?: string
          id?: boolean
          legal_name?: string | null
          municipal_registration?: string | null
          production_enabled?: boolean
          retention_rules?: Json
          service_code?: string | null
          tax_rate?: number | null
          tax_regime?: string | null
          updated_at?: string
        }
        Update: {
          accountant_approved_at?: string | null
          approved_by?: string | null
          cnae?: string | null
          document_number?: string | null
          environment?: string
          id?: boolean
          legal_name?: string | null
          municipal_registration?: string | null
          production_enabled?: boolean
          retention_rules?: Json
          service_code?: string | null
          tax_rate?: number | null
          tax_regime?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_fiscal_settings_approved_by_fkey"
            columns: ["approved_by"]
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
            foreignKeyName: "professional_services_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_services_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_services_service_id_fkey"
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
            foreignKeyName: "profile_establishments_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_establishments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_legal_entities: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          legal_entity_id: string
          profile_id: string
          relationship: string
          revoked_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          legal_entity_id: string
          profile_id: string
          relationship: string
          revoked_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          legal_entity_id?: string
          profile_id?: string
          relationship?: string
          revoked_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_legal_entities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_legal_entities_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "legal_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_legal_entities_profile_id_fkey"
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
          commission_rate: number
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
          notification_channels: string[]
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
          commission_rate?: number
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
          notification_channels?: string[]
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
          commission_rate?: number
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
          notification_channels?: string[]
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
            foreignKeyName: "profiles_establishment_id_fkey"
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
            foreignKeyName: "services_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_units: {
        Row: {
          created_at: string
          effective_from: string
          effective_until: string | null
          establishment_id: string
          id: string
          subscription_id: string
        }
        Insert: {
          created_at?: string
          effective_from: string
          effective_until?: string | null
          establishment_id: string
          id?: string
          subscription_id: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          establishment_id?: string
          id?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_units_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_units_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "organization_subscriptions"
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
      support_business_holidays: {
        Row: {
          active: boolean
          created_at: string
          holiday_date: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          holiday_date: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          holiday_date?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          author_display_name: string
          author_kind: string
          author_profile_id: string | null
          body: string
          content_purged_at: string | null
          created_at: string
          id: string
          idempotency_key: string | null
          is_public: boolean
          jsm_comment_id: string | null
          last_sync_error_code: string | null
          sync_status: string
          synced_at: string | null
          ticket_id: string
          updated_at: string
        }
        Insert: {
          author_display_name: string
          author_kind: string
          author_profile_id?: string | null
          body: string
          content_purged_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          is_public?: boolean
          jsm_comment_id?: string | null
          last_sync_error_code?: string | null
          sync_status?: string
          synced_at?: string | null
          ticket_id: string
          updated_at?: string
        }
        Update: {
          author_display_name?: string
          author_kind?: string
          author_profile_id?: string | null
          body?: string
          content_purged_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          is_public?: boolean
          jsm_comment_id?: string | null
          last_sync_error_code?: string | null
          sync_status?: string
          synced_at?: string | null
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_push_deliveries: {
        Row: {
          attempts: number
          available_at: string
          body: string
          created_at: string
          event_key: string
          event_type: string
          expo_ticket_id: string | null
          id: string
          last_error_code: string | null
          locked_at: string | null
          message_id: string | null
          payload: Json
          profile_id: string
          push_device_id: string
          receipt_checked_at: string | null
          sent_at: string | null
          status: string
          ticket_id: string
          ticketed_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          body: string
          created_at?: string
          event_key: string
          event_type: string
          expo_ticket_id?: string | null
          id?: string
          last_error_code?: string | null
          locked_at?: string | null
          message_id?: string | null
          payload?: Json
          profile_id: string
          push_device_id: string
          receipt_checked_at?: string | null
          sent_at?: string | null
          status?: string
          ticket_id: string
          ticketed_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          available_at?: string
          body?: string
          created_at?: string
          event_key?: string
          event_type?: string
          expo_ticket_id?: string | null
          id?: string
          last_error_code?: string | null
          locked_at?: string | null
          message_id?: string | null
          payload?: Json
          profile_id?: string
          push_device_id?: string
          receipt_checked_at?: string | null
          sent_at?: string | null
          status?: string
          ticket_id?: string
          ticketed_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_push_deliveries_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "support_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_push_deliveries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_push_deliveries_push_device_id_fkey"
            columns: ["push_device_id"]
            isOneToOne: false
            referencedRelation: "push_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_push_deliveries_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_routing_rules: {
        Row: {
          active: boolean
          category: string | null
          city: string | null
          created_at: string
          default_escalation_level: number
          establishment_id: string | null
          id: string
          organization_id: string | null
          priority_order: number
          product: string | null
          region: string | null
          requester_role: string | null
          rule_version: number
          state: string | null
          target_team_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          city?: string | null
          created_at?: string
          default_escalation_level?: number
          establishment_id?: string | null
          id?: string
          organization_id?: string | null
          priority_order: number
          product?: string | null
          region?: string | null
          requester_role?: string | null
          rule_version?: number
          state?: string | null
          target_team_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          city?: string | null
          created_at?: string
          default_escalation_level?: number
          establishment_id?: string | null
          id?: string
          organization_id?: string | null
          priority_order?: number
          product?: string | null
          region?: string | null
          requester_role?: string | null
          rule_version?: number
          state?: string | null
          target_team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_routing_rules_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_routing_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_routing_rules_target_team_id_fkey"
            columns: ["target_team_id"]
            isOneToOne: false
            referencedRelation: "support_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      support_runtime_settings: {
        Row: {
          allow_new_tickets: boolean
          enabled: boolean
          id: boolean
          maintenance_message: string | null
          sync_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allow_new_tickets?: boolean
          enabled?: boolean
          id?: boolean
          maintenance_message?: string | null
          sync_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allow_new_tickets?: boolean
          enabled?: boolean
          id?: boolean
          maintenance_message?: string | null
          sync_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_runtime_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_sync_operations: {
        Row: {
          attempts: number
          available_at: string
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string
          last_error_code: string | null
          locked_at: string | null
          locked_by: string | null
          message_id: string | null
          operation_type: string
          payload: Json
          status: string
          ticket_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          last_error_code?: string | null
          locked_at?: string | null
          locked_by?: string | null
          message_id?: string | null
          operation_type: string
          payload?: Json
          status?: string
          ticket_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          available_at?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          last_error_code?: string | null
          locked_at?: string | null
          locked_by?: string | null
          message_id?: string | null
          operation_type?: string
          payload?: Json
          status?: string
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_sync_operations_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "support_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_sync_operations_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_team_members: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          is_active: boolean
          jira_account_id: string | null
          member_role: string
          profile_id: string
          team_id: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          is_active?: boolean
          jira_account_id?: string | null
          member_role: string
          profile_id: string
          team_id: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          is_active?: boolean
          jira_account_id?: string | null
          member_role?: string
          profile_id?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_team_members_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "support_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      support_teams: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          is_default: boolean
          level: number
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          is_default?: boolean
          level?: number
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          is_default?: boolean
          level?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_ticket_events: {
        Row: {
          actor_display_name: string | null
          actor_profile_id: string | null
          created_at: string
          event_type: string
          from_value: string | null
          id: string
          reason: string | null
          ticket_id: string
          to_value: string | null
        }
        Insert: {
          actor_display_name?: string | null
          actor_profile_id?: string | null
          created_at?: string
          event_type: string
          from_value?: string | null
          id?: string
          reason?: string | null
          ticket_id: string
          to_value?: string | null
        }
        Update: {
          actor_display_name?: string | null
          actor_profile_id?: string | null
          created_at?: string
          event_type?: string
          from_value?: string | null
          id?: string
          reason?: string | null
          ticket_id?: string
          to_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          appointment_id: string | null
          assignee_display_name: string | null
          assignee_profile_id: string | null
          category: string
          closed_at: string | null
          content_purged_at: string | null
          create_idempotency_key: string | null
          created_at: string
          escalation_level: number
          establishment_id: string | null
          first_responded_at: string | null
          first_response_due_at: string | null
          id: string
          impact: string
          jsm_issue_id: string | null
          jsm_issue_key: string | null
          jsm_issue_url: string | null
          last_message_at: string
          last_reconciled_at: string | null
          last_sync_error_code: string | null
          location_address: string | null
          location_city: string | null
          location_label: string | null
          location_region: string | null
          location_source: string
          location_state: string | null
          next_reconcile_at: string
          organization_id: string | null
          priority: string
          product: string
          protocol: string
          provider_updated_at: string | null
          requester_id: string | null
          requester_role: string
          request_kind: string
          resolved_at: string | null
          routing_version: number
          sla_breached: boolean
          status: string
          subcategory: string | null
          subject: string
          sync_status: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          assignee_display_name?: string | null
          assignee_profile_id?: string | null
          category: string
          closed_at?: string | null
          content_purged_at?: string | null
          create_idempotency_key?: string | null
          created_at?: string
          escalation_level?: number
          establishment_id?: string | null
          first_responded_at?: string | null
          first_response_due_at?: string | null
          id?: string
          impact: string
          jsm_issue_id?: string | null
          jsm_issue_key?: string | null
          jsm_issue_url?: string | null
          last_message_at?: string
          last_reconciled_at?: string | null
          last_sync_error_code?: string | null
          location_address?: string | null
          location_city?: string | null
          location_label?: string | null
          location_region?: string | null
          location_source?: string
          location_state?: string | null
          next_reconcile_at?: string
          organization_id?: string | null
          priority: string
          product: string
          protocol?: string
          provider_updated_at?: string | null
          requester_id?: string | null
          requester_role: string
          request_kind?: string
          resolved_at?: string | null
          routing_version?: number
          sla_breached?: boolean
          status?: string
          subcategory?: string | null
          subject: string
          sync_status?: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          assignee_display_name?: string | null
          assignee_profile_id?: string | null
          category?: string
          closed_at?: string | null
          content_purged_at?: string | null
          create_idempotency_key?: string | null
          created_at?: string
          escalation_level?: number
          establishment_id?: string | null
          first_responded_at?: string | null
          first_response_due_at?: string | null
          id?: string
          impact?: string
          jsm_issue_id?: string | null
          jsm_issue_key?: string | null
          jsm_issue_url?: string | null
          last_message_at?: string
          last_reconciled_at?: string | null
          last_sync_error_code?: string | null
          location_address?: string | null
          location_city?: string | null
          location_label?: string | null
          location_region?: string | null
          location_source?: string
          location_state?: string | null
          next_reconcile_at?: string
          organization_id?: string | null
          priority?: string
          product?: string
          protocol?: string
          provider_updated_at?: string | null
          requester_id?: string | null
          requester_role?: string
          request_kind?: string
          resolved_at?: string | null
          routing_version?: number
          sla_breached?: boolean
          status?: string
          subcategory?: string | null
          subject?: string
          sync_status?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_assignee_profile_id_fkey"
            columns: ["assignee_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "support_teams"
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
      accept_my_lgpd_terms: {
        Args: { target_marketing_accepted: boolean }
        Returns: boolean
      }
      accept_organization_invitation: {
        Args: { invitation_token: string }
        Returns: string
      }
      activate_control_subscription: {
        Args: {
          target_organization_id: string
          target_period_start?: string
          target_plan_code: string
        }
        Returns: string
      }
      add_organization_establishment: {
        Args: {
          target_establishment_id: string
          target_organization_id: string
        }
        Returns: undefined
      }
      add_support_message_internal: {
        Args: {
          actor_profile_id: string
          message_body: string
          target_idempotency_key: string
          target_ticket_id: string
        }
        Returns: Json
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
      anonymize_client_account_deletion: {
        Args: { target_request_id: string }
        Returns: Json
      }
      anonymize_user_profile: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      apply_support_reconciliation: {
        Args: {
          target_assignee_jira_account_id: string
          target_assignee_name: string
          target_first_responded_at: string
          target_first_response_due_at: string
          target_jsm_updated_at: string
          target_sla_breached: boolean
          target_status: string
          target_ticket_id: string
        }
        Returns: Json
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
      approve_governance_establishment_request: {
        Args: { reason: string; target_request_id: string }
        Returns: {
          establishment_id: string
          expires_at: string
          invitation_id: string
          invited_email: string
          raw_token: string
        }[]
      }
      begin_client_account_deletion_execution: {
        Args: { execution_reason: string; target_request_id: string }
        Returns: {
          auth_deleted_at: string
          profile_anonymized_at: string
          request_id: string
          status: string
          target_profile_id: string
        }[]
      }
      billing_access_mode: {
        Args: { target_establishment_id: string }
        Returns: string
      }
      bootstrap_superadmins_from_config: { Args: never; Returns: number }
      can_read_control_live: { Args: never; Returns: boolean }
      can_use_establishment_feature: {
        Args: { target_establishment_id: string; target_feature: string }
        Returns: boolean
      }
      can_view_private_profile: {
        Args: { target_profile_id: string }
        Returns: boolean
      }
      can_view_profile: {
        Args: { target_profile_id: string }
        Returns: boolean
      }
      claim_client_push_deliveries: {
        Args: { target_limit?: number }
        Returns: {
          delivery_id: string
          expo_push_token: string
          notification_body: string
          notification_payload: Json
          notification_title: string
        }[]
      }
      claim_client_push_receipts: {
        Args: { target_limit?: number }
        Returns: {
          delivery_id: string
          expo_ticket_id: string
        }[]
      }
      claim_support_push_deliveries: {
        Args: { target_limit?: number }
        Returns: {
          delivery_id: string
          expo_push_token: string
          notification_body: string
          notification_payload: Json
          notification_title: string
        }[]
      }
      claim_support_push_receipts: {
        Args: { target_limit?: number }
        Returns: {
          delivery_id: string
          expo_ticket_id: string
        }[]
      }
      claim_support_sync_operation: {
        Args: { target_operation_id: string }
        Returns: boolean
      }
      claim_support_sync_operations: {
        Args: { target_limit?: number }
        Returns: {
          message_id: string
          operation_id: string
          operation_type: string
          payload: Json
          ticket_id: string
        }[]
      }
      complete_client_account_deletion: {
        Args: { target_request_id: string }
        Returns: Json
      }
      complete_client_push_delivery: {
        Args: {
          target_delivery_id: string
          target_error_code?: string
          target_retryable?: boolean
          target_success: boolean
          target_ticket_id?: string
        }
        Returns: boolean
      }
      complete_client_push_receipt: {
        Args: {
          target_delivery_id: string
          target_error_code?: string
          target_success: boolean
        }
        Returns: boolean
      }
      complete_support_message_sync: {
        Args: {
          target_jsm_comment_id: string
          target_message_id: string
          target_operation_id: string
        }
        Returns: Json
      }
      complete_support_push_delivery: {
        Args: {
          target_delivery_id: string
          target_error_code?: string
          target_retryable?: boolean
          target_success: boolean
          target_ticket_id?: string
        }
        Returns: boolean
      }
      complete_support_push_receipt: {
        Args: {
          target_delivery_id: string
          target_error_code?: string
          target_success: boolean
        }
        Returns: boolean
      }
      complete_support_ticket_creation: {
        Args: {
          target_jsm_issue_id: string
          target_jsm_issue_key: string
          target_jsm_issue_url: string
          target_operation_id: string
          target_ticket_id: string
        }
        Returns: Json
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
      configure_control_plan: {
        Args: {
          target_base_price_cents: number
          target_currency?: string
          target_plan_code: string
        }
        Returns: string
      }
      configure_support_team_member: {
        Args: {
          reason: string
          target_active: boolean
          target_jira_account_id: string
          target_profile_id: string
          target_role: string
        }
        Returns: Json
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
      create_organization: {
        Args: { initial_establishment_id: string; organization_name: string }
        Returns: string
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
      create_support_ticket_internal: {
        Args: {
          actor_profile_id: string
          initial_message: string
          target_appointment_id: string
          target_category: string
          target_idempotency_key: string
          target_impact: string
          target_subject: string
        }
        Returns: Json
      }
      create_support_ticket_internal_v2: {
        Args: {
          actor_profile_id: string
          initial_message: string
          target_appointment_id: string
          target_category: string
          target_idempotency_key: string
          target_impact: string
          target_request_kind: string
          target_subject: string
        }
        Returns: Json
      }
      current_session_is_aal2: { Args: never; Returns: boolean }
      delete_schedule_block: {
        Args: { target_block_id: string }
        Returns: string
      }
      enqueue_support_push: {
        Args: {
          target_event_key: string
          target_event_type: string
          target_message_id?: string
          target_ticket_id: string
        }
        Returns: number
      }
      ensure_billing_account_for_establishment: {
        Args: {
          target_establishment_id: string
          target_transition_days?: number
        }
        Returns: string
      }
      escalate_support_ticket: {
        Args: { reason: string; target_level: number; target_ticket_id: string }
        Returns: Json
      }
      establishment_discovery_requirements: {
        Args: { target_establishment_id: string }
        Returns: Json
      }
      execute_governance_privacy_request: {
        Args: { reason: string; request_id: string }
        Returns: Json
      }
      fail_client_account_deletion: {
        Args: { target_error_code: string; target_request_id: string }
        Returns: undefined
      }
      fail_support_sync_operation: {
        Args: {
          target_error_code: string
          target_operation_id: string
          target_retry_after_seconds?: number
        }
        Returns: Json
      }
      finalize_establishment_onboarding: {
        Args: { opening_hours: string; target_establishment_id: string }
        Returns: undefined
      }
      finalize_governance_kb_attachment: {
        Args: { target_attachment_id: string }
        Returns: undefined
      }
      finalize_organization_billing_cutover: {
        Args: { target_cutover_request_id: string }
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
      get_admin_report_details: {
        Args: {
          target_cursor?: string
          target_day?: string
          target_day_of_week?: number
          target_dimension: string
          target_establishment_id: string
          target_hour?: number
          target_limit?: number
          target_professional_id?: string
          target_range_end: string
          target_range_start: string
          target_service_id?: string
          target_status?: string
        }
        Returns: Json
      }
      get_admin_report_v2: {
        Args: {
          target_establishment_id: string
          target_professional_id?: string
          target_range_end: string
          target_range_start: string
          target_service_id?: string
          target_status?: string
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
      get_available_slots_before_billing: {
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
      get_client_account_deletion_request: {
        Args: never
        Returns: {
          created_at: string
          decision_reason: string
          executed_at: string
          id: string
          processing_started_at: string
          status: string
          updated_at: string
        }[]
      }
      get_client_appointment: {
        Args: { target_appointment_id: string }
        Returns: {
          appointment_id: string
          appointment_status: string
          can_cancel: boolean
          can_reschedule: boolean
          cancel_block_reason: string
          cancellation_deadline: string
          cancellation_reason: string
          cancelled_by_role: string
          created_at: string
          duration_minutes: number
          ends_at: string
          establishment_address: string
          establishment_currency: string
          establishment_id: string
          establishment_name: string
          establishment_phone: string
          establishment_slug: string
          establishment_timezone: string
          instant_booking_enabled: boolean
          min_cancellation_hours: number
          original_starts_at: string
          professional_avatar_url: string
          professional_id: string
          professional_name: string
          reschedule_block_reason: string
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
          cancel_block_reason: string
          cancellation_deadline: string
          cancellation_reason: string
          cancelled_by_role: string
          created_at: string
          duration_minutes: number
          ends_at: string
          establishment_address: string
          establishment_currency: string
          establishment_id: string
          establishment_name: string
          establishment_phone: string
          establishment_slug: string
          establishment_timezone: string
          instant_booking_enabled: boolean
          min_cancellation_hours: number
          original_starts_at: string
          professional_avatar_url: string
          professional_id: string
          professional_name: string
          reschedule_block_reason: string
          reschedule_count: number
          service_id: string
          service_name: string
          starts_at: string
          updated_at: string
        }[]
      }
      get_client_appointments_before_billing: {
        Args: never
        Returns: {
          appointment_id: string
          appointment_status: string
          can_cancel: boolean
          can_reschedule: boolean
          cancel_block_reason: string
          cancellation_deadline: string
          cancellation_reason: string
          cancelled_by_role: string
          created_at: string
          duration_minutes: number
          ends_at: string
          establishment_address: string
          establishment_currency: string
          establishment_id: string
          establishment_name: string
          establishment_phone: string
          establishment_slug: string
          establishment_timezone: string
          instant_booking_enabled: boolean
          min_cancellation_hours: number
          original_starts_at: string
          professional_avatar_url: string
          professional_id: string
          professional_name: string
          reschedule_block_reason: string
          reschedule_count: number
          service_id: string
          service_name: string
          starts_at: string
          updated_at: string
        }[]
      }
      get_client_appointments_v2: {
        Args: never
        Returns: {
          appointment_id: string
          appointment_status: string
          cancellation_reason_code: string
          cancelled_by_role: string
          establishment_address: string
          establishment_currency: string
          establishment_id: string
          establishment_name: string
          establishment_phone: string
          establishment_slug: string
          establishment_timezone: string
          min_cancellation_hours: number
          professional_id: string
          professional_name: string
          reschedule_count: number
          service_duration_minutes: number
          service_id: string
          service_name: string
          service_price: number
          starts_at: string
        }[]
      }
      get_client_booking_options: {
        Args: { target_slug: string }
        Returns: {
          establishment_address: string
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
      get_client_discovery_establishment: {
        Args: { target_slug: string }
        Returns: {
          address: string
          average_price: number
          average_rating: number
          banner_url: string
          currency: string
          description: string
          id: string
          instant_booking_enabled: boolean
          logo_url: string
          name: string
          opening_hours: string
          price_level: number
          primary_color: string
          professionals: Json
          review_count: number
          services: Json
          slogan: string
          slug: string
          timezone: string
        }[]
      }
      get_control_context: { Args: never; Returns: Json }
      get_control_dashboard: { Args: never; Returns: Json }
      get_control_live_snapshot: { Args: never; Returns: Json }
      get_control_support_overview: {
        Args: {
          target_before?: string
          target_category?: string
          target_limit?: number
          target_priority?: string
          target_status?: string
        }
        Returns: Json
      }
      get_control_support_ticket: {
        Args: { target_ticket_id: string }
        Returns: Json
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
      get_establishment_discovery_publication: {
        Args: { target_establishment_id: string }
        Returns: {
          discovery_status: string
          published_at: string
          requirements: Json
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
      get_governance_establishment_detail: {
        Args: { target_establishment_id: string }
        Returns: Json
      }
      get_governance_kb_topic: {
        Args: { target_topic_id: string }
        Returns: Json
      }
      get_my_billing_overview: {
        Args: { target_establishment_id: string }
        Returns: Json
      }
      get_my_business_access_context: {
        Args: { target_establishment_id: string }
        Returns: {
          access_mode: string
          account_status: string
          billing_account_id: string
          billing_owner: boolean
          billing_scope: string
          billing_status: string
          cancel_at_period_end: boolean
          covered_establishment_ids: string[]
          current_period_ends_at: string
          entitlements: Json
          establishment_id: string
          grace_ends_at: string
          membership_role: string
          organization_id: string
          payer_role: string
          pending_change_at: string
          subscription_id: string
          trial_ends_at: string
        }[]
      }
      get_my_client_profile: {
        Args: never
        Returns: {
          avatar_url: string
          email: string
          id: string
          lgpd_marketing_accepted: boolean
          name: string
          notification_channels: string[]
          phone: string
        }[]
      }
      get_my_legal_entity_context: {
        Args: never
        Returns: {
          document_type: string
          entity_type: string
          legal_entity_id: string
          masked_document: string
          organization_id: string
          verification_status: string
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
      get_my_organizations: {
        Args: never
        Returns: {
          establishment_count: number
          member_role: string
          organization_id: string
          organization_name: string
          organization_status: string
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
      get_my_support_ticket: {
        Args: { target_ticket_id: string }
        Returns: Json
      }
      get_organization_billing_context: {
        Args: { target_organization_id: string }
        Returns: Json
      }
      get_organization_context: {
        Args: { target_organization_id: string }
        Returns: Json
      }
      get_organization_report: {
        Args: {
          range_end: string
          range_start: string
          target_organization_id: string
        }
        Returns: Json
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
      get_subscription_entitlement_for_establishment: {
        Args: { target_establishment_id: string }
        Returns: Json
      }
      get_support_capabilities: { Args: never; Returns: Json }
      grant_governance_role: {
        Args: {
          reason: string
          target_profile_id: string
          target_role: Database["public"]["Enums"]["governance_role_enum"]
        }
        Returns: {
          expires_at: string | null
          granted_at: string
          granted_by: string | null
          is_active: boolean
          profile_id: string
          revoked_at: string | null
          revoked_by: string | null
          role: Database["public"]["Enums"]["governance_role_enum"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "governance_users"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_active_membership: {
        Args: { allowed_roles?: string[]; target_establishment_id: string }
        Returns: boolean
      }
      has_organization_role: {
        Args: { allowed_roles?: string[]; target_organization_id: string }
        Returns: boolean
      }
      immutable_array_to_string: {
        Args: { arr: string[]; sep: string }
        Returns: string
      }
      import_support_public_message: {
        Args: {
          message_body: string
          target_author_jira_account_id: string
          target_author_name: string
          target_created_at: string
          target_jsm_comment_id: string
          target_ticket_id: string
        }
        Returns: Json
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
      invite_organization_member: {
        Args: {
          invited_email: string
          target_organization_id: string
          target_role: string
        }
        Returns: {
          expires_at: string
          invitation_id: string
          invitation_token: string
        }[]
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
      issue_manual_billing_invoice: {
        Args: { target_due_date: string; target_subscription_id: string }
        Returns: string
      }
      list_client_discovery_establishments: {
        Args: { result_limit?: number; target_query?: string }
        Returns: {
          address: string
          average_price: number
          average_rating: number
          banner_url: string
          currency: string
          description: string
          id: string
          instant_booking_enabled: boolean
          logo_url: string
          name: string
          opening_hours: string
          price_level: number
          primary_color: string
          professional_count: number
          professional_names: string[]
          review_count: number
          service_count: number
          service_names: string[]
          slogan: string
          slug: string
          timezone: string
        }[]
      }
      list_control_billing_accounts: {
        Args: never
        Returns: {
          active_units: number
          billing_account_id: string
          current_period_end: string
          enforcement_enabled: boolean
          organization_id: string
          organization_name: string
          plan_code: string
          subscription_id: string
          subscription_status: string
        }[]
      }
      list_control_billing_cutovers: {
        Args: never
        Returns: {
          cutover_at: string
          cutover_request_id: string
          organization_id: string
          organization_name: string
          organization_subscription_id: string
          status: string
          unit_count: number
        }[]
      }
      list_control_users: {
        Args: never
        Returns: {
          email: string
          expires_at: string
          granted_at: string
          is_active: boolean
          name: string
          profile_id: string
          revoked_at: string
          role: Database["public"]["Enums"]["governance_role_enum"]
        }[]
      }
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
      list_governance_audit_events: {
        Args: {
          action_filter?: string
          date_from?: string
          date_to?: string
          page_offset?: number
          page_size?: number
          search_term?: string
        }
        Returns: {
          action: string
          actor_name: string
          changes: Json
          client_ip: string
          created_at: string
          id: number
          target_id: string
          target_name: string
          target_type: string
          total_count: number
        }[]
      }
      list_governance_establishment_requests: {
        Args: {
          page_offset?: number
          page_size?: number
          search_term?: string
          status_filter?: string
        }
        Returns: {
          address: string
          created_at: string
          document_number: string
          establishment_id: string
          id: string
          name: string
          phone: string
          rejection_reason: string
          requester_email: string
          requester_id: string
          requester_name: string
          reviewed_at: string
          slug: string
          status: string
          total_count: number
        }[]
      }
      list_governance_establishments: {
        Args: {
          page_offset?: number
          page_size?: number
          search_term?: string
          status_filter?: string
        }
        Returns: {
          account_status: string
          address: string
          document_number: string
          document_type: string
          email_verified: boolean
          id: string
          kyc_status: string
          name: string
          recent_status_changed_at: string
          slug: string
          total_count: number
          verification_level: number
          whatsapp_verified: boolean
        }[]
      }
      list_governance_invitations: {
        Args: { status_filter?: string }
        Returns: {
          created_at: string
          establishment_id: string
          establishment_name: string
          expires_at: string
          id: string
          invited_email: string
          role: string
          status: string
        }[]
      }
      list_governance_memberships: {
        Args: { status_filter?: string }
        Returns: {
          created_at: string
          establishment_id: string
          establishment_name: string
          id: string
          profile_email: string
          profile_id: string
          profile_name: string
          revoked_at: string
          role: string
          status: string
        }[]
      }
      list_governance_privacy_requests: {
        Args: { status_filter?: string }
        Returns: {
          created_at: string
          decided_at: string
          decided_by: string
          decision_reason: string
          executed_at: string
          id: string
          request_reason: string
          requested_by: string
          status: string
          target_name: string
          target_profile_id: string
          updated_at: string
        }[]
      }
      list_governance_users: {
        Args: never
        Returns: {
          email: string
          granted_at: string
          name: string
          profile_id: string
          role: Database["public"]["Enums"]["governance_role_enum"]
          updated_at: string
        }[]
      }
      list_governance_verification_reviews: {
        Args: { status_filter?: string; target_establishment_id?: string }
        Returns: {
          created_at: string
          decision: string
          document_path: string
          establishment_id: string
          establishment_name: string
          id: string
          previous_status: string
          reason: string
          reviewer_id: string
        }[]
      }
      list_identity_migration_conflicts: {
        Args: never
        Returns: {
          conflict_id: string
          created_at: string
          document_type: string
          legacy_record_id: string
          legacy_source: string
          legal_entity_id: string
          masked_document: string
          organization_id: string
          reason_code: string
          requester_profile_id: string
          status: string
        }[]
      }
      list_my_support_tickets: { Args: never; Returns: Json }
      list_public_discovery_establishments: {
        Args: { result_limit?: number }
        Returns: {
          address: string
          average_rating: number
          banner_url: string
          currency: string
          description: string
          discovery_status: string
          id: string
          logo_url: string
          name: string
          opening_hours: string
          published_at: string
          review_count: number
          services: Json
          slug: string
          timezone: string
        }[]
      }
      list_support_tickets_for_reconciliation: {
        Args: { target_limit?: number }
        Returns: {
          jsm_issue_id: string
          jsm_issue_key: string
          last_reconciled_at: string
          provider_updated_at: string
          ticket_id: string
        }[]
      }
      moderate_governance_kb_topic: {
        Args: { requested_action: string; target_topic_id: string }
        Returns: undefined
      }
      normalize_brazil_phone_e164: {
        Args: { input_phone: string }
        Returns: string
      }
      publish_establishment_discovery: {
        Args: { target_establishment_id: string }
        Returns: {
          discovery_status: string
          published_at: string
          requirements: Json
        }[]
      }
      purge_expired_support_content: {
        Args: { target_limit?: number; target_now?: string }
        Returns: number
      }
      purge_support_profile_content: {
        Args: { target_profile_id: string }
        Returns: number
      }
      queue_due_client_appointment_reminders: {
        Args: { target_now?: string }
        Returns: number
      }
      queue_support_ticket_sync_internal: {
        Args: { actor_profile_id: string; target_ticket_id: string }
        Returns: Json
      }
      register_business_identity_atomic: {
        Args: {
          actor_profile_id: string
          encrypted_document_value: string
          encryption_iv_value: string
          encryption_key_version_value: string
          requested_address: string
          requested_name: string
          requested_phone: string
          requested_primary_color: string
          requested_slug: string
          target_document_fingerprint: string
          target_document_last4: string
          target_document_type: string
        }
        Returns: {
          establishment_id: string
          organization_id: string
          result_status: string
        }[]
      }
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
      reject_governance_establishment_request: {
        Args: { reason: string; target_request_id: string }
        Returns: undefined
      }
      reject_governance_privacy_request: {
        Args: { reason: string; request_id: string }
        Returns: Json
      }
      remove_organization_establishment: {
        Args: {
          target_establishment_id: string
          target_organization_id: string
        }
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
      reprocess_support_sync: {
        Args: { reason: string; target_ticket_id: string }
        Returns: Json
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
      require_aal2: { Args: never; Returns: undefined }
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
      resolve_business_billing_context: {
        Args: { target_establishment_id: string }
        Returns: {
          access_mode: string
          billing_account_id: string
          billing_owner_profile_id: string
          billing_scope: string
          billing_status: string
          cancel_at_period_end: boolean
          covered_establishment_ids: string[]
          current_period_ends_at: string
          enforcement_enabled: boolean
          entitlements: Json
          grace_ends_at: string
          organization_id: string
          pending_change_at: string
          subscription_id: string
          trial_ends_at: string
        }[]
      }
      resolve_identity_migration_conflict: {
        Args: {
          actor_profile_id: string
          target_action: string
          target_conflict_id: string
          target_reason: string
        }
        Returns: string
      }
      restore_governance_kb_revision: {
        Args: { requested_change_summary: string; target_revision_id: number }
        Returns: undefined
      }
      review_governance_verification: {
        Args: {
          reason: string
          target_decision: string
          target_review_id: string
        }
        Returns: Json
      }
      revoke_control_user_access: {
        Args: { reason: string; target_profile_id: string }
        Returns: Json
      }
      revoke_governance_invitation: {
        Args: { reason: string; target_invitation_id: string }
        Returns: undefined
      }
      revoke_governance_membership: {
        Args: { reason: string; target_membership_id: string }
        Returns: undefined
      }
      revoke_governance_role: {
        Args: { reason: string; target_profile_id: string }
        Returns: undefined
      }
      revoke_invitation: {
        Args: { reason: string; target_invitation_id: string }
        Returns: undefined
      }
      revoke_organization_member: {
        Args: { target_organization_id: string; target_profile_id: string }
        Returns: undefined
      }
      schedule_organization_billing_cutover: {
        Args: {
          target_establishment_ids?: string[]
          target_organization_id: string
        }
        Returns: string
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
      set_control_subscription_enforcement: {
        Args: {
          enabled: boolean
          reason: string
          target_subscription_id: string
        }
        Returns: undefined
      }
      set_control_subscription_status: {
        Args: {
          reason: string
          target_status: string
          target_subscription_id: string
        }
        Returns: undefined
      }
      set_control_support_runtime: {
        Args: {
          reason: string
          target_allow_new_tickets: boolean
          target_enabled: boolean
          target_maintenance_message: string
          target_sync_enabled: boolean
        }
        Returns: Json
      }
      set_control_user_access: {
        Args: {
          reason: string
          target_expires_at: string
          target_profile_id: string
          target_role: Database["public"]["Enums"]["governance_role_enum"]
        }
        Returns: Json
      }
      submit_client_account_deletion_request: {
        Args: never
        Returns: {
          created_at: string
          id: string
          status: string
          updated_at: string
        }[]
      }
      submit_governance_privacy_request: {
        Args: { reason: string; target_profile_id: string }
        Returns: {
          attempt_count: number
          auth_deleted_at: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          executed_at: string | null
          id: string
          last_error_code: string | null
          processing_started_at: string | null
          profile_anonymized_at: string | null
          request_reason: string
          requested_by: string
          status: string
          target_profile_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "governance_privacy_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_governance_verification: {
        Args: {
          document_path: string
          reason: string
          target_establishment_id: string
        }
        Returns: Json
      }
      support_add_business_minutes: {
        Args: { target_at: string; target_minutes: number }
        Returns: string
      }
      support_control_operator_context: {
        Args: { allow_owner_without_membership?: boolean }
        Returns: Json
      }
      support_first_response_due_at: {
        Args: { target_created_at: string; target_priority: string }
        Returns: string
      }
      support_is_business_day: {
        Args: { target_date: string }
        Returns: boolean
      }
      support_message_payload: {
        Args: { target_message_id: string }
        Returns: Json
      }
      support_public_message_payload: {
        Args: { target_message_id: string }
        Returns: Json
      }
      support_public_ticket_payload: {
        Args: { target_ticket_id: string }
        Returns: Json
      }
      support_ticket_payload: {
        Args: { target_ticket_id: string }
        Returns: Json
      }
      switch_active_establishment: {
        Args: { target_establishment_id: string }
        Returns: string
      }
      text_array_has_duplicates: {
        Args: { target_values: string[] }
        Returns: boolean
      }
      transfer_organization_ownership: {
        Args: { target_organization_id: string; target_profile_id: string }
        Returns: undefined
      }
      unpublish_establishment_discovery: {
        Args: { target_establishment_id: string }
        Returns: {
          discovery_status: string
          published_at: string
          requirements: Json
        }[]
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
      update_appointment_status_v2: {
        Args: {
          new_cancellation_note_internal?: string
          new_cancellation_reason_code?: string
          new_status: string
          target_appointment_id: string
        }
        Returns: string
      }
      update_governance_establishment_status: {
        Args: {
          target_establishment_id: string
          target_reason: string
          target_status: string
        }
        Returns: Json
      }
      update_my_client_avatar: {
        Args: { target_avatar_url: string | null }
        Returns: {
          avatar_url: string
          email: string
          id: string
          lgpd_marketing_accepted: boolean
          name: string
          notification_channels: string[]
          phone: string
        }[]
      }
      update_my_client_preferences: {
        Args: {
          target_lgpd_marketing_accepted: boolean
          target_notification_channels: string[]
        }
        Returns: {
          avatar_url: string
          email: string
          id: string
          lgpd_marketing_accepted: boolean
          name: string
          notification_channels: string[]
          phone: string
        }[]
      }
      update_my_client_profile: {
        Args: { target_name: string; target_phone: string }
        Returns: {
          avatar_url: string
          email: string
          id: string
          lgpd_marketing_accepted: boolean
          name: string
          notification_channels: string[]
          phone: string
        }[]
      }
      update_organization_member_role: {
        Args: {
          target_organization_id: string
          target_profile_id: string
          target_role: string
        }
        Returns: undefined
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
