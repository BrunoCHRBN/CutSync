export const CORPORATE_CASE_RISK_LEVELS = [
  'low',
  'moderate',
  'high',
  'critical',
] as const;

export type CorporateCaseRiskLevel = typeof CORPORATE_CASE_RISK_LEVELS[number];

export const CORPORATE_CASE_PRIORITIES = [
  'low',
  'normal',
  'high',
  'critical',
] as const;

export type CorporateCasePriority = typeof CORPORATE_CASE_PRIORITIES[number];

export const CORPORATE_CASE_VIEWS = [
  'mine',
  'observing',
  'pending',
  'queue',
  'all',
] as const;

export type CorporateCaseView = typeof CORPORATE_CASE_VIEWS[number];

export const CORPORATE_CASE_SENSITIVITIES = [
  'internal',
  'restricted',
  'confidential',
] as const;

export type CorporateCaseSensitivity = typeof CORPORATE_CASE_SENSITIVITIES[number];

export const CORPORATE_CASE_STATUSES = [
  'submitted',
  'triage',
  'review',
  'awaiting_approval',
  'approved',
  'fulfillment',
  'waiting_requester',
  'resolved',
  'closed',
  'rejected',
  'cancelled',
  'expired',
  'archived',
] as const;

export type CorporateCaseStatus = typeof CORPORATE_CASE_STATUSES[number];

export const CORPORATE_CASE_TASK_TYPES = [
  'triage',
  'review',
  'approval',
  'fulfillment',
] as const;

export type CorporateCaseTaskType = typeof CORPORATE_CASE_TASK_TYPES[number];

export const CORPORATE_CASE_TASK_STATUSES = [
  'pending',
  'in_progress',
  'waiting',
  'completed',
  'cancelled',
  'expired',
] as const;

export type CorporateCaseTaskStatus = typeof CORPORATE_CASE_TASK_STATUSES[number];

export const CORPORATE_CASE_PARTICIPANT_ROLES = [
  'requester',
  'beneficiary',
  'observer',
  'triager',
  'assignee',
  'approver',
  'auditor',
] as const;

export type CorporateCaseParticipantRole =
  typeof CORPORATE_CASE_PARTICIPANT_ROLES[number];

export const CORPORATE_NOTIFICATION_CHANNELS = ['in_app', 'email', 'push'] as const;

export type CorporateNotificationChannel = typeof CORPORATE_NOTIFICATION_CHANNELS[number];

export const CORPORATE_CASE_MESSAGE_VISIBILITIES = [
  'participants',
  'internal',
  'restricted',
] as const;

export type CorporateCaseMessageVisibility =
  typeof CORPORATE_CASE_MESSAGE_VISIBILITIES[number];

export const CORPORATE_CASE_APPROVAL_DECISIONS = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'expired',
] as const;

export type CorporateCaseApprovalDecision =
  typeof CORPORATE_CASE_APPROVAL_DECISIONS[number];

export const corporateCaseStatusLabels: Record<CorporateCaseStatus, string> = {
  submitted: 'Recebido',
  triage: 'Em triagem',
  review: 'Em validação',
  awaiting_approval: 'Aguardando aprovação',
  approved: 'Aprovado',
  fulfillment: 'Em execução',
  waiting_requester: 'Aguardando solicitante',
  resolved: 'Resolvido',
  closed: 'Encerrado',
  rejected: 'Rejeitado',
  cancelled: 'Cancelado',
  expired: 'Expirado',
  archived: 'Arquivado',
};

export const isCorporateCaseStatus = (value: string): value is CorporateCaseStatus => (
  CORPORATE_CASE_STATUSES.includes(value as CorporateCaseStatus)
);

export const isCorporateCaseRiskLevel = (value: string): value is CorporateCaseRiskLevel => (
  CORPORATE_CASE_RISK_LEVELS.includes(value as CorporateCaseRiskLevel)
);

export const isCorporateCasePriority = (value: string): value is CorporateCasePriority => (
  CORPORATE_CASE_PRIORITIES.includes(value as CorporateCasePriority)
);
