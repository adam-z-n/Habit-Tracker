import { describe, expect, it } from 'vitest';
import { breakdown, formatMetric, metricsFor, SESSIONS } from '../src/core/breakdown';
import { makeBackup } from '../src/core/exporter';
import { checkBackup } from '../src/core/importer';
import { addActivityType, createHabit, deleteRecord, logRecord, quickValues, saveJournal, setGoal } from '../src/core/ops';
import { buildIndex, dayStatus, periodInfo, recordsBetween, streak, totals } from '../src/core/stats';
import type { AppData, FieldDef } from '../src/core/types';
import { clockAt, freshData } from './helpers';

// The acceptance scenarios from the product requirements.

const distance: FieldDef = { id: 'dist', name: 'Distance', kind: 'number', unit: 'mi', precision: 1 };
const duration: FieldDef = { id: 'dur', name: 'Duration', kind: 'number', unit: 'min', precision: 0 };

function exercise(data: AppData, frequency = { type: 'perWeek', times: 4 } as const) {
  const clock = clockAt('2026-11-02'); // a Monday
  const habit = createHabit(data, { name: 'Exercise', frequency, fields: [distance, duration] }, clock);
  const running = addActivityType(data, habit.id, { name: 'Running' }, clock);
  const skating = addActivityType(data, habit.id, { name: 'Ice skating', fieldIds: ['dur'] }, clock);
  const cycling = addActivityType(data, habit.id, { name: 'Cycling' }, clock);
  return { habit, running, skating, cycling };
}

