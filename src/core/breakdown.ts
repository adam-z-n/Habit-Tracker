import { addDays, addMonths, MONTH_SHORT, monthEnd, monthStart, weekStart } from './dates';
import type { ActivityRecord, ActivityType, Day, Habit, Settings } from './types';
import { canonicalUnit, convert, dimensionOf, formatMinutes, formatNumber, type Dimension } from './units';

// Activity breakdowns: how a habit was actually done. Sessions can always be compared; measured
// amounts are only added up within one kind of measurement (time with time, distance with distance,
// pages with pages), never across kinds.

export interface Metric {
  key: string;
  label: string;
  /** The unit totals are shown in; empty for session counts. */
  unit: string;
}

export const SESSIONS: Metric = { key: 'sessions', label: 'Sessions', unit: '' };

const DIMENSION_LABEL: Record<Dimension, string> = {
  duration: 'Time',
  distance: 'Distance',
  weight: 'Weight',
  volume: 'Volume',
};

function displayUnit(dimension: Dimension, firstSeen: string, settings: Settings): string {
  if (dimension === 'duration') return 'min';
  if (dimension === 'distance') return settings.distanceUnit;
  return firstSeen;
}

function valueUnit(habit: Habit, fieldId: string, unit: string | undefined): string {
  return unit ?? habit.fields.find((f) => f.id === fieldId)?.unit ?? '';
}

/** The ways this set of records can be compared: always sessions, then whatever was measured. */
export function metricsFor(habit: Habit, recs: ActivityRecord[], settings: Settings): Metric[] {
  const out = new Map<string, Metric>();
  for (const rec of recs) {
    for (const v of rec.values) {
      if (typeof v.value !== 'number') continue;
      const unit = valueUnit(habit, v.fieldId, v.unit);
      const dimension = dimensionOf(unit);
      if (dimension) {
        const key = `dim:${dimension}`;
        if (!out.has(key)) {
          out.set(key, { key, label: DIMENSION_LABEL[dimension], unit: displayUnit(dimension, canonicalUnit(unit)!, settings) });
        }
      } else {
        const name = unit || habit.fields.find((f) => f.id === v.fieldId)?.name || 'Amount';
        const key = `unit:${name.toLowerCase()}`;
        if (!out.has(key)) out.set(key, { key, label: name.charAt(0).toUpperCase() + name.slice(1), unit: unit });
      }
    }
  }
  return [SESSIONS, ...out.values()];
}

/** A record's amount under a metric; null when the record has nothing of that kind. */
export function metricValue(habit: Habit, rec: ActivityRecord, metric: Metric): number | null {
  if (metric.key === 'sessions') return 1;
  let total: number | null = null;
  for (const v of rec.values) {
    if (typeof v.value !== 'number') continue;
    const unit = valueUnit(habit, v.fieldId, v.unit);
    const dimension = dimensionOf(unit);
    let amount: number | null = null;
    if (dimension) {
      if (metric.key === `dim:${dimension}`) amount = convert(v.value, unit, metric.unit);
    } else {
      const name = unit || habit.fields.find((f) => f.id === v.fieldId)?.name || 'Amount';
      if (metric.key === `unit:${name.toLowerCase()}`) amount = v.value;
    }
    if (amount !== null) total = (total ?? 0) + amount;
  }
  return total;
}

export function formatMetric(value: number, metric: Metric): string {
  if (metric.key === 'sessions') return String(value);
  if (metric.key === 'dim:duration') return formatMinutes(value);
  return `${formatNumber(value)}${metric.unit ? ` ${metric.unit}` : ''}`;
}

export const TYPE_COLORS = ['#2f6f5e', '#e08a3c', '#4a7fc1', '#c75b7a', '#8a6fc9', '#5aa9a3', '#b8a13a', '#7d8a99'];

export interface Slice {
  /** Activity type id, or '' for records logged without an activity. */
  id: string;
  name: string;
  icon: string;
  color: string;
  value: number;
  sessions: number;
}

