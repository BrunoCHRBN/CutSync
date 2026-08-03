import type { BusinessAgendaItem } from '@cutsync/database';

const activeStatuses = new Set(['pending', 'confirmed']);

export const getLocalDateInTimeZone = (timeZone: string, now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export const shiftLocalDate = (localDate: string, days: number) => {
  const [year, month, day] = localDate.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 12));
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, '0'),
    String(shifted.getUTCDate()).padStart(2, '0'),
  ].join('-');
};

const localDateTimeParts = (value: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
};

export const localDateTimeToIso = (
  localDate: string,
  localTime: string,
  timeZone: string,
) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(localTime)) {
    return null;
  }
  const [year, month, day] = localDate.split('-').map(Number);
  const [hour, minute] = localTime.split(':').map(Number);
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = desiredAsUtc;

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const rendered = localDateTimeParts(new Date(candidate), timeZone);
      const renderedAsUtc = Date.UTC(
        Number(rendered.year),
        Number(rendered.month) - 1,
        Number(rendered.day),
        Number(rendered.hour),
        Number(rendered.minute),
      );
      candidate += desiredAsUtc - renderedAsUtc;
    }
    const verified = localDateTimeParts(new Date(candidate), timeZone);
    if (
      Number(verified.year) !== year
      || Number(verified.month) !== month
      || Number(verified.day) !== day
      || Number(verified.hour) !== hour
      || Number(verified.minute) !== minute
    ) return null;
    return new Date(candidate).toISOString();
  } catch {
    return null;
  }
};

export const formatAgendaDate = (localDate: string, timeZone: string) => {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
};

export const formatAgendaTime = (value: string, timeZone: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));

export const summarizeBusinessAgenda = (items: BusinessAgendaItem[], now = new Date()) => {
  const active = items.filter((item) => activeStatuses.has(item.status));
  const next = active.find((item) => new Date(item.startsAt).getTime() >= now.getTime()) ?? null;
  const remaining = active.filter((item) => new Date(item.endsAt).getTime() > now.getTime()).length;
  const delayed = active.filter((item) => new Date(item.startsAt).getTime() < now.getTime()).length;
  return { next, remaining, delayed };
};

export const getAgendaStatusLabel = (status: string) => {
  switch (status) {
    case 'pending': return 'Pendente';
    case 'confirmed': return 'Confirmado';
    case 'completed': return 'Concluído';
    case 'cancelled': return 'Cancelado';
    case 'no_show': return 'Não compareceu';
    default: return 'Atualizado';
  }
};
