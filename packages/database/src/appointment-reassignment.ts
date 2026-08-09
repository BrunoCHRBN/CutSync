export const APPOINTMENT_PROFESSIONAL_PREFERENCES = [
  'specific',
  'any_available',
] as const;

export type AppointmentProfessionalPreference =
  (typeof APPOINTMENT_PROFESSIONAL_PREFERENCES)[number];

export const APPOINTMENT_REASSIGNMENT_STATUSES = [
  'requested',
  'validating',
  'awaiting_manager',
  'awaiting_customer',
  'ready_to_apply',
  'applied',
  'declined',
  'withdrawn',
  'expired',
  'failed',
  'manual_review',
] as const;

export type AppointmentReassignmentStatus =
  (typeof APPOINTMENT_REASSIGNMENT_STATUSES)[number];

export const CUSTOMER_CHANGE_DECISIONS = [
  'pending',
  'accept_replacement',
  'choose_professional',
  'reschedule_original',
  'cancel_due_to_change',
  'contested',
  'resolved',
] as const;

export type CustomerChangeDecision = (typeof CUSTOMER_CHANGE_DECISIONS)[number];

export type MobileSyncStatus =
  | 'local_draft'
  | 'syncing'
  | 'server_confirmed'
  | 'offline_pending'
  | 'failed'
  | 'conflict'
  | 'manual_review';

export type ClientReassignmentAction = Extract<
  CustomerChangeDecision,
  'accept_replacement' | 'choose_professional' | 'reschedule_original' | 'cancel_due_to_change'
>;

export type AppointmentAssignmentStatus =
  | 'proposed'
  | 'active'
  | 'superseded'
  | 'corrected';

export interface AppointmentAssignmentEvent {
  id: string;
  appointmentId: string;
  establishmentId: string;
  reassignmentRequestId: string | null;
  assignmentId: string | null;
  eventType: string;
  actorId: string | null;
  actorKind: 'customer' | 'professional' | 'staff' | 'system' | 'support';
  requestId: string;
  correlationId: string;
  previousVersion: number | null;
  resultingVersion: number;
  occurredAt: string;
}

export interface DecisionQueueItem {
  reassignmentRequestId: string;
  appointmentId: string;
  establishmentId: string;
  status: AppointmentReassignmentStatus;
  urgency: 'normal' | 'attention' | 'urgent' | 'overdue';
  responsibility: string;
  dueAt: string;
  nextActorKind:
    | 'customer'
    | 'professional'
    | 'reception'
    | 'manager'
    | 'admin'
    | 'owner'
    | 'system';
  customerDecisionRequired: boolean;
  monetaryImpact: boolean;
  allowedActions: string[];
  correlationId: string;
  version: number;
  dataCutoffAt: string;
  appointmentStartsAt: string;
  clientDisplayName: string;
  serviceName: string;
  currentProfessionalName: string;
  proposedProfessionalName: string | null;
}

export interface BusinessReassignmentDetail {
  reassignmentRequestId: string;
  appointmentId: string;
  establishmentId: string;
  status: AppointmentReassignmentStatus;
  responsibility: string;
  reasonCode: string;
  dueAt: string;
  customerDecisionRequired: boolean;
  monetaryImpact: boolean;
  previousCondition: Record<string, unknown>;
  proposedCondition: Record<string, unknown>;
  allowedActions: string[];
  correlationId: string;
  version: number;
  dataCutoffAt: string;
  appointmentStartsAt: string;
  appointmentEndsAt: string;
  clientDisplayName: string;
  serviceName: string;
  currentProfessional: { id: string; name: string };
  proposedProfessional: { id: string; name: string } | null;
  timeline: AppointmentAssignmentEvent[];
}

export interface BusinessReassignmentCandidate {
  profileId: string;
  name: string;
  priceCents: number;
  monetaryImpact: boolean;
}

