import {
  assertCurrencyCode,
  assertMoneyCents,
  assertSupportedOperationalCurrency,
  isMoneyCents,
  isSupportedOperationalCurrency,
  normalizeCurrencyCode,
  type CurrencyCode,
  type MoneyCents,
} from '@cutsync/domain';

export type MoneyCentsValidation =
  | { ok: true; value: MoneyCents }
  | { ok: false; message: string };

export type CurrencyValidation =
  | { ok: true; value: CurrencyCode }
  | { ok: false; message: string };

/** Validates integer cents without duplicating domain arithmetic rules. */
export const validateMoneyCents = (value: unknown): MoneyCentsValidation => {
  if (!isMoneyCents(value)) {
    return { ok: false, message: 'Informe um valor inteiro em centavos.' };
  }
  try {
    return { ok: true, value: assertMoneyCents(value) };
  } catch {
    return { ok: false, message: 'Informe um valor inteiro em centavos.' };
  }
};

export const validateCurrencyCode = (value: unknown): CurrencyValidation => {
  const normalized = normalizeCurrencyCode(value);
  if (!normalized) {
    return { ok: false, message: 'Informe um código de moeda válido.' };
  }
  try {
    return { ok: true, value: assertCurrencyCode(normalized) };
  } catch {
    return { ok: false, message: 'Informe um código de moeda válido.' };
  }
};

export const validateOperationalCurrency = (value: unknown): CurrencyValidation => {
  if (!isSupportedOperationalCurrency(value)) {
    return { ok: false, message: 'Moeda operacional não suportada neste ciclo.' };
  }
  try {
    return { ok: true, value: assertSupportedOperationalCurrency(value) };
  } catch {
    return { ok: false, message: 'Moeda operacional não suportada neste ciclo.' };
  }
};

export const validateFinancialOpsEnabled = (value: unknown): value is boolean => (
  typeof value === 'boolean'
);
