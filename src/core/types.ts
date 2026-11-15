// The data model. Everything the app stores is plain JSON in this shape; see docs/DATA_FORMAT.md.

/** A local calendar day, `YYYY-MM-DD`. */
export type Day = string;

export const SCHEMA_VERSION = 2;

export type Frequency =
  | { type: 'daily' }
  /** Specific days of the week; 0 is Sunday. */
  | { type: 'weekdays'; days: number[] }
  | { type: 'perWeek'; times: number }
  | { type: 'perMonth'; times: number }
  /** Every N days, counted from the habit's start date. */
  | { type: 'interval'; every: number };

/** A daily amount to reach, summed over one measurement field. */
export interface Target {
  fieldId: string;
  amount: number;
}

/** One version of a habit's goal. Editing a goal adds a version, so past days keep the goal they had. */
export interface Goal {
  from: Day;
  frequency: Frequency;
  target: Target | null;
}

export interface FieldDef {
  id: string;
  name: string;
  kind: 'number' | 'choice' | 'text';
  unit?: string;
  /** Decimal places for number fields. */
  precision?: number;
  options?: string[];
  required?: boolean;
  /** Removed fields are kept, hidden, so old records still have a name for their values. */
  archived?: boolean;
}

export interface Minimum {
  label: string;
  /** When true, doing the smallest unit counts as completing the habit. */
  countsAsComplete: boolean;
}

export type HabitStatus = 'active' | 'paused' | 'archived';

export interface Habit {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  startDate: Day;
  status: HabitStatus;
  order: number;
  goals: Goal[];
  minimum: Minimum | null;
  fields: FieldDef[];
  createdAt: string;
  updatedAt: string;
}

export interface ActivityType {
  id: string;
  habitId: string;
  name: string;
  icon: string;
  color?: string;
  /** Which of the habit's fields this activity uses; null means all of them. */
  fieldIds: string[] | null;
  /** Values filled in when the activity is logged with one tap. */
  defaults: Record<string, number | string>;
  order: number;
  /** Removed activity types are kept, hidden, so history stays intact. */
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecordValue {
  fieldId: string;
  value: number | string;
  /** The unit the value was recorded in. */
  unit?: string;
}

export interface ActivityRecord {
  id: string;
  habitId: string;
  /** null for a plain check-off with no activity chosen. */
  activityTypeId: string | null;
  date: Day;
  /** Local time `HH:MM`, if known. */
  time: string | null;
  /** IANA time zone the record was made in. */
  tz: string;
  /** `min` marks a smallest-unit effort. */
  level: 'full' | 'min';
  values: RecordValue[];
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface JournalEntry {
  id: string;
  /** A general journal entry, or a note about one habit (then `habitIds` holds that habit). */
  kind: 'journal' | 'note';
  date: Day;
  text: string;
  /** 1 (rough) to 5 (great). */
  mood: number | null;
  habitIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Reminder {
  id: string;
  habitId: string;
  time: string;
  days: number[];
  text: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  theme: 'auto' | 'light' | 'dark';
  accent: string;
  weekStart: 0 | 1;
  distanceUnit: 'mi' | 'km';
  timeFormat: '12h' | '24h';
  detail: 'compact' | 'detailed';
  updatedAt: string;
}

/** Remembers a deletion so that merging an older backup does not bring the item back. */
export interface Tombstone {
  id: string;
  at: string;
}

export interface AppData {
  schemaVersion: number;
  habits: Habit[];
  activityTypes: ActivityType[];
  records: ActivityRecord[];
  journal: JournalEntry[];
  reminders: Reminder[];
  settings: Settings;
  deleted: Tombstone[];
}

export function defaultSettings(now: string): Settings {
  return {
    theme: 'auto',
    accent: '#2f6f5e',
    weekStart: 1,
    distanceUnit: 'mi',
    timeFormat: '12h',
    detail: 'detailed',
    updatedAt: now,
  };
}

export function emptyData(now: string): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    habits: [],
    activityTypes: [],
    records: [],
    journal: [],
    reminders: [],
    settings: defaultSettings(now),
    deleted: [],
  };
}
