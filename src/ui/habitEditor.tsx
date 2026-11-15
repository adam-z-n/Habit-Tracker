import { useRef, useState } from 'preact/hooks';
import { WEEKDAY_SHORT } from '../core/dates';
import { createHabit, deleteHabit, duplicateHabit, newId, setGoal, setReminders } from '../core/ops';
import { currentGoal, describeFrequency } from '../core/stats';
import type { ActivityType, FieldDef, Frequency, Habit, HabitStatus, Reminder } from '../core/types';
import { UNIT_SUGGESTIONS } from '../core/units';
import { CATEGORIES, ColorPicker, Field, IconPicker, Segmented } from './common';
import { confirmSheet, openSheet, toast } from './sheet';
import { clock, mutate, useData } from './store';

// Creating and editing a habit: basics, goal, measurements, activity types and reminders.

const SUGGESTED: Record<string, [string, string][]> = {
  Exercise: [['Running', '🏃'], ['Walking', '🚶'], ['Cycling', '🚴'], ['Strength training', '🏋️'], ['Swimming', '🏊'], ['Ice skating', '⛸️'], ['Hiking', '🥾'], ['Yoga', '🧘']],
  Health: [['Walk', '🚶'], ['Stretch', '🤸'], ['Cook at home', '🥗']],
  Learning: [['Book', '📖'], ['Audiobook', '🎧'], ['Course', '🎓'], ['Practice', '✍️'], ['Podcast', '🎙️']],
  Mindfulness: [['Meditation', '🧘'], ['Breathing', '🌬️'], ['Journaling', '📓'], ['Walk outside', '🌳']],
  'Personal development': [['Reading', '📖'], ['Writing', '✍️'], ['Planning', '🗓️']],
};

type Kind = Frequency['type'];

interface Draft {
  name: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  startDate: string;
  status: HabitStatus;
  kind: Kind;
  days: number[];
  times: number;
  every: number;
  targetOn: boolean;
  targetAmount: string;
  targetField: string;
  minimumOn: boolean;
  minimumLabel: string;
  minimumCounts: boolean;
  fields: FieldDef[];
  types: ActivityType[];
  reminders: Reminder[];
}

const field = (name: string, unit: string, precision = 0): FieldDef => ({ id: newId(), name, kind: 'number', unit, precision });

function blankType(habitId: string, name: string, icon: string, order: number): ActivityType {
  const now = clock().now;
  return { id: newId(), habitId, name, icon, fieldIds: null, defaults: {}, order, archived: false, createdAt: now, updatedAt: now };
}

function starter(kind: string | undefined, draft: Draft): Draft {
  if (kind === 'exercise') {
    const duration = field('Duration', 'min');
    const distance = field('Distance', 'mi', 1);
    const intensity: FieldDef = { id: newId(), name: 'Intensity', kind: 'choice', options: ['Low', 'Medium', 'High'] };
    const t = (name: string, icon: string, order: number, ids: string[]) => ({ ...blankType('', name, icon, order), fieldIds: ids });
    return {
      ...draft,
      name: 'Exercise',
      icon: '🏃',
      color: '#e08a3c',
      category: 'Exercise',
      kind: 'perWeek',
      times: 4,
      fields: [duration, distance, intensity],
      types: [t('Running', '🏃', 0, [duration.id, distance.id]), t('Cycling', '🚴', 1, [duration.id, distance.id]), t('Walking', '🚶', 2, [duration.id, distance.id]), t('Strength training', '🏋️', 3, [duration.id, intensity.id]), t('Swimming', '🏊', 4, [duration.id, distance.id])],
    };
  }
  if (kind === 'read') {
    const duration = field('Duration', 'min');
    return { ...draft, name: 'Read', icon: '📖', color: '#4a7fc1', category: 'Learning', fields: [duration, field('Pages', 'pages')], targetOn: true, targetAmount: '20', targetField: duration.id, minimumOn: true, minimumLabel: 'One page' };
  }
  if (kind === 'meditate') {
    const duration = field('Duration', 'min');
    return { ...draft, name: 'Meditate', icon: '🧘', color: '#8a6fc9', category: 'Mindfulness', fields: [duration], targetOn: true, targetAmount: '10', targetField: duration.id, minimumOn: true, minimumLabel: 'One minute' };
  }
  return draft;
}

