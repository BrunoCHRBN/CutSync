import { expect, test } from '@playwright/test';

import {
  buildFinancePendingItems,
  catalogPriceState,
  formatMoneyCents,
  formatMoneyInputToCents,
  formatSignedMoneyCents,
  labelForDataAvailability,
  labelForMovementType,
  labelForPlanCode,
  labelForSubscriptionStatus,
  toneForDataAvailability,
  toBillingAccountSummary,
} from '../../apps/control/src/modules/finance/presentation';
import type { ControlBillingSnapshot } from '../../apps/control/src/services/control-billing';

test('formats BRL money and negative amounts consistently', () => {
  expect(formatMoneyCents(4990)).toContain('49,90');
  expect(formatMoneyCents(null)).toBe('Não disponível');
  expect(formatSignedMoneyCents(-1000)).toMatch(/-/);
  expect(formatMoneyInputToCents('49,90')).toBe(4990);
  expect(formatMoneyInputToCents('abc')).toBeNull();
});

test('translates billing statuses and plan codes', () => {
  expect(labelForSubscriptionStatus('active')).toBe('Ativa');
  expect(labelForSubscriptionStatus('past_due')).toBe('Em atraso');
  expect(labelForPlanCode('multi_unit_standard')).toBe('Multiunidade');
  expect(labelForPlanCode('network')).toBe('Rede');
  expect(labelForMovementType('refund')).toBe('Reembolso');
  expect(labelForMovementType('unknown_event')).toContain('Tipo:');
});

test('keeps history unavailable non-alarmist', () => {
  expect(labelForDataAvailability('history_unavailable')).toBe('Histórico indisponível');
  expect(toneForDataAvailability('history_unavailable')).toBe('info');
  expect(catalogPriceState(null).label).toBe('Pendente');
  expect(catalogPriceState(4990).label).toBe('Configurado');
});

test('builds pending items only from real snapshot rows', () => {
  const snapshot: ControlBillingSnapshot = {
    accounts: [
      {
        billingAccountId: 'ba-1',
        organizationId: 'org-1',
        organizationName: 'Org Teste',
        subscriptionId: 'sub-1',
        planCode: 'network',
        subscriptionStatus: 'suspended',
        enforcementEnabled: true,
        configuredUnits: 2,
        activeCoverageUnits: 2,
        scheduledCoverageUnits: 0,
        currentPeriodEnd: null,
      },
    ],
    conflicts: [],
    cutovers: [],
    plans: [],
  };
  const items = buildFinancePendingItems(snapshot);
  expect(items.some((item) => item.type === 'Assinatura suspensa')).toBeTruthy();
  expect(items.some((item) => item.type === 'Bloqueio operacional')).toBeTruthy();
  expect(items.every((item) => item.quantity > 0)).toBeTruthy();

  const summary = toBillingAccountSummary(snapshot.accounts[0]);
  expect(summary.planLabel).toBe('Rede');
  expect(summary.statusLabel).toBe('Suspensa');
  expect(summary.blockLabel).toBe('Ativo');
});
