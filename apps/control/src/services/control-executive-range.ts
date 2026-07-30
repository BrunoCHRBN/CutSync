export type ControlMetricRangeDays = 7 | 28 | 90;

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function getSaoPauloDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function createControlMetricRange(
  days: ControlMetricRangeDays,
  now = new Date(),
) {
  // Daily snapshots close after the operational day ends. The cockpit therefore
  // requests complete days only and never compares a partial current day.
  const end = shiftDate(getSaoPauloDate(now), -1);
  return { start: shiftDate(end, -(days - 1)), end };
}
