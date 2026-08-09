import { BUSINESS_CAPABILITIES, type BusinessCapability } from './business';

export const CUTSYNC_APP_IDS = ['web', 'business', 'client', 'control'] as const;
export const AUTHORIZED_CONTEXT_KINDS = [
  'personal',
  'establishment',
  'organization',
] as const;
export const MEMBERSHIP_ROLE_TEMPLATES = [
  'admin',
  'professional',
  'reception',
  'cashier',
  'finance',
  'manager',
] as const;
export const ESTABLISHMENT_LIFECYCLE_STATUSES = [
  'draft',
  'configuring',
  'ready',
  'active',
  'paused',
  'closed',
  'archived',
] as const;
export const ONBOARDING_INTENTS = [
  'client_account',
  'establishment_request',
  'professional_profile',
  'establishment_operations',
  'payments',
  'fiscal',
] as const;
export const ONBOARDING_STATUSES = [
  'in_progress',
  'paused',
  'blocked',
  'completed',
  'abandoned',
] as const;
export const ONBOARDING_ALLOWED_ACTIONS = [
  'advance',
  'pause',
  'block',
  'complete',
  'abandon',
  'resume',
] as const;

export type CutSyncAppId = (typeof CUTSYNC_APP_IDS)[number];
export type AuthorizedContextKind = (typeof AUTHORIZED_CONTEXT_KINDS)[number];
export type MembershipRoleTemplate = (typeof MEMBERSHIP_ROLE_TEMPLATES)[number];
export type CapabilityOverrideEffect = 'grant' | 'deny';
export type EstablishmentLifecycleStatus =
  (typeof ESTABLISHMENT_LIFECYCLE_STATUSES)[number];
export type OnboardingIntent = (typeof ONBOARDING_INTENTS)[number];
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];
export type OnboardingAllowedAction = (typeof ONBOARDING_ALLOWED_ACTIONS)[number];
export type ApprovalRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'expired';

export interface CapabilityOverrideApprovalReceipt {
  approvalRequestId: string;
  status: ApprovalRequestStatus;
  version: number;
  requestId?: string;
  replayed?: boolean;
}

export interface CapabilityOverrideReceipt {
  overrideId: string;
  membershipId: string;
  capability: string;
  effect: CapabilityOverrideEffect;
  requestId: string;
  replayed: boolean;
}

export interface CapabilityOverrideRevocationReceipt {
  overrideId: string;
  status: 'revoked';
  requestId: string;
  replayed: boolean;
}

export interface EstablishmentLifecycleReceipt {
  establishmentId: string;
  lifecycleStatus: EstablishmentLifecycleStatus;
  version: number;
  requestId: string;
  replayed: boolean;
}

export interface EstablishmentReadiness {
  establishmentId: string;
  lifecycleStatus: EstablishmentLifecycleStatus;
  accountStatus: string;
  operationalReady: boolean;
  paymentsReady: boolean;
  fiscalReady: boolean;
  checks: {
    openingHoursConfigured: boolean;
    activeServiceConfigured: boolean;
    managementMembershipConfigured: boolean;
    governanceAllowsOperation: boolean;
    lifecycleAllowsOperation: boolean;
    financialOpsEnabled: boolean;
    manualPaymentMethodConfigured: boolean;
    serviceFiscalProfileConfigured: boolean;
  };
  blockers: {
    operational: string[];
    payments: string[];
    fiscal: string[];
  };
  version: number;
  dataCutoffAt: string;
}

export interface AuthorizedContext {
  appId: CutSyncAppId;
  contextKind: AuthorizedContextKind;
  establishmentId: string | null;
  establishmentName: string | null;
  organizationId: string | null;
  organizationName: string | null;
  membershipId: string | null;
  membershipRole: 'admin' | 'professional' | null;
  membershipStatus: 'active' | null;
  roleTemplate: MembershipRoleTemplate | null;
  organizationRole: 'owner' | 'manager' | 'finance' | null;
  establishmentSlug: string | null;
  commissionRate: number | null;
  establishmentStatus: string | null;
  capabilities: BusinessCapability[];
  allowedActions: string[];
  active: boolean;
  version: number;
}

