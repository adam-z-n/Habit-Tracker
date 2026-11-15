import { useState } from 'preact/hooks';
import { breakdown, describeRecord, SESSIONS } from '../core/breakdown';
import { addDays, formatDay, formatTime, MONTH_LONG, weekday, weekStart, WEEKDAY_SHORT } from '../core/dates';
import { deleteRecord, fieldsFor, logRecord, quickValues } from '../core/ops';
import { currentGoal, dayInfo, describeFrequency, goalOn, habitsShownOn, isDone, isScheduled, periodInfo, recordsBetween, recordsOn, streak, unitOf, type DayStatus } from '../core/stats';
import type { ActivityRecord, ActivityType, Day, Habit, RecordValue } from '../core/types';
import { formatNumber } from '../core/units';
import { Field, Segmented } from './common';
import { Ring } from './charts';
import { openHabitEditor, openManage } from './habitEditor';
import { openJournalEditor } from './journal';
import { openHabitDetail } from './progress';
import { confirmSheet, openSheet, toast } from './sheet';
import { clock, mutate, useData } from './store';

export function activeTypes(types: ActivityType[], habitId: string): ActivityType[] {
  return types.filter((t) => t.habitId === habitId && !t.archived).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

function buzz(): void {
  navigator.vibrate?.(12);
}

/** Logs with one tap, offering an undo. */
function quickLog(habit: Habit, type: ActivityType | null, date: Day, level: 'full' | 'min'): void {
  let id = '';
  mutate((d, c) => {
    id = logRecord(d, { habitId: habit.id, activityTypeId: type?.id ?? null, date, level, values: quickValues(habit, type, level) }, c).id;
  });
  buzz();
  toast(`${type ? type.name : habit.name} logged`, { label: 'Undo', run: () => mutate((d, c) => deleteRecord(d, id, c)) });
}

function removeRecord(rec: ActivityRecord): void {
  const copy = structuredClone(rec);
  mutate((d, c) => deleteRecord(d, rec.id, c));
  toast('Entry removed', {
    label: 'Undo',
    run: () =>
      mutate((d, c) => {
        d.records.push({ ...copy, updatedAt: c.now });
      }),
  });
}

// ---- The day's checklist ----

export function TodayScreen(props: { today: Day }) {
  const { data, index } = useData();
  const [anchor, setAnchor] = useState(props.today);
  const [open, setOpen] = useState<string | null>(null);
  const ws = data.settings.weekStart;
  const start = weekStart(anchor > props.today ? props.today : anchor, ws);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const end = days[6];
  const thisWeek = props.today >= start && props.today <= end;
  const habits = data.habits
    .filter((h) => (h.status === 'active' && h.startDate <= end) || recordsBetween(index, h.id, start, end).length > 0)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const [, month] = (thisWeek ? props.today : end).split('-').map(Number);
  return (
    <div class="screen">
      <header class="top">
        <h1>Habits</h1>
        <div class="top-actions">
          <button class="icon-btn" onClick={openManage} aria-label="Manage habits">
            ☰
          </button>
          <button class="icon-btn accent" onClick={() => openHabitEditor(null)} aria-label="New habit">
            ＋
          </button>
        </div>
      </header>

      {data.habits.length === 0 ? (
        <DayList date={props.today} today={props.today} />
      ) : (
        <>
          <div class="week-head">
            <div class="week-month">{MONTH_LONG[month - 1]}</div>
            {days.map((day) => (
              <div key={day} class={`week-col${day === props.today ? ' today' : ''}`} aria-hidden="true">
                <span>{Number(day.slice(8))}</span>
                <span>{WEEKDAY_SHORT[weekday(day)].slice(0, 2)}</span>
              </div>
            ))}
          </div>
          <div class="habit-list">
            {habits.map((habit) => (
              <WeekCard key={habit.id} habit={habit} days={days} today={props.today} open={open === habit.id} onToggle={() => setOpen(open === habit.id ? null : habit.id)} />
            ))}
            {!habits.length && <p class="muted pad">No habits for this week.</p>}
          </div>
          <div class="week-pager">
            <button class="chip" onClick={() => setAnchor(addDays(start, -7))}>
              ‹ Earlier week
            </button>
            {!thisWeek && (
              <>
                <button class="chip" onClick={() => setAnchor(props.today)}>
                  This week
                </button>
                <button class="chip" onClick={() => setAnchor(addDays(start, 7))}>
                  Later week ›
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const BOLT = 'M13.5 2L4.5 13.5h6L9.5 22l9.5-12h-6.2L13.5 2z';
const BELL = 'M18 16v-5a6 6 0 10-12 0v5l-1.5 2h15L18 16zM10 20a2 2 0 004 0';

function DayMark(props: { status: DayStatus; scheduled: boolean }) {
  if (isDone(props.status)) {
    return (
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        <path d="M4.5 12.5l5 5L20 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    );
  }
  if (!props.scheduled && props.status === 'none') return <span class="mark-off" />;
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <circle cx="12" cy="12" r="5.5" fill="none" stroke="currentColor" stroke-width="2.6" />
      {props.status !== 'none' && <circle cx="12" cy="12" r="2.4" fill="currentColor" />}
    </svg>
  );
}

/** One habit across the week: a mark per day that can be tapped on or off. */
function WeekCard(props: { habit: Habit; days: Day[]; today: Day; open: boolean; onToggle: () => void }) {
  const { habit, days, today } = props;
  const { data, index } = useData();
  const ws = data.settings.weekStart;
  const types = activeTypes(data.activityTypes, habit.id);
  const run = streak(habit, index, today, ws);
  const focus = today >= days[0] && today <= days[6] ? today : days[6];
  const goal = goalOn(habit, focus);
  const period = periodInfo(habit, index, focus, ws);
  const targetField = goal.target ? habit.fields.find((f) => f.id === goal.target!.fieldId) : undefined;
  const hasReminder = data.reminders.some((r) => r.habitId === habit.id && r.enabled);
  const weekRecs = recordsBetween(index, habit.id, days[0], days[6]);
  const names: Record<DayStatus, string> = { none: 'not done', min: 'smallest unit done', partial: 'partly done', met: 'done', exceeded: 'done, goal exceeded' };

  const toggle = (day: Day) => {
    const recs = recordsOn(index, habit.id, day);
    if (types.length) return openLog(habit, day);
    if (!recs.length) return quickLog(habit, null, day, 'full');
    if (recs.length === 1 && !recs[0].note) return removeRecord(recs[0]);
    openLog(habit, day);
  };

  return (
    <div class="wcard" style={{ '--c': habit.color }}>
      <div class="wgrid">
        <span class="wstreak" aria-label={`Streak: ${run.current} ${run.unit}${run.current === 1 ? '' : 's'}`}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d={BOLT} fill="currentColor" />
          </svg>
          {run.current}
        </span>
        {days.map((day) => {
          const info = dayInfo(habit, recordsOn(index, habit.id, day), goalOn(habit, day));
          // Weekly and monthly goals can be done on any day, so every day is open for them.
          const scheduled = isScheduled(habit, day) || (unitOf(goalOn(habit, day).frequency) !== 'day' && day >= habit.startDate);
          return (
            <button key={day} class={`mark ${info.status}`} disabled={day > today} aria-pressed={isDone(info.status)} aria-label={`${habit.name}, ${formatDay(day)}: ${names[info.status]}`} onClick={() => toggle(day)}>
              <DayMark status={info.status} scheduled={scheduled} />
            </button>
          );
        })}
      </div>
      <div class="wfoot">
        <button class="wname" onClick={props.onToggle} aria-expanded={props.open}>
          <span class="wtitle">
            {habit.icon} {habit.name}
          </span>
          {data.settings.detail === 'detailed' && (
            <span class="wsub">
              {period ? (
                <>
                  <b>{period.count}</b> of {period.goal} this {period.unit}
                </>
              ) : goal.target && targetField ? (
                <>
                  <b>{formatNumber(goal.target.amount)}</b> {targetField.unit ?? targetField.name.toLowerCase()}
                </>
              ) : (
                describeFrequency(goal.frequency)
              )}
            </span>
          )}
        </button>
        <button class="wbell" onClick={() => openHabitEditor(habit.id)} aria-label={hasReminder ? `${habit.name}: reminders on. Edit habit` : `${habit.name}: no reminders. Edit habit`}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d={BELL} fill={hasReminder ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" />
            {!hasReminder && <path d="M4 4l16 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" />}
          </svg>
        </button>
      </div>
      {props.open && <HabitExpanded habit={habit} date={focus} recs={[...weekRecs].reverse()} types={types} showDate />}
    </div>
  );
}

const STARTERS: { name: string; icon: string; color: string; category: string; build: () => void }[] = [
  {
    name: 'Exercise',
    icon: '🏃',
    color: '#e08a3c',
    category: 'Exercise',
    build: () => openHabitEditor(null, 'exercise'),
  },
  { name: 'Read', icon: '📖', color: '#4a7fc1', category: 'Learning', build: () => openHabitEditor(null, 'read') },
  { name: 'Meditate', icon: '🧘', color: '#8a6fc9', category: 'Mindfulness', build: () => openHabitEditor(null, 'meditate') },
];

export function DayList(props: { date: Day; today: Day; only?: (habit: Habit) => boolean }) {
  const { data, index } = useData();
  const [open, setOpen] = useState<string | null>(null);
  let habits = habitsShownOn(data, index, props.date);
  if (props.only) habits = habits.filter(props.only);
  if (!data.habits.length) {
    return (
      <div class="empty">
        <div class="empty-art">🌱</div>
        <h2>Start with one small habit</h2>
        <p class="muted">Pick a starting point, or make your own with the + button.</p>
        <div class="chips center">
          {STARTERS.map((s) => (
            <button key={s.name} class="chip big" onClick={s.build}>
              <span>{s.icon}</span> {s.name}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (!habits.length) return <p class="muted pad">No habits for this day.</p>;
  const due = habits.filter((h) => isScheduled(h, props.date) || recordsOn(index, h.id, props.date).length > 0 || periodInfo(h, index, props.date, data.settings.weekStart));
  const rest = habits.filter((h) => !due.includes(h));
  return (
    <div class="habit-list">
      {due.map((habit) => (
        <HabitCard key={habit.id} habit={habit} date={props.date} today={props.today} open={open === habit.id} onToggle={() => setOpen(open === habit.id ? null : habit.id)} />
      ))}
      {rest.length > 0 && <div class="list-label">Not scheduled for this day</div>}
      {rest.map((habit) => (
        <HabitCard key={habit.id} habit={habit} date={props.date} today={props.today} open={open === habit.id} onToggle={() => setOpen(open === habit.id ? null : habit.id)} dim />
      ))}
    </div>
  );
}

function CheckMark(props: { status: DayStatus; fraction: number; color: string }) {
  const done = isDone(props.status);
  return (
    <span class={`check ${props.status}`} style={{ '--c': props.color }}>
      {!done && props.fraction > 0 && <Ring value={props.fraction} size={44} stroke={4} color={props.color} />}
      {done ? (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      ) : props.status === 'min' ? (
        <span class="check-dot" />
      ) : null}
      {props.status === 'exceeded' && <span class="plus">+</span>}
    </span>
  );
}

function HabitCard(props: { habit: Habit; date: Day; today: Day; open: boolean; onToggle: () => void; dim?: boolean }) {
  const { habit, date } = props;
  const { data, index } = useData();
  const recs = recordsOn(index, habit.id, date);
  const goal = goalOn(habit, date);
  const info = dayInfo(habit, recs, goal);
  const period = periodInfo(habit, index, date, data.settings.weekStart);
  const types = activeTypes(data.activityTypes, habit.id);
  const run = streak(habit, index, props.today, data.settings.weekStart);
  const targetField = goal.target ? habit.fields.find((f) => f.id === goal.target!.fieldId) : undefined;

  // What the check button shows: the day for daily goals, the week or month for the others.
  const status: DayStatus = period ? (isDone(period.status) ? period.status : recs.length ? 'partial' : 'none') : info.status;
  const fraction = period ? Math.min(1, period.count / period.goal) : info.target ? Math.min(1, info.amount / info.target) : info.status === 'min' ? 0.5 : 0;

  const bits: string[] = [];
  if (period) bits.push(`${period.count} of ${period.goal} this ${period.unit}`);
  else if (info.target !== null) bits.push(`${formatNumber(info.amount)}/${formatNumber(info.target)} ${targetField?.unit ?? ''}`.trim());
  else if (info.status === 'min') bits.push(habit.minimum?.label || 'Smallest unit');
  if (run.current > 0) bits.push(`🔥 ${run.current} ${run.unit}${run.current === 1 ? '' : 's'}`);
  if (!bits.length) bits.push(describeFrequency(goal.frequency));

  const onCheck = () => {
    if (types.length) return openLog(habit, date);
    if (!recs.length) return quickLog(habit, null, date, 'full');
    if (recs.length === 1 && !recs[0].note && recs[0].level === 'full') return removeRecord(recs[0]);
    openLog(habit, date);
  };

  return (
    <div class={`card habit${props.dim ? ' dim' : ''}${isDone(status) ? ' done' : ''}`} style={{ '--c': habit.color }}>
      <div class="habit-row">
        <button class="habit-main" onClick={props.onToggle} aria-expanded={props.open}>
          <span class="tile">{habit.icon}</span>
          <span class="habit-text">
            <span class="habit-name">{habit.name}</span>
            {data.settings.detail === 'detailed' && <span class="habit-sub">{bits.join('  ·  ')}</span>}
          </span>
        </button>
        <button class="check-btn" onClick={onCheck} aria-label={`${isDone(status) ? 'Done' : 'Log'}: ${habit.name}`}>
          <CheckMark status={status} fraction={fraction} color={habit.color} />
        </button>
      </div>
      {props.open && <HabitExpanded habit={habit} date={date} recs={recs} types={types} />}
    </div>
  );
}

function HabitExpanded(props: { habit: Habit; date: Day; recs: ActivityRecord[]; types: ActivityType[]; showDate?: boolean }) {
  const { habit, date, recs } = props;
  const { data, index } = useData();
  const period = periodInfo(habit, index, date, data.settings.weekStart);
  const from = period ? period.from : weekStart(date, data.settings.weekStart);
  const to = period ? period.to : addDays(from, 6);
  const slices = props.types.length ? breakdown(habit, data.activityTypes, recordsBetween(index, habit.id, from, to), SESSIONS) : [];
  const unit = period?.unit ?? 'week';
  return (
    <div class="habit-more">
      {habit.description && <p class="muted">{habit.description}</p>}
      {recs.length > 0 && (
        <ul class="entries">
          {recs.map((rec) => (
            <RecordRow key={rec.id} habit={habit} rec={rec} showDate={props.showDate} />
          ))}
        </ul>
      )}
      {slices.length > 0 && (
        <ul class="mini-breakdown">
          {slices.map((s) => (
            <li key={s.id}>
              <span class="swatch-dot" style={{ background: s.color }} />
              {s.name}: {s.value} session{s.value === 1 ? '' : 's'} this {unit}
            </li>
          ))}
          {period && (
            <li class="strong">
              Overall: {period.count} of {period.goal} {period.unit === 'week' ? 'weekly' : 'monthly'} sessions
            </li>
          )}
        </ul>
      )}
      <div class="chips">
        <button class="chip" onClick={() => openLog(habit, date)}>
          ＋ Log activity
        </button>
        {habit.minimum && (
          <button class="chip" onClick={() => quickLog(habit, null, date, 'min')}>
            {habit.minimum.label || 'Smallest unit'}
          </button>
        )}
        <button class="chip" onClick={() => openJournalEditor(null, clock().today, { kind: 'note', habitId: habit.id })}>
          Add note
        </button>
        <button class="chip" onClick={() => openHabitDetail(habit.id)}>
          Stats
        </button>
        <button class="chip" onClick={() => openHabitEditor(habit.id)}>
          Edit
        </button>
      </div>
    </div>
  );
}

export function RecordRow(props: { habit: Habit; rec: ActivityRecord; showDate?: boolean }) {
  const { data } = useData();
  const { habit, rec } = props;
  const type = rec.activityTypeId ? data.activityTypes.find((t) => t.id === rec.activityTypeId) : null;
  return (
    <li>
      <button class="entry" onClick={() => openRecordForm(habit, rec)}>
        <span class="entry-icon">{type?.icon || habit.icon}</span>
        <span class="entry-text">
          <span>{describeRecord(habit, data.activityTypes, rec)}</span>
          <span class="muted small">
            {[props.showDate ? formatDay(rec.date, clock().today.slice(0, 4)) : '', rec.time ? formatTime(rec.time, data.settings.timeFormat) : '', rec.note].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span class="chev">›</span>
      </button>
    </li>
  );
}

// ---- Logging ----

export function openLog(habit: Habit, date: Day): void {
  openSheet(`${habit.name}`, (close) => <LogSheet habitId={habit.id} date={date} close={close} />);
}

function LogSheet(props: { habitId: string; date: Day; close: () => void }) {
  const { data, index } = useData();
  const [minimum, setMinimum] = useState(false);
  const habit = data.habits.find((h) => h.id === props.habitId);
  if (!habit) return null;
  const types = activeTypes(data.activityTypes, habit.id);
  const recs = recordsOn(index, habit.id, props.date);
  const level = minimum ? 'min' : 'full';
  const goal = currentGoal(habit);
  const targetField = goal.target ? habit.fields.find((f) => f.id === goal.target!.fieldId) : undefined;

  const tap = (type: ActivityType | null) => {
    const values = quickValues(habit, type, level);
    const missing = fieldsFor(habit, type).some((f) => f.required && !values.some((v) => v.fieldId === f.id));
    if (missing) openRecordForm(habit, null, { date: props.date, typeId: type?.id ?? null, level });
    else quickLog(habit, type, props.date, level);
  };

  return (
    <div class="stack">
      {types.length > 0 ? (
        <>
          <p class="prompt">What did you do?</p>
          <div class="activity-grid">
            {types.map((type) => {
              const count = recs.filter((r) => r.activityTypeId === type.id).length;
              return (
                <button key={type.id} class={`activity${count ? ' on' : ''}`} style={{ '--c': type.color || habit.color }} onClick={() => tap(type)}>
                  <span class="activity-icon">{type.icon || habit.icon}</span>
                  <span>{type.name}</span>
                  {count > 0 && <span class="badge">{count > 1 ? `✓ ${count}` : '✓'}</span>}
                </button>
              );
            })}
            <button class="activity" onClick={() => tap(null)}>
              <span class="activity-icon">•</span>
              <span>Other</span>
            </button>
          </div>
          <p class="muted small">Tap an activity to log it. Tap more than one if you did several.</p>
        </>
      ) : (
        <button class="btn primary" onClick={() => tap(null)}>
          {minimum ? `Log: ${habit.minimum?.label || 'smallest unit'}` : goal.target && targetField ? `Log ${formatNumber(goal.target.amount)} ${targetField.unit ?? targetField.name}` : 'Mark done'}
        </button>
      )}
      {habit.minimum && (
        <label class="check-row">
          <input type="checkbox" checked={minimum} onChange={(e) => setMinimum((e.target as HTMLInputElement).checked)} />
          <span>
            Just the smallest unit{habit.minimum.label ? `: ${habit.minimum.label}` : ''}
          </span>
        </label>
      )}
      <button class="btn" onClick={() => openRecordForm(habit, null, { date: props.date, typeId: null, level })}>
        Log with details…
      </button>
      {recs.length > 0 && (
        <>
          <div class="list-label">{props.date === clock().today ? 'Logged today' : `Logged ${formatDay(props.date)}`}</div>
          <ul class="entries">
            {recs.map((rec) => (
              <RecordRow key={rec.id} habit={habit} rec={rec} />
            ))}
          </ul>
        </>
      )}
      <button class="btn primary" onClick={props.close}>
        Done
      </button>
    </div>
  );
}

export function openRecordForm(habit: Habit, rec: ActivityRecord | null, fresh?: { date: Day; typeId: string | null; level: 'full' | 'min' }): void {
  openSheet(rec ? 'Edit entry' : 'New entry', (close) => <RecordForm habitId={habit.id} rec={rec} fresh={fresh} close={close} />, { tall: true });
}

function RecordForm(props: { habitId: string; rec: ActivityRecord | null; fresh?: { date: Day; typeId: string | null; level: 'full' | 'min' }; close: () => void }) {
  const { data } = useData();
  const habit = data.habits.find((h) => h.id === props.habitId);
  const now = clock();
  const [typeId, setTypeId] = useState<string | null>(props.rec?.activityTypeId ?? props.fresh?.typeId ?? null);
  const [date, setDate] = useState(props.rec?.date ?? props.fresh?.date ?? now.today);
  const [time, setTime] = useState(props.rec ? props.rec.time ?? '' : date === now.today ? now.time : '');
  const [level, setLevel] = useState<'full' | 'min'>(props.rec?.level ?? props.fresh?.level ?? 'full');
  const [note, setNote] = useState(props.rec?.note ?? '');
  const [values, setValues] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    if (props.rec) for (const v of props.rec.values) out[v.fieldId] = String(v.value);
    return out;
  });
  const [error, setError] = useState('');
  if (!habit) return null;
  const types = data.activityTypes.filter((t) => t.habitId === habit.id && (!t.archived || t.id === typeId)).sort((a, b) => a.order - b.order);
  const type = typeId ? types.find((t) => t.id === typeId) ?? null : null;
  const fields = fieldsFor(habit, type);
  // Keep showing values recorded for fields that have since been removed.
  const extra = props.rec ? props.rec.values.filter((v) => !fields.some((f) => f.id === v.fieldId)) : [];

  const pickType = (id: string | null) => {
    setTypeId(id);
    const t = id ? types.find((x) => x.id === id) : null;
    if (t && !props.rec) {
      const next = { ...values };
      for (const [fieldId, value] of Object.entries(t.defaults)) if (!next[fieldId]) next[fieldId] = String(value);
      setValues(next);
    }
  };

  const save = () => {
    const out: RecordValue[] = [];
    for (const field of fields) {
      const raw = (values[field.id] ?? '').trim();
      if (!raw) {
        if (field.required) return setError(`${field.name} is required.`);
        continue;
      }
      if (field.kind === 'number') {
        const n = Number(raw);
        if (!Number.isFinite(n)) return setError(`${field.name} should be a number.`);
        const old = props.rec?.values.find((v) => v.fieldId === field.id);
        // An untouched value keeps the unit it was recorded in.
        const unit = old && old.value === n ? old.unit : field.unit;
        out.push({ fieldId: field.id, value: n, ...(unit ? { unit } : {}) });
      } else out.push({ fieldId: field.id, value: raw });
    }
    out.push(...extra);
    if (!date) return setError('Pick a date.');
    mutate((d, c) => {
      const existing = props.rec ? d.records.find((r) => r.id === props.rec!.id) : undefined;
      if (existing) Object.assign(existing, { activityTypeId: typeId, date, time: time || null, level, values: out, note: note.trim(), updatedAt: c.now });
      else logRecord(d, { habitId: habit.id, activityTypeId: typeId, date, time: time || null, level, values: out, note: note.trim() }, c);
    });
    props.close();
  };

  return (
    <div class="stack">
      {types.length > 0 && (
        <div class="chips" role="group" aria-label="Activity">
          {types.map((t) => (
            <button key={t.id} type="button" class={`chip${t.id === typeId ? ' on' : ''}`} aria-pressed={t.id === typeId} onClick={() => pickType(t.id)}>
              {t.icon} {t.name}
            </button>
          ))}
          <button type="button" class={`chip${typeId === null ? ' on' : ''}`} aria-pressed={typeId === null} onClick={() => pickType(null)}>
            Other
          </button>
        </div>
      )}
      <div class="row2">
        <Field label="Date">
          <input class="input" type="date" value={date} max={now.today} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
        </Field>
        <Field label="Time">
          <input class="input" type="time" value={time} onInput={(e) => setTime((e.target as HTMLInputElement).value)} />
        </Field>
      </div>
      {fields.map((field) => (
        <Field key={field.id} group={field.kind === 'choice'} label={`${field.name}${field.unit ? ` (${field.unit})` : ''}${field.required ? ' *' : ''}`}>
          {field.kind === 'number' ? (
            <input class="input" type="number" inputMode="decimal" step={field.precision ? String(1 / 10 ** field.precision) : '1'} min="0" value={values[field.id] ?? ''} onInput={(e) => setValues({ ...values, [field.id]: (e.target as HTMLInputElement).value })} />
          ) : field.kind === 'choice' ? (
            <div class="chips">
              {(field.options ?? []).map((option) => (
                <button key={option} type="button" class={`chip${values[field.id] === option ? ' on' : ''}`} aria-pressed={values[field.id] === option} onClick={() => setValues({ ...values, [field.id]: values[field.id] === option ? '' : option })}>
                  {option}
                </button>
              ))}
            </div>
          ) : (
            <input class="input" value={values[field.id] ?? ''} onInput={(e) => setValues({ ...values, [field.id]: (e.target as HTMLInputElement).value })} />
          )}
        </Field>
      ))}
      {habit.minimum && (
        <Segmented
          label="Effort"
          value={level}
          onChange={setLevel}
          options={[
            { value: 'full', label: 'Full session' },
            { value: 'min', label: habit.minimum.label || 'Smallest unit' },
          ]}
        />
      )}
      <Field label="Notes">
        <textarea class="input" rows={2} value={note} onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} />
      </Field>
      {error && <p class="error">{error}</p>}
      <button class="btn primary" onClick={save}>
        Save
      </button>
      {props.rec && (
        <button
          class="btn danger-text"
          onClick={() =>
            confirmSheet('Delete this entry?', 'Only this entry is removed. Other entries are not affected.', 'Delete entry', () => {
              removeRecord(props.rec!);
              props.close();
            })
          }
        >
          Delete entry
        </button>
      )}
    </div>
  );
}
