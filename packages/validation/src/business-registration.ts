export type BrazilianDocumentType = 'CPF' | 'CNPJ';

export const normalizeCpf = (value: string) => value.replace(/\D/g, '');

export const normalizeCnpj = (value: string) =>
  value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

export const normalizeBrazilianDocument = (type: BrazilianDocumentType, value: string) =>
  type === 'CPF' ? normalizeCpf(value) : normalizeCnpj(value);

const hasRepeatedDigits = (value: string) => /^(\d)\1+$/.test(value);

export const isValidCpf = (value: string) => {
  const digits = normalizeCpf(value);
  if (digits.length !== 11 || hasRepeatedDigits(digits)) return false;
  for (let position = 9; position <= 10; position += 1) {
    let sum = 0;
    for (let index = 0; index < position; index += 1) {
      sum += Number(digits[index]) * (position + 1 - index);
    }
    if ((((sum * 10) % 11) % 10) !== Number(digits[position])) return false;
  }
  return true;
};

export const isValidCnpj = (value: string) => {
  const document = normalizeCnpj(value);
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(document) || /^([A-Z0-9])\1{11}/.test(document)) {
    return false;
  }
  const characterValue = (character: string) => character.charCodeAt(0) - 48;
  const calculate = (length: number) => {
    let factor = length - 7;
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += characterValue(document[index]) * factor--;
      if (factor < 2) factor = 9;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return calculate(12) === Number(document[12]) && calculate(13) === Number(document[13]);
};

export const normalizeBrazilPhoneE164 = (value: string) => {
  if (!value.trim()) return '';
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('55')) digits = digits.slice(2);
  if ((digits.length !== 10 && digits.length !== 11) || /^(\d)\1+$/.test(digits)) return null;
  if (digits.slice(0, 2) === '00') return null;
  return `+55${digits}`;
};

export const formatBrazilPhone = (value: string) => {
  const normalized = normalizeBrazilPhoneE164(value);
  if (!normalized) return value;
  const digits = normalized.slice(3);
  return digits.length === 11
    ? `+55 (${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
    : `+55 (${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
};

export const formatMaskedDocument = (type: BrazilianDocumentType, last4: string) =>
  type === 'CPF' ? `***.***.***-${last4}` : `**.***.***/****-${last4}`;
