import {
  supportCategories,
  supportPriorities,
  supportStatuses,
  type SupportCategory,
  type SupportPriority,
  type SupportStatus,
  type SupportTicketSummary,
} from '@/services/control-support';

export const statusLabels: Record<SupportStatus, string> = {
  queued: 'Na fila',
  open: 'Aberto',
  in_progress: 'Em andamento',
  waiting_user: 'Aguardando usuário',
  resolved: 'Resolvido',
  closed: 'Fechado',
  sync_failed: 'Falha de sincronização',
};

export const priorityLabels: Record<SupportPriority, string> = {
  critical: 'Crítica',
  high: 'Alta',
  normal: 'Normal',
  low: 'Baixa',
};

export const categoryLabels: Record<SupportCategory, string> = {
  access_identity: 'Acesso e identidade',
  booking: 'Agendamento',
  business_operations: 'Operação',
  billing: 'Cobrança',
  marketplace: 'Marketplace',
  security_privacy: 'Segurança',
  platform_incident: 'Incidente',
  product_feedback: 'Produto',
  other: 'Outros',
};

export const statusOptions = supportStatuses.map((value) => ({
  value,
  label: statusLabels[value],
}));

export const priorityOptions = supportPriorities.map((value) => ({
  value,
  label: priorityLabels[value],
}));

export const categoryOptions = supportCategories.map((value) => ({
  value,
  label: categoryLabels[value],
}));

export const slaOptions = [
  { value: 'at_risk' as const, label: 'Fora do SLA' },
  { value: 'ok' as const, label: 'No prazo' },
];

export type SupportSlaFilter = 'all' | 'at_risk' | 'ok';
export type SupportSortKey = 'updated' | 'sla' | 'priority' | 'status';

export function isSlaAtRisk(ticket: SupportTicketSummary): boolean {
  if (!ticket.firstResponseDueAt || ticket.firstRespondedAt) return false;
  return Date.parse(ticket.firstResponseDueAt) < Date.now();
}

export function isSlaNear(ticket: SupportTicketSummary): boolean {
  if (!ticket.firstResponseDueAt || ticket.firstRespondedAt) return false;
  const due = Date.parse(ticket.firstResponseDueAt);
  const now = Date.now();
  if (Number.isNaN(due) || due <= now) return false;
  return due - now <= 2 * 60 * 60 * 1000;
}

export function slaLabel(ticket: SupportTicketSummary): string {
  if (isSlaAtRisk(ticket)) return 'Fora do SLA';
  if (isSlaNear(ticket)) return 'Próximo';
  return 'No prazo';
}

export function syncLabel(syncStatus: string): string {
  switch (syncStatus) {
    case 'synced':
      return 'Sincronizado';
    case 'pending':
      return 'Pendente';
    case 'processing':
      return 'Processando';
    case 'failed':
      return 'Falha';
    default:
      return syncStatus;
  }
}

export function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString('pt-BR') : '—';
}

export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '—';
  const seconds = Math.max(0, Math.floor((now - ts) / 1000));
  if (seconds < 45) return 'agora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} d`;
}

export function assigneeLabel(ticket: SupportTicketSummary): string {
  return ticket.assigneeProfileId ? ticket.assigneeProfileId.slice(0, 8) : 'Sem responsável';
}

export function clientLabel(ticket: SupportTicketSummary): string {
  return ticket.requesterDisplayName ?? ticket.locationLabel ?? 'Cliente não identificado';
}

const priorityRank: Record<SupportPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export function sortTickets(
  tickets: SupportTicketSummary[],
  sort: SupportSortKey,
): SupportTicketSummary[] {
  const copy = [...tickets];
  copy.sort((a, b) => {
    switch (sort) {
      case 'sla': {
        const aRisk = isSlaAtRisk(a) ? 0 : isSlaNear(a) ? 1 : 2;
        const bRisk = isSlaAtRisk(b) ? 0 : isSlaNear(b) ? 1 : 2;
        if (aRisk !== bRisk) return aRisk - bRisk;
        return Date.parse(a.firstResponseDueAt ?? a.updatedAt) - Date.parse(b.firstResponseDueAt ?? b.updatedAt);
      }
      case 'priority': {
        const diff = priorityRank[a.priority] - priorityRank[b.priority];
        if (diff !== 0) return diff;
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      }
      case 'status':
        return a.status.localeCompare(b.status);
      case 'updated':
      default:
        return Date.parse(b.lastMessageAt ?? b.updatedAt) - Date.parse(a.lastMessageAt ?? a.updatedAt);
    }
  });
  return copy;
}
