import type { Day } from './types';

// Day arithmetic on `YYYY-MM-DD` strings, done in UTC so daylight saving never shifts a date.

const pad = (n: number) => String(n).padStart(2, '0');

function toUtc(day: Day): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): Day {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function isDay(value: unknown): value is Day {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && fromUtc(toUtc(value)) === value;
}

/** The local calendar day of a moment. */
export function localDay(date: Date = new Date()): Day {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localTime(date: Date = new Date()): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function addDays(day: Day, n: number): Day {
  const date = toUtc(day);
  date.setUTCDate(date.getUTCDate() + n);
  return fromUtc(date);
}

export function diffDays(from: Day, to: Day): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86400000);
}

/** Day of the week, 0 for Sunday. */
export function weekday(day: Day): number {
  return toUtc(day).getUTCDay();
}

export function weekStart(day: Day, startsOn: number): Day {
  return addDays(day, -((weekday(day) - startsOn + 7) % 7));
}

export function monthStart(day: Day): Day {
  return `${day.slice(0, 7)}-01`;
}

export function monthEnd(day: Day): Day {
  const [y, m] = day.split('-').map(Number);
  return fromUtc(new Date(Date.UTC(y, m, 0)));
}

export function addMonths(day: Day, n: number): Day {
  const [y, m] = day.split('-').map(Number);
  return fromUtc(new Date(Date.UTC(y, m - 1 + n, 1)));
}

export function yearStart(day: Day): Day {
  return `${day.slice(0, 4)}-01-01`;
}

export function yearEnd(day: Day): Day {
  return `${day.slice(0, 4)}-12-31`;
}

export function minDay(a: Day, b: Day): Day {
  return a < b ? a : b;
}

export function maxDay(a: Day, b: Day): Day {
  return a > b ? a : b;
}

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** `Sat, Nov 14` (with the year when it is not `thisYear`). */
export function formatDay(day: Day, thisYear?: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const base = `${WEEKDAY_SHORT[weekday(day)]}, ${MONTH_SHORT[m - 1]} ${d}`;
  return thisYear && String(y) === thisYear ? base : `${base}, ${y}`;
}

export function formatTime(time: string, format: '12h' | '24h'): string {
  if (format === '24h') return time;
  const [h, m] = time.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}
