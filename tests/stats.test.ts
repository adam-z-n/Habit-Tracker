import { describe, expect, it } from 'vitest';
import { addDays, addMonths, diffDays, isDay, monthEnd, weekStart, weekday } from '../src/core/dates';
import { createHabit, logRecord, setGoal } from '../src/core/ops';
import { buildIndex, daySummary, dayStatus, isScheduled, percent, rate, streak } from '../src/core/stats';
import { convert, formatMinutes } from '../src/core/units';
import { clockAt, freshData } from './helpers';

describe('dates', () => {
  it('does day arithmetic across months, years and daylight saving', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(diffDays('2026-01-01', '2026-12-31')).toBe(364);
    expect(weekday('2026-11-15')).toBe(0);
    expect(weekStart('2026-11-15', 1)).toBe('2026-11-09');
    expect(weekStart('2026-11-15', 0)).toBe('2026-11-15');
    expect(monthEnd('2028-02-10')).toBe('2028-02-29');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01');
    expect(isDay('2026-02-30')).toBe(false);
  });
});

describe('units', () => {
  it('converts within a dimension only', () => {
    expect(convert(1, 'h', 'min')).toBe(60);
    expect(convert(10, 'km', 'miles')).toBeCloseTo(6.214, 3);
    expect(convert(3, 'mi', 'min')).toBeNull();
    expect(convert(3, 'pages', 'pages')).toBe(3);
    expect(convert(3, 'pages', 'reps')).toBeNull();
    expect(formatMinutes(135)).toBe('2h 15m');
  });
});

describe('schedules and streaks', () => {
  it('does not treat an unscheduled day as a miss', () => {
    const data = freshData();
    // Monday, Wednesday, Friday
    const habit = createHabit(data, { name: 'Gym', frequency: { type: 'weekdays', days: [1, 3, 5] } }, clockAt('2026-11-02'));
    for (const day of ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09']) logRecord(data, { habitId: habit.id }, clockAt(day));
    const index = buildIndex(data.records);
    expect(isScheduled(habit, '2026-11-03')).toBe(false);
    expect(streak(habit, index, '2026-11-10', 1)).toEqual({ current: 4, longest: 4, unit: 'day' });
    expect(rate(habit, index, '2026-11-02', '2026-11-10', '2026-11-10', 1)).toEqual({ done: 4, due: 4 });
    // Tuesday the 10th: nothing due, nothing done.
    expect(daySummary(data, index, '2026-11-10')).toEqual({ due: 0, done: 0 });
  });

  it('breaks a streak on a missed day but not on today', () => {
    const data = freshData();
    const habit = createHabit(data, { name: 'Stretch' }, clockAt('2026-11-01'));
    for (const day of ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06']) logRecord(data, { habitId: habit.id }, clockAt(day));
    const index = buildIndex(data.records);
    expect(streak(habit, index, '2026-11-07', 1)).toEqual({ current: 2, longest: 3, unit: 'day' });
    expect(streak(habit, index, '2026-11-08', 1).current).toBe(0);
    expect(percent(rate(habit, index, '2026-11-01', '2026-11-07', '2026-11-07', 1))).toBe(83);
  });

  it('counts weekly streaks in weeks', () => {
    const data = freshData();
    const habit = createHabit(data, { name: 'Swim', frequency: { type: 'perWeek', times: 2 } }, clockAt('2026-11-02'));
    for (const day of ['2026-11-02', '2026-11-04', '2026-11-10', '2026-11-14', '2026-11-17']) logRecord(data, { habitId: habit.id }, clockAt(day));
    const index = buildIndex(data.records);
    expect(streak(habit, index, '2026-11-18', 1)).toEqual({ current: 2, longest: 2, unit: 'week' });
  });

  it('handles every-N-days and monthly goals', () => {
    const data = freshData();
    const every3 = createHabit(data, { name: 'Water plants', frequency: { type: 'interval', every: 3 } }, clockAt('2026-11-01'));
    expect(['2026-11-01', '2026-11-02', '2026-11-04', '2026-11-07'].map((d) => isScheduled(every3, d))).toEqual([true, false, true, true]);
    const monthly = createHabit(data, { name: 'Skate', frequency: { type: 'perMonth', times: 2 } }, clockAt('2026-09-01'));
    for (const day of ['2026-09-05', '2026-09-20', '2026-10-03', '2026-10-30', '2026-11-08']) logRecord(data, { habitId: monthly.id }, clockAt(day));
    expect(streak(monthly, buildIndex(data.records), '2026-11-15', 1)).toEqual({ current: 2, longest: 2, unit: 'month' });
  });
});

describe('smallest unit', () => {
  it('is a partial day unless the habit says it counts', () => {
    const data = freshData();
    const habit = createHabit(data, { name: 'Write', minimum: { label: 'One sentence', countsAsComplete: false } }, clockAt('2026-11-02'));
    logRecord(data, { habitId: habit.id, level: 'min' }, clockAt('2026-11-02'));
    expect(dayStatus(habit, buildIndex(data.records), '2026-11-02')).toBe('min');
    habit.minimum!.countsAsComplete = true;
    expect(dayStatus(habit, buildIndex(data.records), '2026-11-02')).toBe('met');
  });

  it('tells minimum, target and exceeded apart on an amount goal', () => {
    const data = freshData();
    const field = { id: 'p', name: 'Pages', kind: 'number' as const, unit: 'pages' };
    const habit = createHabit(data, { name: 'Read', fields: [field], target: { fieldId: 'p', amount: 20 }, minimum: { label: 'One page', countsAsComplete: false } }, clockAt('2026-11-02'));
    const log = (day: string, pages: number, level: 'full' | 'min' = 'full') => logRecord(data, { habitId: habit.id, level, values: [{ fieldId: 'p', value: pages, unit: 'pages' }] }, clockAt(day));
    log('2026-11-02', 1, 'min');
    log('2026-11-03', 12);
    log('2026-11-04', 12);
    log('2026-11-04', 8);
    log('2026-11-05', 25);
    const index = buildIndex(data.records);
    expect(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'].map((d) => dayStatus(habit, index, d))).toEqual(['min', 'partial', 'met', 'exceeded', 'none']);
  });

  it('keeps the goal history in order when edited twice in a day', () => {
    const data = freshData();
    const habit = createHabit(data, { name: 'Walk' }, clockAt('2026-11-02'));
    setGoal(habit, { type: 'perWeek', times: 3 }, null, clockAt('2026-11-09'));
    setGoal(habit, { type: 'perWeek', times: 5 }, null, clockAt('2026-11-09'));
    expect(habit.goals.map((g) => [g.from, g.frequency.type])).toEqual([
      ['2026-11-02', 'daily'],
      ['2026-11-09', 'perWeek'],
    ]);
    expect((habit.goals[1].frequency as { times: number }).times).toBe(5);
  });
});
