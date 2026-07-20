export interface ScheduleDay {
  day: number;
  name?: string;
  isOpen: boolean;
  open: string;
  close: string;
}

const isScheduleDay = (value: unknown): value is ScheduleDay => {
  if (!value || typeof value !== 'object') return false;
  const day = value as Record<string, unknown>;
  return typeof day.day === 'number'
    && typeof day.isOpen === 'boolean'
    && typeof day.open === 'string'
    && typeof day.close === 'string';
};

export const parseSchedule = (value?: string | null): ScheduleDay[] => {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isScheduleDay) : [];
  } catch {
    return [];
  }
};

export const getOpeningStatus = (value?: string | null, timezone?: string | null) => {
  const schedule = parseSchedule(value);
  if (!schedule.length) return { isOpen: false, text: '' };

  const now = new Date();
  let day = now.getDay();
  let currentMinutes = now.getHours() * 60 + now.getMinutes();
  if (timezone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(now);
      const weekday = parts.find((part) => part.type === 'weekday')?.value;
      const hour = Number(parts.find((part) => part.type === 'hour')?.value);
      const minute = Number(parts.find((part) => part.type === 'minute')?.value);
      const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      if (weekday && weekdayMap[weekday] != null) day = weekdayMap[weekday];
      if (Number.isFinite(hour) && Number.isFinite(minute)) currentMinutes = hour * 60 + minute;
    } catch {
      // Fuso inválido: mantém o horário local do dispositivo como fallback seguro.
    }
  }
  const todaySchedule = schedule.find((item) => item.day === day);
  const nextOpenDay = (startingDay: number) => {
    let nextDay = startingDay;
    let daysCount = 1;
    let nextSchedule = schedule.find((item) => item.day === nextDay);
    while ((!nextSchedule || !nextSchedule.isOpen) && daysCount < 7) {
      nextDay = (nextDay + 1) % 7;
      nextSchedule = schedule.find((item) => item.day === nextDay);
      daysCount += 1;
    }
    if (!nextSchedule?.isOpen) return { isOpen: false, text: '' };
    const names = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    const label = daysCount === 1 ? 'amanhã' : `na ${names[nextDay]}`;
    return { isOpen: false, text: `Abre ${label} às ${nextSchedule.open}` };
  };

  if (!todaySchedule?.isOpen) {
    const next = nextOpenDay((day + 1) % 7);
    return next.text ? next : { isOpen: false, text: 'Fechado hoje' };
  }

  const [openHour, openMinute] = todaySchedule.open.split(':').map(Number);
  const [closeHour, closeMinute] = todaySchedule.close.split(':').map(Number);
  const openMinutes = openHour * 60 + openMinute;
  const closeMinutes = closeHour * 60 + closeMinute;

  if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
    return { isOpen: true, text: `Até às ${todaySchedule.close}` };
  }
  if (currentMinutes < openMinutes) {
    return { isOpen: false, text: `Abre hoje às ${todaySchedule.open}` };
  }
  return nextOpenDay((day + 1) % 7);
};