function draftOf(habit: Habit | null, types: ActivityType[], reminders: Reminder[], template?: string): Draft {
  const goal = habit ? currentGoal(habit) : null;
  const f = goal?.frequency ?? { type: 'daily' as const };
  const draft: Draft = {
    name: habit?.name ?? '',
    description: habit?.description ?? '',
    icon: habit?.icon ?? '✅',
    color: habit?.color ?? '#2f6f5e',
    category: habit?.category ?? '',
    startDate: habit?.startDate ?? clock().today,
    status: habit?.status ?? 'active',
    kind: f.type,
    days: f.type === 'weekdays' ? [...f.days] : [1, 2, 3, 4, 5],
    times: f.type === 'perWeek' || f.type === 'perMonth' ? f.times : 3,
    every: f.type === 'interval' ? f.every : 2,
    targetOn: !!goal?.target,
    targetAmount: goal?.target ? String(goal.target.amount) : '',
    targetField: goal?.target?.fieldId ?? '',
    minimumOn: !!habit?.minimum,
    minimumLabel: habit?.minimum?.label ?? '',
    minimumCounts: habit?.minimum?.countsAsComplete ?? false,
    fields: structuredClone(habit?.fields ?? []),
    types: structuredClone(types),
    reminders: structuredClone(reminders),
  };
  return habit ? draft : starter(template, draft);
}

export function openHabitEditor(habitId: string | null, template?: string): void {
  openSheet(habitId ? 'Edit habit' : 'New habit', (close) => <HabitEditor habitId={habitId} template={template} close={close} />, { tall: true });
}

