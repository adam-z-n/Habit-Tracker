import { describe, expect, it } from 'vitest';
import { addDays } from '../src/core/dates';
import { createHabit, logRecord } from '../src/core/ops';
import { buildIndex, isScheduled, rate, streak, weekProgress } from '../src/core/stats';
import { clockAt, freshData } from './helpers';

// The owner saw wrong "X of Y this week" counts after ticking earlier days. The cause: a habit starts on the
// day it is created, and days before that were treated as not due, so back-filled check marks there were
// drawn but not counted. Days from the earliest check mark on now count.

const week = Array.from({ length: 7 }, (_, i) => addDays('2026-11-23', i)); // Mon 23 – Sun 29
const wed = clockAt('2026-11-25');

function habitWith(days: string[], input: Parameters<typeof createHabit>[1] = { name: 'Read' }) {
  const data = freshData();
  const habit = createHabit(data, input, wed);
  for (const day of days) logRecord(data, { habitId: habit.id, date: day }, wed);
  return { habit, index: buildIndex(data.records) };
}

describe('check marks back-filled before a habit was created', () => {
  it('count toward the week, the streak and the rate', () => {
    const { habit, index } = habitWith(['2026-11-23', '2026-11-24', '2026-11-25']);
    expect(weekProgress(habit, index, week, '2026-11-25', 1)).toEqual({ done: 3, due: 7, unit: 'week' });
    expect(streak(habit, index, '2026-11-25', 1).current).toBe(3);
    expect(rate(habit, index, '2026-11-23', '2026-11-25', '2026-11-25', 1)).toEqual({ done: 3, due: 3 });
  });

  it('make the habit start at the earliest check mark, not before', () => {
    const { habit, index } = habitWith(['2026-11-24']);
    // Monday is before the earliest mark, so it is not due; Tuesday onwards is.
    expect(weekProgress(habit, index, week, '2026-11-25', 1)).toEqual({ done: 1, due: 6, unit: 'week' });
    expect(isScheduled(habit, '2026-11-23')).toBe(false);
  });

  it('respect the days of the week a habit is for', () => {
    const { habit, index } = habitWith(['2026-11-23'], { name: 'Stretch', frequency: { type: 'weekdays', days: [1, 3, 5] } });
    expect(weekProgress(habit, index, week, '2026-11-25', 1)).toEqual({ done: 1, due: 3, unit: 'week' });
  });

  it('keep an every-few-days rhythm counted from the start date', () => {
    const { habit } = habitWith([], { name: 'Water plants', frequency: { type: 'interval', every: 2 } });
    // Created Wednesday the 25th, every 2 days: the 23rd and 27th are on the rhythm, the 24th is not.
    expect(['2026-11-23', '2026-11-24', '2026-11-27'].map((d) => isScheduled(habit, d, '2026-11-23'))).toEqual([true, false, true]);
  });

  it('were already counted for a weekly goal', () => {
    const { habit, index } = habitWith(['2026-11-23', '2026-11-24'], { name: 'Run', frequency: { type: 'perWeek', times: 3 } });
    expect(weekProgress(habit, index, week, '2026-11-25', 1)).toEqual({ done: 2, due: 3, unit: 'week' });
  });
});