export interface OnboardingProgress {
  progressId: string;
  appId: CutSyncAppId;
  intent: OnboardingIntent;
  contextKind: AuthorizedContextKind;
  establishmentId: string | null;
  organizationId: string | null;
  currentStep: string;
  status: OnboardingStatus;
  allowedActions: OnboardingAllowedAction[];
  version: number;
  dataCutoffAt: string;
  correlationId: string;
  lastResumedAt?: string;
  completedAt?: string | null;
  updatedAt?: string;
  requestId?: string;
  replayed?: boolean;
}

export interface ActiveContextReceipt {
  appId: CutSyncAppId;
  contextKind: AuthorizedContextKind;
  establishmentId: string | null;
  organizationId: string | null;
  version: number;
  requestId: string;
  replayed: boolean;
}

type UnknownRecord = Record<string, unknown>;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isOneOf = <Value extends string>(
  value: unknown,
  options: readonly Value[],
): value is Value => typeof value === 'string' && options.includes(value as Value);

const asNullableUuid = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : undefined;
};

const asNullableString = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  return value.trim();
};

const asOptionalNullableString = (value: unknown): string | null | undefined => (
  value === undefined ? null : asNullableString(value)
);

const asStringArray = (value: unknown): string[] | null => (
  Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : null
);

const isBooleanRecord = <Key extends string>(
  value: unknown,
  keys: readonly Key[],
): value is Record<Key, boolean> => isRecord(value)
  && keys.every((key) => typeof value[key] === 'boolean');

const isStringArrayRecord = <Key extends string>(
  value: unknown,
  keys: readonly Key[],
): value is Record<Key, string[]> => isRecord(value)
  && keys.every((key) => Array.isArray(value[key])
    && value[key].every((item) => typeof item === 'string'));

export const mapAuthorizedContext = (value: unknown): AuthorizedContext | null => {
  if (!isRecord(value)) return null;
  if (!isOneOf(value.appId, CUTSYNC_APP_IDS)) return null;
  if (!isOneOf(value.contextKind, AUTHORIZED_CONTEXT_KINDS)) return null;

  const establishmentId = asNullableUuid(value.establishmentId);
  const establishmentName = asNullableString(value.establishmentName);
  const organizationId = asNullableUuid(value.organizationId);
  const organizationName = asNullableString(value.organizationName);
  const membershipId = asNullableUuid(value.membershipId);
  const establishmentSlug = asOptionalNullableString(value.establishmentSlug);
  const establishmentStatus = asOptionalNullableString(value.establishmentStatus);

  if (
    establishmentId === undefined
    || establishmentName === undefined
    || organizationId === undefined
    || organizationName === undefined
    || membershipId === undefined
    || establishmentSlug === undefined
    || establishmentStatus === undefined
    || typeof value.active !== 'boolean'
    || !Number.isInteger(value.version)
    || (value.version as number) < 0
  ) return null;

  const membershipRole = value.membershipRole === null
    ? null
    : isOneOf(value.membershipRole, ['admin', 'professional'] as const)
      ? value.membershipRole
      : undefined;
  const roleTemplate = value.roleTemplate === null
    ? null
    : isOneOf(value.roleTemplate, MEMBERSHIP_ROLE_TEMPLATES)
      ? value.roleTemplate
      : undefined;
  const membershipStatus = value.membershipStatus === undefined
    ? value.contextKind === 'establishment' ? 'active' as const : null
    : value.membershipStatus === null
      ? null
    : value.membershipStatus === 'active'
      ? 'active' as const
      : undefined;
  const organizationRole = value.organizationRole === null
    ? null
    : isOneOf(value.organizationRole, ['owner', 'manager', 'finance'] as const)
      ? value.organizationRole
      : undefined;
  if (
    membershipRole === undefined
    || membershipStatus === undefined
    || roleTemplate === undefined
    || organizationRole === undefined
  ) return null;

  const rawCapabilities = value.capabilities === undefined ? [] : asStringArray(value.capabilities);
  const rawAllowedActions = value.allowedActions === undefined ? [] : asStringArray(value.allowedActions);
  if (!rawCapabilities || !rawAllowedActions) return null;
  const capabilities = rawCapabilities.filter((item): item is BusinessCapability => (
    isOneOf(item, BUSINESS_CAPABILITIES)
  ));
  if (capabilities.length !== rawCapabilities.length) return null;
  const commissionRate = value.commissionRate == null
    ? null
    : typeof value.commissionRate === 'number' && Number.isFinite(value.commissionRate)
      ? value.commissionRate
      : undefined;
  if (commissionRate === undefined) return null;

  const targetIsValid = value.contextKind === 'personal'
    ? establishmentId === null && organizationId === null
      && membershipId === null && roleTemplate === null && organizationRole === null
    : value.contextKind === 'establishment'
      ? establishmentId !== null && establishmentName !== null
        && organizationId === null && membershipId !== null
        && membershipRole !== null && membershipStatus === 'active'
        && roleTemplate !== null
      : establishmentId === null && organizationId !== null
        && organizationName !== null && organizationRole !== null;
  if (!targetIsValid) return null;

  return {
    appId: value.appId,
    contextKind: value.contextKind,
    establishmentId,
    establishmentName,
    organizationId,
    organizationName,
    membershipId,
    membershipRole,
    membershipStatus,
    roleTemplate,
    organizationRole,
    establishmentSlug,
    commissionRate,
    establishmentStatus,
    capabilities,
    allowedActions: rawAllowedActions,
    active: value.active,
    version: value.version as number,
  };
};

