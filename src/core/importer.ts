import { isDay } from './dates';
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, type Backup } from './exporter';
import { defaultSettings, SCHEMA_VERSION, type AppData, type Tombstone } from './types';

// Restoring a backup: check it, describe it, then either replace the current data or merge into it.

/**
 * Brings data saved by an older version up to the current schema. Each schema change adds one step
 * here, so every backup ever exported stays restorable.
 */
export function migrate(data: AppData): AppData {
  const out = data;
  if (out.schemaVersion < 2) {
    // Version 2 tells journal entries and habit notes apart; everything written before is a journal entry.
    for (const entry of out.journal) entry.kind ??= 'journal';
  }
  out.schemaVersion = SCHEMA_VERSION;
  return out;
}

export interface Checked {
  ok: boolean;
  errors: string[];
  warnings: string[];
  backup?: Backup;
  summary?: {
    exportedAt: string;
    habits: number;
    activityTypes: number;
    records: number;
    journal: number;
    reminders: number;
    firstDay: string | null;
    lastDay: string | null;
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validates the text of a backup file without changing anything. */
export function checkBackup(text: string): Checked {
  const fail = (message: string): Checked => ({ ok: false, errors: [message], warnings: [] });
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('This file is not valid JSON, so it is not a habit tracker backup.');
  }
  if (!isObject(parsed) || parsed.format !== BACKUP_FORMAT) return fail('This file is not a habit tracker backup.');
  if (typeof parsed.formatVersion !== 'number') return fail('The backup does not say which format version it uses.');
  if (parsed.formatVersion > BACKUP_FORMAT_VERSION) {
    return fail(`This backup was made by a newer version of the app (format ${parsed.formatVersion}). Update the app, then restore it.`);
  }
  const data = parsed.data;
  if (!isObject(data)) return fail('The backup contains no data.');
  if (typeof data.schemaVersion === 'number' && data.schemaVersion > SCHEMA_VERSION) {
    return fail('This backup was made by a newer version of the app. Update the app, then restore it.');
  }
  const errors: string[] = [];
  const warnings: string[] = [];
  const lists = ['habits', 'activityTypes', 'records', 'journal', 'reminders'] as const;
  for (const key of lists) {
    if (!Array.isArray(data[key])) errors.push(`The backup is missing its list of ${key}.`);
    else if (!(data[key] as unknown[]).every((item) => isObject(item) && typeof item.id === 'string' && item.id)) {
      errors.push(`Some ${key} in the backup have no id.`);
    }
  }
  if (errors.length) return { ok: false, errors, warnings };
  const d = data as unknown as AppData;
  for (const habit of d.habits) {
    if (typeof habit.name !== 'string' || !Array.isArray(habit.goals) || !habit.goals.length || !Array.isArray(habit.fields) || !isDay(habit.startDate)) {
      errors.push(`The habit "${String(habit.name ?? habit.id)}" is incomplete.`);
    }
  }
  for (const rec of d.records) {
    if (typeof rec.habitId !== 'string' || !isDay(rec.date) || !Array.isArray(rec.values)) errors.push(`The activity record ${rec.id} is incomplete.`);
  }
  for (const entry of d.journal) {
    if (!isDay(entry.date) || typeof entry.text !== 'string') errors.push(`The journal entry ${entry.id} is incomplete.`);
  }
  if (errors.length) return { ok: false, errors: errors.slice(0, 5), warnings };
  const habitIds = new Set(d.habits.map((h) => h.id));
  const orphans = d.records.filter((r) => !habitIds.has(r.habitId)).length;
  if (orphans) warnings.push(`${orphans} activity record${orphans === 1 ? ' belongs' : 's belong'} to a habit that is not in the backup. They are kept but not shown.`);
  if (!isObject(d.settings)) d.settings = defaultSettings(String(parsed.exportedAt ?? ''));
  else d.settings = { ...defaultSettings(''), ...d.settings };
  if (!Array.isArray(d.deleted)) d.deleted = [];
  if (typeof d.schemaVersion !== 'number') d.schemaVersion = 1;
  const days = d.records.map((r) => r.date).sort();
  const backup = { ...(parsed as unknown as Backup), data: migrate(d) };
  return {
    ok: true,
    errors,
    warnings,
    backup,
    summary: {
      exportedAt: String(parsed.exportedAt ?? ''),
      habits: d.habits.length,
      activityTypes: d.activityTypes.length,
      records: d.records.length,
      journal: d.journal.length,
      reminders: d.reminders.length,
      firstDay: days[0] ?? null,
      lastDay: days[days.length - 1] ?? null,
    },
  };
}

type Stamped = { id: string; updatedAt: string };

function mergeList<T extends Stamped>(mine: T[], theirs: T[], deleted: Map<string, string>): T[] {
  const out = new Map<string, T>();
  for (const item of mine) out.set(item.id, item);
  for (const item of theirs) {
    const have = out.get(item.id);
    if (!have || item.updatedAt > have.updatedAt) out.set(item.id, item);
  }
  // A deletion wins over any copy that was not edited after it.
  return [...out.values()].filter((item) => !(deleted.has(item.id) && deleted.get(item.id)! >= item.updatedAt));
}

/**
 * Combines two sets of data. Items are matched by id and the most recently edited copy wins, so
 * merging a backup never duplicates records and never undoes a newer edit or a deletion.
 */
export function mergeData(mine: AppData, theirs: AppData): AppData {
  const deleted = new Map<string, string>();
  for (const t of [...mine.deleted, ...theirs.deleted]) {
    if (!deleted.has(t.id) || deleted.get(t.id)! < t.at) deleted.set(t.id, t.at);
  }
  const tombstones: Tombstone[] = [...deleted].map(([id, at]) => ({ id, at }));
  return {
    schemaVersion: SCHEMA_VERSION,
    habits: mergeList(mine.habits, theirs.habits, deleted),
    activityTypes: mergeList(mine.activityTypes, theirs.activityTypes, deleted),
    records: mergeList(mine.records, theirs.records, deleted),
    journal: mergeList(mine.journal, theirs.journal, deleted),
    reminders: mergeList(mine.reminders, theirs.reminders, deleted),
    settings: theirs.settings.updatedAt > mine.settings.updatedAt ? theirs.settings : mine.settings,
    deleted: tombstones,
  };
}
