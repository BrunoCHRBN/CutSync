import {
  CORPORATE_CASE_APPROVAL_DECISIONS,
  CORPORATE_CASE_MESSAGE_VISIBILITIES,
  CORPORATE_CASE_PARTICIPANT_ROLES,
  CORPORATE_CASE_PRIORITIES,
  CORPORATE_CASE_RISK_LEVELS,
  CORPORATE_CASE_SENSITIVITIES,
  CORPORATE_CASE_STATUSES,
  CORPORATE_CASE_TASK_STATUSES,
  CORPORATE_CASE_TASK_TYPES,
  CORPORATE_CASE_VIEWS,
  type CorporateCaseApprovalDecision,
  type CorporateCaseMessageVisibility,
  type CorporateCaseParticipantRole,
  type CorporateCasePriority,
  type CorporateCaseRiskLevel,
  type CorporateCaseSensitivity,
  type CorporateCaseStatus,
  type CorporateCaseTaskStatus,
  type CorporateCaseTaskType,
  type CorporateCaseView,
} from '@cutsync/domain';
import { supabase } from '@/services/supabase';

export type CorporateCasesViewAccess = Record<CorporateCaseView, boolean>;

export interface CorporateCasesReadContext {
  enabled: boolean;
  creationEnabled: boolean;
  permissions: string[];
  views: CorporateCasesViewAccess;
}

export interface CorporateCaseType {
  typeId: string;
  typeKey: string;
  area: string;
  category: string;
  label: string;
  description: string;
  formKey: string;
  formVersion: number;
  defaultRisk: CorporateCaseRiskLevel;
  sensitivity: CorporateCaseSensitivity;
  requiresBeneficiary: boolean;
}

export interface CorporateCaseSummary {
  caseId: string;
  protocol: string;
  caseTypeKey: string;
  caseTypeLabel: string;
  riskLevel: CorporateCaseRiskLevel;
  priority: CorporateCasePriority;
  sensitivity: CorporateCaseSensitivity;
  status: CorporateCaseStatus;
  subject: string;
  summary: string;
  currentStageOrder: number | null;
  currentGroupLabel: string | null;
  currentAssigneeName: string | null;
  requesterName: string;
  beneficiaryName: string | null;
  expiresAt: string;
  updatedAt: string;
  createdAt: string;
  version: number;
}

export interface CorporateCaseParticipant {
  profileId: string;
  name: string;
  role: CorporateCaseParticipantRole;
  notificationLevel: 'all' | 'important' | 'none';
  createdAt: string;
}