export const mapOnboardingProgress = (value: unknown): OnboardingProgress | null => {
  if (!isRecord(value)) return null;
  if (typeof value.progressId !== 'string' || !UUID_PATTERN.test(value.progressId)) return null;
  if (!isOneOf(value.appId, CUTSYNC_APP_IDS)) return null;
  if (!isOneOf(value.intent, ONBOARDING_INTENTS)) return null;
  if (!isOneOf(value.contextKind, AUTHORIZED_CONTEXT_KINDS)) return null;
  if (!isOneOf(value.status, ONBOARDING_STATUSES)) return null;
  const establishmentId = asNullableUuid(value.establishmentId);
  const organizationId = asNullableUuid(value.organizationId);
  const allowedActions = asStringArray(value.allowedActions);
  if (
    establishmentId === undefined
    || organizationId === undefined
    || typeof value.currentStep !== 'string'
    || !/^[a-z][a-z0-9_]{1,79}$/.test(value.currentStep)
    || !allowedActions
    || !allowedActions.every((action) => isOneOf(action, ONBOARDING_ALLOWED_ACTIONS))
    || !Number.isInteger(value.version)
    || (value.version as number) < 1
    || typeof value.dataCutoffAt !== 'string'
    || Number.isNaN(Date.parse(value.dataCutoffAt))
    || typeof value.correlationId !== 'string'
    || !UUID_PATTERN.test(value.correlationId)
  ) return null;
  const targetIsValid = value.contextKind === 'personal'
    ? establishmentId === null && organizationId === null
    : value.contextKind === 'establishment'
      ? establishmentId !== null && organizationId === null
      : establishmentId === null && organizationId !== null;
  if (!targetIsValid) return null;
  if (value.requestId !== undefined
    && (typeof value.requestId !== 'string' || !UUID_PATTERN.test(value.requestId))) return null;
  if (value.replayed !== undefined && typeof value.replayed !== 'boolean') return null;

  return {
    progressId: value.progressId,
    appId: value.appId,
    intent: value.intent,
    contextKind: value.contextKind,
    establishmentId,
    organizationId,
    currentStep: value.currentStep,
    status: value.status,
    allowedActions: allowedActions as OnboardingAllowedAction[],
    version: value.version as number,
    dataCutoffAt: value.dataCutoffAt,
    correlationId: value.correlationId,
    ...(typeof value.lastResumedAt === 'string' ? { lastResumedAt: value.lastResumedAt } : {}),
    ...(value.completedAt === null || typeof value.completedAt === 'string'
      ? { completedAt: value.completedAt }
      : {}),
    ...(typeof value.updatedAt === 'string' ? { updatedAt: value.updatedAt } : {}),
    ...(typeof value.requestId === 'string' ? { requestId: value.requestId } : {}),
    ...(typeof value.replayed === 'boolean' ? { replayed: value.replayed } : {}),
  };
};