export function sliceMeta(habit: Habit, types: ActivityType[]): Map<string, Omit<Slice, 'value' | 'sessions'>> {
  const out = new Map<string, Omit<Slice, 'value' | 'sessions'>>();
  const own = types.filter((t) => t.habitId === habit.id).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  own.forEach((t, i) => out.set(t.id, { id: t.id, name: t.name, icon: t.icon, color: t.color || TYPE_COLORS[i % TYPE_COLORS.length] }));
  out.set('', { id: '', name: own.length ? 'No activity chosen' : habit.name, icon: habit.icon, color: own.length ? '#a3a8ad' : habit.color });
  return out;
}

/** Totals per activity type, largest first. Records with nothing to count under the metric are left out. */
export function breakdown(habit: Habit, types: ActivityType[], recs: ActivityRecord[], metric: Metric): Slice[] {
  const meta = sliceMeta(habit, types);
  const out = new Map<string, Slice>();
  for (const rec of recs) {
    const value = metricValue(habit, rec, metric);
    if (value === null) continue;
    const id = rec.activityTypeId ?? '';
    let slice = out.get(id);
    if (!slice) {
      const m = meta.get(id) ?? { id, name: 'Removed activity', icon: '•', color: '#a3a8ad' };
      out.set(id, (slice = { ...m, value: 0, sessions: 0 }));
    }
    slice.value += value;
    slice.sessions++;
  }
  return [...out.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

export interface Bucket {
  label: string;
  from: Day;
  to: Day;
  /** Amount per activity type id. */
  parts: Map<string, number>;
  total: number;
}

/** Amounts per week or month across a date range, split by activity type, for a stacked bar chart. */
export function series(
  habit: Habit,
  recs: ActivityRecord[],
  metric: Metric,
  from: Day,
  to: Day,
  by: 'week' | 'month',
  weekStartsOn: number,
): Bucket[] {
  const buckets: Bucket[] = [];
  let start = by === 'week' ? weekStart(from, weekStartsOn) : monthStart(from);
  while (start <= to) {
    const end = by === 'week' ? addDays(start, 6) : monthEnd(start);
    const [, m, d] = start.split('-').map(Number);
    buckets.push({ label: by === 'week' ? `${MONTH_SHORT[m - 1]} ${d}` : MONTH_SHORT[m - 1], from: start, to: end, parts: new Map(), total: 0 });
    start = by === 'week' ? addDays(start, 7) : addMonths(start, 1);
  }
  for (const rec of recs) {
    const bucket = buckets.find((b) => rec.date >= b.from && rec.date <= b.to);
    const value = metricValue(habit, rec, metric);
    if (!bucket || value === null) continue;
    const id = rec.activityTypeId ?? '';
    bucket.parts.set(id, (bucket.parts.get(id) ?? 0) + value);
    bucket.total += value;
  }
  return buckets;
}

/** `Running · 3 mi · 30 min` */
export function describeRecord(habit: Habit, types: ActivityType[], rec: ActivityRecord): string {
  const parts: string[] = [];
  const type = rec.activityTypeId ? types.find((t) => t.id === rec.activityTypeId) : null;
  if (type) parts.push(type.name);
  else if (rec.activityTypeId) parts.push('Removed activity');
  if (rec.level === 'min') parts.push(habit.minimum?.label || 'Smallest unit');
  for (const v of rec.values) {
    const field = habit.fields.find((f) => f.id === v.fieldId);
    if (typeof v.value === 'number') {
      const unit = v.unit ?? field?.unit ?? '';
      parts.push(`${formatNumber(v.value, field?.precision ?? 2)}${unit ? ` ${unit}` : field ? ` ${field.name.toLowerCase()}` : ''}`);
    } else if (v.value) parts.push(field && field.kind === 'choice' ? `${field.name}: ${v.value}` : String(v.value));
  }
  return parts.join(' · ') || 'Done';
}