export interface ClientReassignmentDecision {
  reassignmentRequestId: string;
  appointmentId: string;
  status: AppointmentReassignmentStatus;
  dueAt: string;
  responsibility: string;
  appointmentStartsAt: string;
  establishmentName: string;
  establishmentTimezone: string;
  serviceName: string;
  currentProfessionalName: string;
  proposedProfessionalName: string | null;
  monetaryImpact: boolean;
  allowedActions: ClientReassignmentAction[];
  version: number;
  correlationId: string;
  dataCutoffAt: string;
}

export interface ClientReassignmentDetail {
  reassignmentRequestId: string;
  appointmentId: string;
  establishmentId: string;
  establishmentName: string;
  establishmentTimezone: string;
  currency: string;
  status: AppointmentReassignmentStatus;
  responsibility: string;
  reasonCode: string;
  dueAt: string;
  customerDecisionRequired: boolean;
  monetaryImpact: boolean;
  previousCondition: Record<string, unknown>;
  proposedCondition: Record<string, unknown>;
  allowedActions: ClientReassignmentAction[];
  correlationId: string;
  version: number;
  dataCutoffAt: string;
  appointmentStartsAt: string;
  appointmentEndsAt: string;
  serviceName: string;
  currentProfessional: { id: string; name: string };
  proposedProfessional: { id: string; name: string } | null;
  initiatedByKind: AppointmentAssignmentEvent['actorKind'];
  timeline: AppointmentAssignmentEvent[];
}

export interface AppointmentReassignmentMutationReceipt {
  reassignmentRequestId: string;
  appointmentId?: string;
  proposedAssignmentId?: string;
  status: AppointmentReassignmentStatus;
  version: number;
  requestId: string;
  correlationId: string;
  customerDecisionRequired?: boolean;
  monetaryImpact?: boolean;
  replayed: boolean;
}

export interface AppointmentAssignmentCorrectionReceipt {
  appointmentId: string;
  assignmentId: string;
  previousProfessionalId: string;
  professionalId: string;
  approvalRequestId: string;
  requestId: string;
  correlationId: string;
  replayed: boolean;
}

export interface AppointmentAssignmentShadowRun {
  runId: string;
  establishmentId: string;
  totalAppointments: number;
  matchingAppointments: number;
  mismatchedAppointments: number;
  missingAssignments: number;
  multipleActiveAssignments: number;
  cutoverEligible: boolean;
  dataCutoffAt: string;
  requestId: string;
  replayed: boolean;
}

export const isAppointmentProfessionalPreference = (
  value: unknown,
): value is AppointmentProfessionalPreference => (
  typeof value === 'string'
  && APPOINTMENT_PROFESSIONAL_PREFERENCES.some((candidate) => candidate === value)
);

export const isAppointmentReassignmentStatus = (
  value: unknown,
): value is AppointmentReassignmentStatus => (
  typeof value === 'string'
  && APPOINTMENT_REASSIGNMENT_STATUSES.some((candidate) => candidate === value)
);

export const isCustomerChangeDecision = (
  value: unknown,
): value is CustomerChangeDecision => (
  typeof value === 'string'
  && CUSTOMER_CHANGE_DECISIONS.some((candidate) => candidate === value)
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const asString = (value: unknown): string | null => (
  typeof value === 'string' && value.trim().length > 0 ? value : null
);

const asStringArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return null;
  return value as string[];
};

const mapAssignmentEvent = (value: unknown): AppointmentAssignmentEvent | null => {
  if (!isRecord(value)) return null;
  const actorKinds: AppointmentAssignmentEvent['actorKind'][] = [
    'customer', 'professional', 'staff', 'system', 'support',
  ];
  const actorKind = actorKinds.find((candidate) => candidate === value.actorKind);
  const id = asString(value.id);
  const appointmentId = asString(value.appointmentId);
  const establishmentId = asString(value.establishmentId);
  const eventType = asString(value.eventType);
  const requestId = asString(value.requestId);
  const correlationId = asString(value.correlationId);
  const occurredAt = asString(value.occurredAt);
  if (
    !id || !appointmentId || !establishmentId || !eventType || !actorKind
    || !requestId || !correlationId || !occurredAt
    || !Number.isInteger(value.resultingVersion)
    || (value.previousVersion !== null && !Number.isInteger(value.previousVersion))
  ) return null;
  return {
    id,
    appointmentId,
    establishmentId,
    reassignmentRequestId: value.reassignmentRequestId === null
      ? null : asString(value.reassignmentRequestId),
    assignmentId: value.assignmentId === null ? null : asString(value.assignmentId),
    eventType,
    actorId: value.actorId === null ? null : asString(value.actorId),
    actorKind,
    requestId,
    correlationId,
    previousVersion: value.previousVersion as number | null,
    resultingVersion: value.resultingVersion as number,
    occurredAt,
  };
};