export interface CorporateCaseTask {
  taskId: string;
  stageOrder: number;
  taskType: CorporateCaseTaskType;
  assignedGroupId: string;
  assignedGroupLabel: string;
  assignedProfileId: string | null;
  assignedProfileName: string | null;
  status: CorporateCaseTaskStatus;
  dueAt: string;
  completedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CorporateCaseApproval {
  approvalId: string;
  taskId: string;
  slotOrder: number;
  requestedApproverProfileId: string | null;
  requestedApproverName: string | null;
  requestedApproverGroupId: string | null;
  requestedApproverGroupLabel: string | null;
  decision: CorporateCaseApprovalDecision;
  decidedByName: string | null;
  decisionReason: string | null;
  decidedAt: string | null;
  dueAt: string;
  createdAt: string;
}

export interface CorporateCaseMessage {
  messageId: string;
  authorProfileId: string | null;
  authorName: string;
  visibility: CorporateCaseMessageVisibility;
  body: string;
  createdAt: string;
  editedAt: string | null;
}

export interface CorporateCaseEvent {
  eventId: string;
  eventType: string;
  actorProfileId: string | null;
  actorName: string;
  audience: 'participants' | 'internal' | 'restricted' | 'system';
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface CorporateCaseDetailRecord extends CorporateCaseSummary {
  caseNumber: number;
  area: string;
  category: string;
  formKey: string;
  formVersion: number;
  requesterProfileId: string;
  beneficiaryProfileId: string | null;
  currentGroupId: string | null;
  currentAssigneeProfileId: string | null;
  formPayload: Record<string, unknown>;
  externalReference: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
}

export interface CorporateCaseDetail {
  case: CorporateCaseDetailRecord;
  visibility: { internal: boolean; restricted: boolean };
  participants: CorporateCaseParticipant[];
  tasks: CorporateCaseTask[];
  approvals: CorporateCaseApproval[];
  messages: CorporateCaseMessage[];
  events: CorporateCaseEvent[];
}

export interface CorporateNotification {
  notificationId: string;
  eventId: string;
  eventCategory: string;
  importance: CorporateCasePriority;
  title: string;
  body: string;
  routePayload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export type CorporateAccessCaseAction = 'grant' | 'revoke';

export interface CorporateAccessRequestProfile {
  profileId: string;
  profileKey: string;
  label: string;
  description: string;
  riskLevel: CorporateCaseRiskLevel;
  requiredApprovals: number;
  requiresOwnerApproval: boolean;
  requiresExpiry: boolean;
  reviewIntervalDays: number;
}

export interface CorporateCaseIdentity {
  profileId: string;
  name: string;
  email: string;
}

export interface CorporateAccessCaseCreationResult {
  caseId: string;
  protocol: string;
  status: CorporateCaseStatus;
  version: number;
  createdAt: string;
  idempotent: boolean;
}

export interface CorporateCaseWorkflowTaskContext {
  taskId: string;
  stageOrder: number;
  taskType: CorporateCaseTaskType;
  assignedGroupId: string;
  assignedProfileId: string | null;
  status: CorporateCaseTaskStatus;
  dueAt: string;
  version: number;
}

export interface CorporateCaseWorkflowNextStage {
  stageOrder: number;
  stageKey: string;
  label: string;
  taskType: CorporateCaseTaskType;
  targetGroupId: string;
  requiredApprovals: number;
  requiresOwnerApproval: boolean;
  requiresDistinctActor: boolean;
}

export interface CorporateCaseWorkflowApprover extends CorporateCaseIdentity {
  isOwner: boolean;
}

export interface CorporateCaseActionContext {
  workflowEnabled: boolean;
  caseId: string;
  caseVersion: number;
  task: CorporateCaseWorkflowTaskContext | null;
  canClaim: boolean;
  canAdvance: boolean;
  nextStage: CorporateCaseWorkflowNextStage | null;
  eligibleApprovers: CorporateCaseWorkflowApprover[];
}

export interface CorporateCaseWorkflowMutationResult {
  caseId: string;
  caseVersion: number;
  taskId: string;
  taskVersion: number;
  status: CorporateCaseStatus;
  nextTaskId: string | null;
  idempotent: boolean;
}

export interface CorporateCaseApprovalTaskContext {
  taskId: string;
  taskVersion: number;
  status: CorporateCaseTaskStatus;
  dueAt: string;
}

export interface CorporateCaseApprovalSlotContext {
  approvalId: string;
  approvalVersion: number;
  slotOrder: number;
  decision: CorporateCaseApprovalDecision;
  dueAt: string;
}

export interface CorporateCaseApprovalContext {
  workflowEnabled: boolean;
  caseId: string;
  caseVersion: number;
  task: CorporateCaseApprovalTaskContext | null;
  approval: CorporateCaseApprovalSlotContext | null;
  canDecide: boolean;
  approvedCount: number;
  pendingCount: number;
  requiredApprovals: number;
  requiresOwnerApproval: boolean;
}

export interface CorporateCaseApprovalMutationResult {
  caseId: string;
  caseVersion: number;
  taskId: string;
  taskVersion: number;
  approvalId: string;
  approvalVersion: number;
  status: CorporateCaseStatus;
  nextTaskId: string | null;
  approvedCount: number;
  requiredApprovals: number;
  idempotent: boolean;
}

export type CorporateCaseFulfillmentExecutionStatus = 'applied' | 'failed' | 'deferred';

export interface CorporateCaseFulfillmentTaskContext {
  taskId: string;
  taskVersion: number;
  status: CorporateCaseTaskStatus;
  dueAt: string;
  assignedProfileId: string | null;
}

export interface CorporateCaseFulfillmentRequestContext {
  requestedAction: CorporateAccessCaseAction;
  requestedProfileKey: string;
  requestedProfileLabel: string;
  requestedValidUntil: string | null;
  legacyAccessRequestId: string | null;
  legacyStatus: string | null;
}

export interface CorporateCaseFulfillmentContext {
  workflowEnabled: boolean;
  caseId: string;
  caseVersion: number;
  task: CorporateCaseFulfillmentTaskContext | null;
  request: CorporateCaseFulfillmentRequestContext | null;
  canClaim: boolean;
  canExecute: boolean;
  separationSatisfied: boolean;
  attemptCount: number;
  latestOutcome: CorporateCaseFulfillmentExecutionStatus | null;
}

export interface CorporateCaseFulfillmentMutationResult {
  caseId: string;
  caseVersion: number;
  taskId: string;
  taskVersion: number;
  status: CorporateCaseStatus;
  executionStatus: CorporateCaseFulfillmentExecutionStatus;
  legacyAccessRequestId: string | null;
  assignmentId: string | null;
  failureCode: string | null;
  retryable: boolean;
  idempotent: boolean;
}

export const CORPORATE_CASE_FULFILLMENT_SLA_STATES = [
  'overdue',
  'due_soon',
  'on_track',
] as const;

export type CorporateCaseFulfillmentSlaState =
  typeof CORPORATE_CASE_FULFILLMENT_SLA_STATES[number];

export const CORPORATE_CASE_FULFILLMENT_ATTEMPT_STATES = [
  'not_attempted',
  'failed',
  'deferred',
] as const;

export type CorporateCaseFulfillmentAttemptState =
  typeof CORPORATE_CASE_FULFILLMENT_ATTEMPT_STATES[number];

export interface CorporateCaseFulfillmentQueueItem {
  caseId: string;
  protocol: string;
  subject: string;
  riskLevel: CorporateCaseRiskLevel;
  priority: CorporateCasePriority;
  sensitivity: CorporateCaseSensitivity;
  caseVersion: number;
  taskId: string;
  taskVersion: number;
  taskStatus: CorporateCaseTaskStatus;
  taskDueAt: string;
  slaState: CorporateCaseFulfillmentSlaState;
  assignedGroupLabel: string;
  assignedProfileId: string | null;
  assignedProfileName: string | null;
  beneficiaryName: string | null;
  requestedAction: CorporateAccessCaseAction;
  requestedProfileKey: string;
  requestedProfileLabel: string;
  requestedValidUntil: string | null;
  attemptCount: number;
  attemptState: CorporateCaseFulfillmentAttemptState;
  latestFailureCode: string | null;
  canClaim: boolean;
  canExecute: boolean;
  caseExpired: boolean;
  expiresAt: string;
  updatedAt: string;
}

export type CorporateCaseFulfillmentQueueCursor = { dueAt: string; id: string };

export type CorporateCasesCursor = { timestamp: string; id: string };

type ServiceError = { message?: string; code?: string; details?: string };
type CorporateCasesRpc = (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: ServiceError | null }>;

const invalidPayloadMessage = 'O módulo de chamados retornou dados em formato inesperado.';

export class CorporateCasesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorporateCasesError';
  }
}

function rpc(name: string, args?: Record<string, unknown>): ReturnType<CorporateCasesRpc> {
  return (supabase.rpc as unknown as CorporateCasesRpc)(name, args);
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CorporateCasesError(invalidPayloadMessage);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new CorporateCasesError(invalidPayloadMessage);
  return value;
}

function requireString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new CorporateCasesError(invalidPayloadMessage);
  }
  return value;
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return requireString(value);
}

function requireInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new CorporateCasesError(invalidPayloadMessage);
  }
  return value;
}

function nullableInteger(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return requireInteger(value);
}

function requireBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new CorporateCasesError(invalidPayloadMessage);
  return value;
}

function requireStringArray(value: unknown): string[] {
  const values = requireArray(value);
  if (!values.every((entry) => typeof entry === 'string')) {
    throw new CorporateCasesError(invalidPayloadMessage);
  }
  return values;
}

function parseEnum<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new CorporateCasesError(invalidPayloadMessage);
  }
  return value as T;
}

function parseNotificationLevel(value: unknown): CorporateCaseParticipant['notificationLevel'] {
  return parseEnum(value, ['all', 'important', 'none'] as const);
}

function parseAudience(value: unknown): CorporateCaseEvent['audience'] {
  return parseEnum(value, ['participants', 'internal', 'restricted', 'system'] as const);
}

function parseReadViews(value: unknown): CorporateCasesViewAccess {
  const record = requireRecord(value);
  return Object.fromEntries(CORPORATE_CASE_VIEWS.map((view) => [
    view,
    requireBoolean(record[view]),
  ])) as CorporateCasesViewAccess;
}

