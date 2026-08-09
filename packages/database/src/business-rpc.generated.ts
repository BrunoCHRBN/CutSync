/**
 * Temporary Business RPC contract surface.
 *
 * Maintains pending/homologation-lagging RPCs until the linked Supabase schema
 * is applied and `supabase.generated.ts` can be regenerated. Includes the
 * `financial_ops_enabled` field from
 * `20260814000000_financial_ops_foundation` — regenerate the monorepo-wide
 * generated types after that migration is homologated.
 *
 * Keep this scoped surface in sync with the RPC definitions consumed by
 * CutSync Business.
 */
export interface BusinessRpcFunctions {
  list_business_decision_queue: {
    Args: { target_establishment_id: string };
    Returns: unknown;
  };
  get_business_reassignment_detail: {
    Args: {
      target_establishment_id: string;
      target_reassignment_request_id: string;
    };
    Returns: unknown;
  };
  list_business_reassignment_candidates: {
    Args: {
      target_establishment_id: string;
      target_reassignment_request_id: string;
    };
    Returns: unknown;
  };
  request_appointment_reassignment: {
    Args: {
      target_appointment_id: string;
      target_reason_code: string;
      target_responsibility: string;
      target_due_at: string;
      target_expected_appointment_updated_at: string;
      target_request_id: string;
      target_correlation_id: string;
    };
    Returns: unknown;
  };
  validate_appointment_reassignment: {
    Args: {
      target_reassignment_request_id: string;
      target_expected_version: number;
      target_request_id: string;
    };
    Returns: unknown;
  };
  propose_appointment_reassignment: {
    Args: {
      target_reassignment_request_id: string;
      target_proposed_professional_id: string;
      target_expected_version: number;
      target_request_id: string;
    };
    Returns: unknown;
  };
  decide_appointment_reassignment: {
    Args: {
      target_reassignment_request_id: string;
      target_decision: string;
      target_chosen_professional_id: string | null;
      target_channel: string;
      target_reason: string | null;
      target_expected_version: number;
      target_request_id: string;
    };
    Returns: unknown;
  };
  apply_appointment_reassignment: {
    Args: {
      target_reassignment_request_id: string;
      target_expected_version: number;
      target_request_id: string;
    };
    Returns: unknown;
  };
  withdraw_appointment_reassignment: {
    Args: {
      target_reassignment_request_id: string;
      target_expected_version: number;
      target_reason: string;
      target_request_id: string;
    };
    Returns: unknown;
  };
  expire_appointment_reassignment: {
    Args: {
      target_reassignment_request_id: string;
      target_expected_version: number;
      target_request_id: string;
    };
    Returns: unknown;
  };
  request_appointment_assignment_correction_approval: {
    Args: {
      target_appointment_id: string;
      target_proposed_professional_id: string;
      target_reason: string;
      target_request_id: string;
    };
    Returns: unknown;
  };
  decide_appointment_assignment_correction_approval: {
    Args: {
      target_approval_request_id: string;
      target_expected_version: number;
      target_decision: 'approved' | 'rejected';
      target_reason: string;
      target_request_id: string;
    };
    Returns: unknown;
  };
  correct_appointment_assignment: {
    Args: {
      target_appointment_id: string;
      target_proposed_professional_id: string;
      target_approval_request_id: string;
      target_expected_appointment_updated_at: string;
      target_reason: string;
      target_request_id: string;
      target_correlation_id: string;
    };
    Returns: unknown;
  };
  reconcile_appointment_assignment_shadow: {
    Args: {
      target_establishment_id: string;
      target_request_id: string;
    };
    Returns: unknown;
  };
  get_my_authorized_contexts: {
    Args: { target_app_id: string };
    Returns: unknown[];
  };
  set_my_active_context: {
    Args: {
      target_app_id: string;
      target_context_kind: string;
      target_establishment_id: string | null;
      target_organization_id: string | null;
      target_request_id: string;
    };
    Returns: unknown;
  };
  get_my_onboarding_progress: {
    Args: {
      target_app_id: string;
      target_intent?: string | null;
    };
    Returns: unknown[];
  };
  set_my_onboarding_progress: {
    Args: {
      target_app_id: string;
      target_intent: string;
      target_context_kind: string;
      target_establishment_id: string | null;
      target_organization_id: string | null;
      target_current_step: string;
      target_status: string;
      target_expected_version: number;
      target_request_id: string;
    };
    Returns: unknown;
  };
  request_capability_override_approval: {
    Args: {
      target_establishment_id: string;
      target_membership_id: string;
      target_capability: string;
      target_effect: string;
      target_justification: string;
      target_request_id: string;
    };
    Returns: unknown;
  };
  decide_capability_override_approval: {
    Args: {
      target_approval_request_id: string;
      target_expected_version: number;
      target_decision: string;
      target_reason: string;
      target_request_id: string;
    };
    Returns: unknown;
  };
  apply_membership_capability_override: {
    Args: {
      target_approval_request_id: string;
      target_expected_approval_version: number;
      target_valid_until?: string | null;
      target_request_id: string;
    };
    Returns: unknown;
  };
  request_capability_override_revocation: {
    Args: {
      target_override_id: string;
      target_justification: string;
      target_request_id: string;
    };
    Returns: unknown;
  };
  revoke_membership_capability_override: {
    Args: {
      target_approval_request_id: string;
      target_expected_approval_version: number;
      target_request_id: string;
    };
    Returns: unknown;
  };
  get_establishment_readiness: {
    Args: { target_establishment_id: string };
    Returns: unknown;
  };
  set_establishment_lifecycle_status: {
    Args: {
      target_establishment_id: string;
      target_lifecycle_status: string;
      target_expected_version: number;
      target_reason: string;
      target_request_id: string;
    };
    Returns: unknown;
  };
  accept_invitation: {
    Args: { invitation_token: string };
    Returns: {
      accepted_establishment_id: string;
      accepted_role: string;
    }[];
  };
  get_business_agenda_day: {
    Args: {
      target_establishment_id: string;
      target_local_date: string;
      target_scope: string;
    };
    Returns: {
      appointment_id: string;
      appointment_status: string;
      client_display_name: string;
      ends_at: string;
      establishment_id: string;
      professional_id: string;
      professional_name: string;
      service_id: string;
      service_name: string;
      starts_at: string;
    }[];
  };
  get_my_business_operational_contexts: {
    Args: never;
    Returns: {
      access_mode: string;
      billing_account_id: string;
      billing_owner: boolean;
      billing_scope: string;
      billing_status: string;
      capabilities: string[];
      covered_establishment_ids: string[];
      current_period_ends_at: string;
      establishment_id: string;
      establishment_name: string;
      establishment_slug: string;
      financial_ops_enabled: boolean;
      grace_ends_at: string;
      membership_id: string;
      membership_role: string;
      membership_status: string;
      operational_role: string;
      organization_id: string;
      payer_role: string;
      pending_change_at: string;
      subscription_id: string;
      timezone: string;
      trial_ends_at: string;
    }[];
  };
  inspect_invitation: {
    Args: { invitation_token: string };
    Returns: {
      establishment_name: string;
      expiration: string;
      invitation_status: string;
      invited_email: string;
      invited_role: string;
    }[];
  };
  inspect_business_invitation_token: {
    Args: { target_invitation_token: string };
    Returns: {
      establishment_name: string;
      expiration: string;
      invitation_status: string;
      invited_contact: string;
      invited_role: string;
    }[];
  };
  accept_business_invitation_token: {
    Args: { target_invitation_token: string; target_request_id: string };
    Returns: {
      accepted_establishment_id: string;
      accepted_role: string;
    }[];
  };
  get_mobile_release_policy: {
    Args: { target_app_kind: string; target_platform: string; target_app_version: string };
    Returns: {
      app_kind: string;
      enforcement_enabled: boolean;
      latest_version: string;
      message: string | null;
      minimum_supported_version: string;
      platform: string;
      store_url: string | null;
      update_required: boolean;
    }[];
  };
  get_available_slots: {
    Args: {
      target_appointment_id?: string;
      target_establishment_id: string;
      target_local_date: string;
      target_professional_id: string;
      target_service_id: string;
    };
    Returns: {
      available: boolean;
      duration_minutes: number;
      local_time: string;
      starts_at: string;
      unavailable_reason: string | null;
    }[];
  };
  get_business_appointment_detail: {
    Args: { target_establishment_id: string; target_appointment_id: string };
    Returns: unknown;
  };
  confirm_business_appointment: {
    Args: { target_establishment_id: string; target_appointment_id: string; target_request_id: string };
    Returns: unknown;
  };
  complete_business_appointment: {
    Args: { target_establishment_id: string; target_appointment_id: string; target_request_id: string };
    Returns: unknown;
  };
  cancel_business_appointment: {
    Args: { target_establishment_id: string; target_appointment_id: string; target_request_id: string; target_reason?: string | null };
    Returns: unknown;
  };
  mark_business_appointment_no_show: {
    Args: { target_establishment_id: string; target_appointment_id: string; target_request_id: string };
    Returns: unknown;
  };
  reschedule_business_appointment: {
    Args: {
      target_establishment_id: string;
      target_appointment_id: string;
      target_date_time: string;
      target_professional_id: string;
      target_service_id: string;
      target_request_id: string;
    };
    Returns: unknown;
  };
  create_business_appointment: {
    Args: {
      target_establishment_id: string;
      target_professional_id: string;
      target_service_id: string;
      target_date_time: string;
      target_request_id: string;
      target_establishment_client_id?: string | null;
      target_client_name?: string | null;
      target_client_phone?: string | null;
      target_client_email?: string | null;
      target_notes?: string | null;
    };
    Returns: unknown;
  };
  get_business_schedule_blocks: {
    Args: {
      target_establishment_id: string;
      target_range_start: string;
      target_range_end: string;
      target_professional_id?: string | null;
    };
    Returns: unknown;
  };
  create_business_schedule_block: {
    Args: {
      target_establishment_id: string;
      target_professional_id: string;
      target_starts_at: string;
      target_ends_at: string;
      target_kind: string;
      target_request_id: string;
      target_reason?: string | null;
      target_all_day?: boolean;
      target_local_date?: string | null;
    };
    Returns: unknown;
  };
  update_business_schedule_block: {
    Args: {
      target_establishment_id: string;
      target_schedule_block_id: string;
      target_professional_id: string;
      target_starts_at: string;
      target_ends_at: string;
      target_kind: string;
      target_request_id: string;
      target_reason?: string | null;
      target_all_day?: boolean;
      target_local_date?: string | null;
    };
    Returns: unknown;
  };
  delete_business_schedule_block: {
    Args: { target_establishment_id: string; target_schedule_block_id: string; target_request_id: string };
    Returns: unknown;
  };
  search_establishment_clients: {
    Args: {
      target_establishment_id: string;
      target_query?: string | null;
      target_limit?: number;
      target_offset?: number;
      target_include_archived?: boolean;
    };
    Returns: unknown;
  };
  get_establishment_client: {
    Args: { target_establishment_id: string; target_establishment_client_id: string };
    Returns: unknown;
  };
  create_establishment_client: {
    Args: {
      target_establishment_id: string; target_name: string; target_request_id: string;
      target_phone?: string | null; target_email?: string | null; target_tags?: string[]; target_notes?: string | null;
    };
    Returns: unknown;
  };
  update_establishment_client: {
    Args: {
      target_establishment_id: string; target_establishment_client_id: string; target_request_id: string;
      target_name?: string | null; target_phone?: string | null; target_email?: string | null;
      target_tags?: string[] | null; target_notes?: string | null;
      target_marketing_consent_status?: string | null;
    };
    Returns: unknown;
  };
  archive_establishment_client: {
    Args: {
      target_establishment_id: string;
      target_establishment_client_id: string;
      target_request_id: string;
    };
    Returns: unknown;
  };
  restore_establishment_client: {
    Args: {
      target_establishment_id: string;
      target_establishment_client_id: string;
      target_request_id: string;
    };
    Returns: unknown;
  };
  merge_establishment_clients: {
    Args: {
      target_establishment_id: string; target_survivor_client_id: string;
      target_duplicate_client_id: string; target_request_id: string; target_reason?: string | null;
    };
    Returns: unknown;
  };
  get_my_establishment_client_link_requests: { Args: never; Returns: unknown };
  confirm_establishment_client_link: { Args: { target_link_id: string; target_request_id: string }; Returns: unknown };
  reject_establishment_client_link: { Args: { target_link_id: string; target_request_id: string }; Returns: unknown };
  get_business_services: { Args: { target_establishment_id: string }; Returns: unknown };
  create_business_service: {
    Args: { target_establishment_id: string; target_name: string; target_price: number; target_duration_minutes: number; target_request_id: string; target_sort_order?: number | null };
    Returns: unknown;
  };
  update_business_service: {
    Args: { target_establishment_id: string; target_service_id: string; target_request_id: string; target_name?: string | null; target_price?: number | null; target_duration_minutes?: number | null; target_sort_order?: number | null };
    Returns: unknown;
  };
  set_business_service_status: {
    Args: { target_establishment_id: string; target_service_id: string; target_is_active: boolean; target_request_id: string };
    Returns: unknown;
  };
  reorder_business_services: { Args: { target_establishment_id: string; target_service_ids: string[]; target_request_id: string }; Returns: unknown };
  upsert_business_professional_service: {
    Args: { target_establishment_id: string; target_professional_id: string; target_service_id: string; target_price: number; target_duration_minutes: number; target_is_active: boolean; target_request_id: string };
    Returns: unknown;
  };
  get_business_team: { Args: { target_establishment_id: string }; Returns: unknown };
  create_business_team_invite: { Args: { target_establishment_id: string; target_contact: string; target_role: string; target_request_id: string }; Returns: unknown };
  resend_business_team_invite: { Args: { target_establishment_id: string; target_invitation_id: string; target_request_id: string }; Returns: unknown };
  revoke_business_team_invite: { Args: { target_establishment_id: string; target_invitation_id: string; target_request_id: string }; Returns: unknown };
  accept_business_team_invite: { Args: { target_invitation_id: string; target_request_id: string }; Returns: unknown };
  get_my_business_team_invitation: { Args: { target_invitation_id: string }; Returns: unknown };
  suspend_business_team_member: { Args: { target_establishment_id: string; target_membership_id: string; target_request_id: string }; Returns: unknown };
  reactivate_business_team_member: { Args: { target_establishment_id: string; target_membership_id: string; target_request_id: string }; Returns: unknown };
  remove_business_team_member: { Args: { target_establishment_id: string; target_membership_id: string; target_request_id: string }; Returns: unknown };
  update_business_team_commission: { Args: { target_establishment_id: string; target_membership_id: string; target_commission_rate: number; target_request_id: string }; Returns: unknown };
  open_service_order: {
    Args: {
      target_establishment_id: string;
      target_request_id: string;
      target_appointment_id?: string | null;
      target_professional_id?: string | null;
      target_establishment_client_id?: string | null;
      target_internal_notes?: string | null;
    };
    Returns: unknown;
  };
  start_service_order: {
    Args: {
      target_establishment_id: string;
      target_service_order_id: string;
      target_expected_version: number;
      target_request_id: string;
    };
    Returns: unknown;
  };
  upsert_service_order_item: {
    Args: {
      target_establishment_id: string;
      target_service_order_id: string;
      target_expected_version: number;
      target_request_id: string;
      target_item_id?: string | null;
      target_service_id?: string | null;
      target_professional_id?: string | null;
      target_description_snapshot?: string | null;
      target_quantity?: number;
      target_discount_cents?: number;
      target_custom_unit_price_cents?: number | null;
    };
    Returns: unknown;
  };
  remove_service_order_item: {
    Args: {
      target_establishment_id: string;
      target_service_order_id: string;
      target_service_order_item_id: string;
      target_expected_version: number;
      target_request_id: string;
    };
    Returns: unknown;
  };
  finish_service_order: {
    Args: {
      target_establishment_id: string;
      target_service_order_id: string;
      target_expected_version: number;
      target_request_id: string;
    };
    Returns: unknown;
  };
  close_service_order: {
    Args: {
      target_establishment_id: string;
      target_service_order_id: string;
      target_expected_version: number;
      target_request_id: string;
    };
    Returns: unknown;
  };
  void_service_order: {
    Args: {
      target_establishment_id: string;
      target_service_order_id: string;
      target_expected_version: number;
      target_reason: string;
      target_request_id: string;
    };
    Returns: unknown;
  };
  reopen_voided_service_order: {
    Args: {
      target_establishment_id: string;
      target_service_order_id: string;
      target_expected_version: number;
      target_reason: string;
      target_request_id: string;
    };
    Returns: unknown;
  };
  get_service_order: {
    Args: { target_establishment_id: string; target_service_order_id: string };
    Returns: unknown;
  };
  get_service_order_for_appointment: {
    Args: {
      target_establishment_id: string;
      target_appointment_id: string;
    };
    Returns: unknown;
  };
  list_service_orders_for_day: {
    Args: {
      target_establishment_id: string;
      target_local_date: string;
      target_scope?: string;
    };
    Returns: unknown;
  };
}

export type BusinessRpcName = keyof BusinessRpcFunctions;
export type BusinessRpcArgs<Name extends BusinessRpcName> =
  BusinessRpcFunctions[Name]['Args'];
export type BusinessRpcReturns<Name extends BusinessRpcName> =
  BusinessRpcFunctions[Name]['Returns'];
export type BusinessRpcRow<Name extends BusinessRpcName> =
  BusinessRpcReturns<Name> extends readonly (infer Row)[] ? Row : BusinessRpcReturns<Name>;
