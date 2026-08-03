/**
 * Shared monetary primitives for establishment financial-ops (POS).
 * Values are integer cents. Do not use floats as a persisted representation.
 * Multi-currency codes are typed for forward compatibility; P0 operational
 * support is BRL only.
 */

export type MoneyCents = number;
export type CurrencyCode = string;

export const SUPPORTED_OPERATIONAL_CURRENCIES = ['BRL'] as const;
export type SupportedOperationalCurrency = (typeof SUPPORTED_OPERATIONAL_CURRENCIES)[number];

const DECIMAL_AMOUNT_PATTERN = /^-?\d+(?:\.\d+)?$/;

export const isMoneyCents = (value: unknown): value is MoneyCents => (
  typeof value === 'number'
  && Number.isInteger(value)
  && Number.isSafeInteger(value)
);

export const assertMoneyCents = (value: unknown): MoneyCents => {
  if (!isMoneyCents(value)) {
    throw new Error('invalid_money_cents');
  }
  return value;
};

const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

export const normalizeCurrencyCode = (value: unknown): CurrencyCode | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return CURRENCY_CODE_PATTERN.test(normalized) ? normalized : null;
};

export const isSupportedOperationalCurrency = (
  value: unknown,
): value is SupportedOperationalCurrency => {
  const normalized = normalizeCurrencyCode(value);
  return normalized !== null
    && (SUPPORTED_OPERATIONAL_CURRENCIES as readonly string[]).includes(normalized);
};

export const assertCurrencyCode = (value: unknown): CurrencyCode => {
  const normalized = normalizeCurrencyCode(value);
  if (!normalized) {
    throw new Error('invalid_currency_code');
  }
  return normalized;
};

export const assertSupportedOperationalCurrency = (
  value: unknown,
): SupportedOperationalCurrency => {
  const normalized = assertCurrencyCode(value);
  if (!isSupportedOperationalCurrency(normalized)) {
    throw new Error('unsupported_operational_currency');
  }
  return normalized;
};

export const addMoneyCents = (values: readonly number[]): MoneyCents => {
  let total = 0;
  for (const value of values) {
    const cents = assertMoneyCents(value);
    const next = total + cents;
    if (!Number.isSafeInteger(next)) {
      throw new Error('money_overflow');
    }
    total = next;
  }
  return total;
};

export const subtractMoneyCents = (left: number, right: number): MoneyCents => {
  const leftCents = assertMoneyCents(left);
  const rightCents = assertMoneyCents(right);
  const next = leftCents - rightCents;
  if (!Number.isSafeInteger(next)) {
    throw new Error('money_overflow');
  }
  return next;
};

/**
 * Boundary helper: converts a legacy decimal amount (reais) to integer cents.
 * Rounding is half-away-from-zero on the third fractional digit of the decimal
 * amount (commercial round half up away from zero for positive/negative).
 * Not for use as a formatting path.
 */
export const decimalAmountToCents = (value: string | number): MoneyCents => {
  const raw = typeof value === 'number'
    ? (Number.isFinite(value) ? String(value) : '')
    : value.trim().replace(',', '.');

  if (!raw || !DECIMAL_AMOUNT_PATTERN.test(raw)) {
    throw new Error('invalid_decimal_amount');
  }

  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [wholePart, fractionPart = ''] = unsigned.split('.');

  if (!/^\d+$/.test(wholePart)) {
    throw new Error('invalid_decimal_amount');
  }

  const digits = `${fractionPart}000`.slice(0, 3);
  let fractionalCents = Number(digits.slice(0, 2));
  const third = Number(digits[2]);
  if (third >= 5) {
    fractionalCents += 1;
  }

  let whole = Number(wholePart);
  if (!Number.isSafeInteger(whole)) {
    throw new Error('money_overflow');
  }

  if (fractionalCents >= 100) {
    whole += 1;
    fractionalCents -= 100;
  }

  let cents = whole * 100 + fractionalCents;
  if (!Number.isSafeInteger(cents)) {
    throw new Error('money_overflow');
  }
  if (negative) {
    cents = -cents;
    if (!Number.isSafeInteger(cents)) {
      throw new Error('money_overflow');
    }
  }
  return cents;
};

/** Display only — never feed formatted output back into arithmetic. */
export const formatMoneyCents = (
  value: number,
  currency: string,
  locale = 'pt-BR',
): string => {
  const cents = assertMoneyCents(value);
  const code = assertCurrencyCode(currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
  }).format(cents / 100);
};
