export type DiscountType = 'percent' | 'fixed_price';

export interface PricingPromotion {
  id: string;
  serviceId: string | null;
  daysOfWeek: number[];
  discountType: DiscountType;
  value: number;
  startsAt: string;
  endsAt: string | null;
  isActive: boolean;
}

export interface EffectivePriceResult {
  listPrice: number;
  effectivePrice: number;
  savings: number;
  promotionId: string | null;
  discountType: DiscountType | null;
  discountValue: number | null;
}

const toDateKey = (value: string | Date) => {
  if (typeof value === 'string') return value.slice(0, 10);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** Local civil DOW compatible with Postgres EXTRACT(DOW): 0=Sunday. */
export const localDayOfWeek = (date: string | Date) => {
  const key = toDateKey(date);
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
};

export const applyDiscount = (listPrice: number, discountType: DiscountType, value: number) => {
  if (discountType === 'fixed_price') return Math.max(0, Math.min(listPrice, value));
  const next = Math.round(listPrice * (1 - value / 100) * 100) / 100;
  return Math.max(0, next);
};

export const resolveEffectivePrice = (
  listPrice: number,
  serviceId: string,
  localDate: string | Date,
  promotions: readonly PricingPromotion[],
): EffectivePriceResult => {
  const dateKey = toDateKey(localDate);
  const dow = localDayOfWeek(dateKey);
  const eligible = promotions.filter((promotion) => {
    if (!promotion.isActive) return false;
    if (promotion.serviceId && promotion.serviceId !== serviceId) return false;
    if (dateKey < promotion.startsAt.slice(0, 10)) return false;
    if (promotion.endsAt && dateKey > promotion.endsAt.slice(0, 10)) return false;
    return promotion.daysOfWeek.includes(dow);
  });

  eligible.sort((left, right) => {
    const specificity = Number(Boolean(right.serviceId)) - Number(Boolean(left.serviceId));
    if (specificity !== 0) return specificity;
    const leftSavings = listPrice - applyDiscount(listPrice, left.discountType, left.value);
    const rightSavings = listPrice - applyDiscount(listPrice, right.discountType, right.value);
    return rightSavings - leftSavings;
  });

  const winner = eligible[0];
  if (!winner) {
    return {
      listPrice,
      effectivePrice: listPrice,
      savings: 0,
      promotionId: null,
      discountType: null,
      discountValue: null,
    };
  }

  const effectivePrice = applyDiscount(listPrice, winner.discountType, winner.value);
  return {
    listPrice,
    effectivePrice,
    savings: Math.max(0, listPrice - effectivePrice),
    promotionId: winner.id,
    discountType: winner.discountType,
    discountValue: winner.value,
  };
};

export const comboMembersTotal = (memberPrices: readonly number[]) =>
  memberPrices.reduce((sum, price) => sum + price, 0);

export const comboDiscountPercent = (membersTotal: number, comboPrice: number) => {
  if (membersTotal <= 0 || comboPrice >= membersTotal) return 0;
  return Math.round(((membersTotal - comboPrice) / membersTotal) * 1000) / 10;
};
