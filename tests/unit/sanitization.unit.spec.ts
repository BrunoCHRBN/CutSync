import { expect, test } from '@playwright/test';

// Helper formatters under test (mirroring RequestEstablishmentExperience implementation)
const formatCpf = (val: string) => {
  const clean = val.replace(/<[^>]*>/g, '').replace(/\D/g, ''); // Strips XML/HTML tags first
  if (clean.length <= 3) return clean;
  if (clean.length <= 6) return `${clean.slice(0, 3)}.${clean.slice(3)}`;
  if (clean.length <= 9) return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6)}`;
  return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9, 11)}`;
};

const formatCnpj = (val: string) => {
  const clean = val.replace(/<[^>]*>/g, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (clean.length <= 2) return clean;
  if (clean.length <= 5) return `${clean.slice(0, 2)}.${clean.slice(2)}`;
  if (clean.length <= 8) return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5)}`;
  if (clean.length <= 12) return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8)}`;
  return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12, 14)}`;
};

const formatPhoneWithDdi = (val: string) => {
  if (val.length < 3) return '';
  const clean = val.replace(/<[^>]*>/g, '').replace(/\D/g, ''); // Strips XML/HTML tags first
  if (clean.length === 0) return '';
  
  let digits = clean;
  if (clean.length > 0 && !clean.startsWith('55')) {
    if (clean === '5') {
      digits = '55';
    } else {
      digits = '55' + clean;
    }
  }
  
  if (digits.length <= 2) return '+55';
  if (digits.length <= 4) return `+55 (${digits.slice(2)}`;
  if (digits.length <= 8) return `+55 (${digits.slice(2, 4)}) ${digits.slice(4)}`;
  if (digits.length <= 12) return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9, 13)}`;
};

test('Sanitização CPF: Rejeita letras, emojis e SVG', () => {
  // Test removing emojis
  expect(formatCpf('123456789💈00')).toBe('123.456.789-00');
  
  // Test removing letters
  expect(formatCpf('123abc456def789xyz00')).toBe('123.456.789-00');

  // Test removing SVG XML code
  const svgInput = '123<svg height="100" width="100"><circle cx="50" cy="50" r="40" /></svg>45678900';
  expect(formatCpf(svgInput)).toBe('123.456.789-00');
});

test('Sanitização CNPJ: aceita letras, rejeita símbolos e remove tags', () => {
  // Test removing emojis
  expect(formatCnpj('123456780001💈99')).toBe('12.345.678/0001-99');
  
  // Preserve lowercase letters as uppercase in the new official format
  expect(formatCnpj('12abc34501de35')).toBe('12.ABC.345/01DE-35');

  // Test removing SVG XML code
  const svgInput = '123456780001<svg></svg>99';
  expect(formatCnpj(svgInput)).toBe('12.345.678/0001-99');
});

test('Sanitização Telefone: Formata com +55 DDI e rejeita letras, emojis e SVG', () => {
  // Test prepending 55 on basic local inputs
  expect(formatPhoneWithDdi('11999999999')).toBe('+55 (11) 99999-9999');

  // Test input with DDI already present
  expect(formatPhoneWithDdi('5511999999999')).toBe('+55 (11) 99999-9999');

  // Test deletion behaviors
  expect(formatPhoneWithDdi('1')).toBe(''); // clear if less than 3 characters input
  expect(formatPhoneWithDdi('+5')).toBe('');

  // Test removing emojis
  expect(formatPhoneWithDdi('1199999💈9999')).toBe('+55 (11) 99999-9999');

  // Test removing letters
  expect(formatPhoneWithDdi('11abc99999def9999')).toBe('+55 (11) 99999-9999');

  // Test removing SVG XML code
  const svgInput = '1199999<svg></svg>9999';
  expect(formatPhoneWithDdi(svgInput)).toBe('+55 (11) 99999-9999');
});
