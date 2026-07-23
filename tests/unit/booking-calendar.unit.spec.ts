import { expect, test } from '@playwright/test';
import {
  buildMonthWeeks,
  CALENDAR_WEEKDAYS,
} from '../../apps/web/src/utils/booking-calendar';

test('mantém cada semana com as mesmas sete colunas do cabeçalho', () => {
  const weeks = buildMonthWeeks(new Date(2026, 6, 1));

  expect(CALENDAR_WEEKDAYS).toEqual(['D', 'S', 'T', 'Q', 'Q', 'S', 'S']);
  expect(weeks.every((week) => week.length === 7)).toBe(true);
  expect(weeks[0].map((date) => date?.getDate() ?? null)).toEqual([null, null, null, 1, 2, 3, 4]);
});

test('posiciona domingos na primeira coluna inclusive na última semana', () => {
  const weeks = buildMonthWeeks(new Date(2026, 6, 1));

  expect(weeks.at(-1)?.[0]?.getDay()).toBe(0);
  expect(weeks.at(-1)?.map((date) => date?.getDate() ?? null)).toEqual([26, 27, 28, 29, 30, 31, null]);
});
