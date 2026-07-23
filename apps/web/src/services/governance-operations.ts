import { supabaseGovernance } from './supabaseGovernance';
import type {
  GovernanceAccountStatus,
  GovernanceAuditEvent,
  GovernanceEstablishmentDetail,
  GovernanceEstablishmentListItem,
} from '../types/governance-knowledge';

type RpcResult<T> = { data: T | null; error: { message?: string; code?: string } | null };

const rpc = (name: string, args: Record<string, unknown>) =>
  (supabaseGovernance.rpc as unknown as (fn: string, params: Record<string, unknown>) => Promise<RpcResult<unknown>>)(name, args);

function throwRpc(error: { message?: string; code?: string } | null, fallback: string): never {
  if (!error) throw new Error(fallback);
  const detail = error.message || fallback;
  const translated: Record<string, string> = {
    forbidden: 'Você não possui permissão para executar esta ação.',
    status_change_reason_invalid: 'A justificativa deve ter entre 10 e 500 caracteres.',
    status_unchanged: 'O estabelecimento já está neste status.',
    establishment_not_found: 'Estabelecimento não encontrado.',
    invalid_account_status: 'Status de conta inválido.',
  };
  throw new Error(Object.entries(translated).find(([key]) => detail.includes(key))?.[1] || detail);
}

export async function listGovernanceEstablishments(params: {
  searchTerm?: string;
  status?: GovernanceAccountStatus | null;
  pageSize?: number;
  pageOffset?: number;
}): Promise<GovernanceEstablishmentListItem[]> {
  const { data, error } = await rpc('list_governance_establishments', {
    search_term: params.searchTerm || null,
    status_filter: params.status || null,
    page_size: params.pageSize ?? 25,
    page_offset: params.pageOffset ?? 0,
  });
  if (error) throwRpc(error, 'Não foi possível carregar os estabelecimentos.');
  return (data ?? []) as GovernanceEstablishmentListItem[];
}

export async function changeGovernanceEstablishmentStatus(
  establishmentId: string,
  nextStatus: Exclude<GovernanceAccountStatus, 'pending_verification'>,
  reason: string,
): Promise<{ id: string; name: string; old_status: GovernanceAccountStatus; new_status: GovernanceAccountStatus; reason: string }> {
  const { data, error } = await rpc('update_governance_establishment_status', {
    target_establishment_id: establishmentId,
    target_status: nextStatus,
    target_reason: reason.trim(),
  });
  if (error) throwRpc(error, 'Não foi possível atualizar o status.');
  return data as { id: string; name: string; old_status: GovernanceAccountStatus; new_status: GovernanceAccountStatus; reason: string };
}

export async function listGovernanceAuditEvents(params: {
  searchTerm?: string;
  action?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  pageSize?: number;
  pageOffset?: number;
}): Promise<GovernanceAuditEvent[]> {
  const { data, error } = await rpc('list_governance_audit_events', {
    search_term: params.searchTerm || null,
    action_filter: params.action || null,
    date_from: params.dateFrom || null,
    date_to: params.dateTo || null,
    page_size: params.pageSize ?? 40,
    page_offset: params.pageOffset ?? 0,
  });
  if (error) throwRpc(error, 'Não foi possível carregar a auditoria.');
  return (data ?? []) as GovernanceAuditEvent[];
}

export async function getGovernanceEstablishmentDetail(id: string): Promise<GovernanceEstablishmentDetail> {
  const { data, error } = await rpc('get_governance_establishment_detail', { target_establishment_id: id });
  if (error) throwRpc(error, 'Não foi possível carregar o detalhe do estabelecimento.');
  return data as GovernanceEstablishmentDetail;
}
