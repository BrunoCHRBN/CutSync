import type { BillingSubscriptionStatus } from '@/services/control-billing';

export const subscriptionStatusLabels: Record<BillingSubscriptionStatus, string> = {
  trialing: 'Em avaliação',
  active: 'Ativa',
  past_due: 'Em atraso',
  suspended: 'Suspensa',
  canceled: 'Cancelada',
};

/** Subscription lifecycle emphasis for Assinaturas table. */
export const subscriptionLifecycleLabels: Record<BillingSubscriptionStatus, string> = {
  trialing: 'Em avaliação',
  active: 'Vigente',
  past_due: 'Em atraso',
  suspended: 'Pausada',
  canceled: 'Cancelada',
};

export const cutoverStatusLabels: Record<'scheduled' | 'reconciling', string> = {
  scheduled: 'Agendada',
  reconciling: 'Em revisão',
};

export const planCodeLabels: Record<string, string> = {
  multi_unit_standard: 'Multiunidade',
  network: 'Rede',
};

export const conflictReasonLabels: Record<string, string> = {
  duplicate_document: 'Documento já associado',
  legacy_record_ambiguous: 'Registro legado ambíguo',
  legal_entity_not_found: 'Entidade legal não localizada',
  organization_not_found: 'Organização não localizada',
};

export const conflictResolutionLabels = {
  link: 'Vincular',
  reject: 'Rejeitar',
  request_evidence: 'Solicitar evidência',
} as const;

function humanizeToken(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function labelForSubscriptionStatus(
  status: BillingSubscriptionStatus | null | undefined,
): string {
  if (!status) return 'Sem assinatura';
  return subscriptionStatusLabels[status] ?? humanizeToken(status);
}

export function labelForSubscriptionLifecycle(
  status: BillingSubscriptionStatus | null | undefined,
): string {
  if (!status) return 'Sem assinatura';
  return subscriptionLifecycleLabels[status] ?? humanizeToken(status);
}

export function labelForPlanCode(code: string | null | undefined): string {
  if (!code) return 'Não configurado';
  return planCodeLabels[code] ?? humanizeToken(code);
}

export function labelForCutoverStatus(status: string | null | undefined): string {
  if (!status) return 'Indeterminado';
  if (status in cutoverStatusLabels) {
    return cutoverStatusLabels[status as keyof typeof cutoverStatusLabels];
  }
  return humanizeToken(status);
}

export function labelForConflictReason(reasonCode: string | null | undefined): string {
  if (!reasonCode) return 'Revisão cadastral necessária';
  return conflictReasonLabels[reasonCode] ?? humanizeToken(reasonCode);
}

export function labelForMovementType(type: string | null | undefined): string {
  if (!type) return 'Movimentação';
  const map: Record<string, string> = {
    invoice: 'Fatura',
    payment: 'Pagamento',
    refund: 'Reembolso',
    adjustment: 'Ajuste',
    reconciliation: 'Conciliação',
    chargeback: 'Contestação',
  };
  return map[type] ?? `Tipo: ${humanizeToken(type)}`;
}