export const mapDecisionQueueItem = (value: unknown): DecisionQueueItem | null => {
  if (!isRecord(value)) return null;
  const status = isAppointmentReassignmentStatus(value.status) ? value.status : null;
  const urgency = ['normal', 'attention', 'urgent', 'overdue'].find(
    (candidate) => candidate === value.urgency,
  ) as DecisionQueueItem['urgency'] | undefined;
  const nextActorKind = [
    'customer', 'professional', 'reception', 'manager', 'admin', 'owner', 'system',
  ].find((candidate) => candidate === value.nextActorKind) as DecisionQueueItem['nextActorKind'] | undefined;
  const requiredStrings = [
    'reassignmentRequestId', 'appointmentId', 'establishmentId', 'responsibility',
    'dueAt', 'correlationId', 'dataCutoffAt', 'appointmentStartsAt',
    'clientDisplayName', 'serviceName', 'currentProfessionalName',
  ] as const;
  const strings = Object.fromEntries(requiredStrings.map((key) => [key, asString(value[key])]));
  const allowedActions = asStringArray(value.allowedActions);
  if (
    Object.values(strings).some((item) => !item) || !status || !urgency || !nextActorKind
    || !allowedActions || typeof value.customerDecisionRequired !== 'boolean'
    || typeof value.monetaryImpact !== 'boolean' || !Number.isInteger(value.version)
    || (value.proposedProfessionalName !== null && !asString(value.proposedProfessionalName))
  ) return null;
  return {
    ...(strings as unknown as Pick<DecisionQueueItem,
      'reassignmentRequestId' | 'appointmentId' | 'establishmentId' | 'responsibility'
      | 'dueAt' | 'correlationId' | 'dataCutoffAt' | 'appointmentStartsAt'
      | 'clientDisplayName' | 'serviceName' | 'currentProfessionalName'>),
    status,
    urgency,
    nextActorKind,
    customerDecisionRequired: value.customerDecisionRequired,
    monetaryImpact: value.monetaryImpact,
    allowedActions,
    version: value.version as number,
    proposedProfessionalName: value.proposedProfessionalName as string | null,
  };
};

const mapProfessional = (value: unknown): { id: string; name: string } | null => {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const name = asString(value.name);
  return id && name ? { id, name } : null;
};

