export const BUSINESS_CAPABILITIES = [
  'view_own_agenda',
  'view_team_agenda',
  'create_self_walk_in',
  'create_team_walk_in',
  'manage_own_blocks',
  'manage_team_blocks',
  'view_services',
  'manage_services',
  'manage_team',
  'manage_admins',
  'view_own_commission',
  'view_unit_reports',
  'manage_operational_settings',
  'view_clients',
  'manage_clients',
  'export_clients',
  'manage_data_imports',
] as const;

export type BusinessOperationalRole = 'owner' | 'admin' | 'professional';
export type BusinessAccessMode = 'full' | 'read_only' | 'blocked';
export type BusinessCapability = (typeof BUSINESS_CAPABILITIES)[number];
export type BusinessMembershipRole = 'admin' | 'professional';
export type BusinessAgendaScope = 'own' | 'team';
export type BusinessAgendaStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
export type BusinessBillingScope = 'establishment' | 'organization';
export type BusinessPayerRole = 'owner' | 'finance' | 'billing_owner';
export type BusinessInvitationRole = 'admin' | 'professional';
export type BusinessInvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface BusinessOperationalContext {
  membershipId: string;
  membershipRole: BusinessMembershipRole;
  membershipStatus: 'active';
  establishmentId: string;
  establishmentName: string;
  establishmentSlug: string;
  timezone: string;
  operationalRole: BusinessOperationalRole;
  accessMode: BusinessAccessMode;
  capabilities: BusinessCapability[];
  billingOwner: boolean;
  billingStatus: string;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  billingScope: BusinessBillingScope | null;
  billingAccountId: string | null;
  subscriptionId: string | null;
  organizationId: string | null;
  coveredEstablishmentIds: string[];
  payerRole: BusinessPayerRole | null;
  pendingChangeAt: string | null;
}

export interface BusinessAgendaItem {
  id: string;
  establishmentId: string;
  professionalId: string;
  professionalName: string;
  serviceId: string;
  serviceName: string;
  clientDisplayName: string;
  startsAt: string;
  endsAt: string;
  status: BusinessAgendaStatus;
}

export interface BusinessInvitationDetails {
  establishmentName: string;
  invitedEmail: string;
  invitedRole: BusinessInvitationRole;
  status: BusinessInvitationStatus;
  expiresAt: string;
}

export interface BusinessInvitationAcceptance {
  establishmentId: string;
  role: BusinessInvitationRole;
}

type UnknownRecord = Record<string, unknown>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROLE_CAPABILITIES: Record<BusinessOperationalRole, ReadonlySet<BusinessCapability>> = {
  owner: new Set(BUSINESS_CAPABILITIES),
  admin: new Set(BUSINESS_CAPABILITIES.filter((capability) => capability !== 'manage_admins')),
  professional: new Set([
    'view_own_agenda',
    'view_team_agenda',
    'create_self_walk_in',
    'manage_own_blocks',
    'view_services',
    'view_own_commission',
  ]),
};

const READ_ONLY_CAPABILITIES = new Set<BusinessCapability>([
  'view_own_agenda',
  'view_team_agenda',
  'view_services',
  'view_own_commission',
  'view_unit_reports',
]);

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const asRequiredString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const asIdentifier = (value: unknown): string | null => {
  const identifier = asRequiredString(value);
  return identifier && UUID_PATTERN.test(identifier) ? identifier : null;
};

const asNullableIdentifier = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  return asIdentifier(value) ?? undefined;
};

const asNullableTimestamp = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  const timestamp = asRequiredString(value);
  return timestamp && Number.isFinite(Date.parse(timestamp)) ? timestamp : undefined;
};

const asTimestamp = (value: unknown): string | null => {
  const timestamp = asRequiredString(value);
  return timestamp && Number.isFinite(Date.parse(timestamp)) ? timestamp : null;
};

const asOperationalRole = (value: unknown): BusinessOperationalRole | null => (
  value === 'owner' || value === 'admin' || value === 'professional' ? value : null
);

const asMembershipRole = (value: unknown): BusinessMembershipRole | null => (
  value === 'admin' || value === 'professional' ? value : null
);

const asAccessMode = (value: unknown): BusinessAccessMode | null => (
  value === 'full' || value === 'read_only' || value === 'blocked' ? value : null
);

const asBillingScope = (value: unknown): BusinessBillingScope | null | undefined => {
  if (value === null) return null;
  return value === 'establishment' || value === 'organization' ? value : undefined;
};

const asPayerRole = (value: unknown): BusinessPayerRole | null | undefined => {
  if (value === null) return null;
  return value === 'owner' || value === 'finance' || value === 'billing_owner'
    ? value
    : undefined;
};

const asAgendaStatus = (value: unknown): BusinessAgendaStatus | null => (
  value === 'pending'
  || value === 'confirmed'
  || value === 'cancelled'
  || value === 'completed'
  || value === 'no_show'
    ? value
    : null
);

const asInvitationRole = (value: unknown): BusinessInvitationRole | null => (
  value === 'admin' || value === 'professional' ? value : null
);

const asInvitationStatus = (value: unknown): BusinessInvitationStatus | null => (
  value === 'pending' || value === 'accepted' || value === 'revoked' || value === 'expired'
    ? value
    : null
);

const asIdentifierArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null;
  const identifiers = value.map(asIdentifier);
  if (identifiers.some((identifier) => identifier === null)) return null;
  return [...new Set(identifiers as string[])];
};