function rpcErrorMessage(error: ServiceError, fallback: string): string {
  const source = `${error.message ?? ''} ${error.code ?? ''}`.toLowerCase();
  if (source.includes('corporate_cases_disabled')) {
    return 'O módulo de chamados ainda não está habilitado.';
  }
  if (source.includes('corporate_case_creation_disabled')) {
    return 'A abertura de chamados ainda não está habilitada.';
  }
  if (source.includes('corporate_case_workflow_disabled')) {
    return 'As ações do fluxo ainda não estão habilitadas.';
  }
  if (source.includes('corporate_case_version_conflict')) {
    return 'O chamado foi atualizado por outra pessoa. Recarregue antes de continuar.';
  }
  if (source.includes('corporate_case_group_membership_required')) {
    return 'Você não pertence mais ao grupo responsável por esta etapa.';
  }
  if (source.includes('corporate_case_task_not_claimable')) {
    return 'Esta tarefa já foi assumida ou não está mais disponível.';
  }
  if (source.includes('corporate_case_task_assignment_required')) {
    return 'Assuma esta tarefa antes de encaminhar ou rejeitar o chamado.';
  }
  if (source.includes('corporate_case_fulfillment_separation_required')) {
    return 'A execução exige grupo e permissões válidos e não pode ser realizada por solicitante, beneficiário, revisor ou aprovador do mesmo chamado.';
  }
  if (source.includes('corporate_case_fulfillment_not_current')) {
    return 'A execução não pertence mais à etapa atual do chamado.';
  }
  if (source.includes('corporate_case_approvals_incomplete')) {
    return 'As aprovações exigidas não estão completas ou não atendem ao requisito de Owner.';
  }
  if (source.includes('corporate_case_expired')) {
    return 'O prazo de existência do chamado terminou. Nenhum acesso foi alterado.';
  }
  if (source.includes('corporate_case_access_projection_mismatch')) {
    return 'A projeção de acesso diverge do chamado. Encaminhe para reconciliação antes de executar.';
  }
  if (source.includes('corporate_case_task_not_current')) {
    return 'Esta etapa não é mais a etapa atual do chamado.';
  }
  if (source.includes('corporate_case_approver_count_invalid')) {
    return 'Selecione exatamente a quantidade de aprovadores exigida pelo fluxo.';
  }
  if (source.includes('corporate_case_approver_ineligible')) {
    return 'Um dos aprovadores selecionados não está mais elegível.';
  }
  if (source.includes('corporate_case_owner_approver_required')) {
    return 'Este pacote exige ao menos um SaaS Owner entre os aprovadores.';
  }
  if (source.includes('corporate_case_owner_approval_required')) {
    return 'A consolidação exige uma aprovação válida de SaaS Owner.';
  }
  if (source.includes('corporate_case_approval_separation_required')) {
    return 'Solicitante, beneficiário e responsável pela validação não podem aprovar este chamado.';
  }
  if (source.includes('corporate_case_approval_not_pending')) {
    return 'Esta aprovação já foi decidida ou não pertence mais ao seu perfil.';
  }
  if (source.includes('corporate_case_approval_not_current')) {
    return 'A aprovação não pertence mais à etapa atual do chamado.';
  }
  if (source.includes('corporate_case_approval_not_found')) {
    return 'A aprovação indicada não está disponível para decisão.';
  }
  if (source.includes('corporate_case_approvers_not_allowed')) {
    return 'Esta etapa não permite selecionar aprovadores.';
  }
  if (source.includes('corporate_case_reason_invalid')) {
    return 'A justificativa interna deve ter entre 20 e 2.000 caracteres.';
  }
  if (source.includes('corporate_case_next_stage_unavailable')) {
    return 'A próxima etapa do fluxo não está disponível.';
  }
  if (source.includes('corporate_case_not_found')) {
    return 'Chamado não encontrado ou indisponível para o seu perfil.';
  }
  if (source.includes('aal2') || source.includes('unauthorized')) {
    return 'Confirme o MFA novamente para acessar os chamados.';
  }
  if (source.includes('forbidden')) {
    return 'Seu perfil não possui acesso a esta área de chamados.';
  }
  if (source.includes('invalid_corporate_')) {
    return 'Os filtros informados para os chamados são inválidos.';
  }
  if (source.includes('corporate_case_beneficiary_not_found')) {
    return 'A pessoa beneficiária não é uma identidade Control ativa.';
  }
  if (source.includes('corporate_case_observer_not_found')) {
    return 'Um dos observadores não é uma identidade Control ativa.';
  }
  if (source.includes('corporate_access_profile_not_found')) {
    return 'O pacote de acesso selecionado não está mais disponível.';
  }
  if (source.includes('corporate_access_expiry_required')) {
    return 'O pacote selecionado exige uma data de expiração.';
  }
  if (source.includes('corporate_access_expiry_invalid')) {
    return 'A expiração deve estar no futuro e limitada a 366 dias.';
  }
  if (source.includes('control_assignment_already_active')) {
    return 'A pessoa já possui esse pacote de acesso ativo.';
  }
  if (source.includes('control_assignment_not_active')) {
    return 'A pessoa não possui esse pacote ativo para revogação.';
  }
  if (source.includes('idempotency_conflict')) {
    return 'A tentativa de envio conflita com outra solicitação. Revise e envie novamente.';
  }
  return fallback;
}

function throwRpcError(error: ServiceError | null, fallback: string): void {
  if (error) throw new CorporateCasesError(rpcErrorMessage(error, fallback));
}

export function parseCorporateCasesReadContext(value: unknown): CorporateCasesReadContext {
  const record = requireRecord(value);
  return {
    enabled: requireBoolean(record.enabled),
    creationEnabled: requireBoolean(record.creation_enabled),
    permissions: requireStringArray(record.permissions),
    views: parseReadViews(record.views),
  };
}

export function parseCorporateCaseType(value: unknown): CorporateCaseType {
  const record = requireRecord(value);
  return {
    typeId: requireString(record.type_id),
    typeKey: requireString(record.type_key),
    area: requireString(record.area),
    category: requireString(record.category),
    label: requireString(record.label),
    description: requireString(record.description),
    formKey: requireString(record.form_key),
    formVersion: requireInteger(record.form_version),
    defaultRisk: parseEnum(record.default_risk, CORPORATE_CASE_RISK_LEVELS),
    sensitivity: parseEnum(record.sensitivity, CORPORATE_CASE_SENSITIVITIES),
    requiresBeneficiary: requireBoolean(record.requires_beneficiary),
  };
}

export function parseCorporateCaseSummary(value: unknown): CorporateCaseSummary {
  const record = requireRecord(value);
  return {
    caseId: requireString(record.case_id),
    protocol: requireString(record.protocol),
    caseTypeKey: requireString(record.case_type_key),
    caseTypeLabel: requireString(record.case_type_label),
    riskLevel: parseEnum(record.risk_level, CORPORATE_CASE_RISK_LEVELS),
    priority: parseEnum(record.priority, CORPORATE_CASE_PRIORITIES),
    sensitivity: parseEnum(record.sensitivity, CORPORATE_CASE_SENSITIVITIES),
    status: parseEnum(record.status, CORPORATE_CASE_STATUSES),
    subject: requireString(record.subject),
    summary: requireString(record.summary),
    currentStageOrder: nullableInteger(record.current_stage_order),
    currentGroupLabel: nullableString(record.current_group_label),
    currentAssigneeName: nullableString(record.current_assignee_name),
    requesterName: requireString(record.requester_name),
    beneficiaryName: nullableString(record.beneficiary_name),
    expiresAt: requireString(record.expires_at),
    updatedAt: requireString(record.updated_at),
    createdAt: requireString(record.created_at),
    version: requireInteger(record.version),
  };
}

function parseParticipant(value: unknown): CorporateCaseParticipant {
  const record = requireRecord(value);
  return {
    profileId: requireString(record.profile_id),
    name: requireString(record.name),
    role: parseEnum(record.role, CORPORATE_CASE_PARTICIPANT_ROLES),
    notificationLevel: parseNotificationLevel(record.notification_level),
    createdAt: requireString(record.created_at),
  };
}