export const mapActiveContextReceipt = (value: unknown): ActiveContextReceipt | null => {
  if (!isRecord(value)) return null;
  if (!isOneOf(value.appId, CUTSYNC_APP_IDS)) return null;
  if (!isOneOf(value.contextKind, AUTHORIZED_CONTEXT_KINDS)) return null;
  const establishmentId = asNullableUuid(value.establishmentId);
  const organizationId = asNullableUuid(value.organizationId);
  const requestId = typeof value.requestId === 'string' && UUID_PATTERN.test(value.requestId)
    ? value.requestId
    : null;
  if (
    establishmentId === undefined
    || organizationId === undefined
    || !requestId
    || !Number.isInteger(value.version)
    || (value.version as number) < 1
    || typeof value.replayed !== 'boolean'
  ) return null;

  const targetIsValid = value.contextKind === 'personal'
    ? establishmentId === null && organizationId === null
    : value.contextKind === 'establishment'
      ? establishmentId !== null && organizationId === null
      : establishmentId === null && organizationId !== null;
  if (!targetIsValid) return null;

  return {
    appId: value.appId,
    contextKind: value.contextKind,
    establishmentId,
    organizationId,
    version: value.version as number,
    requestId,
    replayed: value.replayed,
  };
};

export const mapEstablishmentReadiness = (value: unknown): EstablishmentReadiness | null => {
  if (!isRecord(value)) return null;
  if (!isOneOf(value.lifecycleStatus, ESTABLISHMENT_LIFECYCLE_STATUSES)) return null;
  if (typeof value.establishmentId !== 'string' || !UUID_PATTERN.test(value.establishmentId)) {
    return null;
  }
  if (
    typeof value.accountStatus !== 'string'
    || typeof value.operationalReady !== 'boolean'
    || typeof value.paymentsReady !== 'boolean'
    || typeof value.fiscalReady !== 'boolean'
    || !Number.isInteger(value.version)
    || (value.version as number) < 1
    || typeof value.dataCutoffAt !== 'string'
    || Number.isNaN(Date.parse(value.dataCutoffAt))
  ) return null;

  const checkKeys = [
    'openingHoursConfigured',
    'activeServiceConfigured',
    'managementMembershipConfigured',
    'governanceAllowsOperation',
    'lifecycleAllowsOperation',
    'financialOpsEnabled',
    'manualPaymentMethodConfigured',
    'serviceFiscalProfileConfigured',
  ] as const;
  const blockerKeys = ['operational', 'payments', 'fiscal'] as const;
  if (!isBooleanRecord(value.checks, checkKeys)
    || !isStringArrayRecord(value.blockers, blockerKeys)) return null;

  return {
    establishmentId: value.establishmentId,
    lifecycleStatus: value.lifecycleStatus,
    accountStatus: value.accountStatus,
    operationalReady: value.operationalReady,
    paymentsReady: value.paymentsReady,
    fiscalReady: value.fiscalReady,
    checks: value.checks,
    blockers: value.blockers,
    version: value.version as number,
    dataCutoffAt: value.dataCutoffAt,
  };
};