export const mapBusinessReassignmentDetail = (
  value: unknown,
): BusinessReassignmentDetail | null => {
  if (!isRecord(value)) return null;
  const status = isAppointmentReassignmentStatus(value.status) ? value.status : null;
  const allowedActions = asStringArray(value.allowedActions);
  const currentProfessional = mapProfessional(value.currentProfessional);
  const proposedProfessional = value.proposedProfessional === null
    ? null : mapProfessional(value.proposedProfessional);
  const timelineValues = Array.isArray(value.timeline) ? value.timeline : null;
  const timeline = timelineValues?.map(mapAssignmentEvent) ?? null;
  const previousCondition = isRecord(value.previousCondition) ? value.previousCondition : null;
  const proposedCondition = isRecord(value.proposedCondition) ? value.proposedCondition : null;
  const fields = {
    reassignmentRequestId: asString(value.reassignmentRequestId),
    appointmentId: asString(value.appointmentId),
    establishmentId: asString(value.establishmentId),
    responsibility: asString(value.responsibility),
    reasonCode: asString(value.reasonCode),
    dueAt: asString(value.dueAt),
    correlationId: asString(value.correlationId),
    dataCutoffAt: asString(value.dataCutoffAt),
    appointmentStartsAt: asString(value.appointmentStartsAt),
    appointmentEndsAt: asString(value.appointmentEndsAt),
    clientDisplayName: asString(value.clientDisplayName),
    serviceName: asString(value.serviceName),
  };
  if (
    Object.values(fields).some((item) => !item) || !status || !allowedActions
    || !currentProfessional || proposedProfessional === null && value.proposedProfessional !== null
    || !timeline || timeline.some((event) => !event) || !previousCondition || !proposedCondition
    || typeof value.customerDecisionRequired !== 'boolean'
    || typeof value.monetaryImpact !== 'boolean' || !Number.isInteger(value.version)
  ) return null;
  return {
    ...(fields as Record<keyof typeof fields, string>),
    status,
    customerDecisionRequired: value.customerDecisionRequired,
    monetaryImpact: value.monetaryImpact,
    previousCondition,
    proposedCondition,
    allowedActions,
    version: value.version as number,
    currentProfessional,
    proposedProfessional,
    timeline: timeline as AppointmentAssignmentEvent[],
  };
};

export const mapBusinessReassignmentCandidate = (
  value: unknown,
): BusinessReassignmentCandidate | null => {
  if (!isRecord(value)) return null;
  const profileId = asString(value.profileId);
  const name = asString(value.name);
  if (
    !profileId || !name || !Number.isSafeInteger(value.priceCents)
    || (value.priceCents as number) < 0 || typeof value.monetaryImpact !== 'boolean'
  ) return null;
  return {
    profileId,
    name,
    priceCents: value.priceCents as number,
    monetaryImpact: value.monetaryImpact,
  };
};

const mapCustomerDecisionActions = (value: unknown): ClientReassignmentAction[] | null => {
  const actions = asStringArray(value);
  if (!actions) return null;
  const clientActions: ClientReassignmentAction[] = [
    'accept_replacement', 'choose_professional',
    'reschedule_original', 'cancel_due_to_change',
  ];
  const mapped = actions.map((action) => clientActions.find((candidate) => candidate === action));
  return mapped.some((action) => !action) ? null : mapped as ClientReassignmentAction[];
};

export const mapClientReassignmentDecision = (
  value: unknown,
): ClientReassignmentDecision | null => {
  if (!isRecord(value)) return null;
  const status = isAppointmentReassignmentStatus(value.status) ? value.status : null;
  const allowedActions = mapCustomerDecisionActions(value.allowedActions);
  const fields = {
    reassignmentRequestId: asString(value.reassignmentRequestId),
    appointmentId: asString(value.appointmentId),
    dueAt: asString(value.dueAt),
    responsibility: asString(value.responsibility),
    appointmentStartsAt: asString(value.appointmentStartsAt),
    establishmentName: asString(value.establishmentName),
    establishmentTimezone: asString(value.establishmentTimezone),
    serviceName: asString(value.serviceName),
    currentProfessionalName: asString(value.currentProfessionalName),
    correlationId: asString(value.correlationId),
    dataCutoffAt: asString(value.dataCutoffAt),
  };
  if (
    Object.values(fields).some((item) => !item) || !status || !allowedActions
    || typeof value.monetaryImpact !== 'boolean' || !Number.isInteger(value.version)
    || (value.proposedProfessionalName !== null && !asString(value.proposedProfessionalName))
  ) return null;
  return {
    ...(fields as Record<keyof typeof fields, string>),
    status,
    proposedProfessionalName: value.proposedProfessionalName as string | null,
    monetaryImpact: value.monetaryImpact,
    allowedActions,
    version: value.version as number,
  };
};