function parseTask(value: unknown): CorporateCaseTask {
  const record = requireRecord(value);
  return {
    taskId: requireString(record.task_id),
    stageOrder: requireInteger(record.stage_order),
    taskType: parseEnum(record.task_type, CORPORATE_CASE_TASK_TYPES),
    assignedGroupId: requireString(record.assigned_group_id),
    assignedGroupLabel: requireString(record.assigned_group_label),
    assignedProfileId: nullableString(record.assigned_profile_id),
    assignedProfileName: nullableString(record.assigned_profile_name),
    status: parseEnum(record.status, CORPORATE_CASE_TASK_STATUSES),
    dueAt: requireString(record.due_at),
    completedAt: nullableString(record.completed_at),
    version: requireInteger(record.version),
    createdAt: requireString(record.created_at),
    updatedAt: requireString(record.updated_at),
  };
}

function parseApproval(value: unknown): CorporateCaseApproval {
  const record = requireRecord(value);
  return {
    approvalId: requireString(record.approval_id),
    taskId: requireString(record.task_id),
    slotOrder: requireInteger(record.slot_order),
    requestedApproverProfileId: nullableString(record.requested_approver_profile_id),
    requestedApproverName: nullableString(record.requested_approver_name),
    requestedApproverGroupId: nullableString(record.requested_approver_group_id),
    requestedApproverGroupLabel: nullableString(record.requested_approver_group_label),
    decision: parseEnum(record.decision, CORPORATE_CASE_APPROVAL_DECISIONS),
    decidedByName: nullableString(record.decided_by_name),
    decisionReason: nullableString(record.decision_reason),
    decidedAt: nullableString(record.decided_at),
    dueAt: requireString(record.due_at),
    createdAt: requireString(record.created_at),
  };
}

function parseMessage(value: unknown): CorporateCaseMessage {
  const record = requireRecord(value);
  return {
    messageId: requireString(record.message_id),
    authorProfileId: nullableString(record.author_profile_id),
    authorName: requireString(record.author_name),
    visibility: parseEnum(record.visibility, CORPORATE_CASE_MESSAGE_VISIBILITIES),
    body: requireString(record.body),
    createdAt: requireString(record.created_at),
    editedAt: nullableString(record.edited_at),
  };
}

function parseEvent(value: unknown): CorporateCaseEvent {
  const record = requireRecord(value);
  return {
    eventId: requireString(record.event_id),
    eventType: requireString(record.event_type),
    actorProfileId: nullableString(record.actor_profile_id),
    actorName: requireString(record.actor_name),
    audience: parseAudience(record.audience),
    payload: requireRecord(record.payload),
    createdAt: requireString(record.created_at),
  };
}

function parseDetailCase(value: unknown): CorporateCaseDetailRecord {
  const record = requireRecord(value);
  const summary = parseCorporateCaseSummary(record);
  return {
    ...summary,
    caseNumber: requireInteger(record.case_number),
    area: requireString(record.area),
    category: requireString(record.category),
    formKey: requireString(record.form_key),
    formVersion: requireInteger(record.form_version),
    requesterProfileId: requireString(record.requester_profile_id),
    beneficiaryProfileId: nullableString(record.beneficiary_profile_id),
    currentGroupId: nullableString(record.current_group_id),
    currentAssigneeProfileId: nullableString(record.current_assignee_profile_id),
    formPayload: requireRecord(record.form_payload),
    externalReference: nullableString(record.external_reference),
    resolvedAt: nullableString(record.resolved_at),
    closedAt: nullableString(record.closed_at),
  };
}

export function parseCorporateCaseDetail(value: unknown): CorporateCaseDetail {
  const record = requireRecord(value);
  const visibility = requireRecord(record.visibility);
  return {
    case: parseDetailCase(record.case),
    visibility: {
      internal: requireBoolean(visibility.internal),
      restricted: requireBoolean(visibility.restricted),
    },
    participants: requireArray(record.participants).map(parseParticipant),
    tasks: requireArray(record.tasks).map(parseTask),
    approvals: requireArray(record.approvals).map(parseApproval),
    messages: requireArray(record.messages).map(parseMessage),
    events: requireArray(record.events).map(parseEvent),
  };
}

export function parseCorporateNotification(value: unknown): CorporateNotification {
  const record = requireRecord(value);
  return {
    notificationId: requireString(record.notification_id),
    eventId: requireString(record.event_id),
    eventCategory: requireString(record.event_category),
    importance: parseEnum(record.importance, CORPORATE_CASE_PRIORITIES),
    title: requireString(record.title),
    body: requireString(record.body),
    routePayload: requireRecord(record.route_payload),
    readAt: nullableString(record.read_at),
    createdAt: requireString(record.created_at),
  };
}

export function parseCorporateAccessRequestProfile(value: unknown): CorporateAccessRequestProfile {
  const record = requireRecord(value);
  return {
    profileId: requireString(record.profile_id),
    profileKey: requireString(record.profile_key),
    label: requireString(record.label),
    description: requireString(record.description),
    riskLevel: parseEnum(record.risk_level, CORPORATE_CASE_RISK_LEVELS),
    requiredApprovals: requireInteger(record.required_approvals),
    requiresOwnerApproval: requireBoolean(record.requires_owner_approval),
    requiresExpiry: requireBoolean(record.requires_expiry),
    reviewIntervalDays: requireInteger(record.review_interval_days),
  };
}

export function parseCorporateCaseIdentity(value: unknown): CorporateCaseIdentity {
  const record = requireRecord(value);
  return {
    profileId: requireString(record.profile_id),
    name: requireString(record.name),
    email: requireString(record.email),
  };
}

export function parseCorporateAccessCaseCreationResult(
  value: unknown,
): CorporateAccessCaseCreationResult {
  const record = requireRecord(value);
  return {
    caseId: requireString(record.case_id),
    protocol: requireString(record.protocol),
    status: parseEnum(record.status, CORPORATE_CASE_STATUSES),
    version: requireInteger(record.version),
    createdAt: requireString(record.created_at),
    idempotent: requireBoolean(record.idempotent),
  };
}

function parseWorkflowTask(value: unknown): CorporateCaseWorkflowTaskContext {
  const record = requireRecord(value);
  return {
    taskId: requireString(record.task_id),
    stageOrder: requireInteger(record.stage_order),
    taskType: parseEnum(record.task_type, CORPORATE_CASE_TASK_TYPES),
    assignedGroupId: requireString(record.assigned_group_id),
    assignedProfileId: nullableString(record.assigned_profile_id),
    status: parseEnum(record.status, CORPORATE_CASE_TASK_STATUSES),
    dueAt: requireString(record.due_at),
    version: requireInteger(record.version),
  };
}