describe('acceptance scenarios', () => {
  it('1: several ways to do one habit all count toward it and stay distinguishable', () => {
    const data = freshData();
    const { habit, running, skating } = exercise(data);
    logRecord(data, { habitId: habit.id, activityTypeId: running.id }, clockAt('2026-11-03'));
    logRecord(data, { habitId: habit.id, activityTypeId: skating.id }, clockAt('2026-11-05'));
    const index = buildIndex(data.records);
    expect(periodInfo(habit, index, '2026-11-05', 1)).toMatchObject({ count: 2, goal: 4, status: 'partial' });
    const slices = breakdown(habit, data.activityTypes, data.records, SESSIONS);
    expect(slices.map((s) => [s.name, s.value]).sort()).toEqual([
      ['Ice skating', 1],
      ['Running', 1],
    ]);
  });

  it('2: sessions, time and distance are reported without mixing measurements', () => {
    const data = freshData();
    const { habit, running, skating, cycling } = exercise(data);
    const v = (dist: number | null, dur: number) => [...(dist === null ? [] : [{ fieldId: 'dist', value: dist, unit: 'mi' }]), { fieldId: 'dur', value: dur, unit: 'min' }];
    logRecord(data, { habitId: habit.id, activityTypeId: running.id, values: v(3, 30) }, clockAt('2026-11-03'));
    logRecord(data, { habitId: habit.id, activityTypeId: skating.id, values: v(null, 60) }, clockAt('2026-11-04'));
    logRecord(data, { habitId: habit.id, activityTypeId: cycling.id, values: v(10, 40) }, clockAt('2026-11-05'));
    const metrics = metricsFor(habit, data.records, data.settings);
    expect(metrics.map((m) => m.key)).toEqual(['sessions', 'dim:distance', 'dim:duration']);
    const by = (key: string) => {
      const metric = metrics.find((m) => m.key === key)!;
      return Object.fromEntries(breakdown(habit, data.activityTypes, data.records, metric).map((s) => [s.name, formatMetric(s.value, metric)]));
    };
    expect(by('sessions')).toEqual({ Running: '1', 'Ice skating': '1', Cycling: '1' });
    expect(by('dim:duration')).toEqual({ Running: '30 min', 'Ice skating': '1h', Cycling: '40 min' });
    // Skating has no distance, so it is absent rather than counted as zero or as minutes.
    expect(by('dim:distance')).toEqual({ Running: '3 mi', Cycling: '10 mi' });
  });

  it('2b: distances are converted for display but stored as entered', () => {
    const data = freshData();
    const { habit, running } = exercise(data);
    const rec = logRecord(data, { habitId: habit.id, activityTypeId: running.id, values: [{ fieldId: 'dist', value: 5, unit: 'km' }] }, clockAt('2026-11-03'));
    const metric = metricsFor(habit, data.records, data.settings).find((m) => m.key === 'dim:distance')!;
    expect(breakdown(habit, data.activityTypes, data.records, metric)[0].value).toBeCloseTo(3.107, 3);
    expect(rec.values[0]).toEqual({ fieldId: 'dist', value: 5, unit: 'km' });
  });

  it('3: two activities on one day are two records but one completed day', () => {
    const data = freshData();
    const { habit, running, skating } = exercise(data, { type: 'daily' } as never);
    logRecord(data, { habitId: habit.id, activityTypeId: running.id, time: '07:30' }, clockAt('2026-11-07'));
    logRecord(data, { habitId: habit.id, activityTypeId: skating.id, time: '19:00' }, clockAt('2026-11-07'));
    const index = buildIndex(data.records);
    expect(data.records).toHaveLength(2);
    expect(dayStatus(habit, index, '2026-11-07')).toBe('met');
    expect(totals(habit, index, '2026-11-01', '2026-11-30')).toEqual({ completions: 1, sessions: 2, activeDays: 1 });
    expect(streak(habit, index, '2026-11-07', 1).current).toBe(1);
  });

  it('4: five sessions against a goal of four a week shows as exceeded', () => {
    const data = freshData();
    const { habit, running, skating, cycling } = exercise(data);
    const plan: [string, string][] = [
      ['2026-11-02', running.id],
      ['2026-11-03', cycling.id],
      ['2026-11-05', running.id],
      ['2026-11-07', running.id],
      ['2026-11-07', skating.id],
    ];
    for (const [day, type] of plan) logRecord(data, { habitId: habit.id, activityTypeId: type }, clockAt(day));
    const index = buildIndex(data.records);
    expect(periodInfo(habit, index, '2026-11-08', 1)).toMatchObject({ count: 5, goal: 4, status: 'exceeded' });
    expect(breakdown(habit, data.activityTypes, data.records, SESSIONS).map((s) => [s.name, s.value])).toEqual([
      ['Running', 3],
      ['Cycling', 1],
      ['Ice skating', 1],
    ]);
  });

  it('5: renaming a habit or removing an activity type keeps history and statistics', () => {
    const data = freshData();
    const { habit, running, skating } = exercise(data);
    logRecord(data, { habitId: habit.id, activityTypeId: running.id }, clockAt('2026-11-03'));
    logRecord(data, { habitId: habit.id, activityTypeId: skating.id }, clockAt('2026-11-04'));
    const before = periodInfo(habit, buildIndex(data.records), '2026-11-04', 1);
    habit.name = 'Move';
    skating.archived = true;
    expect(data.records).toHaveLength(2);
    expect(periodInfo(habit, buildIndex(data.records), '2026-11-04', 1)).toEqual(before);
    expect(breakdown(habit, data.activityTypes, data.records, SESSIONS).map((s) => s.name).sort()).toEqual(['Ice skating', 'Running']);
  });

  it('5b: changing a goal does not rewrite how earlier days were judged', () => {
    const data = freshData();
    const habit = createHabit(data, { name: 'Read', fields: [duration], target: { fieldId: 'dur', amount: 20 } }, clockAt('2026-11-02'));
    logRecord(data, { habitId: habit.id, values: [{ fieldId: 'dur', value: 20, unit: 'min' }] }, clockAt('2026-11-02'));
    setGoal(habit, { type: 'daily' }, { fieldId: 'dur', amount: 30 }, clockAt('2026-11-05'));
    logRecord(data, { habitId: habit.id, values: [{ fieldId: 'dur', value: 20, unit: 'min' }] }, clockAt('2026-11-05'));
    const index = buildIndex(data.records);
    expect(habit.goals).toHaveLength(2);
    expect(dayStatus(habit, index, '2026-11-02')).toBe('met');
    expect(dayStatus(habit, index, '2026-11-05')).toBe('partial');
  });

  it('6: a backup restores every habit, activity type, record, measurement and journal entry', () => {
    const data = freshData();
    const { habit, running } = exercise(data);
    logRecord(data, { habitId: habit.id, activityTypeId: running.id, values: [{ fieldId: 'dist', value: 3.2, unit: 'mi' }], note: 'Cold' }, clockAt('2026-11-03'));
    saveJournal(data, { date: '2026-11-03', text: 'Good day', mood: 4, habitIds: [habit.id] }, clockAt('2026-11-03'));
    const text = JSON.stringify(makeBackup(data, '2026-11-10T00:00:00.000Z', '0.1.0', 'America/New_York'));
    const checked = checkBackup(text);
    expect(checked.ok).toBe(true);
    expect(checked.summary).toMatchObject({ habits: 1, activityTypes: 3, records: 1, journal: 1 });
    expect(checked.backup!.data).toEqual(data);
  });

  it('7: a habit is completed with one action, and undone with one', () => {
    const data = freshData();
    const habit = createHabit(data, { name: 'Read', fields: [duration], target: { fieldId: 'dur', amount: 20 } }, clockAt('2026-11-02'));
    const rec = logRecord(data, { habitId: habit.id, values: quickValues(habit, null, 'full') }, clockAt('2026-11-02'));
    expect(dayStatus(habit, buildIndex(data.records), '2026-11-02')).toBe('met');
    deleteRecord(data, rec.id, clockAt('2026-11-02'));
    expect(dayStatus(habit, buildIndex(data.records), '2026-11-02')).toBe('none');
    expect(recordsBetween(buildIndex(data.records), habit.id, '2026-01-01', '2026-12-31')).toEqual([]);
  });
});
