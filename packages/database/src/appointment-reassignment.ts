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
