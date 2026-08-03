import { expect, test } from '@playwright/test';
import {
  getAvailableSlots,
  intersectWindows,
} from '../../apps/web/src/features/availability/get-available-slots';

test('cruza opening_hours com work_hours', () => {
  expect(intersectWindows(
    { openMinutes: 8 * 60, closeMinutes: 18 * 60 },
    { openMinutes: 10 * 60, closeMinutes: 16 * 60 },
  )).toEqual({ openMinutes: 10 * 60, closeMinutes: 16 * 60 });
  expect(intersectWindows(
    { openMinutes: 8 * 60, closeMinutes: 12 * 60 },
    { openMinutes: 13 * 60, closeMinutes: 18 * 60 },
  )).toBeNull();
});

test('bloqueia pelo intervalo start-end e respeita duração do serviço', () => {
  const slots = getAvailableSlots({
    serviceDurationMinutes: 60,
    establishmentWindow: { openMinutes: 14 * 60, closeMinutes: 17 * 60 },
    busyIntervals: [{ startMinutes: 14 * 60, endMinutes: 15 * 60 }],
  });
  const available = slots.filter((slot) => slot.available).map((slot) => slot.localTime);
  expect(available).toEqual(['15:00', '15:30', '16:00']);
  expect(slots.find((slot) => slot.localTime === '14:00')?.reason).toBe('busy');
  expect(slots.find((slot) => slot.localTime === '14:30')?.reason).toBe('busy');
});

test('exclui passado e schedule_blocks', () => {
  const slots = getAvailableSlots({
    serviceDurationMinutes: 30,
    establishmentWindow: { openMinutes: 9 * 60, closeMinutes: 12 * 60 },
    blockIntervals: [{ startMinutes: 10 * 60, endMinutes: 11 * 60 }],
    nowMinutes: 9 * 60 + 20,
  });
  expect(slots.filter((slot) => slot.available).map((slot) => slot.localTime)).toEqual(['09:30', '11:00', '11:30']);
  expect(slots.find((slot) => slot.localTime === '09:00')?.reason).toBe('past');
  expect(slots.find((slot) => slot.localTime === '10:00')?.reason).toBe('blocked');
});
