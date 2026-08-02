import type { SupportPriority, SupportTicketSummary } from '@/services/control-support';
import {
  labelForStatus,
  labelForSync,
  type SupportSortKey,
} from '@/modules/support/presentation/support-labels';

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
  if (isSlaNear(ticket)) return 'Próximo do limite';
  return 'No prazo';
}

export function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return null;
  return new Date(ts).toLocaleString('pt-BR');
}

export function formatDateTimeOrDash(value: string | null | undefined): string {
  return formatDateTime(value) ?? '—';
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

export function formatCompactDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function initialsFromName(name: string | null | undefined): string {
  if (!name?.trim()) return '·';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function syncLabel(syncStatus: string): string {
  return labelForSync(syncStatus);
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
        return labelForStatus(a.status).localeCompare(labelForStatus(b.status), 'pt-BR');
      case 'updated':
      default:
        return Date.parse(b.lastMessageAt ?? b.updatedAt) - Date.parse(a.lastMessageAt ?? a.updatedAt);
    }
  });
  return copy;
}
