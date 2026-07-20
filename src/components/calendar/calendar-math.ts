export const SLOT_MINUTES = 30;
export const SLOT_HEIGHT = 36;
export const FALLBACK_START = 8 * 60;
export const FALLBACK_END = 20 * 60;

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const zonedParts = (date: Date, timezone?: string): ZonedParts => {
  if (!timezone) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
    };
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone: timezone,
    year: 'numeric',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
};

export const minutesOfDay = (date: Date, timezone?: string) => {
  const parts = zonedParts(date, timezone);
  return parts.hour * 60 + parts.minute;
};

export const isSameCalendarDay = (left: Date, right: Date, timezone?: string) => {
  const leftParts = zonedParts(left, timezone);
  const rightParts = zonedParts(right, timezone);
  return leftParts.year === rightParts.year && leftParts.month === rightParts.month && leftParts.day === rightParts.day;
};

export const parseClock = (clock?: string) => {
  if (!clock) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
};

const timezoneOffsetAt = (date: Date, timezone: string) => {
  const parts = zonedParts(date, timezone);
  const representedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return representedAsUtc - Math.floor(date.getTime() / 1000) * 1000;
};

export const zonedDateAtMinute = (referenceDate: Date, minute: number, timezone?: string) => {
  if (!timezone) {
    const next = new Date(referenceDate);
    next.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
    return next;
  }

  const reference = zonedParts(referenceDate, timezone);
  const localUtc = Date.UTC(reference.year, reference.month - 1, reference.day, Math.floor(minute / 60), minute % 60, 0, 0);
  let candidate = new Date(localUtc);
  candidate = new Date(localUtc - timezoneOffsetAt(candidate, timezone));
  candidate = new Date(localUtc - timezoneOffsetAt(candidate, timezone));
  return candidate;
};

export const buildCalendarRange = ({
  eventStarts,
  eventEnds,
  workingStart,
  workingEnd,
  timezone,
}: {
  eventStarts: Date[];
  eventEnds: Date[];
  workingStart?: string;
  workingEnd?: string;
  timezone?: string;
}) => {
  const starts = eventStarts.map((date) => minutesOfDay(date, timezone));
  const ends = eventEnds.map((date) => minutesOfDay(date, timezone));
  const scheduleStart = parseClock(workingStart);
  const scheduleEnd = parseClock(workingEnd);
  const rawStart = Math.min(scheduleStart ?? FALLBACK_START, ...(starts.length ? starts : [FALLBACK_START]));
  const rawEnd = Math.max(scheduleEnd ?? FALLBACK_END, ...(ends.length ? ends : [FALLBACK_END]));
  const startMinute = Math.floor(rawStart / SLOT_MINUTES) * SLOT_MINUTES;
  const endMinute = Math.max(startMinute + SLOT_MINUTES, Math.ceil(rawEnd / SLOT_MINUTES) * SLOT_MINUTES);
  const slots = Array.from(
    { length: Math.ceil((endMinute - startMinute) / SLOT_MINUTES) },
    (_, index) => startMinute + index * SLOT_MINUTES,
  );
  return { startMinute, endMinute, slots };
};

export const calculateEventGeometry = (startsAt: Date, endsAt: Date, startMinute: number, timezone?: string) => {
  const top = ((minutesOfDay(startsAt, timezone) - startMinute) / SLOT_MINUTES) * SLOT_HEIGHT + 2;
  const durationMinutes = Math.max(SLOT_MINUTES, (endsAt.getTime() - startsAt.getTime()) / 60_000);
  const height = Math.max(44, (durationMinutes / SLOT_MINUTES) * SLOT_HEIGHT - 4);
  return { top, height, durationMinutes };
};
