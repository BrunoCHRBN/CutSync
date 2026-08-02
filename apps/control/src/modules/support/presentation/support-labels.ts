import {
  supportCategories,
  supportPriorities,
  supportStatuses,
  type SupportCategory,
  type SupportPriority,
  type SupportStatus,
} from '@/services/control-support';

/** Human labels for stored status values — never mutate stored enums. */
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

const productLabels: Record<string, string> = {
  client: 'Aplicativo do cliente',
  business: 'Aplicativo do negócio',
  web: 'Web',
  control: 'CutSync Cloud',
  marketplace: 'Marketplace',
  platform: 'Plataforma',
};

const impactLabels: Record<string, string> = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Médio',
  normal: 'Normal',
  low: 'Baixo',
};

const syncLabels: Record<string, string> = {
  synced: 'Sincronizado',
  pending: 'Pendente',
  processing: 'Processando',
  failed: 'Falha',
};

function humanizeToken(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Translate known enums; unknown values get a readable fallback. */
export function labelForStatus(value: string | null | undefined): string {
  if (!value) return 'Não informado';
  if (value in statusLabels) return statusLabels[value as SupportStatus];
  return humanizeToken(value);
}

export function labelForPriority(value: string | null | undefined): string {
  if (!value) return 'Não informado';
  if (value in priorityLabels) return priorityLabels[value as SupportPriority];
  return humanizeToken(value);
}

export function labelForCategory(value: string | null | undefined): string {
  if (!value) return 'Não informado';
  if (value in categoryLabels) return categoryLabels[value as SupportCategory];
  return humanizeToken(value);
}

export function labelForProduct(value: string | null | undefined): string {
  if (!value) return 'Não informado';
  const key = value.trim().toLowerCase();
  return productLabels[key] ?? humanizeToken(value);
}

export function labelForImpact(value: string | null | undefined): string {
  if (!value) return 'Não informado';
  const key = value.trim().toLowerCase();
  return impactLabels[key] ?? humanizeToken(value);
}

export function labelForSync(value: string | null | undefined): string {
  if (!value) return 'Não informado';
  const key = value.trim().toLowerCase();
  return syncLabels[key] ?? humanizeToken(value);
}

/** Translate a transition value that may be status/priority/raw. */
export function labelForTransitionValue(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value in statusLabels) return statusLabels[value as SupportStatus];
  if (value in priorityLabels) return priorityLabels[value as SupportPriority];
  if (value in categoryLabels) return categoryLabels[value as SupportCategory];
  const lower = value.toLowerCase();
  if (lower in productLabels) return productLabels[lower];
  if (lower in impactLabels) return impactLabels[lower];
  if (lower in syncLabels) return syncLabels[lower];
  if (/^[0-9a-f-]{8,}$/i.test(value)) return `ID ${value.slice(0, 8)}`;
  return humanizeToken(value);
}

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
