import { supabase } from '@/services/supabase';

export type ControlGovernanceAuditEvent = {
  id: number;
  action: string;
  targetId: string | null;
  targetType: string | null;
  changes: Record<string, unknown> | null;
  clientIp: string | null;
  createdAt: string;
  actorName: string;
  targetName: string;
  totalCount: number;
};

export type ControlGovernanceAuditErrorCode =
  | 'forbidden'
  | 'invalid_response'
  | 'unavailable';

export class ControlGovernanceAuditError extends Error {
  constructor(readonly code: ControlGovernanceAuditErrorCode) {
    super(code);
    this.name = 'ControlGovernanceAuditError';
  }
}

type ServiceError = { message?: string; code?: string };

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ControlGovernanceAuditError('invalid_response');
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, nullable = false): string | null {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== 'string') throw new ControlGovernanceAuditError('invalid_response');
  return value;
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  throw new ControlGovernanceAuditError('invalid_response');
}

function asChanges(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function mapError(message?: string): ControlGovernanceAuditError {
  const normalized = (message ?? '').toLowerCase();
  if (normalized.includes('forbidden')) return new ControlGovernanceAuditError('forbidden');
  return new ControlGovernanceAuditError('unavailable');
}

function parseEvent(value: unknown): ControlGovernanceAuditEvent {
  const record = asRecord(value);
  return {
    id: asNumber(record.id),
    action: asString(record.action) ?? '',
    targetId: asString(record.target_id, true),
    targetType: asString(record.target_type, true),
    changes: asChanges(record.changes),
    clientIp: asString(record.client_ip, true),
    createdAt: asString(record.created_at) ?? '',
    actorName: asString(record.actor_name, true) ?? 'Sistema',
    targetName: asString(record.target_name, true) ?? '—',
    totalCount: asNumber(record.total_count ?? 0),
  };
}

export async function listControlGovernanceAuditEvents(params: {
  searchTerm?: string | null;
  action?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  pageSize?: number;
  pageOffset?: number;
} = {}): Promise<ControlGovernanceAuditEvent[]> {
  const result = await (supabase.rpc as any)('list_governance_audit_events', {
    search_term: params.searchTerm ?? null,
    action_filter: params.action ?? null,
    date_from: params.dateFrom ?? null,
    date_to: params.dateTo ?? null,
    page_size: Math.min(Math.max(params.pageSize ?? 40, 1), 100),
    page_offset: Math.max(params.pageOffset ?? 0, 0),
  }) as { data: unknown; error: ServiceError | null };

  if (result.error) throw mapError(result.error.message);
  if (!Array.isArray(result.data)) throw new ControlGovernanceAuditError('invalid_response');
  return result.data.map(parseEvent);
}

export function getControlGovernanceAuditErrorMessage(error: unknown): string {
  if (!(error instanceof ControlGovernanceAuditError)) {
    return 'Não foi possível carregar a auditoria.';
  }
  switch (error.code) {
    case 'forbidden':
      return 'Seu acesso atual não permite consultar a trilha de auditoria.';
    case 'invalid_response':
      return 'A auditoria retornou dados em formato inesperado.';
    default:
      return 'A fonte de auditoria está temporariamente indisponível.';
  }
}
