import { describeRecord } from './breakdown';
import { buildIndex, dayInfo, goalOn, periodInfo, unitOf } from './stats';
import type { AppData, Habit } from './types';

// Exports. The JSON backup is the complete data; the tables (CSV files, and the tabs of the Google
// Sheet) are a readable view of it with stable ids linking the rows. See docs/DATA_FORMAT.md.

export const BACKUP_FORMAT = 'habit-tracker-backup';
export const BACKUP_FORMAT_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  exportedAt: string;
  appVersion: string;
  timeZone: string;
  data: AppData;
}

export function makeBackup(data: AppData, exportedAt: string, appVersion: string, timeZone: string): Backup {
  return { format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, exportedAt, appVersion, timeZone, data };
}

export interface Table {
  name: string;
  header: string[];
  rows: (string | number)[][];
}

function frequencyColumns(habit: Habit): [string, string] {
  const f = habit.goals[habit.goals.length - 1].frequency;
  switch (f.type) {
    case 'daily':
      return ['daily', ''];
    case 'weekdays':
      return ['weekdays', f.days.join(' ')];
    case 'perWeek':
      return ['per_week', String(f.times)];
    case 'perMonth':
      return ['per_month', String(f.times)];
    case 'interval':
      return ['every_n_days', String(f.every)];
  }
}

