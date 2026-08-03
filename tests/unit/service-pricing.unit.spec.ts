import { expect, test } from '@playwright/test';
import {
  applyDiscount,
  comboDiscountPercent,
  comboMembersTotal,
  resolveEffectivePrice,
} from '../../packages/domain/src/service-pricing';

test('aplica desconto percentual e preço fixo', () => {
  expect(applyDiscount(100, 'percent', 20)).toBe(80);
  expect(applyDiscount(100, 'fixed_price', 70)).toBe(70);
  expect(applyDiscount(50, 'fixed_price', 70)).toBe(50);
});

test('escolhe promoção do serviço no dia da semana e calcula economia', () => {
  const result = resolveEffectivePrice(100, 'svc-1', '2026-08-03', [
    {
      id: 'promo-global',
      serviceId: null,
      daysOfWeek: [1],
      discountType: 'percent',
      value: 10,
      startsAt: '2026-01-01',
      endsAt: null,
      isActive: true,
    },
    {
      id: 'promo-service',
      serviceId: 'svc-1',
      daysOfWeek: [1],
      discountType: 'percent',
      value: 25,
      startsAt: '2026-01-01',
      endsAt: null,
      isActive: true,
    },
  ]);
  // 2026-08-03 is Monday (DOW=1)
  expect(result.promotionId).toBe('promo-service');
  expect(result.effectivePrice).toBe(75);
  expect(result.savings).toBe(25);
});

test('calcula economia do combo vs soma dos avulsos', () => {
  expect(comboMembersTotal([40, 30, 20])).toBe(90);
  expect(comboDiscountPercent(90, 70)).toBe(22.2);
  expect(comboDiscountPercent(90, 90)).toBe(0);
});
