import type { GovernanceRole } from '@/types/control';

export const roleLabels: Record<GovernanceRole, string> = {
  SaaS_Owner: 'Proprietário',
  SaaS_Editor: 'Editor',
  SaaS_Viewer: 'Leitor',
};

export type GspAccessState = 'active' | 'expired' | 'revoked' | 'pending' | 'inactive';

export const accessStateLabels: Record<GspAccessState, string> = {
  active: 'Ativo',
  expired: 'Expirado',
  revoked: 'Revogado',
  pending: 'Pendente',
  inactive: 'Inativo',
};

export type GspReviewState =
  | 'not_started'
  | 'in_review'
  | 'awaiting_owner'
  | 'completed'
  | 'overdue';

export const reviewStateLabels: Record<GspReviewState, string> = {
  not_started: 'Não iniciada',
  in_review: 'Em revisão',
  awaiting_owner: 'Aguardando responsável',
  completed: 'Concluída',
  overdue: 'Vencida',
};

function humanizeToken(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function labelForRole(role: string | null | undefined): string {
  if (!role) return 'Não informado';
  if (role in roleLabels) return roleLabels[role as GovernanceRole];
  if (role.startsWith('SaaS_')) return role.replace('SaaS_', '');
  return humanizeToken(role);
}

export function labelForAccessState(state: GspAccessState): string {
  return accessStateLabels[state];
}

export function labelForReviewState(state: GspReviewState): string {
  return reviewStateLabels[state];
}

export const roleFilterOptions = (Object.keys(roleLabels) as GovernanceRole[]).map((value) => ({
  value,
  label: roleLabels[value],
}));

export const accessStateFilterOptions = (Object.keys(accessStateLabels) as GspAccessState[]).map((value) => ({
  value,
  label: accessStateLabels[value],
}));
