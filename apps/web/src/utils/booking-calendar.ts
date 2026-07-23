export const CALENDAR_WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const;

export function buildMonthWeeks(viewDate: Date): (Date | null)[][] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: firstWeekday }, () => null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }

  while (cells.length % CALENDAR_WEEKDAYS.length !== 0) {
    cells.push(null);
  }

  return Array.from(
    { length: cells.length / CALENDAR_WEEKDAYS.length },
    (_, weekIndex) => cells.slice(
      weekIndex * CALENDAR_WEEKDAYS.length,
      (weekIndex + 1) * CALENDAR_WEEKDAYS.length,
    ),
  );
}
