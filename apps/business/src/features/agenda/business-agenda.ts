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
    default: return 'Atualizado';
  }
};