export const filterBusinessCapabilities = (
  value: unknown,
  role: BusinessOperationalRole,
  accessMode: BusinessAccessMode,
): BusinessCapability[] => {
  if (!Array.isArray(value) || accessMode === 'blocked') return [];

  const requested = new Set(
    value.filter((capability): capability is string => typeof capability === 'string'),
  );
  const roleCapabilities = ROLE_CAPABILITIES[role];

  return BUSINESS_CAPABILITIES.filter((capability) => (
    requested.has(capability)
    && roleCapabilities.has(capability)
    && (accessMode === 'full' || READ_ONLY_CAPABILITIES.has(capability))
  ));
};

export const mapBusinessOperationalContext = (
  value: unknown,
): BusinessOperationalContext | null => {
  if (!isRecord(value)) return null;

  const membershipId = asIdentifier(value.membership_id);
  const membershipRole = asMembershipRole(value.membership_role);
  const establishmentId = asIdentifier(value.establishment_id);
  const establishmentName = asRequiredString(value.establishment_name);
  const establishmentSlug = asRequiredString(value.establishment_slug);
  const timezone = asRequiredString(value.timezone);
  const operationalRole = asOperationalRole(value.operational_role);
  const accessMode = asAccessMode(value.access_mode);
  const billingStatus = asRequiredString(value.billing_status);
  const trialEndsAt = asNullableTimestamp(value.trial_ends_at);
  const graceEndsAt = asNullableTimestamp(value.grace_ends_at);
  const currentPeriodEndsAt = asNullableTimestamp(value.current_period_ends_at);
  const billingScope = asBillingScope(value.billing_scope);
  const billingAccountId = asNullableIdentifier(value.billing_account_id);
  const subscriptionId = asNullableIdentifier(value.subscription_id);
  const organizationId = asNullableIdentifier(value.organization_id);
  const coveredEstablishmentIds = asIdentifierArray(value.covered_establishment_ids);
  const payerRole = asPayerRole(value.payer_role);
  const pendingChangeAt = asNullableTimestamp(value.pending_change_at);

  if (
    !membershipId
    || !membershipRole
    || value.membership_status !== 'active'
    || !establishmentId
    || !establishmentName
    || !establishmentSlug
    || !timezone
    || !operationalRole
    || !accessMode
    || typeof value.billing_owner !== 'boolean'
    || !billingStatus
    || trialEndsAt === undefined
    || graceEndsAt === undefined
    || currentPeriodEndsAt === undefined
    || billingScope === undefined
    || billingAccountId === undefined
    || subscriptionId === undefined
    || organizationId === undefined
    || !coveredEstablishmentIds
    || payerRole === undefined
    || pendingChangeAt === undefined
  ) {
    return null;
  }

  const roleMatchesMembership = membershipRole === 'professional'
    ? operationalRole === 'professional'
    : operationalRole === 'owner' || operationalRole === 'admin';
  const billingIsResolvedForAccess = accessMode === 'blocked'
    || (billingScope !== null && billingAccountId !== null);
  if (!roleMatchesMembership || !billingIsResolvedForAccess) return null;

  return {
    membershipId,
    membershipRole,
    membershipStatus: 'active',
    establishmentId,
    establishmentName,
    establishmentSlug,
    timezone,
    operationalRole,
    accessMode,
    capabilities: filterBusinessCapabilities(value.capabilities, operationalRole, accessMode),
    billingOwner: value.billing_owner,
    billingStatus,
    trialEndsAt,
    graceEndsAt,
    currentPeriodEndsAt,
    billingScope,
    billingAccountId,
    subscriptionId,
    organizationId,
    coveredEstablishmentIds,
    payerRole,
    pendingChangeAt,
  };
};

export const mapBusinessAgendaItem = (value: unknown): BusinessAgendaItem | null => {
  if (!isRecord(value)) return null;

  const id = asRequiredString(value.appointment_id);
  const establishmentId = asIdentifier(value.establishment_id);
  const professionalId = asIdentifier(value.professional_id);
  const professionalName = asRequiredString(value.professional_name);
  const serviceId = asRequiredString(value.service_id);
  const serviceName = asRequiredString(value.service_name);
  const clientDisplayName = asRequiredString(value.client_display_name);
  const startsAt = asTimestamp(value.starts_at);
  const endsAt = asTimestamp(value.ends_at);
  const status = asAgendaStatus(value.appointment_status);

  if (
    !id
    || !establishmentId
    || !professionalId
    || !professionalName
    || !serviceId
    || !serviceName
    || !clientDisplayName
    || !startsAt
    || !endsAt
    || Date.parse(endsAt) <= Date.parse(startsAt)
    || !status
  ) {
    return null;
  }

  return {
    id,
    establishmentId,
    professionalId,
    professionalName,
    serviceId,
    serviceName,
    clientDisplayName,
    startsAt,
    endsAt,
    status,
  };
};

export const mapBusinessInvitationDetails = (
  value: unknown,
): BusinessInvitationDetails | null => {
  if (!isRecord(value)) return null;

  const establishmentName = asRequiredString(value.establishment_name);
  const invitedEmail = asRequiredString(value.invited_email);
  const invitedRole = asInvitationRole(value.invited_role);
  const status = asInvitationStatus(value.invitation_status);
  const expiresAt = asTimestamp(value.expiration);

  if (!establishmentName || !invitedEmail || !invitedRole || !status || !expiresAt) return null;

  return {
    establishmentName,
    invitedEmail,
    invitedRole,
    status,
    expiresAt,
  };
};

export const mapBusinessInvitationAcceptance = (
  value: unknown,
): BusinessInvitationAcceptance | null => {
  if (!isRecord(value)) return null;

  const establishmentId = asIdentifier(value.accepted_establishment_id);
  const role = asInvitationRole(value.accepted_role);
  return establishmentId && role ? { establishmentId, role } : null;
};
