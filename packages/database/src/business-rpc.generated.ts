/**
 * Generated from the linked Supabase public schema after
 * 20260801000000_business_operational_access.
 *
 * Keep this scoped surface in sync with the RPC definitions consumed by
 * CutSync Business. The monorepo-wide generated file is regenerated
 * independently because it is shared by concurrent product work.
 */
export interface BusinessRpcFunctions {
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
}

export type BusinessRpcName = keyof BusinessRpcFunctions;
export type BusinessRpcArgs<Name extends BusinessRpcName> =
  BusinessRpcFunctions[Name]['Args'];
export type BusinessRpcReturns<Name extends BusinessRpcName> =
  BusinessRpcFunctions[Name]['Returns'];
export type BusinessRpcRow<Name extends BusinessRpcName> =
  BusinessRpcReturns<Name>[number];
