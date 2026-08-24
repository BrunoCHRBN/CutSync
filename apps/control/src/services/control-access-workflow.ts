import {
  ControlAccessError,
  getControlAccessErrorMessage,
  normalizeControlAccessEmail,
  validateControlAccessReason,
  type ControlAccessProfile,
} from '@/services/control-access';
import { supabase } from '@/services/supabase';

export type ControlAccessRiskLevel = 'low' | 'moderate' | 'high' | 'critical';
export type ControlAccessRequestAction = 'grant' | 'revoke';
export type ControlAccessDecision = 'approve' | 'reject';
export type ControlAccessRequestStatus =
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'applied'
  | 'expired'
  | 'cancelled'
  | 'failed';

export interface ControlDelegatedAccessProfile {
  profileId: string;
  profileKey: string;
  label: string;
  description: string;
  riskLevel: ControlAccessRiskLevel;
  requiredApprovals: number;
  requiresOwnerApproval: boolean;
  requiresExpiry: boolean;
  reviewIntervalDays: number;
  permissions: string[];
}

export interface ControlAccessRequest {
  requestId: string;
  requestNumber: number;
  targetProfileId: string;
  targetName: string;
  targetEmail: string;
  requestedProfileKey: string;
  requestedProfileLabel: string;
  requestedAction: ControlAccessRequestAction;
  riskLevel: ControlAccessRiskLevel;
  status: ControlAccessRequestStatus;
  version: number;
  requiredApprovals: number;
  requiresOwnerApproval: boolean;
  approvalCount: number;
  requestedValidUntil: string | null;
  ticketReference: string;
  justification: string;
  requestedBy: string;
  requestedByName: string;
  createdAt: string;
  expiresAt: string;
  approvedAt: string | null;
  appliedAt: string | null;
}

export interface ControlAccessMutationResult {
  requestId: string;
  status: ControlAccessRequestStatus;
  version: number;
  requestNumber?: number;
  requiredApprovals?: number;
  assignmentId?: string;
}

type ServiceError = { message?: string; code?: string; details?: string };
type ControlRpc = (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: ServiceError | null }>;

const riskLevels: ControlAccessRiskLevel[] = ['low', 'moderate', 'high', 'critical'];
const requestActions: ControlAccessRequestAction[] = ['grant', 'revoke'];
const requestStatuses: ControlAccessRequestStatus[] = [
  'awaiting_approval',
  'approved',
  'rejected',
  'applied',
  'expired',
  'cancelled',
  'failed',
];

function rpc(name: string, args?: Record<string, unknown>): ReturnType<ControlRpc> {
  return (supabase.rpc as unknown as ControlRpc)(name, args);
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ControlAccessError('O fluxo de acessos retornou dados em formato inesperado.');
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ControlAccessError('O fluxo de acessos retornou dados em formato inesperado.');
  }
  return value;
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return requireString(value);
}

function requireInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new ControlAccessError('O fluxo de acessos retornou dados em formato inesperado.');
  }
  return value;
}

function requireBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new ControlAccessError('O fluxo de acessos retornou dados em formato inesperado.');
  }
  return value;
}

function requireStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new ControlAccessError('O fluxo de acessos retornou dados em formato inesperado.');
  }
  return value;
}

function parseRiskLevel(value: unknown): ControlAccessRiskLevel {
  if (!riskLevels.includes(value as ControlAccessRiskLevel)) {
    throw new ControlAccessError('O fluxo de acessos retornou dados em formato inesperado.');
  }
  return value as ControlAccessRiskLevel;
}

function parseRequestStatus(value: unknown): ControlAccessRequestStatus {
  if (!requestStatuses.includes(value as ControlAccessRequestStatus)) {
    throw new ControlAccessError('O fluxo de acessos retornou dados em formato inesperado.');
  }
  return value as ControlAccessRequestStatus;
}

function parseRequestAction(value: unknown): ControlAccessRequestAction {
  if (!requestActions.includes(value as ControlAccessRequestAction)) {
    throw new ControlAccessError('O fluxo de acessos retornou dados em formato inesperado.');
  }
  return value as ControlAccessRequestAction;
}

function throwRpcError(error: ServiceError | null, fallback: string): void {
  if (error) {
    throw new ControlAccessError(getControlAccessErrorMessage(error, fallback));
  }
}

export function parseControlDelegatedAccessProfile(value: unknown): ControlDelegatedAccessProfile {
  const record = requireRecord(value);
  return {
    profileId: requireString(record.profile_id),
    profileKey: requireString(record.profile_key),
    label: requireString(record.label),
    description: requireString(record.description),
    riskLevel: parseRiskLevel(record.risk_level),
    requiredApprovals: requireInteger(record.required_approvals),
    requiresOwnerApproval: requireBoolean(record.requires_owner_approval),
    requiresExpiry: requireBoolean(record.requires_expiry),
    reviewIntervalDays: requireInteger(record.review_interval_days),
    permissions: requireStringArray(record.permissions),
  };
}