export const mapClientReassignmentDetail = (
  value: unknown,
): ClientReassignmentDetail | null => {
  if (!isRecord(value)) return null;
  const status = isAppointmentReassignmentStatus(value.status) ? value.status : null;
  const allowedActions = mapCustomerDecisionActions(value.allowedActions);
  const currentProfessional = mapProfessional(value.currentProfessional);
  const proposedProfessional = value.proposedProfessional === null
    ? null : mapProfessional(value.proposedProfessional);
  const timelineValues = Array.isArray(value.timeline) ? value.timeline : null;
  const timeline = timelineValues?.map(mapAssignmentEvent) ?? null;
  const previousCondition = isRecord(value.previousCondition) ? value.previousCondition : null;
  const proposedCondition = isRecord(value.proposedCondition) ? value.proposedCondition : null;
  const actorKinds: AppointmentAssignmentEvent['actorKind'][] = [
    'customer', 'professional', 'staff', 'system', 'support',
  ];
  const initiatedByKind = actorKinds.find((kind) => kind === value.initiatedByKind);
  const fields = {
    reassignmentRequestId: asString(value.reassignmentRequestId),
    appointmentId: asString(value.appointmentId),
    establishmentId: asString(value.establishmentId),
    establishmentName: asString(value.establishmentName),
    establishmentTimezone: asString(value.establishmentTimezone),
    currency: asString(value.currency),
    responsibility: asString(value.responsibility),
    reasonCode: asString(value.reasonCode),
    dueAt: asString(value.dueAt),
    correlationId: asString(value.correlationId),
    dataCutoffAt: asString(value.dataCutoffAt),
    appointmentStartsAt: asString(value.appointmentStartsAt),
    appointmentEndsAt: asString(value.appointmentEndsAt),
    serviceName: asString(value.serviceName),
  };
  if (
    Object.values(fields).some((item) => !item) || !status || !allowedActions
    || !currentProfessional || proposedProfessional === null && value.proposedProfessional !== null
    || !timeline || timeline.some((event) => !event) || !previousCondition || !proposedCondition
    || !initiatedByKind || typeof value.customerDecisionRequired !== 'boolean'
    || typeof value.monetaryImpact !== 'boolean' || !Number.isInteger(value.version)
  ) return null;
  return {
    ...(fields as Record<keyof typeof fields, string>),
    status,
    customerDecisionRequired: value.customerDecisionRequired,
    monetaryImpact: value.monetaryImpact,
    previousCondition,
    proposedCondition,
    allowedActions,
    version: value.version as number,
    currentProfessional,
    proposedProfessional,
    initiatedByKind,
    timeline: timeline as AppointmentAssignmentEvent[],
  };
};

export const mapAppointmentReassignmentMutationReceipt = (
  value: unknown,
): AppointmentReassignmentMutationReceipt | null => {
  if (!isRecord(value)) return null;
  const reassignmentRequestId = asString(value.reassignmentRequestId);
  const status = isAppointmentReassignmentStatus(value.status) ? value.status : null;
  const requestId = asString(value.requestId);
  const correlationId = asString(value.correlationId);
  if (
    !reassignmentRequestId || !status || !requestId || !correlationId
    || !Number.isInteger(value.version) || typeof value.replayed !== 'boolean'
    || (value.appointmentId !== undefined && !asString(value.appointmentId))
    || (value.proposedAssignmentId !== undefined && !asString(value.proposedAssignmentId))
    || (value.customerDecisionRequired !== undefined
      && typeof value.customerDecisionRequired !== 'boolean')
    || (value.monetaryImpact !== undefined && typeof value.monetaryImpact !== 'boolean')
  ) return null;
  return {
    reassignmentRequestId,
    status,
    version: value.version as number,
    requestId,
    correlationId,
    replayed: value.replayed,
    ...(typeof value.appointmentId === 'string' ? { appointmentId: value.appointmentId } : {}),
    ...(typeof value.proposedAssignmentId === 'string'
      ? { proposedAssignmentId: value.proposedAssignmentId } : {}),
    ...(typeof value.customerDecisionRequired === 'boolean'
      ? { customerDecisionRequired: value.customerDecisionRequired } : {}),
    ...(typeof value.monetaryImpact === 'boolean'
      ? { monetaryImpact: value.monetaryImpact } : {}),
  };
};
