import type {
  ControlBillingAccount,
  ControlBillingCutover,
  ControlBillingPlan,
  ControlBillingSnapshot,
  ControlIdentityConflict,
} from '@/services/control-billing';
import {
  labelForCutoverStatus,
  labelForPlanCode,
  labelForSubscriptionLifecycle,
  labelForSubscriptionStatus,
} from '@/modules/finance/presentation/finance-labels';
import {
  formatFinanceDate,
  formatUnitCount,
  maskFinanceId,
} from '@/modules/finance/presentation/finance-formatters';
import { formatMoneyCents } from '@/modules/finance/presentation/finance-money';
import {
  catalogPriceState,
  toneForCutoverStatus,
  toneForSubscriptionStatus,
  type FinanceDataAvailability,
  type FinanceStatusTone,
} from '@/modules/finance/presentation/finance-status';

export type BillingAccountSummary = {
  id: string;
  organizationName: string;
  organizationIdHint: string | null;
  planLabel: string;
  planCode: string | null;
  statusLabel: string;
  statusTone: FinanceStatusTone;
  blockLabel: string;
  unitsLabel: string;
  periodLabel: string;
  raw: ControlBillingAccount;
};

export type SubscriptionSummary = {
  id: string;
  organizationName: string;
  planLabel: string;
  lifecycleLabel: string;
  lifecycleTone: FinanceStatusTone;
  billingStatusLabel: string;
  startLabel: string;
  renewalLabel: string;
  raw: ControlBillingAccount;
};

export type PlanCatalogEntry = {
  code: string;
  name: string;
  priceLabel: string;
  stateLabel: string;
  stateTone: FinanceStatusTone;
  currency: string;
  raw: ControlBillingPlan;
};

export type ReconciliationSummary = {
  id: string;
  organizationName: string;
  unitsLabel: string;
  cutoverLabel: string;
  statusLabel: string;
  statusTone: FinanceStatusTone;
  conflictsLabel: string;
  raw: ControlBillingCutover;
};

export type FinancePendingItem = {
  id: string;
  type: string;
  quantity: number;
  amountLabel: string;
  oldestLabel: string;
};

export type FinanceOperationItem = {
  id: string;
  label: string;
  detail: string;
  count: number;
  href: string;
};

export function toBillingAccountSummary(account: ControlBillingAccount): BillingAccountSummary {
  return {
    id: account.billingAccountId,
    organizationName: account.organizationName,
    organizationIdHint: maskFinanceId(account.organizationId),
    planLabel: labelForPlanCode(account.planCode),
    planCode: account.planCode,
    statusLabel: labelForSubscriptionStatus(account.subscriptionStatus),
    statusTone: toneForSubscriptionStatus(account.subscriptionStatus),
    blockLabel: account.enforcementEnabled ? 'Ativo' : 'Não',
    unitsLabel: formatUnitCount(account.configuredUnits),
    periodLabel: account.currentPeriodEnd
      ? `até ${formatFinanceDate(account.currentPeriodEnd)}`
      : 'Não informada',
    raw: account,
  };
}

export function toSubscriptionSummary(account: ControlBillingAccount): SubscriptionSummary | null {
  if (!account.subscriptionId) return null;
  return {
    id: account.subscriptionId,
    organizationName: account.organizationName,
    planLabel: labelForPlanCode(account.planCode),
    lifecycleLabel: labelForSubscriptionLifecycle(account.subscriptionStatus),
    lifecycleTone: toneForSubscriptionStatus(account.subscriptionStatus),
    billingStatusLabel: labelForSubscriptionStatus(account.subscriptionStatus),
    startLabel: 'Não disponível',
    renewalLabel: account.currentPeriodEnd
      ? formatFinanceDate(account.currentPeriodEnd)
      : 'Não disponível',
    raw: account,
  };
}

export function toPlanCatalogEntry(plan: ControlBillingPlan): PlanCatalogEntry {
  const state = catalogPriceState(plan.basePriceCents);
  return {
    code: plan.code,
    name: plan.name || labelForPlanCode(plan.code),
    priceLabel: formatMoneyCents(plan.basePriceCents, plan.currency),
    stateLabel: state.label,
    stateTone: state.tone,
    currency: plan.currency,
    raw: plan,
  };
}

export function toReconciliationSummary(
  cutover: ControlBillingCutover,
  conflictCount = 0,
): ReconciliationSummary {
  return {
    id: cutover.cutoverRequestId,
    organizationName: cutover.organizationName,
    unitsLabel: formatUnitCount(cutover.unitCount),
    cutoverLabel: formatFinanceDate(cutover.cutoverAt),
    statusLabel: labelForCutoverStatus(cutover.status),
    statusTone: toneForCutoverStatus(cutover.status),
    conflictsLabel: String(conflictCount),
    raw: cutover,
  };
}