function parseWorkflowNextStage(value: unknown): CorporateCaseWorkflowNextStage {
  const record = requireRecord(value);
  return {
    stageOrder: requireInteger(record.stage_order),
    stageKey: requireString(record.stage_key),
    label: requireString(record.label),
    taskType: parseEnum(record.task_type, CORPORATE_CASE_TASK_TYPES),
    targetGroupId: requireString(record.target_group_id),
    requiredApprovals: requireInteger(record.required_approvals),
    requiresOwnerApproval: requireBoolean(record.requires_owner_approval),
    requiresDistinctActor: requireBoolean(record.requires_distinct_actor),
  };
}

function parseWorkflowApprover(value: unknown): CorporateCaseWorkflowApprover {
  const record = requireRecord(value);
  return {
    ...parseCorporateCaseIdentity(record),
    isOwner: requireBoolean(record.is_owner),
  };
}

export function parseCorporateCaseActionContext(value: unknown): CorporateCaseActionContext {
  const record = requireRecord(value);
  return {
    workflowEnabled: requireBoolean(record.workflow_enabled),
    caseId: requireString(record.case_id),
    caseVersion: requireInteger(record.case_version),
    task: record.task === null ? null : parseWorkflowTask(record.task),
    canClaim: requireBoolean(record.can_claim),
    canAdvance: requireBoolean(record.can_advance),
    nextStage: record.next_stage === null ? null : parseWorkflowNextStage(record.next_stage),
    eligibleApprovers: requireArray(record.eligible_approvers).map(parseWorkflowApprover),
  };
}

export function parseCorporateCaseWorkflowMutationResult(
  value: unknown,
): CorporateCaseWorkflowMutationResult {
  const record = requireRecord(value);
  return {
    caseId: requireString(record.case_id),
    caseVersion: requireInteger(record.case_version),
    taskId: requireString(record.task_id),
    taskVersion: requireInteger(record.task_version),
    status: parseEnum(record.status, CORPORATE_CASE_STATUSES),
    nextTaskId: nullableString(record.next_task_id),
    idempotent: requireBoolean(record.idempotent),
  };
}

function parseApprovalTaskContext(value: unknown): CorporateCaseApprovalTaskContext {
  const record = requireRecord(value);
  return {
    taskId: requireString(record.task_id),
    taskVersion: requireInteger(record.task_version),
    status: parseEnum(record.status, CORPORATE_CASE_TASK_STATUSES),
    dueAt: requireString(record.due_at),
  };
}

function parseApprovalSlotContext(value: unknown): CorporateCaseApprovalSlotContext {
  const record = requireRecord(value);
  return {
    approvalId: requireString(record.approval_id),
    approvalVersion: requireInteger(record.approval_version),
    slotOrder: requireInteger(record.slot_order),
    decision: parseEnum(record.decision, CORPORATE_CASE_APPROVAL_DECISIONS),
    dueAt: requireString(record.due_at),
  };
}

export function parseCorporateCaseApprovalContext(value: unknown): CorporateCaseApprovalContext {
  const record = requireRecord(value);
  return {
    workflowEnabled: requireBoolean(record.workflow_enabled),
    caseId: requireString(record.case_id),
    caseVersion: requireInteger(record.case_version),
    task: record.task === null ? null : parseApprovalTaskContext(record.task),
    approval: record.approval === null ? null : parseApprovalSlotContext(record.approval),
    canDecide: requireBoolean(record.can_decide),
    approvedCount: requireInteger(record.approved_count),
    pendingCount: requireInteger(record.pending_count),
    requiredApprovals: requireInteger(record.required_approvals),
    requiresOwnerApproval: requireBoolean(record.requires_owner_approval),
  };
}

export function parseCorporateCaseApprovalMutationResult(
  value: unknown,
): CorporateCaseApprovalMutationResult {
  const record = requireRecord(value);
  return {
    caseId: requireString(record.case_id),
    caseVersion: requireInteger(record.case_version),
    taskId: requireString(record.task_id),
    taskVersion: requireInteger(record.task_version),
    approvalId: requireString(record.approval_id),
    approvalVersion: requireInteger(record.approval_version),
    status: parseEnum(record.status, CORPORATE_CASE_STATUSES),
    nextTaskId: nullableString(record.next_task_id),
    approvedCount: requireInteger(record.approved_count),
    requiredApprovals: requireInteger(record.required_approvals),
    idempotent: requireBoolean(record.idempotent),
  };
}

function parseFulfillmentExecutionStatus(
  value: unknown,
): CorporateCaseFulfillmentExecutionStatus {
  return parseEnum(value, ['applied', 'failed', 'deferred'] as const);
}

function parseFulfillmentTaskContext(value: unknown): CorporateCaseFulfillmentTaskContext {
  const record = requireRecord(value);
  return {
    taskId: requireString(record.task_id),
    taskVersion: requireInteger(record.task_version),
    status: parseEnum(record.status, CORPORATE_CASE_TASK_STATUSES),
    dueAt: requireString(record.due_at),
    assignedProfileId: nullableString(record.assigned_profile_id),
  };
}

function parseFulfillmentRequestContext(value: unknown): CorporateCaseFulfillmentRequestContext {
  const record = requireRecord(value);
  return {
    requestedAction: parseEnum(record.requested_action, ['grant', 'revoke'] as const),
    requestedProfileKey: requireString(record.requested_profile_key),
    requestedProfileLabel: requireString(record.requested_profile_label),
    requestedValidUntil: nullableString(record.requested_valid_until),
    legacyAccessRequestId: nullableString(record.legacy_access_request_id),
    legacyStatus: nullableString(record.legacy_status),
  };
}

export function parseCorporateCaseFulfillmentContext(
  value: unknown,
): CorporateCaseFulfillmentContext {
  const record = requireRecord(value);
  return {
    workflowEnabled: requireBoolean(record.workflow_enabled),
    caseId: requireString(record.case_id),
    caseVersion: requireInteger(record.case_version),
    task: record.task === null ? null : parseFulfillmentTaskContext(record.task),
    request: record.request === null ? null : parseFulfillmentRequestContext(record.request),
    canClaim: requireBoolean(record.can_claim),
    canExecute: requireBoolean(record.can_execute),
    separationSatisfied: requireBoolean(record.separation_satisfied),
    attemptCount: requireInteger(record.attempt_count),
    latestOutcome: record.latest_outcome === null
      ? null
      : parseFulfillmentExecutionStatus(record.latest_outcome),
  };
}

export function parseCorporateCaseFulfillmentMutationResult(
  value: unknown,
): CorporateCaseFulfillmentMutationResult {
  const record = requireRecord(value);
  return {
    caseId: requireString(record.case_id),
    caseVersion: requireInteger(record.case_version),
    taskId: requireString(record.task_id),
    taskVersion: requireInteger(record.task_version),
    status: parseEnum(record.status, CORPORATE_CASE_STATUSES),
    executionStatus: parseFulfillmentExecutionStatus(record.execution_status),
    legacyAccessRequestId: nullableString(record.legacy_access_request_id),
    assignmentId: nullableString(record.assignment_id),
    failureCode: nullableString(record.failure_code),
    retryable: requireBoolean(record.retryable),
    idempotent: requireBoolean(record.idempotent),
  };
}

