import type { BillingSubscriptionStatus } from '@/services/control-billing';

export type FinanceDataAvailability =
  | 'available'
  | 'partial'
  | 'preparing'
  | 'empty'
  | 'source_missing'
  | 'history_unavailable';

export type FinanceStatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const availabilityLabels: Record<FinanceDataAvailability, string> = {
  available: 'Disponível',
  partial: 'Parcial',
  preparing: 'Em preparação',
  empty: 'Sem dados',
  source_missing: 'Fonte não conectada',
  history_unavailable: 'Histórico indisponível',
};

export function labelForDataAvailability(state: FinanceDataAvailability): string {
  return availabilityLabels[state];
}

export function toneForDataAvailability(state: FinanceDataAvailability): FinanceStatusTone {
  switch (state) {
    case 'available':
      return 'success';
    case 'partial':
    case 'preparing':
    case 'history_unavailable':
      return 'info';
    case 'empty':
    case 'source_missing':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function toneForSubscriptionStatus(
  status: BillingSubscriptionStatus | null | undefined,
): FinanceStatusTone {
  if (status === 'active' || status === 'trialing') return 'success';
  if (status === 'past_due') return 'warning';
  if (status === 'suspended' || status === 'canceled') return 'danger';
  return 'neutral';
}

export function toneForCutoverStatus(status: string | null | undefined): FinanceStatusTone {
  if (status === 'reconciling') return 'warning';
  if (status === 'scheduled') return 'info';
  return 'neutral';
}

export function catalogPriceState(basePriceCents: number | null): {
  label: string;
  tone: FinanceStatusTone;
} {
  if (basePriceCents === null) {
    return { label: 'Pendente', tone: 'warning' };
  }
  return { label: 'Configurado', tone: 'success' };
}
