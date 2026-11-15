import { addDays, addMonths, diffDays, monthEnd, monthStart, weekStart, yearEnd, yearStart } from './dates';
import type { Day } from './types';

// Reporting periods and the period each is compared with.

export type PeriodKey = 'week' | 'lastWeek' | 'month' | 'lastMonth' | 'year' | 'lastYear' | 'all' | 'custom';

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  week: 'This week',
  lastWeek: 'Last week',
  month: 'This month',
  lastMonth: 'Last month',
  year: 'This year',
  lastYear: 'Last year',
  all: 'All time',
  custom: 'Custom range',
};

export interface Period {
  from: Day;
  to: Day;
  /** The period before, of the same length, for comparison. Null for all time. */
  previous: { from: Day; to: Day; label: string } | null;
}

export function resolvePeriod(key: PeriodKey, today: Day, weekStartsOn: number, earliest: Day, custom?: { from: Day; to: Day }): Period {
  const shiftYear = (day: Day, by: number) => `${Number(day.slice(0, 4)) + by}${day.slice(4)}`;
  switch (key) {
    case 'week':
    case 'lastWeek': {
      const from = addDays(weekStart(today, weekStartsOn), key === 'week' ? 0 : -7);
      return { from, to: addDays(from, 6), previous: { from: addDays(from, -7), to: addDays(from, -1), label: 'prior week' } };
    }
    case 'month':
    case 'lastMonth': {
      const from = addMonths(monthStart(today), key === 'month' ? 0 : -1);
      const before = addMonths(from, -1);
      return { from, to: monthEnd(from), previous: { from: before, to: monthEnd(before), label: 'prior month' } };
    }
    case 'year':
    case 'lastYear': {
      const from = shiftYear(yearStart(today), key === 'year' ? 0 : -1);
      return { from, to: yearEnd(from), previous: { from: shiftYear(from, -1), to: yearEnd(shiftYear(from, -1)), label: 'prior year' } };
    }
    case 'all':
      return { from: earliest < today ? earliest : today, to: today, previous: null };
    case 'custom': {
      const from = custom?.from ?? today;
      const to = custom && custom.to >= from ? custom.to : from;
      const length = diffDays(from, to) + 1;
      return { from, to, previous: { from: addDays(from, -length), to: addDays(from, -1), label: `prior ${length} days` } };
    }
  }
}
