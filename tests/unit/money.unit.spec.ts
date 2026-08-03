import { expect, test } from '@playwright/test';

import {
  addMoneyCents,
  assertCurrencyCode,
  assertMoneyCents,
  assertSupportedOperationalCurrency,
  decimalAmountToCents,
  formatMoneyCents,
  isMoneyCents,
  subtractMoneyCents,
} from '../../packages/domain/src/money';
import {
  validateCurrencyCode,
  validateFinancialOpsEnabled,
  validateMoneyCents,
  validateOperationalCurrency,
} from '../../packages/validation/src/money';

test('aceita centavos inteiros seguros e rejeita fracionários/NaN/Infinity', () => {
  expect(isMoneyCents(0)).toBe(true);
  expect(isMoneyCents(1990)).toBe(true);
  expect(isMoneyCents(-50)).toBe(true);
  expect(isMoneyCents(1.5)).toBe(false);
  expect(isMoneyCents(Number.NaN)).toBe(false);
  expect(isMoneyCents(Number.POSITIVE_INFINITY)).toBe(false);
  expect(isMoneyCents('1990')).toBe(false);
  expect(assertMoneyCents(250)).toBe(250);
  expect(() => assertMoneyCents(1.25)).toThrow('invalid_money_cents');
  expect(validateMoneyCents(10).ok).toBe(true);
  expect(validateMoneyCents(10.1).ok).toBe(false);
});

test('protege overflow em soma e subtração', () => {
  expect(addMoneyCents([100, 250, -50])).toBe(300);
  expect(subtractMoneyCents(500, 125)).toBe(375);
  expect(() => addMoneyCents([Number.MAX_SAFE_INTEGER, 1])).toThrow('money_overflow');
  expect(() => subtractMoneyCents(Number.MIN_SAFE_INTEGER, 1)).toThrow('money_overflow');
});

test('converte decimal legado para centavos com arredondamento definido', () => {
  expect(decimalAmountToCents('19.90')).toBe(1990);
  expect(decimalAmountToCents(19.9)).toBe(1990);
  expect(decimalAmountToCents('1.005')).toBe(101);
  expect(decimalAmountToCents('-1.005')).toBe(-101);
  expect(decimalAmountToCents('1.004')).toBe(100);
  expect(decimalAmountToCents('10')).toBe(1000);
  expect(() => decimalAmountToCents('abc')).toThrow('invalid_decimal_amount');
  expect(() => decimalAmountToCents(Number.NaN)).toThrow('invalid_decimal_amount');
});

test('normaliza moeda e restringe suporte operacional a BRL', () => {
  expect(assertCurrencyCode('brl')).toBe('BRL');
  expect(assertCurrencyCode('BRL')).toBe('BRL');
  expect(assertCurrencyCode('USD')).toBe('USD');
  expect(assertSupportedOperationalCurrency('BRL')).toBe('BRL');
  expect(() => assertSupportedOperationalCurrency('USD')).toThrow(
    'unsupported_operational_currency',
  );
  expect(() => assertCurrencyCode('BR$')).toThrow('invalid_currency_code');
  expect(() => assertCurrencyCode('123')).toThrow('invalid_currency_code');
  expect(() => assertCurrencyCode('ABCDE')).toThrow('invalid_currency_code');
  expect(() => assertCurrencyCode('')).toThrow('invalid_currency_code');
  expect(() => assertCurrencyCode('  ')).toThrow('invalid_currency_code');
  expect(validateCurrencyCode('brl').ok).toBe(true);
  expect(validateOperationalCurrency('BRL').ok).toBe(true);
  expect(validateOperationalCurrency('USD').ok).toBe(false);
  expect(validateCurrencyCode('BR$')).toMatchObject({ ok: false });
  expect(validateCurrencyCode('ABCDE')).toMatchObject({ ok: false });
  expect(validateCurrencyCode('')).toMatchObject({ ok: false });
});

test('formatação rejeita moeda inválida antes do Intl e flag é boolean estrito', () => {
  expect(formatMoneyCents(1990, 'BRL')).toContain('19');
  expect(() => formatMoneyCents(1990, 'BR$')).toThrow('invalid_currency_code');
  expect(() => formatMoneyCents(1990, 'ABCDE')).toThrow('invalid_currency_code');
  expect(validateFinancialOpsEnabled(false)).toBe(true);
  expect(validateFinancialOpsEnabled(true)).toBe(true);
  expect(validateFinancialOpsEnabled('false')).toBe(false);
});
