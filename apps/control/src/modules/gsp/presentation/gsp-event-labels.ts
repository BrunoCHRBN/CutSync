import type { GspAuditResult } from '@/modules/gsp/presentation/gsp-status';

const eventLabels: Record<string, string> = {
  'control.access.changed': 'Acesso alterado',
  'control.access.revoked': 'Acesso revogado',
  'governance.user_created': 'Usuário de governança criado',
  'governance.user_role_changed': 'Papel de usuário alterado',
  'governance.user_revoked': 'Usuário de governança revogado',
  access_granted: 'Acesso concedido',
  access_revoked: 'Acesso revogado',
  role_changed: 'Papel alterado',
  review_created: 'Revisão criada',
  review_completed: 'Revisão concluída',
  policy_updated: 'Política atualizada',
  login_failed: 'Tentativa de login recusada',
  session_terminated: 'Sessão encerrada',
  'establishment.status_changed': 'Status de estabelecimento alterado',
};

function humanizeUnknownEvent(value: string): string {
  const readable = value.replace(/[._-]+/g, ' ').trim();
  return `Evento: ${readable}`;
}

export function labelForAuditAction(action: string | null | undefined): string {
  if (!action) return 'Evento';
  return eventLabels[action] ?? humanizeUnknownEvent(action);
}

export function inferAuditResult(
  action: string | null | undefined,
  changes: Record<string, unknown> | null | undefined,
): GspAuditResult {
  const haystack = `${action ?? ''} ${JSON.stringify(changes ?? {})}`.toLowerCase();
  if (haystack.includes('fail') || haystack.includes('error') || haystack.includes('denied')) {
    return 'failure';
  }
  if (haystack.includes('partial')) return 'partial';
  if (!action) return 'unknown';
  return 'success';
}

export function formatAuditChangeSummary(
  changes: Record<string, unknown> | null | undefined,
): { before: string | null; after: string | null } {
  if (!changes || typeof changes !== 'object') {
    return { before: null, after: null };
  }
  const before = changes.before ?? changes.from ?? changes.old_role ?? changes.old_status;
  const after = changes.after ?? changes.to ?? changes.new_role ?? changes.new_status ?? changes.role;
  const stringify = (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  };
  return { before: stringify(before), after: stringify(after) };
}
