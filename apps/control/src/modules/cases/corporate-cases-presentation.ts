import {
  corporateCaseStatusLabels,
  type CorporateCasePriority,
  type CorporateCaseRiskLevel,
  type CorporateCaseStatus,
  type CorporateCaseView,
} from '@cutsync/domain';

import type { CloudTone } from '@/theme/cloud-components';

export const corporateCaseViewCopy: Record<CorporateCaseView, {
  title: string;
  description: string;
  empty: string;
}> = {
  mine: {
    title: 'Meus chamados',
    description: 'Chamados abertos por você, para você ou dos quais você participa.',
    empty: 'Você ainda não participa de nenhum chamado.',
  },
  observing: {
    title: 'Observando',
    description: 'Chamados que você acompanha como observador e cujas atualizações recebe.',
    empty: 'Você não está observando nenhum chamado.',
  },
  pending: {
    title: 'Minhas pendências',
    description: 'Chamados com tarefa, validação ou aprovação pendente atribuída a você.',
    empty: 'Não há pendências de chamados atribuídas a você.',
  },
  queue: {
    title: 'Fila da equipe',
    description: 'Chamados aguardando atuação dos grupos dos quais você é membro ativo.',
    empty: 'Não há chamados aguardando sua equipe.',
  },
  all: {
    title: 'Todos os chamados',
    description: 'Visão administrativa e auditável dos chamados autorizados ao seu perfil.',
    empty: 'Nenhum chamado foi localizado.',
  },
};

export const corporateCaseStatusTone: Record<CorporateCaseStatus, CloudTone> = {
  submitted: 'info',
  triage: 'info',
  review: 'info',
  awaiting_approval: 'warning',
  approved: 'success',
  fulfillment: 'info',
  waiting_requester: 'warning',
  resolved: 'success',
  closed: 'neutral',
  rejected: 'danger',
  cancelled: 'neutral',
  expired: 'danger',
  archived: 'neutral',
};

export const corporateCasePriorityLabels: Record<CorporateCasePriority, string> = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
  critical: 'Crítica',
};

export const corporateCasePriorityTone: Record<CorporateCasePriority, CloudTone> = {
  low: 'neutral',
  normal: 'info',
  high: 'warning',
  critical: 'danger',
};

export const corporateCaseRiskLabels: Record<CorporateCaseRiskLevel, string> = {
  low: 'Baixo',
  moderate: 'Moderado',
  high: 'Alto',
  critical: 'Crítico',
};

export function formatCorporateCaseStatus(status: CorporateCaseStatus): string {
  return corporateCaseStatusLabels[status];
}

export function formatCorporateCaseDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Data indisponível';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export function formatCorporateCaseDeadline(value: string, now = Date.now()): {
  label: string;
  tone: CloudTone;
} {
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) return { label: 'Prazo indisponível', tone: 'neutral' };
  const difference = parsed - now;
  if (difference < 0) return { label: `Expirou em ${formatCorporateCaseDate(value)}`, tone: 'danger' };
  const hours = Math.ceil(difference / 3_600_000);
  if (hours <= 24) return { label: `Vence em ${hours}h`, tone: 'warning' };
  return { label: `Até ${formatCorporateCaseDate(value)}`, tone: 'neutral' };
}

export function isCorporateCaseUuid(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}