export function parseControlAccessRequest(value: unknown): ControlAccessRequest {
  const record = requireRecord(value);
  return {
    requestId: requireString(record.request_id),
    requestNumber: requireInteger(record.request_number),
    targetProfileId: requireString(record.target_profile_id),
    targetName: requireString(record.target_name),
    targetEmail: requireString(record.target_email),
    requestedProfileKey: requireString(record.requested_profile_key),
    requestedProfileLabel: requireString(record.requested_profile_label),
    requestedAction: parseRequestAction(record.requested_action),
    riskLevel: parseRiskLevel(record.risk_level),
    status: parseRequestStatus(record.status),
    version: requireInteger(record.version),
    requiredApprovals: requireInteger(record.required_approvals),
    requiresOwnerApproval: requireBoolean(record.requires_owner_approval),
    approvalCount: requireInteger(record.approval_count),
    requestedValidUntil: nullableString(record.requested_valid_until),
    ticketReference: requireString(record.ticket_reference),
    justification: requireString(record.justification),
    requestedBy: requireString(record.requested_by),
    requestedByName: requireString(record.requested_by_name),
    createdAt: requireString(record.created_at),
    expiresAt: requireString(record.expires_at),
    approvedAt: nullableString(record.approved_at),
    appliedAt: nullableString(record.applied_at),
  };
}

export function parseControlAccessMutationResult(value: unknown): ControlAccessMutationResult {
  const record = requireRecord(value);
  return {
    requestId: requireString(record.request_id),
    status: parseRequestStatus(record.status),
    version: requireInteger(record.version),
    requestNumber: record.request_number === undefined
      ? undefined
      : requireInteger(record.request_number),
    requiredApprovals: record.required_approvals === undefined
      ? undefined
      : requireInteger(record.required_approvals),
    assignmentId: record.assignment_id === undefined
      ? undefined
      : requireString(record.assignment_id),
  };
}

export function createControlIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new ControlAccessError('Este navegador não oferece geração segura de identificadores. Atualize-o para continuar.');
  }
  return globalThis.crypto.randomUUID();
}

export async function listControlDelegatedAccessProfiles(): Promise<ControlDelegatedAccessProfile[]> {
  const result = await rpc('list_control_access_profiles');
  throwRpcError(result.error, 'Não foi possível consultar os perfis de acesso.');
  if (!Array.isArray(result.data)) {
    throw new ControlAccessError('O fluxo de acessos retornou dados em formato inesperado.');
  }
  return result.data.map(parseControlDelegatedAccessProfile);
}

export async function findControlAccessTargetByEmail(emailValue: string): Promise<ControlAccessProfile | null> {
  const email = normalizeControlAccessEmail(emailValue);
  const result = await rpc('find_control_access_target_by_email', { target_email: email });
  throwRpcError(result.error, 'Não foi possível localizar a conta informada.');
  if (!Array.isArray(result.data) || result.data.length > 1) {
    throw new ControlAccessError('O fluxo de acessos retornou dados em formato inesperado.');
  }
  if (result.data.length === 0) return null;
  const record = requireRecord(result.data[0]);
  return {
    profileId: requireString(record.profile_id),
    name: requireString(record.name),
    email: requireString(record.email),
  };
}

export async function listControlAccessRequests(
  status: ControlAccessRequestStatus | null = null,
): Promise<ControlAccessRequest[]> {
  const result = await rpc('list_control_access_requests', { target_status: status });
  throwRpcError(result.error, 'Não foi possível consultar as solicitações.');
  if (!Array.isArray(result.data)) {
    throw new ControlAccessError('O fluxo de acessos retornou dados em formato inesperado.');
  }
  return result.data.map(parseControlAccessRequest);
}

export async function createControlAccessRequest(input: {
  targetProfileId: string;
  requestedProfileKey: string;
  action: ControlAccessRequestAction;
  validUntil: string | null;
  justification: string;
  ticketReference: string;
  sourceProfileKey?: string | null;
  clientRequestId: string;
}): Promise<ControlAccessMutationResult> {
  const justification = validateControlAccessReason(input.justification);
  const ticketReference = input.ticketReference.trim();
  if (ticketReference.length < 3 || ticketReference.length > 100) {
    throw new ControlAccessError('Informe uma referência de chamado entre 3 e 100 caracteres.');
  }
  if (!requestActions.includes(input.action)) {
    throw new ControlAccessError('Selecione uma ação de acesso válida.');
  }

  const result = await rpc('create_control_access_request', {
    target_profile_id: input.targetProfileId,
    target_requested_profile_key: input.requestedProfileKey,
    target_action: input.action,
    target_source_profile_key: input.sourceProfileKey ?? null,
    target_valid_until: input.validUntil,
    target_justification: justification,
    target_ticket_reference: ticketReference,
    target_client_request_id: input.clientRequestId,
  });
  throwRpcError(result.error, 'Não foi possível criar a solicitação.');
  return parseControlAccessMutationResult(result.data);
}

export async function decideControlAccessRequest(input: {
  requestId: string;
  expectedVersion: number;
  decision: ControlAccessDecision;
  reason: string;
  clientRequestId: string;
}): Promise<ControlAccessMutationResult> {
  const reason = validateControlAccessReason(input.reason);
  const result = await rpc('decide_control_access_request', {
    target_request_id: input.requestId,
    target_expected_version: input.expectedVersion,
    target_decision: input.decision,
    target_reason: reason,
    target_client_request_id: input.clientRequestId,
  });
  throwRpcError(result.error, 'Não foi possível registrar a decisão.');
  return parseControlAccessMutationResult(result.data);
}

export async function applyControlAccessRequest(input: {
  requestId: string;
  expectedVersion: number;
  clientRequestId: string;
}): Promise<ControlAccessMutationResult> {
  const result = await rpc('apply_control_access_request', {
    target_request_id: input.requestId,
    target_expected_version: input.expectedVersion,
    target_client_request_id: input.clientRequestId,
  });
  throwRpcError(result.error, 'Não foi possível aplicar o acesso aprovado.');
  return parseControlAccessMutationResult(result.data);
}
