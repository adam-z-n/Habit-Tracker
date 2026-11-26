import { addDays, addMonths, diffDays, maxDay, minDay, monthEnd, monthStart, weekStart, weekday } from './dates';
import type { ActivityRecord, AppData, Day, Frequency, Goal, Habit } from './types';
import { convert } from './units';

// Completion is never stored: it is worked out from the activity records, so a day with two
// activities is still one completed day, and editing a record can never leave a stale completion.
// Since 0.3.1 there is no "partly done": a day with any record is done (the owner's request). Older
// smallest-unit records and days short of an old daily amount therefore count as done too.

export type DayStatus = 'none' | 'met' | 'exceeded';
export type PeriodUnit = 'day' | 'week' | 'month';

/** Records grouped by habit and then by day, each day's records in the order they happened. */
export type Index = Map<string, Map<Day, ActivityRecord[]>>;

export function buildIndex(records: ActivityRecord[]): Index {
  const index: Index = new Map();
  for (const rec of records) {
    let days = index.get(rec.habitId);
    if (!days) index.set(rec.habitId, (days = new Map()));
    const list = days.get(rec.date);
    if (list) list.push(rec);
    else days.set(rec.date, [rec]);
  }
  for (const days of index.values()) {
    for (const list of days.values()) {
      list.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '') || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    }
  }
  return index;
}

const NO_RECORDS: ActivityRecord[] = [];

export function recordsOn(index: Index, habitId: string, day: Day): ActivityRecord[] {
  return index.get(habitId)?.get(day) ?? NO_RECORDS;
}

export function recordsBetween(index: Index, habitId: string, from: Day, to: Day): ActivityRecord[] {
  const days = index.get(habitId);
  if (!days) return [];
  const out: ActivityRecord[] = [];
  for (const day of [...days.keys()].sort()) {
    if (day >= from && day <= to) out.push(...days.get(day)!);
  }
  return out;
}

/** The goal that applied on a day. */
export function goalOn(habit: Habit, day: Day): Goal {
  let goal = habit.goals[0];
  for (const g of habit.goals) {
    if (g.from <= day) goal = g;
  }
  return goal;
}

export function currentGoal(habit: Habit): Goal {
  return habit.goals[habit.goals.length - 1];
}

export function unitOf(frequency: Frequency): PeriodUnit {
  if (frequency.type === 'perWeek') return 'week';
  if (frequency.type === 'perMonth') return 'month';
  return 'day';
}

/** The first day the habit has anything to say about: its start date, or an earlier back-filled record. */
export function habitStart(habit: Habit, index: Index): Day {
  let start = habit.startDate;
  const days = index.get(habit.id);
  if (days) for (const day of days.keys()) if (day < start) start = day;
  return start;
}

/**
 * Whether the habit was due on a day. Weekly and monthly goals are never due on a particular day,
 * so a day without activity is not a miss for them.
 *
 * Pass `start` as `habitStart(habit, index)` wherever records are at hand: a check mark back-filled
 * before the start date means the habit had begun by then, so those days count too. (The editor no
 * longer sets a start date, so a new habit starts on the day it is made.)
 */
export function isScheduled(habit: Habit, day: Day, start: Day = habit.startDate): boolean {
  if (day < start) return false;
  const { frequency } = goalOn(habit, day);
  switch (frequency.type) {
    case 'daily':
      return true;
    case 'weekdays':
      return frequency.days.includes(weekday(day));
    case 'interval':
    {
      // Counted from the start date in both directions, so back-filled days keep the same rhythm.
      const every = Math.max(1, frequency.every);
      return ((diffDays(habit.startDate, day) % every) + every) % every === 0;
    }
    default:
      return false;
  }
}

/** A record's value for a field, in the field's current unit. Null when it has none. */
export function fieldAmount(habit: Habit, rec: ActivityRecord, fieldId: string): number | null {
  const entry = rec.values.find((v) => v.fieldId === fieldId);
  if (!entry || typeof entry.value !== 'number') return null;
  const field = habit.fields.find((f) => f.id === fieldId);
  return convert(entry.value, entry.unit, field?.unit) ?? entry.value;
}

