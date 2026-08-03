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
  'view_orders',
  'manage_own_orders',
  'manage_team_orders',
  'apply_order_discounts',
  'void_orders',
  'view_payments',
  'take_payments',
  'void_payments',
  'issue_refunds',
  'view_cash',
  'operate_cash',
  'close_cash',
  'reopen_cash',
  'view_team_commission',
  'manage_commission_policies',
  'close_commission_period',
  'record_commission_payout',
  'view_reconciliation',
  'manage_reconciliation',
] as const;

/** Financial-ops capability subset introduced in P0 Etapa 1. */
export const FINANCIAL_OPS_CAPABILITIES = [
  'view_orders',
  'manage_own_orders',
  'manage_team_orders',
  'apply_order_discounts',
  'void_orders',
  'view_payments',
  'take_payments',
  'void_payments',
  'issue_refunds',
  'view_cash',
  'operate_cash',
  'close_cash',
  'reopen_cash',
  'view_team_commission',
  'manage_commission_policies',
  'close_commission_period',
  'record_commission_payout',
  'view_reconciliation',
  'manage_reconciliation',
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

/** Operational status of a service order (comanda). Not payment state. */
export type ServiceOrderStatus =
  | 'open'
  | 'in_service'
  | 'awaiting_payment'
  | 'closed'
  | 'voided';

export interface ServiceOrderCommandReceipt {
  serviceOrderId: string;
  status: ServiceOrderStatus;
  version: number;
  serviceOrderItemId?: string;
}

export interface ServiceOrderItem {
  id: string;
  serviceOrderId: string;
  establishmentId: string;
  serviceId: string | null;
  professionalId: string | null;
  descriptionSnapshot: string;
  quantity: number;
  unitPriceCents: number;
  discountCents: number;
  subtotalCents: number;
  totalCents: number;
  sortOrder: number;
}

export interface ServiceOrderDetail {
  id: string;
  establishmentId: string;
  appointmentId: string | null;
  establishmentClientId: string | null;
  professionalId: string | null;
  status: ServiceOrderStatus;
  currency: 'BRL';
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  internalNotes: string | null;
  openedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  closedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  version: number;
  items: ServiceOrderItem[];
  events: ServiceOrderEventSummary[];
}

export interface ServiceOrderEventSummary {
  id: number;
  eventType: string;
  previousStatus: ServiceOrderStatus | null;
  resultingStatus: ServiceOrderStatus;
  actorId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ServiceOrderSummary {
  serviceOrderId: string;
  appointmentId: string | null;
  professionalId: string | null;
  establishmentClientId: string | null;
  status: ServiceOrderStatus;
  currency: 'BRL';
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  openedAt: string;
  version: number;
}

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
  /**
   * Product availability for financial-ops on the unit.
   * Independent from capabilities (authority). Future UI requires both.
   */
  financialOpsEnabled: boolean;
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
  admin: new Set(BUSINESS_CAPABILITIES.filter((capability) => (
    capability !== 'manage_admins' && capability !== 'reopen_cash'
  ))),
  professional: new Set([
    'view_own_agenda',
    'view_team_agenda',
    'create_self_walk_in',
    'manage_own_blocks',
    'view_services',
    'view_own_commission',
    'view_orders',
    'manage_own_orders',
    'view_payments',
  ]),
};

const READ_ONLY_CAPABILITIES = new Set<BusinessCapability>([
  'view_own_agenda',
  'view_team_agenda',
  'view_services',
  'view_own_commission',
  'view_unit_reports',
  'view_orders',
  'view_payments',
  'view_cash',
  'view_team_commission',
  'view_reconciliation',
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
  // Missing field defaults to false so Business keeps working until
  // 20260814000000 is homologated and the RPC starts returning the column.
  const financialOpsEnabled = typeof value.financial_ops_enabled === 'boolean'
    ? value.financial_ops_enabled
    : value.financial_ops_enabled === undefined
      ? false
      : undefined;

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
    || financialOpsEnabled === undefined
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
    financialOpsEnabled,
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
  const invitedEmail = asRequiredString(value.invited_contact ?? value.invited_email);
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

const SERVICE_ORDER_STATUSES = new Set<ServiceOrderStatus>([
  'open',
  'in_service',
  'awaiting_payment',
  'closed',
  'voided',
]);

const asServiceOrderStatus = (value: unknown): ServiceOrderStatus | null => (
  typeof value === 'string' && SERVICE_ORDER_STATUSES.has(value as ServiceOrderStatus)
    ? value as ServiceOrderStatus
    : null
);

const asSafeInteger = (value: unknown, minimum = 0): number | null => (
  typeof value === 'number'
  && Number.isInteger(value)
  && Number.isSafeInteger(value)
  && value >= minimum
    ? value
    : null
);

const asMoneyCentsField = (value: unknown): number | null => asSafeInteger(value, 0);

/**
 * Fields omitted by jsonb_strip_nulls are treated as null.
 * Present but invalid values return undefined so mappers fail closed.
 */
const asStrippedNullableIdentifier = (
  value: unknown,
): string | null | undefined => {
  if (value === undefined || value === null) return null;
  return asIdentifier(value) ?? undefined;
};

const asStrippedNullableString = (
  value: unknown,
): string | null | undefined => {
  if (value === undefined || value === null) return null;
  return asRequiredString(value) ?? undefined;
};

const asStrippedNullableTimestamp = (
  value: unknown,
): string | null | undefined => {
  if (value === undefined || value === null) return null;
  return asTimestamp(value) ?? undefined;
};

const asStrippedNullableServiceOrderStatus = (
  value: unknown,
): ServiceOrderStatus | null | undefined => {
  if (value === undefined || value === null) return null;
  return asServiceOrderStatus(value) ?? undefined;
};

/** Fail-closed mapper for mutation receipt payloads. */
export const mapServiceOrderCommandReceipt = (
  value: unknown,
): ServiceOrderCommandReceipt | null => {
  if (!isRecord(value)) return null;
  if ('paymentStatus' in value || 'payment_status' in value) return null;

  const serviceOrderId = asIdentifier(value.serviceOrderId);
  const status = asServiceOrderStatus(value.status);
  const version = asSafeInteger(value.version, 1);
  const serviceOrderItemId = value.serviceOrderItemId === undefined
    ? undefined
    : asIdentifier(value.serviceOrderItemId);

  if (!serviceOrderId || !status || version === null) return null;
  if (value.serviceOrderItemId !== undefined && !serviceOrderItemId) return null;
  if (value.currency !== undefined && value.currency !== 'BRL') return null;

  return serviceOrderItemId
    ? { serviceOrderId, status, version, serviceOrderItemId }
    : { serviceOrderId, status, version };
};

const mapServiceOrderItem = (value: unknown): ServiceOrderItem | null => {
  if (!isRecord(value)) return null;
  const id = asIdentifier(value.id);
  const serviceOrderId = asIdentifier(value.serviceOrderId);
  const establishmentId = asIdentifier(value.establishmentId);
  const serviceId = asStrippedNullableString(value.serviceId);
  const professionalId = asStrippedNullableIdentifier(value.professionalId);
  const descriptionSnapshot = asRequiredString(value.descriptionSnapshot);
  const quantity = asSafeInteger(value.quantity, 1);
  const unitPriceCents = asMoneyCentsField(value.unitPriceCents);
  const discountCents = asMoneyCentsField(value.discountCents);
  const subtotalCents = asMoneyCentsField(value.subtotalCents);
  const totalCents = asMoneyCentsField(value.totalCents);
  const sortOrder = asSafeInteger(value.sortOrder, 0);

  if (
    !id
    || !serviceOrderId
    || !establishmentId
    || serviceId === undefined
    || professionalId === undefined
    || !descriptionSnapshot
    || quantity === null
    || quantity > 999
    || unitPriceCents === null
    || discountCents === null
    || subtotalCents === null
    || totalCents === null
    || sortOrder === null
  ) {
    return null;
  }

  return {
    id,
    serviceOrderId,
    establishmentId,
    serviceId,
    professionalId,
    descriptionSnapshot,
    quantity,
    unitPriceCents,
    discountCents,
    subtotalCents,
    totalCents,
    sortOrder,
  };
};

/** Fail-closed mapper for get_service_order JSON. */
export const mapServiceOrderDetail = (value: unknown): ServiceOrderDetail | null => {
  if (!isRecord(value)) return null;
  if ('paymentStatus' in value || 'payment_status' in value) return null;

  const order = isRecord(value.order) ? value.order : null;
  if (!order) return null;
  if ('paymentStatus' in order || 'payment_status' in order) return null;

  const id = asIdentifier(order.id);
  const establishmentId = asIdentifier(order.establishmentId);
  const appointmentId = asStrippedNullableString(order.appointmentId);
  const establishmentClientId = asStrippedNullableIdentifier(order.establishmentClientId);
  const professionalId = asStrippedNullableIdentifier(order.professionalId);
  const status = asServiceOrderStatus(order.status);
  const currency = order.currency === 'BRL' ? 'BRL' as const : null;
  const subtotalCents = asMoneyCentsField(order.subtotalCents);
  const discountCents = asMoneyCentsField(order.discountCents);
  const totalCents = asMoneyCentsField(order.totalCents);
  const internalNotes = asStrippedNullableString(order.internalNotes);
  const openedAt = asTimestamp(order.openedAt);
  const startedAt = asStrippedNullableTimestamp(order.startedAt);
  const finishedAt = asStrippedNullableTimestamp(order.finishedAt);
  const closedAt = asStrippedNullableTimestamp(order.closedAt);
  const voidedAt = asStrippedNullableTimestamp(order.voidedAt);
  const voidReason = asStrippedNullableString(order.voidReason);
  const version = asSafeInteger(order.version, 1);

  if (
    !id
    || !establishmentId
    || appointmentId === undefined
    || establishmentClientId === undefined
    || professionalId === undefined
    || !status
    || !currency
    || subtotalCents === null
    || discountCents === null
    || totalCents === null
    || internalNotes === undefined
    || !openedAt
    || startedAt === undefined
    || finishedAt === undefined
    || closedAt === undefined
    || voidedAt === undefined
    || voidReason === undefined
    || version === null
    || !Array.isArray(value.items)
    || !Array.isArray(value.events)
  ) {
    return null;
  }

  const items = value.items.map(mapServiceOrderItem);
  if (items.some((item) => item === null)) return null;

  const events: ServiceOrderEventSummary[] = [];
  for (const rawEvent of value.events) {
    if (!isRecord(rawEvent)) return null;
    const eventId = asSafeInteger(rawEvent.id, 1);
    const eventType = asRequiredString(rawEvent.eventType);
    const previousStatus = asStrippedNullableServiceOrderStatus(rawEvent.previousStatus);
    const resultingStatus = asServiceOrderStatus(rawEvent.resultingStatus);
    const actorId = asStrippedNullableIdentifier(rawEvent.actorId);
    const createdAt = asTimestamp(rawEvent.createdAt);
    const metadata = isRecord(rawEvent.metadata) ? rawEvent.metadata : null;
    if (
      eventId === null
      || !eventType
      || previousStatus === undefined
      || !resultingStatus
      || actorId === undefined
      || !createdAt
      || !metadata
    ) {
      return null;
    }
    events.push({
      id: eventId,
      eventType,
      previousStatus,
      resultingStatus,
      actorId,
      metadata,
      createdAt,
    });
  }

  return {
    id,
    establishmentId,
    appointmentId,
    establishmentClientId,
    professionalId,
    status,
    currency,
    subtotalCents,
    discountCents,
    totalCents,
    internalNotes,
    openedAt,
    startedAt,
    finishedAt,
    closedAt,
    voidedAt,
    voidReason,
    version,
    items: items as ServiceOrderItem[],
    events,
  };
};

/** Fail-closed mapper for list_service_orders_for_day item rows. */
export const mapServiceOrderSummary = (value: unknown): ServiceOrderSummary | null => {
  if (!isRecord(value)) return null;
  if ('paymentStatus' in value || 'payment_status' in value) return null;

  const serviceOrderId = asIdentifier(value.serviceOrderId);
  const appointmentId = asStrippedNullableString(value.appointmentId);
  const professionalId = asStrippedNullableIdentifier(value.professionalId);
  const establishmentClientId = asStrippedNullableIdentifier(value.establishmentClientId);
  const status = asServiceOrderStatus(value.status);
  const currency = value.currency === 'BRL' ? 'BRL' as const : null;
  const subtotalCents = asMoneyCentsField(value.subtotalCents);
  const discountCents = asMoneyCentsField(value.discountCents);
  const totalCents = asMoneyCentsField(value.totalCents);
  const openedAt = asTimestamp(value.openedAt);
  const version = asSafeInteger(value.version, 1);

  if (
    !serviceOrderId
    || appointmentId === undefined
    || professionalId === undefined
    || establishmentClientId === undefined
    || !status
    || !currency
    || subtotalCents === null
    || discountCents === null
    || totalCents === null
    || !openedAt
    || version === null
  ) {
    return null;
  }

  return {
    serviceOrderId,
    appointmentId,
    professionalId,
    establishmentClientId,
    status,
    currency,
    subtotalCents,
    discountCents,
    totalCents,
    openedAt,
    version,
  };
};
