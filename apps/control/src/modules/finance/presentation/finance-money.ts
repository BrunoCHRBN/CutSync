export function formatMoneyCents(
  cents: number | null | undefined,
  currency = 'BRL',
): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) {
    return 'Não disponível';
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

export function formatMoneyInputToCents(value: string): number | null {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.');
  if (!normalized) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

export function formatSignedMoneyCents(
  cents: number | null | undefined,
  currency = 'BRL',
): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) {
    return 'Não disponível';
  }
  const formatted = formatMoneyCents(Math.abs(cents), currency);
  if (cents < 0) {
    return formatted.startsWith('-') ? formatted : `-${formatted}`;
  }
  return formatted;
}