export interface DayInfo {
  status: DayStatus;
  /** Progress toward the day's amount, when the goal has one. */
  amount: number;
  target: number | null;
}

export function dayInfo(habit: Habit, recs: ActivityRecord[], goal: Goal): DayInfo {
  const target = goal.target;
  if (!recs.length) return { status: 'none', amount: 0, target: target?.amount ?? null };
  if (target) {
    let amount = 0;
    for (const rec of recs) amount += fieldAmount(habit, rec, target.fieldId) ?? 0;
    return { status: amount > target.amount ? 'exceeded' : 'met', amount, target: target.amount };
  }
  return { status: 'met', amount: 0, target: null };
}

export function dayStatus(habit: Habit, index: Index, day: Day): DayStatus {
  return dayInfo(habit, recordsOn(index, habit.id, day), goalOn(habit, day)).status;
}

export const isDone = (status: DayStatus) => status === 'met' || status === 'exceeded';

export function periodBounds(unit: PeriodUnit, day: Day, weekStartsOn: number): [Day, Day] {
  if (unit === 'week') {
    const from = weekStart(day, weekStartsOn);
    return [from, addDays(from, 6)];
  }
  if (unit === 'month') return [monthStart(day), monthEnd(day)];
  return [day, day];
}

export interface PeriodInfo {
  unit: PeriodUnit;
  from: Day;
  to: Day;
  /** Sessions so far; for goals with a daily amount, the days with activity. */
  count: number;
  goal: number;
  status: DayStatus;
}

/**
 * Progress on a weekly or monthly goal for the period containing `day`. Each record is a session,
 * so a run and a skate on the same day are two sessions toward "4 times a week". When the goal
 * also has a daily amount, a day counts once, when it reaches the amount.
 */
export function periodInfo(habit: Habit, index: Index, day: Day, weekStartsOn: number): PeriodInfo | null {
  const goal = goalOn(habit, day);
  const unit = unitOf(goal.frequency);
  if (unit === 'day') return null;
  const [from, to] = periodBounds(unit, day, weekStartsOn);
  const times = Math.max(1, (goal.frequency as { times: number }).times);
  let count = 0;
  const days = index.get(habit.id);
  if (days) {
    for (const [date, recs] of days) {
      if (date < from || date > to) continue;
      count += goal.target ? 1 : recs.length;
    }
  }
  // A period short of its goal is simply not done yet; "2 of 3 this week" shows the progress.
  const status: DayStatus = count > times ? 'exceeded' : count >= times ? 'met' : 'none';
  return { unit, from, to, count, goal: times, status };
}

/**
 * "X of Y this week" for the Habits screen: for weekly or monthly goals, sessions toward the goal in the
 * period containing `focus`; for daily goals, the done days out of the due days among `days`.
 */
export function weekProgress(habit: Habit, index: Index, days: Day[], focus: Day, weekStartsOn: number): { done: number; due: number; unit: PeriodUnit } | null {
  const period = periodInfo(habit, index, focus, weekStartsOn);
  if (period) return { done: period.count, due: period.goal, unit: period.unit };
  const first = habitStart(habit, index);
  const due = days.filter((d) => isScheduled(habit, d, first));
  if (!due.length) return null;
  const done = due.filter((d) => isDone(dayStatus(habit, index, d))).length;
  return { done, due: due.length, unit: 'week' };
}

export interface Streak {
  current: number;
  longest: number;
  unit: PeriodUnit;
}

/**
 * Consecutive scheduled days (or weeks, or months) on which the goal was reached. Days that are
 * not scheduled are skipped, and today or the current period does not break a streak until it is over.
 */
