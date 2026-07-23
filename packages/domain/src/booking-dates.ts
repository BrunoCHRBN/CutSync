export interface BookingDateOption {
  localDate: string;
  weekdayLabel: string;
  dayLabel: string;
  monthLabel: string;
  isToday: boolean;
}

const datePartsInTimeZone = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export const addBookingCalendarDays = (localDate: string, days: number) => {
  const [year, month, day] = localDate.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days, 12));
  return [
    result.getUTCFullYear(),
    String(result.getUTCMonth() + 1).padStart(2, '0'),
    String(result.getUTCDate()).padStart(2, '0'),
  ].join('-');
};

const displayDate = (localDate: string) => new Date(localDate + 'T12:00:00.000Z');

export const getBookingDateOptions = (
  timeZone: string,
  count = 14,
  now = new Date(),
): BookingDateOption[] => {
  const today = datePartsInTimeZone(now, timeZone);
  return Array.from({ length: Math.max(0, Math.min(count, 32)) }, (_, index) => {
    const localDate = addBookingCalendarDays(today, index);
    const date = displayDate(localDate);
    return {
      localDate,
      weekdayLabel: new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' })
        .format(date)
        .replace('.', ''),
      dayLabel: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', timeZone: 'UTC' }).format(date),
      monthLabel: new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })
        .format(date)
        .replace('.', ''),
      isToday: index === 0,
    };
  });
};

export const formatBookingDateLong = (localDate: string) => (
  new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(displayDate(localDate))
);