export function parseCorporateCaseFulfillmentQueueItem(
  value: unknown,
): CorporateCaseFulfillmentQueueItem {
  const record = requireRecord(value);
  return {
    caseId: requireString(record.case_id),
    protocol: requireString(record.protocol),
    subject: requireString(record.subject),
    riskLevel: parseEnum(record.risk_level, CORPORATE_CASE_RISK_LEVELS),
    priority: parseEnum(record.priority, CORPORATE_CASE_PRIORITIES),
    sensitivity: parseEnum(record.sensitivity, CORPORATE_CASE_SENSITIVITIES),
    caseVersion: requireInteger(record.case_version),
    taskId: requireString(record.task_id),
    taskVersion: requireInteger(record.task_version),
    taskStatus: parseEnum(record.task_status, CORPORATE_CASE_TASK_STATUSES),
    taskDueAt: requireString(record.task_due_at),
    slaState: parseEnum(record.sla_state, CORPORATE_CASE_FULFILLMENT_SLA_STATES),
    assignedGroupLabel: requireString(record.assigned_group_label),
    assignedProfileId: nullableString(record.assigned_profile_id),
    assignedProfileName: nullableString(record.assigned_profile_name),
    beneficiaryName: nullableString(record.beneficiary_name),
    requestedAction: parseEnum(record.requested_action, ['grant', 'revoke'] as const),
    requestedProfileKey: requireString(record.requested_profile_key),
    requestedProfileLabel: requireString(record.requested_profile_label),
    requestedValidUntil: nullableString(record.requested_valid_until),
    attemptCount: requireInteger(record.attempt_count),
    attemptState: parseEnum(
      record.attempt_state,
      CORPORATE_CASE_FULFILLMENT_ATTEMPT_STATES,
    ),
    latestFailureCode: nullableString(record.latest_failure_code),
    canClaim: requireBoolean(record.can_claim),
    canExecute: requireBoolean(record.can_execute),
    caseExpired: requireBoolean(record.case_expired),
    expiresAt: requireString(record.expires_at),
    updatedAt: requireString(record.updated_at),
  };
}

function validateLimit(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new CorporateCasesError('A quantidade de chamados deve ficar entre 1 e 100.');
  }
  return limit;
}

export async function getCorporateCasesReadContext(): Promise<CorporateCasesReadContext> {
  const result = await rpc('get_corporate_cases_read_context');
  throwRpcError(result.error, 'Não foi possível consultar a disponibilidade dos chamados.');
  return parseCorporateCasesReadContext(result.data);
}

export async function listCorporateCaseTypes(): Promise<CorporateCaseType[]> {
  const result = await rpc('list_corporate_case_types');
  throwRpcError(result.error, 'Não foi possível consultar os tipos de chamado.');
  return requireArray(result.data).map(parseCorporateCaseType);
}

export async function listCorporateCases(options: {
  view?: CorporateCaseView;
  status?: CorporateCaseStatus | null;
  limit?: number;
  cursor?: CorporateCasesCursor | null;
} = {}): Promise<CorporateCaseSummary[]> {
  const view = options.view ?? 'mine';
  if (!CORPORATE_CASE_VIEWS.includes(view)) {
    throw new CorporateCasesError('Selecione uma visão válida de chamados.');
  }
  if (options.status && !CORPORATE_CASE_STATUSES.includes(options.status)) {
    throw new CorporateCasesError('Selecione um status válido de chamados.');
  }
  const limit = validateLimit(options.limit ?? 50);
  const result = await rpc('list_corporate_cases', {
    target_view: view,
    target_status: options.status ?? null,
    target_limit: limit,
    target_cursor_updated_at: options.cursor?.timestamp ?? null,
    target_cursor_id: options.cursor?.id ?? null,
  });
  throwRpcError(result.error, 'Não foi possível consultar os chamados.');
  return requireArray(result.data).map(parseCorporateCaseSummary);
}

export async function getCorporateCaseDetail(caseId: string): Promise<CorporateCaseDetail> {
  if (!caseId.trim()) throw new CorporateCasesError('Informe um chamado válido.');
  const result = await rpc('get_corporate_case_detail', { target_case_id: caseId });
  throwRpcError(result.error, 'Não foi possível consultar o chamado.');
  return parseCorporateCaseDetail(result.data);
}

export async function getCorporateCaseActionContext(
  caseId: string,
): Promise<CorporateCaseActionContext> {
  if (!caseId.trim()) throw new CorporateCasesError('Informe um chamado válido.');
  const result = await rpc('get_corporate_case_action_context', { target_case_id: caseId.trim() });
  throwRpcError(result.error, 'Não foi possível consultar as ações disponíveis para o chamado.');
  return parseCorporateCaseActionContext(result.data);
}

export async function listCorporateCaseApprovalCandidates(input: {
  caseId: string;
  taskId: string;
}): Promise<CorporateCaseWorkflowApprover[]> {
  if (!input.caseId.trim() || !input.taskId.trim()) {
    throw new CorporateCasesError('Não foi possível identificar a validação atual.');
  }
  const result = await rpc('list_corporate_case_approval_candidates', {
    target_case_id: input.caseId.trim(),
    target_task_id: input.taskId.trim(),
  });
  throwRpcError(result.error, 'Não foi possível consultar os aprovadores elegíveis.');
  return requireArray(result.data).map(parseWorkflowApprover);
}

export async function getCorporateCaseApprovalContext(
  caseId: string,
): Promise<CorporateCaseApprovalContext> {
  if (!caseId.trim()) throw new CorporateCasesError('Informe um chamado válido.');
  const result = await rpc('get_corporate_case_approval_context', {
    target_case_id: caseId.trim(),
  });
  throwRpcError(result.error, 'Não foi possível consultar a aprovação indicada.');
  return parseCorporateCaseApprovalContext(result.data);
}

export async function decideCorporateCaseApproval(input: {
  caseId: string;
  taskId: string;
  approvalId: string;
  expectedCaseVersion: number;
  expectedTaskVersion: number;
  expectedApprovalVersion: number;
  decision: 'approve' | 'reject';
  reason: string;
  clientRequestId: string;
}): Promise<CorporateCaseApprovalMutationResult> {
  const reason = input.reason.trim();
  if (
    !input.caseId.trim()
    || !input.taskId.trim()
    || !input.approvalId.trim()
    || !input.clientRequestId.trim()
  ) {
    throw new CorporateCasesError('Não foi possível identificar a aprovação a decidir.');
  }
  if (
    input.expectedCaseVersion < 1
    || input.expectedTaskVersion < 1
    || input.expectedApprovalVersion < 1
  ) {
    throw new CorporateCasesError('Recarregue o chamado antes de decidir a aprovação.');
  }
  if (input.decision !== 'approve' && input.decision !== 'reject') {
    throw new CorporateCasesError('Selecione uma decisão de aprovação válida.');
  }
  if (reason.length < 20 || reason.length > 2000) {
    throw new CorporateCasesError('A justificativa interna deve ter entre 20 e 2.000 caracteres.');
  }
  const result = await rpc('decide_corporate_case_approval', {
    target_case_id: input.caseId.trim(),
    target_task_id: input.taskId.trim(),
    target_approval_id: input.approvalId.trim(),
    target_expected_case_version: input.expectedCaseVersion,
    target_expected_task_version: input.expectedTaskVersion,
    target_expected_approval_version: input.expectedApprovalVersion,
    target_decision: input.decision,
    target_reason: reason,
    target_client_request_id: input.clientRequestId.trim(),
  });
  throwRpcError(result.error, input.decision === 'approve'
    ? 'Não foi possível registrar a aprovação.'
    : 'Não foi possível registrar a rejeição.');
  return parseCorporateCaseApprovalMutationResult(result.data);
}

