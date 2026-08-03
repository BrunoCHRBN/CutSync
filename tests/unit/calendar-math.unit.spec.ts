import { expect, test } from '@playwright/test';
import {
  appointmentCardDensity,
  buildCalendarRange,
  calculateEventGeometry,
  isSameCalendarDay,
  layoutConcurrentEvents,
  minutesOfDay,
  parseClock,
  shortDisplayName,
  SLOT_HEIGHT,
  zonedDateAtMinute,
} from '../../apps/web/src/components/calendar/calendar-math';

test('interpreta relógios e rejeita horários inválidos', () => {
  expect(parseClock('09:30')).toBe(570);
  expect(parseClock('23:59')).toBe(1439);
  expect(parseClock('24:00')).toBeNull();
  expect(parseClock('9:7')).toBeNull();
});

test('calcula minutos e dia civil no timezone do estabelecimento', () => {
  const instant = new Date('2026-07-19T12:30:00.000Z');
  expect(minutesOfDay(instant, 'America/Sao_Paulo')).toBe(570);
  expect(minutesOfDay(instant, 'America/Los_Angeles')).toBe(330);
  expect(isSameCalendarDay(
    new Date('2026-07-20T01:30:00.000Z'),
    new Date('2026-07-19T13:00:00.000Z'),
    'America/Sao_Paulo',
  )).toBe(true);
});

test('converte slot local em instante UTC inclusive na mudança de DST', () => {
  expect(zonedDateAtMinute(
    new Date('2026-07-19T15:00:00.000Z'),
    9 * 60 + 30,
    'America/Sao_Paulo',
  ).toISOString()).toBe('2026-07-19T12:30:00.000Z');
  expect(zonedDateAtMinute(
    new Date('2026-03-08T16:00:00.000Z'),
    9 * 60,
    'America/New_York',
  ).toISOString()).toBe('2026-03-08T13:00:00.000Z');
});

test('expande a grade para eventos fora da jornada e mantém slots de 30 minutos', () => {
  const range = buildCalendarRange({
    eventStarts: [new Date('2026-07-19T10:15:00.000Z')],
    eventEnds: [new Date('2026-07-20T00:10:00.000Z')],
    workingStart: '09:00',
    workingEnd: '18:00',
    timezone: 'America/Sao_Paulo',
  });
  expect(range.startMinute).toBe(7 * 60);
  expect(range.endMinute).toBe(21 * 60 + 30);
  expect(range.slots.every((minute, index) => index === 0 || minute - range.slots[index - 1] === 30)).toBe(true);
});

test('calcula posição e altura mínima do atendimento com slot confortável', () => {
  expect(SLOT_HEIGHT).toBe(52);
  expect(calculateEventGeometry(
    new Date('2026-07-19T09:15:00.000Z'),
    new Date('2026-07-19T10:15:00.000Z'),
    8 * 60,
    'UTC',
  )).toEqual({ top: 132, height: 100, durationMinutes: 60 });
  expect(calculateEventGeometry(
    new Date('2026-07-19T08:00:00.000Z'),
    new Date('2026-07-19T08:25:00.000Z'),
    8 * 60,
    'UTC',
  ).height).toBe(44);
  expect(appointmentCardDensity(44)).toBe('single');
  expect(appointmentCardDensity(56)).toBe('double');
  expect(appointmentCardDensity(100)).toBe('full');
});

test('empacota eventos simultâneos em colunas lado a lado', () => {
  const layout = layoutConcurrentEvents([
    {
      id: 'a',
      startsAt: new Date('2026-07-19T12:00:00.000Z'),
      endsAt: new Date('2026-07-19T13:00:00.000Z'),
    },
    {
      id: 'b',
      startsAt: new Date('2026-07-19T12:30:00.000Z'),
      endsAt: new Date('2026-07-19T13:30:00.000Z'),
    },
    {
      id: 'c',
      startsAt: new Date('2026-07-19T14:00:00.000Z'),
      endsAt: new Date('2026-07-19T14:30:00.000Z'),
    },
  ]);
  expect(layout.get('a')).toEqual({ column: 0, columnCount: 2 });
  expect(layout.get('b')).toEqual({ column: 1, columnCount: 2 });
  expect(layout.get('c')).toEqual({ column: 0, columnCount: 1 });
  expect(shortDisplayName('Bruno Vieira')).toBe('Bruno V.');
});
