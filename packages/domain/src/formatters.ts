const DEFAULT_LOCALE = 'pt-BR';
const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const DEFAULT_CURRENCY = 'BRL';

export function formatCurrency(
  value: number,
  currency = DEFAULT_CURRENCY,
  locale = DEFAULT_LOCALE,
): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
}
export function formatDateTime(
  value: string | Date,
  timezone = DEFAULT_TIMEZONE,
  locale = DEFAULT_LOCALE,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data indisponível';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(date);
}

export function formatLocalDate(
  localDate: string,
  locale = DEFAULT_LOCALE,
): string {
  const [year, month, day] = localDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (Number.isNaN(date.getTime())) return 'Data indisponível';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}