export async function getCorporateCaseFulfillmentContext(
  caseId: string,
): Promise<CorporateCaseFulfillmentContext> {
  if (!caseId.trim()) throw new CorporateCasesError('Informe um chamado válido.');
  const result = await rpc('get_corporate_case_fulfillment_context', {
    target_case_id: caseId.trim(),
  });
  throwRpcError(result.error, 'Não foi possível consultar a execução deste chamado.');
  return parseCorporateCaseFulfillmentContext(result.data);
}

export async function listCorporateCaseFulfillmentQueue(options: {
  priority?: CorporateCasePriority | null;
  slaState?: CorporateCaseFulfillmentSlaState | null;
  attemptState?: CorporateCaseFulfillmentAttemptState | null;
  limit?: number;
  cursor?: CorporateCaseFulfillmentQueueCursor | null;
} = {}): Promise<CorporateCaseFulfillmentQueueItem[]> {
  if (options.priority && !CORPORATE_CASE_PRIORITIES.includes(options.priority)) {
    throw new CorporateCasesError('Selecione uma prioridade válida para a execução.');
  }
  if (
    options.slaState
    && !CORPORATE_CASE_FULFILLMENT_SLA_STATES.includes(options.slaState)
  ) {
    throw new CorporateCasesError('Selecione uma situação de prazo válida.');
  }
  if (
    options.attemptState
    && !CORPORATE_CASE_FULFILLMENT_ATTEMPT_STATES.includes(options.attemptState)
  ) {
    throw new CorporateCasesError('Selecione um estado de tentativa válido.');
  }
  const limit = validateLimit(options.limit ?? 50);
  const result = await rpc('list_corporate_case_fulfillment_queue', {
    target_priority: options.priority ?? null,
    target_sla_state: options.slaState ?? null,
    target_attempt_state: options.attemptState ?? null,
    target_limit: limit,
    target_cursor_due_at: options.cursor?.dueAt ?? null,
    target_cursor_id: options.cursor?.id ?? null,
  });
  throwRpcError(result.error, 'Não foi possível consultar a fila de execução.');
  return requireArray(result.data).map(parseCorporateCaseFulfillmentQueueItem);
}

export async function claimCorporateCaseFulfillment(input: {
  caseId: string;
  taskId: string;
  expectedCaseVersion: number;
  expectedTaskVersion: number;
  clientRequestId: string;
}): Promise<CorporateCaseWorkflowMutationResult> {
  if (!input.caseId.trim() || !input.taskId.trim() || !input.clientRequestId.trim()) {
    throw new CorporateCasesError('Não foi possível identificar a execução a assumir.');
  }
  if (input.expectedCaseVersion < 1 || input.expectedTaskVersion < 1) {
    throw new CorporateCasesError('Recarregue o chamado antes de assumir a execução.');
  }
  const result = await rpc('claim_corporate_case_fulfillment', {
    target_case_id: input.caseId.trim(),
    target_task_id: input.taskId.trim(),
    target_expected_case_version: input.expectedCaseVersion,
    target_expected_task_version: input.expectedTaskVersion,
    target_client_request_id: input.clientRequestId.trim(),
  });
  throwRpcError(result.error, 'Não foi possível assumir esta execução.');
  return parseCorporateCaseWorkflowMutationResult({
    ...requireRecord(result.data),
    next_task_id: null,
  });
}

export async function executeCorporateAccessFulfillment(input: {
  caseId: string;
  taskId: string;
  expectedCaseVersion: number;
  expectedTaskVersion: number;
  operation: 'apply' | 'defer';
  reason: string;
  clientRequestId: string;
}): Promise<CorporateCaseFulfillmentMutationResult> {
  const reason = input.reason.trim();
  if (!input.caseId.trim() || !input.taskId.trim() || !input.clientRequestId.trim()) {
    throw new CorporateCasesError('Não foi possível identificar a execução a concluir.');
  }
  if (input.expectedCaseVersion < 1 || input.expectedTaskVersion < 1) {
    throw new CorporateCasesError('Recarregue o chamado antes de executar a solicitação.');
  }
  if (input.operation !== 'apply' && input.operation !== 'defer') {
    throw new CorporateCasesError('Selecione uma operação válida para a execução.');
  }
  if (reason.length < 20 || reason.length > 2000) {
    throw new CorporateCasesError('A justificativa interna deve ter entre 20 e 2.000 caracteres.');
  }
  const result = await rpc('execute_corporate_access_fulfillment', {
    target_case_id: input.caseId.trim(),
    target_task_id: input.taskId.trim(),
    target_expected_case_version: input.expectedCaseVersion,
    target_expected_task_version: input.expectedTaskVersion,
    target_operation: input.operation,
    target_reason: reason,
    target_client_request_id: input.clientRequestId.trim(),
  });
  throwRpcError(result.error, input.operation === 'apply'
    ? 'Não foi possível aplicar a solicitação de acesso.'
    : 'Não foi possível devolver a execução para a fila.');
  return parseCorporateCaseFulfillmentMutationResult(result.data);
}

export async function claimCorporateCaseTask(input: {
  caseId: string;
  taskId: string;
  expectedCaseVersion: number;
  expectedTaskVersion: number;
  clientRequestId: string;
}): Promise<CorporateCaseWorkflowMutationResult> {
  if (!input.caseId.trim() || !input.taskId.trim() || !input.clientRequestId.trim()) {
    throw new CorporateCasesError('Não foi possível identificar a tarefa a assumir.');
  }
  if (input.expectedCaseVersion < 1 || input.expectedTaskVersion < 1) {
    throw new CorporateCasesError('Recarregue o chamado antes de assumir a tarefa.');
  }
  const result = await rpc('claim_corporate_case_task', {
    target_case_id: input.caseId.trim(),
    target_task_id: input.taskId.trim(),
    target_expected_case_version: input.expectedCaseVersion,
    target_expected_task_version: input.expectedTaskVersion,
    target_client_request_id: input.clientRequestId.trim(),
  });
  throwRpcError(result.error, 'Não foi possível assumir esta tarefa.');
  return parseCorporateCaseWorkflowMutationResult(result.data);
}