function HabitEditor(props: { habitId: string | null; template?: string; close: () => void }) {
  const { data } = useData();
  const habit = props.habitId ? data.habits.find((h) => h.id === props.habitId) ?? null : null;
  const [d, setD] = useState<Draft>(() =>
    draftOf(
      habit,
      data.activityTypes.filter((t) => t.habitId === props.habitId).sort((a, b) => a.order - b.order),
      data.reminders.filter((r) => r.habitId === props.habitId),
      props.template,
    ),
  );
  const [error, setError] = useState('');
  const [openType, setOpenType] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setD((old) => ({ ...old, ...patch }));
  const liveFields = d.fields.filter((f) => !f.archived);
  const numberFields = liveFields.filter((f) => f.kind === 'number');
  const liveTypes = d.types.filter((t) => !t.archived);
  const suggestions = (SUGGESTED[d.category] ?? []).filter(([name]) => !liveTypes.some((t) => t.name.toLowerCase() === name.toLowerCase()));

  const setField = (id: string, patch: Partial<FieldDef>) => set({ fields: d.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  const setType = (id: string, patch: Partial<ActivityType>) => set({ types: d.types.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  const addField = (name: string, unit: string, precision = 0) => {
    const f = field(name, unit, precision);
    set({ fields: [...d.fields, f], ...(d.targetOn && !d.targetField ? { targetField: f.id } : {}) });
    return f;
  };
  const moveType = (id: string, by: number) => {
    const list = [...liveTypes];
    const i = list.findIndex((t) => t.id === id);
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const order = new Map(list.map((t, n) => [t.id, n]));
    set({ types: d.types.map((t) => (order.has(t.id) ? { ...t, order: order.get(t.id)! } : t)).sort((a, b) => a.order - b.order) });
  };
  const addType = (name: string, icon: string) => {
    const t = blankType(props.habitId ?? '', name, icon, liveTypes.length);
    set({ types: [...d.types, t] });
    if (!name) setOpenType(t.id);
  };

  const save = () => {
    const name = d.name.trim();
    if (!name) return setError('Give the habit a name.');
    if (d.kind === 'weekdays' && !d.days.length) return setError('Pick at least one day of the week.');
    if (liveTypes.some((t) => !t.name.trim())) return setError('Every activity type needs a name.');
    if (liveFields.some((f) => !f.name.trim())) return setError('Every measurement needs a name.');
    const frequency: Frequency =
      d.kind === 'weekdays' ? { type: 'weekdays', days: [...d.days].sort() } : d.kind === 'perWeek' || d.kind === 'perMonth' ? { type: d.kind, times: Math.max(1, Math.round(d.times) || 1) } : d.kind === 'interval' ? { type: 'interval', every: Math.max(1, Math.round(d.every) || 1) } : { type: 'daily' };
    let target = null;
    if (d.targetOn) {
      const amount = Number(d.targetAmount);
      if (!(amount > 0)) return setError('Enter the amount for the daily target.');
      if (!numberFields.some((f) => f.id === d.targetField)) return setError('Choose what the daily target is measured in.');
      target = { fieldId: d.targetField, amount };
    }
    const minimum = d.minimumOn ? { label: d.minimumLabel.trim(), countsAsComplete: d.minimumCounts } : null;
    mutate((data, c) => {
      let h = props.habitId ? data.habits.find((x) => x.id === props.habitId) : undefined;
      if (!h) h = createHabit(data, { name, startDate: d.startDate || c.today, frequency, target }, c);
      else setGoal(h, frequency, target, c);
      Object.assign(h, { name, description: d.description.trim(), icon: d.icon || '✅', color: d.color, category: d.category.trim(), startDate: d.startDate || h.startDate, status: d.status, minimum, fields: d.fields, updatedAt: c.now });
      if (h.goals.length === 1) h.goals[0].from = h.startDate;
      const habitId = h.id;
      const others = data.activityTypes.filter((t) => t.habitId !== habitId);
      data.activityTypes = [...others, ...d.types.map((t) => ({ ...t, habitId, name: t.name.trim(), updatedAt: c.now }))];
      setReminders(data, habitId, d.reminders.map((r) => ({ ...r, habitId, updatedAt: c.now })), c);
    });
    props.close();
  };

  return (
    <div class="stack editor">
      <div class="name-row">
        <span class="tile big" style={{ '--c': d.color }}>
          {d.icon}
        </span>
        <input class="input name" placeholder="Habit name" value={d.name} onInput={(e) => set({ name: (e.target as HTMLInputElement).value })} aria-label="Habit name" />
      </div>

      <details class="group">
        <summary>Icon and color</summary>
        <div class="stack">
          <IconPicker value={d.icon} onChange={(icon) => set({ icon })} />
          <ColorPicker value={d.color} onChange={(color) => set({ color })} />
        </div>
      </details>

      <section class="group">
        <h3>Goal</h3>
        <Field label="How often">
          <select class="input" value={d.kind} onChange={(e) => set({ kind: (e.target as HTMLSelectElement).value as Kind })}>
            <option value="daily">Every day</option>
            <option value="weekdays">Specific days of the week</option>
            <option value="perWeek">A number of times per week</option>
            <option value="perMonth">A number of times per month</option>
            <option value="interval">Every few days</option>
          </select>
        </Field>
        {d.kind === 'weekdays' && (
          <div class="chips" role="group" aria-label="Days of the week">
            {WEEKDAY_SHORT.map((label, day) => (
              <button key={day} type="button" class={`chip${d.days.includes(day) ? ' on' : ''}`} aria-pressed={d.days.includes(day)} onClick={() => set({ days: d.days.includes(day) ? d.days.filter((x) => x !== day) : [...d.days, day] })}>
                {label}
              </button>
            ))}
          </div>
        )}
        {(d.kind === 'perWeek' || d.kind === 'perMonth') && (
          <Field label={d.kind === 'perWeek' ? 'Times per week' : 'Times per month'}>
            <input class="input" type="number" inputMode="numeric" min="1" max={d.kind === 'perWeek' ? 21 : 90} value={d.times} onInput={(e) => set({ times: Number((e.target as HTMLInputElement).value) })} />
          </Field>
        )}
        {d.kind === 'interval' && (
          <Field label="Every how many days">
            <input class="input" type="number" inputMode="numeric" min="1" value={d.every} onInput={(e) => set({ every: Number((e.target as HTMLInputElement).value) })} />
          </Field>
        )}
        <label class="check-row">
          <input type="checkbox" checked={d.targetOn} onChange={(e) => set({ targetOn: (e.target as HTMLInputElement).checked, targetField: d.targetField || numberFields[0]?.id || '' })} />
          <span>Set an amount to reach each day</span>
        </label>
        {d.targetOn && (
          <>
            {numberFields.length > 0 ? (
              <div class="row2">
                <Field label="Amount">
                  <input class="input" type="number" inputMode="decimal" min="0" value={d.targetAmount} onInput={(e) => set({ targetAmount: (e.target as HTMLInputElement).value })} />
                </Field>
                <Field label="Measured in">
                  <select class="input" value={d.targetField} onChange={(e) => set({ targetField: (e.target as HTMLSelectElement).value })}>
                    {numberFields.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                        {f.unit ? ` (${f.unit})` : ''}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            ) : (
              <p class="muted small">Pick what to measure:</p>
            )}
            {numberFields.length === 0 && <QuickFields add={addField} />}
          </>
        )}
        {habit && habit.goals.length > 1 && <p class="muted small">Goal changes apply from today. Earlier days keep the goal they had: {habit.goals.map((g) => `${describeFrequency(g.frequency)} from ${g.from}`).join('; ')}.</p>}
      </section>

      <section class="group">
        <h3>Smallest unit</h3>
        <label class="check-row">
          <input type="checkbox" checked={d.minimumOn} onChange={(e) => set({ minimumOn: (e.target as HTMLInputElement).checked })} />
          <span>Allow a minimum version for hard days</span>
        </label>
        {d.minimumOn && (
          <>
            <Field label="What is the smallest version?" hint="For example: one page, one push-up, one minute.">
              <input class="input" value={d.minimumLabel} onInput={(e) => set({ minimumLabel: (e.target as HTMLInputElement).value })} />
            </Field>
            <label class="check-row">
              <input type="checkbox" checked={d.minimumCounts} onChange={(e) => set({ minimumCounts: (e.target as HTMLInputElement).checked })} />
              <span>Count it as completing the habit</span>
            </label>
            {!d.minimumCounts && <p class="muted small">It will show as a partial day and will not extend a streak.</p>}
          </>
        )}
      </section>

      <section class="group">
        <h3>Activity types</h3>
        <p class="muted small">The different ways you do this habit. Optional.</p>
        {liveTypes.map((t, i) => (
          <div class="sub-card" key={t.id}>
            <div class="type-row">
              <input class="input emoji" value={t.icon} maxLength={8} aria-label="Activity icon" placeholder="🙂" onInput={(e) => setType(t.id, { icon: (e.target as HTMLInputElement).value })} />
              <input class="input" value={t.name} placeholder="Activity name" aria-label="Activity name" onInput={(e) => setType(t.id, { name: (e.target as HTMLInputElement).value })} />
              <button type="button" class="icon-btn small" aria-label="Move up" disabled={i === 0} onClick={() => moveType(t.id, -1)}>
                ↑
              </button>
              <button type="button" class="icon-btn small" aria-label="Move down" disabled={i === liveTypes.length - 1} onClick={() => moveType(t.id, 1)}>
                ↓
              </button>
              <button type="button" class="icon-btn small" aria-label="More options" aria-expanded={openType === t.id} onClick={() => setOpenType(openType === t.id ? null : t.id)}>
                ⋯
              </button>
            </div>
            {openType === t.id && (
              <div class="stack">
                <Field group label="Color">
                  <ColorPicker value={t.color ?? ''} allowNone onChange={(color) => setType(t.id, { color: color || undefined })} />
                </Field>
                {liveFields.length > 0 && (
                  <Field group label="Measurements for this activity" hint="Numbers typed here are filled in when you log with one tap.">
                    <div class="stack tight">
                      {liveFields.map((f) => {
                        const on = t.fieldIds === null || t.fieldIds.includes(f.id);
                        return (
                          <div class="measure-row" key={f.id}>
                            <label class="check-row">
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => {
                                  const all = t.fieldIds ?? liveFields.map((x) => x.id);
                                  setType(t.id, { fieldIds: on ? all.filter((x) => x !== f.id) : [...all, f.id] });
                                }}
                              />
                              <span>
                                {f.name}
                                {f.unit ? ` (${f.unit})` : ''}
                              </span>
                            </label>
                            {on && f.kind === 'number' && (
                              <input
                                class="input short"
                                type="number"
                                inputMode="decimal"
                                placeholder="Default"
                                aria-label={`Default ${f.name}`}
                                value={t.defaults[f.id] ?? ''}
                                onInput={(e) => {
                                  const raw = (e.target as HTMLInputElement).value;
                                  const defaults = { ...t.defaults };
                                  if (raw === '') delete defaults[f.id];
                                  else defaults[f.id] = Number(raw);
                                  setType(t.id, { defaults });
                                }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </Field>
                )}
                <button type="button" class="btn danger-text" onClick={() => setType(t.id, { archived: true })}>
                  Remove activity type
                </button>
                <p class="muted small">Entries already logged with it are kept.</p>
              </div>
            )}
          </div>
        ))}
        <div class="chips">
          <button type="button" class="chip on" onClick={() => addType('', '')}>
            ＋ Add activity type
          </button>
          {suggestions.map(([name, icon]) => (
            <button type="button" key={name} class="chip" onClick={() => addType(name, icon)}>
              {icon} {name}
            </button>
          ))}
        </div>
      </section>

      <section class="group">
        <h3>Measurements</h3>
        <p class="muted small">Optional details you can record, such as duration or distance.</p>
        {liveFields.map((f) => (
          <div class="sub-card" key={f.id}>
            <div class="type-row">
              <input class="input" value={f.name} placeholder="Name" aria-label="Measurement name" onInput={(e) => setField(f.id, { name: (e.target as HTMLInputElement).value })} />
              <select class="input short" value={f.kind} aria-label="Kind" onChange={(e) => setField(f.id, { kind: (e.target as HTMLSelectElement).value as FieldDef['kind'] })}>
                <option value="number">Number</option>
                <option value="choice">Choice</option>
                <option value="text">Text</option>
              </select>
              <button
                type="button"
                class="icon-btn small"
                aria-label={`Remove ${f.name}`}
                onClick={() => {
                  // A new, unused field is dropped; one that may have records is only hidden.
                  const used = !!habit?.fields.some((x) => x.id === f.id);
                  set({ fields: used ? d.fields.map((x) => (x.id === f.id ? { ...x, archived: true } : x)) : d.fields.filter((x) => x.id !== f.id), ...(d.targetField === f.id ? { targetField: '', targetOn: false } : {}) });
                }}
              >
                ✕
              </button>
            </div>
            {f.kind === 'number' && (
              <div class="row2">
                <Field label="Unit">
                  <input class="input" list="unit-list" value={f.unit ?? ''} placeholder="min, mi, pages…" onInput={(e) => setField(f.id, { unit: (e.target as HTMLInputElement).value.trim() || undefined })} />
                </Field>
                <Field label="Decimal places">
                  <select class="input" value={String(f.precision ?? 0)} onChange={(e) => setField(f.id, { precision: Number((e.target as HTMLSelectElement).value) })}>
                    <option value="0">0</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                  </select>
                </Field>
              </div>
            )}
            {f.kind === 'choice' && (
              <Field label="Choices, separated by commas">
                <input class="input" value={(f.options ?? []).join(', ')} placeholder="Low, Medium, High" onChange={(e) => setField(f.id, { options: (e.target as HTMLInputElement).value.split(',').map((s) => s.trim()).filter(Boolean) })} />
              </Field>
            )}
            <label class="check-row">
              <input type="checkbox" checked={!!f.required} onChange={(e) => setField(f.id, { required: (e.target as HTMLInputElement).checked })} />
              <span>Required when logging</span>
            </label>
          </div>
        ))}
        <datalist id="unit-list">
          {UNIT_SUGGESTIONS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <QuickFields add={addField} custom={() => set({ fields: [...d.fields, { id: newId(), name: '', kind: 'number', precision: 0 }] })} have={liveFields} />
      </section>

      <section class="group">
        <h3>Reminders</h3>
        {d.reminders.map((r) => {
          const setR = (patch: Partial<Reminder>) => set({ reminders: d.reminders.map((x) => (x.id === r.id ? { ...x, ...patch } : x)) });
          return (
            <div class="sub-card" key={r.id}>
              <div class="type-row">
                <input class="input short" type="time" value={r.time} aria-label="Reminder time" onInput={(e) => setR({ time: (e.target as HTMLInputElement).value })} />
                <input class="input" value={r.text} placeholder={`Time for ${d.name || 'your habit'}`} aria-label="Reminder text" onInput={(e) => setR({ text: (e.target as HTMLInputElement).value })} />
                <button type="button" class="icon-btn small" aria-label="Remove reminder" onClick={() => set({ reminders: d.reminders.filter((x) => x.id !== r.id) })}>
                  ✕
                </button>
              </div>
              <div class="chips" role="group" aria-label="Reminder days">
                {WEEKDAY_SHORT.map((label, day) => (
                  <button key={day} type="button" class={`chip tiny${r.days.includes(day) ? ' on' : ''}`} aria-pressed={r.days.includes(day)} onClick={() => setR({ days: r.days.includes(day) ? r.days.filter((x) => x !== day) : [...r.days, day] })}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <div class="chips">
          <button
            type="button"
            class="chip on"
            onClick={() => {
              const now = clock().now;
              set({ reminders: [...d.reminders, { id: newId(), habitId: props.habitId ?? '', time: '08:00', days: [0, 1, 2, 3, 4, 5, 6], text: '', enabled: true, createdAt: now, updatedAt: now }] });
            }}
          >
            ＋ Add reminder
          </button>
        </div>
        {d.reminders.length > 0 && <p class="muted small">Reminders show while the app is open or in the background. See Settings for how to get them on your phone's calendar.</p>}
      </section>

      <details class="group">
        <summary>More</summary>
        <div class="stack">
          <Field label="Category">
            <input class="input" list="category-list" value={d.category} placeholder="Health, Exercise, Learning…" onInput={(e) => set({ category: (e.target as HTMLInputElement).value })} />
            <datalist id="category-list">
              {CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Description">
            <textarea class="input" rows={2} value={d.description} onInput={(e) => set({ description: (e.target as HTMLTextAreaElement).value })} />
          </Field>
          <Field label="Start date">
            <input class="input" type="date" value={d.startDate} onInput={(e) => set({ startDate: (e.target as HTMLInputElement).value })} />
          </Field>
          <Field group label="Status">
            <Segmented
              value={d.status}
              onChange={(status) => set({ status })}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'paused', label: 'Paused' },
                { value: 'archived', label: 'Archived' },
              ]}
            />
          </Field>
        </div>
      </details>

      {error && <p class="error">{error}</p>}
      <button class="btn primary" onClick={save}>
        {habit ? 'Save changes' : 'Create habit'}
      </button>
      {habit && (
        <div class="row2">
          <button
            class="btn"
            onClick={() => {
              mutate((data, c) => void duplicateHabit(data, habit.id, c));
              props.close();
              toast('Habit duplicated');
            }}
          >
            Duplicate
          </button>
          <button
            class="btn danger-text"
            onClick={() =>
              confirmSheet(`Delete ${habit.name}?`, 'This deletes the habit and all of its history. To keep the history, archive it instead (under More).', 'Delete habit and history', () => {
                mutate((data, c) => deleteHabit(data, habit.id, c));
                props.close();
              })
            }
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function QuickFields(props: { add: (name: string, unit: string, precision?: number) => void; custom?: () => void; have?: FieldDef[] }) {
  const presets: [string, string, number][] = [
    ['Duration', 'min', 0],
    ['Distance', 'mi', 1],
    ['Pages', 'pages', 0],
    ['Repetitions', 'reps', 0],
  ];
  const have = new Set((props.have ?? []).map((f) => f.name.toLowerCase()));
  return (
    <div class="chips">
      {props.custom && (
        <button type="button" class="chip on" onClick={props.custom}>
          ＋ Add measurement
        </button>
      )}
      {presets
        .filter(([name]) => !have.has(name.toLowerCase()))
        .map(([name, unit, precision]) => (
          <button type="button" key={name} class="chip" onClick={() => props.add(name, unit, precision)}>
            {name}
          </button>
        ))}
    </div>
  );
}

// ---- Managing the list: order and status ----

export function openManage(): void {
  openSheet('Your habits', () => <Manage />, { tall: true });
}

function Manage() {
  const { data } = useData();
  const sorted = [...data.habits].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const active = sorted.filter((h) => h.status === 'active');
  const rest = sorted.filter((h) => h.status !== 'active');
  const [order, setOrder] = useState<string[] | null>(null);
  const drag = useRef<{ id: string; startY: number; from: number; height: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const ids = order ?? active.map((h) => h.id);
  const byId = new Map(active.map((h) => [h.id, h]));

  const commit = (list: string[]) =>
    mutate((d, c) => {
      list.forEach((id, i) => {
        const h = d.habits.find((x) => x.id === id);
        if (h && h.order !== i) Object.assign(h, { order: i, updatedAt: c.now });
      });
      d.habits.filter((h) => h.status !== 'active').forEach((h, i) => (h.order = list.length + i));
    });

  const onDown = (id: string) => (e: PointerEvent) => {
    const row = (e.currentTarget as HTMLElement).closest('.manage-row') as HTMLElement;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id, startY: e.clientY, from: ids.indexOf(id), height: row.offsetHeight + 8 };
    setOrder(ids);
    setOffset(0);
  };
  const onMove = (e: PointerEvent) => {
    const g = drag.current;
    if (!g) return;
    const dy = e.clientY - g.startY;
    const to = Math.max(0, Math.min(ids.length - 1, g.from + Math.round(dy / g.height)));
    const at = ids.indexOf(g.id);
    if (to !== at) {
      const next = ids.filter((x) => x !== g.id);
      next.splice(to, 0, g.id);
      setOrder(next);
    }
    setOffset(dy - (to - g.from) * g.height);
  };
  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setOffset(0);
    if (order) commit(order);
    setOrder(null);
  };
  const move = (id: string, by: number) => {
    const i = ids.indexOf(id);
    const j = i + by;
    if (j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };

  return (
    <div class="stack">
      {active.length > 1 && <p class="muted small">Drag the handle to reorder.</p>}
      <div class="manage-list">
        {ids.map((id) => {
          const h = byId.get(id);
          if (!h) return null;
          const dragging = drag.current?.id === id;
          return (
            <div class={`manage-row${dragging ? ' dragging' : ''}`} key={id} style={dragging ? { transform: `translateY(${offset}px)` } : undefined}>
              <span
                class="handle"
                role="button"
                tabIndex={0}
                aria-label={`Reorder ${h.name}. Use arrow keys.`}
                onPointerDown={onDown(id)}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') move(id, -1);
                  if (e.key === 'ArrowDown') move(id, 1);
                }}
              >
                ≡
              </span>
              <button class="manage-main" onClick={() => openHabitEditor(id)}>
                <span class="tile small" style={{ '--c': h.color }}>
                  {h.icon}
                </span>
                <span class="habit-text">
                  <span class="habit-name">{h.name}</span>
                  <span class="habit-sub">{describeFrequency(currentGoal(h).frequency)}</span>
                </span>
                <span class="chev">›</span>
              </button>
            </div>
          );
        })}
      </div>
      {rest.length > 0 && <div class="list-label">Paused and archived</div>}
      {rest.map((h) => (
        <div class="manage-row" key={h.id}>
          <button class="manage-main" onClick={() => openHabitEditor(h.id)}>
            <span class="tile small" style={{ '--c': h.color }}>
              {h.icon}
            </span>
            <span class="habit-text">
              <span class="habit-name">{h.name}</span>
              <span class="habit-sub">{h.status === 'paused' ? 'Paused' : 'Archived'}</span>
            </span>
          </button>
          <button class="chip" onClick={() => mutate((d, c) => Object.assign(d.habits.find((x) => x.id === h.id)!, { status: 'active', updatedAt: c.now }))}>
            Resume
          </button>
        </div>
      ))}
      <button class="btn primary" onClick={() => openHabitEditor(null)}>
        New habit
      </button>
    </div>
  );
}

