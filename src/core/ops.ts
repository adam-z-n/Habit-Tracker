import type { ActivityRecord, ActivityType, AppData, Day, FieldDef, Frequency, Goal, Habit, JournalEntry, RecordValue, Reminder, Target, TodoItem, TodoList } from './types';
import { SOFT_COLORS } from './importer';
import { currentGoal } from './stats';

// Every change to the data goes through these functions. They mutate the AppData they are given
// and keep `updatedAt` and the deletion list right, which is what merging two backups relies on.

export function newId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

export interface Clock {
  /** ISO timestamp. */
  now: string;
  today: Day;
  time: string;
  tz: string;
}

export interface HabitInput {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  category?: string;
  startDate?: Day;
  frequency?: Frequency;
  target?: Target | null;
  fields?: FieldDef[];
  minimum?: Habit['minimum'];
}

export function createHabit(data: AppData, input: HabitInput, clock: Clock): Habit {
  const habit: Habit = {
    id: newId(),
    name: input.name,
    description: input.description ?? '',
    icon: input.icon ?? '✅',
    color: input.color ?? '#7fb39a',
    category: input.category ?? '',
    startDate: input.startDate ?? clock.today,
    status: 'active',
    order: data.habits.reduce((max, h) => Math.max(max, h.order), -1) + 1,
    goals: [{ from: input.startDate ?? clock.today, frequency: input.frequency ?? { type: 'daily' }, target: input.target ?? null }],
    minimum: input.minimum ?? null,
    fields: input.fields ?? [],
    createdAt: clock.now,
    updatedAt: clock.now,
  };
  data.habits.push(habit);
  return habit;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Changes a habit's goal from today on. Earlier days keep the goal they were tracked against, so
 * past statistics do not change.
 */
export function setGoal(habit: Habit, frequency: Frequency, target: Target | null, clock: Clock): void {
  const last = currentGoal(habit);
  if (same(last.frequency, frequency) && same(last.target, target)) return;
  const next: Goal = { from: clock.today, frequency, target };
  if (last.from >= clock.today || habit.goals.length === 1 && habit.startDate >= clock.today) habit.goals[habit.goals.length - 1] = { ...next, from: last.from };
  else habit.goals.push(next);
  habit.updatedAt = clock.now;
}

export function addActivityType(data: AppData, habitId: string, input: Partial<ActivityType> & { name: string }, clock: Clock): ActivityType {
  const type: ActivityType = {
    id: newId(),
    habitId,
    name: input.name,
    icon: input.icon ?? '',
    color: input.color,
    fieldIds: input.fieldIds ?? null,
    defaults: input.defaults ?? {},
    order: input.order ?? data.activityTypes.filter((t) => t.habitId === habitId).reduce((max, t) => Math.max(max, t.order), -1) + 1,
    archived: false,
    createdAt: clock.now,
    updatedAt: clock.now,
  };
  data.activityTypes.push(type);
  return type;
}

/** The measurement fields that apply when logging a habit, or one of its activity types. */
export function fieldsFor(habit: Habit, type: ActivityType | null | undefined): FieldDef[] {
  return habit.fields.filter((f) => !f.archived && (!type || type.fieldIds === null || type.fieldIds.includes(f.id)));
}

export interface RecordInput {
  habitId: string;
  activityTypeId?: string | null;
  date?: Day;
  time?: string | null;
  level?: 'full' | 'min';
  values?: RecordValue[];
  note?: string;
}

export function logRecord(data: AppData, input: RecordInput, clock: Clock): ActivityRecord {
  const date = input.date ?? clock.today;
  const rec: ActivityRecord = {
    id: newId(),
    habitId: input.habitId,
    activityTypeId: input.activityTypeId ?? null,
    date,
    time: input.time !== undefined ? input.time : date === clock.today ? clock.time : null,
    tz: clock.tz,
    level: input.level ?? 'full',
    values: input.values ?? [],
    note: input.note ?? '',
    createdAt: clock.now,
    updatedAt: clock.now,
  };
  data.records.push(rec);
  return rec;
}

/**
 * The values a one-tap log should carry: the activity's defaults, and for a habit with a daily
 * amount, that amount, so ticking "Read 20 minutes" records 20 minutes.
 */
export function quickValues(habit: Habit, type: ActivityType | null, level: 'full' | 'min'): RecordValue[] {
  const values: RecordValue[] = [];
  const fields = fieldsFor(habit, type);
  if (type) {
    for (const field of fields) {
      const value = type.defaults[field.id];
      if (value !== undefined && value !== '') values.push({ fieldId: field.id, value, ...(field.unit ? { unit: field.unit } : {}) });
    }
  }
  const target = currentGoal(habit).target;
  if (level === 'full' && target && !values.some((v) => v.fieldId === target.fieldId)) {
    const field = fields.find((f) => f.id === target.fieldId);
    if (field) values.push({ fieldId: field.id, value: target.amount, ...(field.unit ? { unit: field.unit } : {}) });
  }
  return values;
}

function bury(data: AppData, id: string, clock: Clock): void {
  data.deleted.push({ id, at: clock.now });
}

export function deleteRecord(data: AppData, id: string, clock: Clock): void {
  const before = data.records.length;
  data.records = data.records.filter((r) => r.id !== id);
  if (data.records.length !== before) bury(data, id, clock);
}

/** Deletes a habit with its activity types, records and reminders. Archiving keeps them instead. */
export function deleteHabit(data: AppData, id: string, clock: Clock): void {
  const drop = <T extends { id: string }>(list: T[], gone: (item: T) => boolean): T[] =>
    list.filter((item) => {
      if (!gone(item)) return true;
      bury(data, item.id, clock);
      return false;
    });
  data.habits = drop(data.habits, (h) => h.id === id);
  data.activityTypes = drop(data.activityTypes, (t) => t.habitId === id);
  data.records = drop(data.records, (r) => r.habitId === id);
  data.reminders = drop(data.reminders, (r) => r.habitId === id);
  for (const entry of data.journal) {
    if (entry.habitIds.includes(id)) {
      entry.habitIds = entry.habitIds.filter((h) => h !== id);
      // A note about the deleted habit is kept as a journal entry, so it stays visible.
      if (entry.kind === 'note') entry.kind = 'journal';
      entry.updatedAt = clock.now;
    }
  }
}

/** Copies a habit's setup (not its history) as a new habit. */
export function duplicateHabit(data: AppData, id: string, clock: Clock): Habit | null {
  const source = data.habits.find((h) => h.id === id);
  if (!source) return null;
  const fieldIds = new Map(source.fields.map((f) => [f.id, newId()]));
  const goal = currentGoal(source);
  const copy = createHabit(
    data,
    {
      name: `${source.name} copy`,
      description: source.description,
      icon: source.icon,
      color: source.color,
      category: source.category,
      frequency: structuredClone(goal.frequency),
      target: goal.target ? { fieldId: fieldIds.get(goal.target.fieldId) ?? goal.target.fieldId, amount: goal.target.amount } : null,
      fields: source.fields.filter((f) => !f.archived).map((f) => ({ ...structuredClone(f), id: fieldIds.get(f.id)! })),
      minimum: source.minimum ? { ...source.minimum } : null,
    },
    clock,
  );
  for (const type of data.activityTypes.filter((t) => t.habitId === id && !t.archived)) {
    addActivityType(
      data,
      copy.id,
      {
        name: type.name,
        icon: type.icon,
        color: type.color,
        order: type.order,
        fieldIds: type.fieldIds ? type.fieldIds.map((f) => fieldIds.get(f) ?? f) : null,
        defaults: Object.fromEntries(Object.entries(type.defaults).map(([k, v]) => [fieldIds.get(k) ?? k, v])),
      },
      clock,
    );
  }
  for (const reminder of data.reminders.filter((r) => r.habitId === id)) {
    data.reminders.push({ ...reminder, id: newId(), habitId: copy.id, days: [...reminder.days], createdAt: clock.now, updatedAt: clock.now });
  }
  return copy;
}

export function saveJournal(data: AppData, input: { id?: string; kind?: JournalEntry['kind']; date: Day; text: string; mood: number | null; habitIds: string[] }, clock: Clock): JournalEntry {
  const kind = input.kind ?? 'journal';
  const existing = input.id ? data.journal.find((j) => j.id === input.id) : undefined;
  if (existing) {
    Object.assign(existing, { kind, date: input.date, text: input.text, mood: input.mood, habitIds: input.habitIds, updatedAt: clock.now });
    return existing;
  }
  const entry: JournalEntry = { id: newId(), kind, date: input.date, text: input.text, mood: input.mood, habitIds: input.habitIds, createdAt: clock.now, updatedAt: clock.now };
  data.journal.push(entry);
  return entry;
}

export function deleteJournal(data: AppData, id: string, clock: Clock): void {
  data.journal = data.journal.filter((j) => j.id !== id);
  bury(data, id, clock);
}

/** Replaces a habit's reminders with the edited list. */
export function setReminders(data: AppData, habitId: string, reminders: Reminder[], clock: Clock): void {
  const keep = new Set(reminders.map((r) => r.id));
  for (const old of data.reminders) if (old.habitId === habitId && !keep.has(old.id)) bury(data, old.id, clock);
  data.reminders = [...data.reminders.filter((r) => r.habitId !== habitId), ...reminders];
}

/** The smallest unit from a number and what it counts; both are optional. */
export function makeMinimum(amount: number | null, unit: string, countsAsComplete: boolean): Habit['minimum'] {
  const what = unit.trim();
  if (amount === null && !what) return null;
  const label = [amount === null ? '' : String(amount), what].filter(Boolean).join(' ');
  return { label, countsAsComplete, ...(amount === null ? {} : { amount }), ...(what ? { unit: what } : {}) };
}

// ---- To-do lists ----

const nextOrder = (list: { order: number }[]) => list.reduce((max, x) => Math.max(max, x.order), -1) + 1;

/** The first habit color no list uses yet, or the next one in turn when all are taken. */
export function nextListColor(data: AppData): string {
  const used = new Set(data.todoLists.map((l) => l.color));
  return SOFT_COLORS.find((c) => !used.has(c)) ?? SOFT_COLORS[data.todoLists.length % SOFT_COLORS.length];
}

export function createTodoList(data: AppData, name: string, clock: Clock, color?: string): TodoList {
  const list: TodoList = { id: newId(), name: name.trim() || 'To-do', color: color || nextListColor(data), order: nextOrder(data.todoLists), createdAt: clock.now, updatedAt: clock.now };
  data.todoLists.push(list);
  return list;
}

export function updateTodoList(data: AppData, id: string, patch: { name?: string; color?: string }, clock: Clock): void {
  const list = data.todoLists.find((l) => l.id === id);
  if (!list) return;
  const name = patch.name?.trim();
  if (name && name !== list.name) Object.assign(list, { name, updatedAt: clock.now });
  if (patch.color && patch.color !== list.color) Object.assign(list, { color: patch.color, updatedAt: clock.now });
}

/** Deletes a list and everything on it. */
export function deleteTodoList(data: AppData, id: string, clock: Clock): void {
  for (const item of data.todos) if (item.listId === id) bury(data, item.id, clock);
  data.todos = data.todos.filter((t) => t.listId !== id);
  if (data.todoLists.some((l) => l.id === id)) bury(data, id, clock);
  data.todoLists = data.todoLists.filter((l) => l.id !== id);
}

export function addTodo(data: AppData, listId: string, text: string, clock: Clock): TodoItem {
  const item: TodoItem = { id: newId(), listId, text: text.trim(), done: false, doneAt: null, order: nextOrder(data.todos.filter((t) => t.listId === listId)), createdAt: clock.now, updatedAt: clock.now };
  data.todos.push(item);
  return item;
}

export function updateTodo(data: AppData, id: string, patch: { text?: string; done?: boolean }, clock: Clock): void {
  const item = data.todos.find((t) => t.id === id);
  if (!item) return;
  if (patch.text !== undefined && patch.text.trim() !== item.text) Object.assign(item, { text: patch.text.trim(), updatedAt: clock.now });
  if (patch.done !== undefined && patch.done !== item.done) Object.assign(item, { done: patch.done, doneAt: patch.done ? clock.now : null, updatedAt: clock.now });
}

export function deleteTodo(data: AppData, id: string, clock: Clock): void {
  const before = data.todos.length;
  data.todos = data.todos.filter((t) => t.id !== id);
  if (data.todos.length !== before) bury(data, id, clock);
}