export function buildFinancePendingItems(snapshot: ControlBillingSnapshot): FinancePendingItem[] {
  const items: FinancePendingItem[] = [];
  const pastDue = snapshot.accounts.filter((item) => item.subscriptionStatus === 'past_due');
  const suspended = snapshot.accounts.filter((item) => item.subscriptionStatus === 'suspended');
  const blocked = snapshot.accounts.filter((item) => item.enforcementEnabled);
  const pendingConflicts = snapshot.conflicts.filter((item) => item.status === 'pending');

  if (pastDue.length > 0) {
    items.push({
      id: 'past_due',
      type: 'Assinatura em atraso',
      quantity: pastDue.length,
      amountLabel: 'Não disponível',
      oldestLabel: 'Não disponível',
    });
  }
  if (suspended.length > 0) {
    items.push({
      id: 'suspended',
      type: 'Assinatura suspensa',
      quantity: suspended.length,
      amountLabel: 'Não disponível',
      oldestLabel: 'Não disponível',
    });
  }
  if (snapshot.cutovers.length > 0) {
    items.push({
      id: 'cutover',
      type: 'Conciliação pendente',
      quantity: snapshot.cutovers.length,
      amountLabel: 'Não disponível',
      oldestLabel: formatFinanceDate(
        [...snapshot.cutovers].sort((a, b) => Date.parse(a.cutoverAt) - Date.parse(b.cutoverAt))[0]?.cutoverAt,
      ),
    });
  }
  if (pendingConflicts.length > 0) {
    items.push({
      id: 'conflict',
      type: 'Conflito cadastral',
      quantity: pendingConflicts.length,
      amountLabel: 'Não disponível',
      oldestLabel: formatFinanceDate(
        [...pendingConflicts].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0]?.createdAt,
      ),
    });
  }
  if (blocked.length > 0) {
    items.push({
      id: 'block',
      type: 'Bloqueio operacional',
      quantity: blocked.length,
      amountLabel: 'Não disponível',
      oldestLabel: 'Não disponível',
    });
  }
  return items;
}

export function buildFinanceOperationItems(snapshot: ControlBillingSnapshot): FinanceOperationItem[] {
  const active = snapshot.accounts.filter((item) => (
    item.subscriptionStatus === 'active' || item.subscriptionStatus === 'trialing'
  )).length;
  const pastDue = snapshot.accounts.filter((item) => item.subscriptionStatus === 'past_due').length;
  const suspended = snapshot.accounts.filter((item) => item.subscriptionStatus === 'suspended').length;
  const blocked = snapshot.accounts.filter((item) => item.enforcementEnabled).length;
  const pendingConflicts = snapshot.conflicts.filter((item) => item.status === 'pending').length;

  return [
    {
      id: 'active',
      label: 'Assinaturas ativas',
      detail: 'Planos em vigor ou em avaliação',
      count: active,
      href: '/financeiro/assinaturas',
    },
    {
      id: 'past_due',
      label: 'Assinaturas em atraso',
      detail: 'Cobrança exige regularização',
      count: pastDue,
      href: '/financeiro/cobrancas',
    },
    {
      id: 'suspended',
      label: 'Assinaturas suspensas',
      detail: 'Contratos pausados operacionalmente',
      count: suspended,
      href: '/financeiro/cobrancas',
    },
    {
      id: 'blocks',
      label: 'Bloqueios ativos',
      detail: 'Enforcement aplicado na assinatura',
      count: blocked,
      href: '/financeiro/cobrancas',
    },
    {
      id: 'accounts',
      label: 'Contas de cobrança',
      detail: 'Organizações com conta financeira',
      count: snapshot.accounts.length,
      href: '/financeiro/cobrancas',
    },
    {
      id: 'conflicts',
      label: 'Conflitos',
      detail: 'Identidade pendente de decisão',
      count: pendingConflicts,
      href: '/financeiro/conciliacao',
    },
  ];
}

export function cashAvailability(): FinanceDataAvailability {
  return 'history_unavailable';
}

export function summarizeConflict(conflict: ControlIdentityConflict) {
  return {
    id: conflict.conflictId,
    title: `${conflict.documentType ?? 'Documento'} · ${conflict.maskedDocument ?? 'mascarado'}`,
    detail: conflict.legacySource,
    createdLabel: formatFinanceDate(conflict.createdAt),
    raw: conflict,
  };
}
