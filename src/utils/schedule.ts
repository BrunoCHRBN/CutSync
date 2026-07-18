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

export const getOpeningStatus = (value?: string | null) => {
  const schedule = parseSchedule(value);
  if (!schedule.length) return { isOpen: false, text: '' };

  const now = new Date();
  const day = now.getDay();
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
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
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