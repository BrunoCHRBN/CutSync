import { OrganizationContext, OrganizationReport, OrganizationRole } from '@cutsync/database';
import { supabase } from './supabase';

export interface MyOrganization {
  organizationId: string;
  organizationName: string;
  organizationStatus: string;
  memberRole: OrganizationRole;
  scopeMode?: string;
  establishmentCount: number;
}

export interface OrganizationBillingContext {
  organization_id: string;
  billing_account_id: string;
  billing_owner_profile_id: string | null;
  viewer_role: OrganizationRole | null;
  subscription: {
    id: string;
    status: string;
    enforcement_enabled: boolean;
    current_period_start: string;
    current_period_end: string;
    grace_ends_at: string | null;
    cancel_at_period_end: boolean;
    provider: 'stripe' | 'google_play' | 'internal';
    has_external_customer: boolean;
    plan_code: string;
    plan_name: string;
  } | null;
  tiers: {
    unit_from: number;
    unit_to: number | null;
    unit_price_cents: number;
  }[];
  establishments: {
    establishment_id: string;
    name: string;
    coverage_scope: 'establishment' | 'organization' | null;
    coverage_status: 'active' | 'scheduled' | 'ended' | null;
    effective_from: string | null;
    effective_until: string | null;
  }[];
  cutover: {
    id: string;
    status: 'scheduled' | 'reconciling';
    cutover_at: string;
    establishment_ids: string[];
  } | null;
}

const rpc = async (name: string, args?: Record<string, unknown>): Promise<{
  data: unknown;
  error: { message: string } | null;
}> => {
  const result = await (supabase.rpc as any)(name, args);
  return { data: result.data, error: result.error };
};

const assertRpc = <T,>(result: { data: unknown; error: { message: string } | null }): T => {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
};

export const organizationService = {
  async listMine(): Promise<MyOrganization[]> {
    const data = assertRpc<Record<string, unknown>[]>(await rpc('get_my_organizations'));
    return (data ?? []).map((row) => ({
      organizationId: String(row.organization_id),
      organizationName: String(row.organization_name),
      organizationStatus: String(row.organization_status),
      memberRole: row.member_role as OrganizationRole,
      scopeMode: row.scope_mode ? String(row.scope_mode) : undefined,
      establishmentCount: Number(row.establishment_count ?? 0),
    }));
  },

  async getContext(organizationId: string): Promise<OrganizationContext> {
    return assertRpc<OrganizationContext>(await rpc('get_organization_context', {
      target_organization_id: organizationId,
    }));
  },

  async getReport(organizationId: string, rangeStart: string, rangeEnd: string): Promise<OrganizationReport> {
    return assertRpc<OrganizationReport>(await rpc('get_organization_report', {
      target_organization_id: organizationId,
      range_start: rangeStart,
      range_end: rangeEnd,
    }));
  },

  async getBillingContext(organizationId: string): Promise<OrganizationBillingContext> {
    return assertRpc<OrganizationBillingContext>(await rpc('get_organization_billing_context', {
      target_organization_id: organizationId,
    }));
  },

  async scheduleBillingCutover(organizationId: string, establishmentIds: string[]): Promise<string> {
    return assertRpc<string>(await rpc('schedule_organization_billing_cutover', {
      target_organization_id: organizationId,
      target_establishment_ids: establishmentIds,
    }));
  },

  async create(name: string, initialEstablishmentId: string): Promise<string> {
    return assertRpc<string>(await rpc('create_organization', {
      organization_name: name,
      initial_establishment_id: initialEstablishmentId,
    }));
  },

  async addEstablishment(organizationId: string, establishmentId: string): Promise<void> {
    assertRpc(await rpc('add_organization_establishment', {
      target_organization_id: organizationId,
      target_establishment_id: establishmentId,
    }));
  },

  async removeEstablishment(organizationId: string, establishmentId: string): Promise<void> {
    assertRpc(await rpc('remove_organization_establishment', {
      target_organization_id: organizationId,
      target_establishment_id: establishmentId,
    }));
  },

  async inviteMember(organizationId: string, email: string, role: Exclude<OrganizationRole, 'owner'>) {
    const rows = assertRpc<{ invitation_id: string; invitation_token: string; expires_at: string }[]>(
      await rpc('invite_organization_member', {
        target_organization_id: organizationId,
        invited_email: email,
        target_role: role,
      }),
    );
    return rows[0];
  },

  async inviteMemberV2(
    organizationId: string,
    email: string,
    role: Exclude<OrganizationRole, 'owner'>,
    scopeMode: 'all' | 'selected' = 'all',
    establishmentIds?: string[],
  ) {
    const rows = assertRpc<{ invitation_id: string; invitation_token: string; expires_at: string }[]>(
      await rpc('invite_organization_member_v2', {
        target_organization_id: organizationId,
        invited_email: email,
        target_role: role,
        target_scope_mode: scopeMode,
        target_establishment_ids: establishmentIds,
      }),
    );
    return rows[0];
  },

  async updateMemberRole(organizationId: string, profileId: string, role: Exclude<OrganizationRole, 'owner'>) {
    assertRpc(await rpc('update_organization_member_role', {
      target_organization_id: organizationId,
      target_profile_id: profileId,
      target_role: role,
    }));
  },

  async setMemberUnitScope(
    organizationId: string,
    profileId: string,
    scopeMode: 'all' | 'selected',
    establishmentIds?: string[],
  ): Promise<void> {
    assertRpc(await rpc('set_organization_member_unit_scope', {
      target_organization_id: organizationId,
      target_profile_id: profileId,
      target_scope_mode: scopeMode,
      target_establishment_ids: establishmentIds ?? [],
    }));
  },

  async transferOwnership(organizationId: string, profileId: string) {
    assertRpc(await rpc('transfer_organization_ownership', {
      target_organization_id: organizationId,
      target_profile_id: profileId,
    }));
  },

  async revokeMember(organizationId: string, profileId: string) {
    assertRpc(await rpc('revoke_organization_member', {
      target_organization_id: organizationId,
      target_profile_id: profileId,
    }));
  },
};