export async function advanceCorporateCaseTask(input: {
  caseId: string;
  taskId: string;
  expectedCaseVersion: number;
  expectedTaskVersion: number;
  decision: 'advance' | 'reject';
  reason: string;
  approverProfileIds?: string[];
  clientRequestId: string;
}): Promise<CorporateCaseWorkflowMutationResult> {
  const reason = input.reason.trim();
  const approverProfileIds = [...new Set(input.approverProfileIds ?? [])];
  if (!input.caseId.trim() || !input.taskId.trim() || !input.clientRequestId.trim()) {
    throw new CorporateCasesError('Não foi possível identificar a etapa do chamado.');
  }
  if (input.expectedCaseVersion < 1 || input.expectedTaskVersion < 1) {
    throw new CorporateCasesError('Recarregue o chamado antes de continuar.');
  }
  if (input.decision !== 'advance' && input.decision !== 'reject') {
    throw new CorporateCasesError('Selecione uma decisão válida para a etapa.');
  }
  if (reason.length < 20 || reason.length > 2000) {
    throw new CorporateCasesError('A justificativa interna deve ter entre 20 e 2.000 caracteres.');
  }
  if (input.decision === 'reject' && approverProfileIds.length > 0) {
    throw new CorporateCasesError('A rejeição não permite selecionar aprovadores.');
  }
  const result = await rpc('advance_corporate_case_task', {
    target_case_id: input.caseId.trim(),
    target_task_id: input.taskId.trim(),
    target_expected_case_version: input.expectedCaseVersion,
    target_expected_task_version: input.expectedTaskVersion,
    target_decision: input.decision,
    target_reason: reason,
    target_approver_profile_ids: approverProfileIds,
    target_client_request_id: input.clientRequestId.trim(),
  });
  throwRpcError(result.error, input.decision === 'reject'
    ? 'Não foi possível rejeitar o chamado.'
    : 'Não foi possível encaminhar o chamado.');
  return parseCorporateCaseWorkflowMutationResult(result.data);
}

export async function listCorporateNotifications(options: {
  unreadOnly?: boolean;
  limit?: number;
  cursor?: CorporateCasesCursor | null;
} = {}): Promise<CorporateNotification[]> {
  const limit = validateLimit(options.limit ?? 50);
  const result = await rpc('list_corporate_notifications', {
    target_unread_only: options.unreadOnly ?? false,
    target_limit: limit,
    target_cursor_created_at: options.cursor?.timestamp ?? null,
    target_cursor_id: options.cursor?.id ?? null,
  });
  throwRpcError(result.error, 'Não foi possível consultar as notificações de chamados.');
  return requireArray(result.data).map(parseCorporateNotification);
}

export function createCorporateCaseIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new CorporateCasesError(
      'Este navegador não oferece geração segura de identificadores. Atualize-o para continuar.',
    );
  }
  return globalThis.crypto.randomUUID();
}

export function parseCorporateAccessExpiryInput(
  value: string,
  now = Date.now(),
): string | null {
  const dateInput = value.trim();
  if (!dateInput) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput);
  if (!match) {
    throw new CorporateCasesError('Informe a expiração no formato AAAA-MM-DD.');
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarProbe = new Date(Date.UTC(year, month - 1, day));
  const validCalendarDate = calendarProbe.getUTCFullYear() === year
    && calendarProbe.getUTCMonth() === month - 1
    && calendarProbe.getUTCDate() === day;
  const expiration = new Date(`${dateInput}T23:59:59.999-03:00`);
  const maximum = now + (366 * 24 * 60 * 60 * 1000);
  if (!validCalendarDate || expiration.getTime() <= now || expiration.getTime() > maximum) {
    throw new CorporateCasesError('A expiração deve estar no futuro e limitada a 366 dias.');
  }
  return expiration.toISOString();
}

export async function listCorporateAccessRequestProfiles(): Promise<CorporateAccessRequestProfile[]> {
  const result = await rpc('list_corporate_access_request_profiles');
  throwRpcError(result.error, 'Não foi possível consultar os pacotes de acesso.');
  return requireArray(result.data).map(parseCorporateAccessRequestProfile);
}

export async function findCorporateCaseIdentityByEmail(
  emailValue: string,
): Promise<CorporateCaseIdentity | null> {
  const email = emailValue.trim().toLowerCase();
  if (email.length < 3 || email.length > 320 || !email.includes('@')) {
    throw new CorporateCasesError('Informe um e-mail corporativo válido.');
  }
  const result = await rpc('find_corporate_case_participant_by_email', {
    target_email: email,
  });
  throwRpcError(result.error, 'Não foi possível localizar a identidade informada.');
  const rows = requireArray(result.data);
  if (rows.length > 1) throw new CorporateCasesError(invalidPayloadMessage);
  return rows.length === 0 ? null : parseCorporateCaseIdentity(rows[0]);
}

export async function createCorporateAccessCase(input: {
  beneficiaryProfileId: string;
  requestedProfileKey: string;
  action: CorporateAccessCaseAction;
  sourceProfileKey?: string | null;
  validUntil?: string | null;
  justification: string;
  observerProfileIds?: string[];
  clientRequestId: string;
}): Promise<CorporateAccessCaseCreationResult> {
  const beneficiaryProfileId = input.beneficiaryProfileId.trim();
  const requestedProfileKey = input.requestedProfileKey.trim();
  const justification = input.justification.trim();
  const observers = [...new Set(input.observerProfileIds ?? [])];
  if (!beneficiaryProfileId || !requestedProfileKey || !input.clientRequestId.trim()) {
    throw new CorporateCasesError('Preencha a pessoa, o pacote e o identificador da solicitação.');
  }
  if (input.action !== 'grant' && input.action !== 'revoke') {
    throw new CorporateCasesError('Selecione uma ação de acesso válida.');
  }
  if (justification.length < 20 || justification.length > 2000) {
    throw new CorporateCasesError('A justificativa deve ter entre 20 e 2.000 caracteres.');
  }
  if (observers.length > 10 || observers.some((profileId) => !profileId.trim())) {
    throw new CorporateCasesError('Inclua no máximo 10 observadores válidos.');
  }
  if (observers.includes(beneficiaryProfileId)) {
    throw new CorporateCasesError('A pessoa beneficiária já acompanha o chamado automaticamente.');
  }
  if (input.validUntil) {
    const timestamp = new Date(input.validUntil).getTime();
    if (Number.isNaN(timestamp) || timestamp <= Date.now()) {
      throw new CorporateCasesError('Informe uma data de expiração futura.');
    }
  }

  const result = await rpc('create_corporate_access_case', {
    target_beneficiary_profile_id: beneficiaryProfileId,
    target_requested_profile_key: requestedProfileKey,
    target_action: input.action,
    target_source_profile_key: input.sourceProfileKey?.trim() || null,
    target_valid_until: input.validUntil ?? null,
    target_justification: justification,
    target_observer_profile_ids: observers,
    target_client_request_id: input.clientRequestId.trim(),
  });
  throwRpcError(result.error, 'Não foi possível abrir o chamado de acesso.');
  return parseCorporateAccessCaseCreationResult(result.data);
}
