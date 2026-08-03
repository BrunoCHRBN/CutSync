/** Pure availability engine shared by admin quick-book, reschedule and free-window insights. */

export interface ScheduleWindow {
  openMinutes: number;
  closeMinutes: number;
}

export interface TimeInterval {
  startMinutes: number;
  endMinutes: number;
}

export interface GetAvailableSlotsInput {
  serviceDurationMinutes: number;
  /** Intersection of establishment opening hours for the day. `null` = closed / not configured. */
  establishmentWindow: ScheduleWindow | null;
  /** Professional work hours for the day. `null` = closed; `undefined` = no extra restriction. */
  professionalWindow?: ScheduleWindow | null;
  busyIntervals?: TimeInterval[];
  blockIntervals?: TimeInterval[];
  /** Minutes from midnight for "now" on the same local day; omit when not filtering past. */
  nowMinutes?: number | null;
  stepMinutes?: number;
}

export interface AvailableSlotResult {
  localTime: string;
  startMinutes: number;
  endMinutes: number;
  available: boolean;
  reason: 'past' | 'busy' | 'blocked' | 'outside_hours' | null;
}

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && aEnd > bStart;

export const minutesToClock = (minutes: number) => {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

export const clockToMinutes = (clock: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
};

export const intersectWindows = (
  left: ScheduleWindow | null | undefined,
  right: ScheduleWindow | null | undefined,
): ScheduleWindow | null => {
  if (left === null || right === null) return null;
  if (!left && !right) return null;
  if (!left) return right ?? null;
  if (!right) return left;
  const openMinutes = Math.max(left.openMinutes, right.openMinutes);
  const closeMinutes = Math.min(left.closeMinutes, right.closeMinutes);
  if (openMinutes >= closeMinutes) return null;
  return { openMinutes, closeMinutes };
};

export const getAvailableSlots = ({
  serviceDurationMinutes,
  establishmentWindow,
  professionalWindow,
  busyIntervals = [],
  blockIntervals = [],
  nowMinutes = null,
  stepMinutes = 30,
}: GetAvailableSlotsInput): AvailableSlotResult[] => {
  const duration = Math.max(1, Math.round(serviceDurationMinutes));
  const step = Math.max(1, Math.round(stepMinutes));
  const window = intersectWindows(establishmentWindow, professionalWindow);
  if (!window) return [];

  const latestStart = window.closeMinutes - duration;
  if (latestStart < window.openMinutes) return [];

  const slots: AvailableSlotResult[] = [];
  for (let startMinutes = window.openMinutes; startMinutes <= latestStart; startMinutes += step) {
    const endMinutes = startMinutes + duration;
    let reason: AvailableSlotResult['reason'] = null;
    if (nowMinutes != null && startMinutes <= nowMinutes) {
      reason = 'past';
    } else if (busyIntervals.some((interval) => overlaps(startMinutes, endMinutes, interval.startMinutes, interval.endMinutes))) {
      reason = 'busy';
    } else if (blockIntervals.some((interval) => overlaps(startMinutes, endMinutes, interval.startMinutes, interval.endMinutes))) {
      reason = 'blocked';
    }
    slots.push({
      localTime: minutesToClock(startMinutes),
      startMinutes,
      endMinutes,
      available: reason === null,
      reason,
    });
  }
  return slots;
};