export function streak(habit: Habit, index: Index, today: Day, weekStartsOn: number): Streak {
  const unit = unitOf(currentGoal(habit).frequency);
  // Only count back as far as the goal has been measured in the same unit.
  let since = habitStart(habit, index);
  for (let i = habit.goals.length - 1; i > 0; i--) {
    if (unitOf(habit.goals[i - 1].frequency) !== unit) {
      since = maxDay(since, habit.goals[i].from);
      break;
    }
  }
  const first = habitStart(habit, index);
  let run = 0;
  let longest = 0;
  if (unit === 'day') {
    for (let day = since; day <= today; day = addDays(day, 1)) {
      if (!isScheduled(habit, day, first)) continue;
      if (isDone(dayStatus(habit, index, day))) {
        run++;
        if (run > longest) longest = run;
      } else if (day !== today) run = 0;
    }
  } else {
    let [from] = periodBounds(unit, since, weekStartsOn);
    while (from <= today) {
      const info = periodInfo(habit, index, maxDay(from, since), weekStartsOn)!;
      if (isDone(info.status)) {
        run++;
        if (run > longest) longest = run;
      } else if (info.to < today) run = 0;
      from = unit === 'week' ? addDays(from, 7) : addMonths(from, 1);
    }
  }
  return { current: run, longest, unit };
}

export interface Rate {
  done: number;
  due: number;
}

/**
 * How much of what was due in a date range got done. Daily goals count scheduled days; weekly and
 * monthly goals count sessions up to the goal, and the period still running only counts once it is met.
 */
export function rate(habit: Habit, index: Index, from: Day, to: Day, today: Day, weekStartsOn: number): Rate {
  const first = habitStart(habit, index);
  const start = maxDay(from, first);
  const end = minDay(to, today);
  const out: Rate = { done: 0, due: 0 };
  const seen = new Set<string>();
  for (let day = start; day <= end; day = addDays(day, 1)) {
    const unit = unitOf(goalOn(habit, day).frequency);
    if (unit === 'day') {
      if (!isScheduled(habit, day, first)) continue;
      const done = isDone(dayStatus(habit, index, day));
      if (day === today && !done) continue;
      out.due++;
      if (done) out.done++;
    } else {
      const info = periodInfo(habit, index, day, weekStartsOn)!;
      const key = `${unit}:${info.from}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (info.to >= today && !isDone(info.status)) continue;
      out.due += info.goal;
      out.done += Math.min(info.count, info.goal);
    }
  }
  return out;
}

export function percent(r: Rate): number | null {
  return r.due ? Math.round((r.done / r.due) * 100) : null;
}

export interface Totals {
  /** Times the goal counted as done: completed days, or sessions for weekly and monthly goals. */
  completions: number;
  /** Individual activity records. */
  sessions: number;
  activeDays: number;
}

export function totals(habit: Habit, index: Index, from: Day, to: Day): Totals {
  const out: Totals = { completions: 0, sessions: 0, activeDays: 0 };
  const days = index.get(habit.id);
  if (!days) return out;
  for (const [day, recs] of days) {
    if (day < from || day > to) continue;
    out.sessions += recs.length;
    out.activeDays++;
    const goal = goalOn(habit, day);
    if (unitOf(goal.frequency) === 'day' || goal.target) {
      if (isDone(dayInfo(habit, recs, goal).status)) out.completions++;
    } else out.completions += recs.length;
  }
  return out;
}

export interface DaySummary {
  /** Habits that were due, plus weekly and monthly habits that saw activity. */
  due: number;
  done: number;
}

export function habitsShownOn(data: AppData, index: Index, day: Day): Habit[] {
  return data.habits
    .filter((h) => (h.status === 'active' && h.startDate <= day) || recordsOn(index, h.id, day).length > 0)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function daySummary(data: AppData, index: Index, day: Day): DaySummary {
  const out: DaySummary = { due: 0, done: 0 };
  for (const habit of data.habits) {
    const recs = recordsOn(index, habit.id, day);
    const scheduled = habit.status === 'active' && isScheduled(habit, day, habitStart(habit, index));
    if (!scheduled && !recs.length) continue;
    out.due++;
    if (isDone(dayInfo(habit, recs, goalOn(habit, day)).status)) out.done++;
  }
  return out;
}

export function describeFrequency(frequency: Frequency): string {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  switch (frequency.type) {
    case 'daily':
      return 'Every day';
    case 'weekdays':
      return frequency.days.length === 7 ? 'Every day' : [...frequency.days].sort().map((d) => names[d]).join(', ') || 'No days';
    case 'perWeek':
      return `${frequency.times}× a week`;
    case 'perMonth':
      return `${frequency.times}× a month`;
    case 'interval':
      return frequency.every === 1 ? 'Every day' : `Every ${frequency.every} days`;
  }
}