export function tables(data: AppData, weekStartsOn: number = data.settings.weekStart): Table[] {
  const habitById = new Map(data.habits.map((h) => [h.id, h]));
  const typeById = new Map(data.activityTypes.map((t) => [t.id, t]));
  const byOrder = <T extends { order: number; id: string }>(list: T[]) => [...list].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  const habits: Table = {
    name: 'habits',
    header: ['id', 'name', 'description', 'icon', 'color', 'category', 'start_date', 'status', 'order', 'frequency', 'frequency_detail', 'target_amount', 'target_field', 'target_unit', 'minimum_label', 'minimum_counts_as_complete', 'goals_json', 'fields_json', 'created_at', 'updated_at', 'todo_list_ids'],
    rows: byOrder(data.habits).map((h) => {
      const goal = h.goals[h.goals.length - 1];
      const field = goal.target ? h.fields.find((f) => f.id === goal.target!.fieldId) : undefined;
      return [h.id, h.name, h.description, h.icon, h.color, h.category, h.startDate, h.status, h.order, ...frequencyColumns(h), goal.target ? goal.target.amount : '', field?.name ?? '', field?.unit ?? '', h.minimum?.label ?? '', h.minimum ? String(h.minimum.countsAsComplete) : '', JSON.stringify(h.goals), JSON.stringify(h.fields), h.createdAt, h.updatedAt, (h.todoListIds ?? []).join(' ')];
    }),
  };

  const activityTypes: Table = {
    name: 'activity_types',
    header: ['id', 'habit_id', 'habit_name', 'name', 'icon', 'color', 'field_ids', 'defaults_json', 'order', 'archived', 'created_at', 'updated_at'],
    rows: [...data.activityTypes]
      .sort((a, b) => a.habitId.localeCompare(b.habitId) || a.order - b.order || a.id.localeCompare(b.id))
      .map((t) => [t.id, t.habitId, habitById.get(t.habitId)?.name ?? '', t.name, t.icon, t.color ?? '', t.fieldIds ? t.fieldIds.join(' ') : 'all', JSON.stringify(t.defaults), t.order, String(t.archived), t.createdAt, t.updatedAt]),
  };

  const sortedRecords = [...data.records].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.id.localeCompare(b.id));
  const records: Table = {
    name: 'activity_records',
    header: ['id', 'habit_id', 'habit_name', 'activity_type_id', 'activity_type_name', 'date', 'time', 'time_zone', 'level', 'summary', 'values_json', 'note', 'created_at', 'updated_at', 'todo_id'],
    rows: sortedRecords.map((r) => {
      const habit = habitById.get(r.habitId);
      return [r.id, r.habitId, habit?.name ?? '', r.activityTypeId ?? '', r.activityTypeId ? typeById.get(r.activityTypeId)?.name ?? '' : '', r.date, r.time ?? '', r.tz, r.level, habit ? describeRecord(habit, data.activityTypes, r) : '', JSON.stringify(r.values), r.note, r.createdAt, r.updatedAt, r.todoId ?? ''];
    }),
  };

  // Completions are derived from the records: one row per day for daily goals, one per week or
  // month for weekly and monthly goals. Only periods with activity are listed.
  const index = buildIndex(data.records);
  const completions: Table = {
    name: 'habit_completions',
    header: ['id', 'habit_id', 'habit_name', 'period', 'period_start', 'period_end', 'status', 'completion_type', 'amount', 'goal', 'record_ids'],
    rows: [],
  };
  const typeOf = (status: string) => (status === 'exceeded' ? 'exceeded' : status === 'met' ? 'target' : '');
  for (const habit of byOrder(data.habits)) {
    const days = index.get(habit.id);
    if (!days) continue;
    const seen = new Set<string>();
    for (const day of [...days.keys()].sort()) {
      const goal = goalOn(habit, day);
      const unit = unitOf(goal.frequency);
      if (unit === 'day') {
        const recs = days.get(day)!;
        const info = dayInfo(habit, recs, goal);
        const done = info.status === 'met' || info.status === 'exceeded';
        completions.rows.push([`${habit.id}:day:${day}`, habit.id, habit.name, 'day', day, day, done ? 'complete' : 'incomplete', typeOf(info.status), info.target === null ? recs.length : info.amount, info.target === null ? 1 : info.target, recs.map((r) => r.id).join(' ')]);
      } else {
        const info = periodInfo(habit, index, day, weekStartsOn)!;
        const key = `${habit.id}:${unit}:${info.from}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const ids = [...days.entries()].filter(([d]) => d >= info.from && d <= info.to).flatMap(([, recs]) => recs.map((r) => r.id));
        const done = info.status === 'met' || info.status === 'exceeded';
        completions.rows.push([key, habit.id, habit.name, unit, info.from, info.to, done ? 'complete' : 'incomplete', typeOf(info.status), info.count, info.goal, ids.join(' ')]);
      }
    }
  }

  const journal: Table = {
    name: 'journal_entries',
    header: ['id', 'kind', 'date', 'mood', 'text', 'habit_ids', 'created_at', 'updated_at'],
    rows: [...data.journal].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).map((j) => [j.id, j.kind, j.date, j.mood ?? '', j.text, j.habitIds.join(' '), j.createdAt, j.updatedAt]),
  };

  const listById = new Map(data.todoLists.map((l) => [l.id, l]));
  const todoLists: Table = {
    name: 'todo_lists',
    header: ['id', 'name', 'color', 'order', 'created_at', 'updated_at'],
    rows: byOrder(data.todoLists).map((l) => [l.id, l.name, l.color, l.order, l.createdAt, l.updatedAt]),
  };
  const todoItems: Table = {
    name: 'todo_items',
    header: ['id', 'list_id', 'list_name', 'text', 'done', 'done_at', 'order', 'created_at', 'updated_at'],
    rows: [...data.todos]
      .sort((a, b) => (listById.get(a.listId)?.order ?? 0) - (listById.get(b.listId)?.order ?? 0) || a.listId.localeCompare(b.listId) || a.order - b.order || a.id.localeCompare(b.id))
      .map((t) => [t.id, t.listId, listById.get(t.listId)?.name ?? '', t.text, String(t.done), t.doneAt ?? '', t.order, t.createdAt, t.updatedAt]),
  };

  return [habits, activityTypes, records, completions, journal, todoLists, todoItems];
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(table: Table): string {
  return [table.header, ...table.rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
