import { useRef, useState } from 'preact/hooks';
import { WEEKDAY_SHORT } from '../core/dates';
import { SOFT_COLORS } from '../core/importer';
import { createHabit, deleteHabit, makeMinimum, setGoal } from '../core/ops';
import { currentGoal, describeFrequency } from '../core/stats';
import type { Frequency, Habit, HabitStatus } from '../core/types';
import { ColorPicker, Segmented } from './common';
import { confirmSheet, openSheet } from './sheet';
import { mutate, useData } from './store';

// Creating and editing a habit: its name, color, how often, an optional smallest unit, and status.
// Older habits may also carry a daily amount, measurements, activity types and reminders; editing
// here leaves those as they are.

type Kind = Frequency['type'];
export type Template = 'exercise' | 'read' | 'meditate';

interface Draft {
  name: string;
  color: string;
  status: HabitStatus;
  kind: Kind;
  days: number[];
  times: number;
  every: number;
  minAmount: string;
  minUnit: string;
  todoListIds: string[];
}

const TEMPLATES: Record<Template, Partial<Draft>> = {
  exercise: { name: 'Exercise', color: '#f4b27a', kind: 'perWeek', times: 4, minAmount: '10', minUnit: 'minutes' },
  read: { name: 'Read', color: '#7eaee0', minAmount: '1', minUnit: 'page' },
  meditate: { name: 'Meditate', color: '#b39ae0', minAmount: '1', minUnit: 'minute' },
};

/** Splits an older free-text smallest unit such as "5 minutes" into its number and metric. */
function splitMinimum(minimum: Habit['minimum']): [string, string] {
  if (!minimum) return ['', ''];
  if (minimum.amount !== undefined || minimum.unit !== undefined) return [minimum.amount === undefined ? '' : String(minimum.amount), minimum.unit ?? ''];
  const m = /^(\d+(?:\.\d+)?)\s*(.*)$/.exec(minimum.label.trim());
  return m ? [m[1], m[2]] : ['', minimum.label.trim()];
}

function draftOf(habit: Habit | null, template?: Template): Draft {
  const f = habit ? currentGoal(habit).frequency : { type: 'daily' as const };
  const [minAmount, minUnit] = splitMinimum(habit?.minimum ?? null);
  const draft: Draft = {
    name: habit?.name ?? '',
    color: habit?.color ?? SOFT_COLORS[0],
    status: habit?.status ?? 'active',
    kind: f.type,
    days: f.type === 'weekdays' ? [...f.days] : [1, 2, 3, 4, 5],
    times: f.type === 'perWeek' || f.type === 'perMonth' ? f.times : 3,
    every: f.type === 'interval' ? f.every : 2,
    minAmount,
    minUnit,
    todoListIds: [...(habit?.todoListIds ?? [])],
  };
  return habit || !template ? draft : { ...draft, ...TEMPLATES[template] };
}

export function openHabitEditor(habitId: string | null, template?: Template): void {
  openSheet(habitId ? 'Edit habit' : 'New habit', (close) => <HabitEditor habitId={habitId} template={template} close={close} />, { tall: true });
}

function HabitEditor(props: { habitId: string | null; template?: Template; close: () => void }) {
  const { data } = useData();
  const habit = props.habitId ? data.habits.find((h) => h.id === props.habitId) ?? null : null;
  const [d, setD] = useState<Draft>(() => draftOf(habit, props.template));
  const [error, setError] = useState('');
  const set = (patch: Partial<Draft>) => setD((old) => ({ ...old, ...patch }));
  const lists = [...data.todoLists].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  const save = () => {
    const name = d.name.trim();
    if (!name) return setError('Give the habit a name.');
    if (d.kind === 'weekdays' && !d.days.length) return setError('Pick at least one day of the week.');
    const amount = d.minAmount.trim() === '' ? null : Number(d.minAmount);
    if (amount !== null && !(Number.isFinite(amount) && amount > 0)) return setError('The smallest unit should be a number above zero.');
    const frequency: Frequency =
      d.kind === 'weekdays' ? { type: 'weekdays', days: [...d.days].sort() } : d.kind === 'perWeek' || d.kind === 'perMonth' ? { type: d.kind, times: Math.max(1, Math.round(d.times) || 1) } : d.kind === 'interval' ? { type: 'interval', every: Math.max(1, Math.round(d.every) || 1) } : { type: 'daily' };
    const minimum = makeMinimum(amount, d.minUnit, habit?.minimum?.countsAsComplete ?? false);
    mutate((data, c) => {
      let h = props.habitId ? data.habits.find((x) => x.id === props.habitId) : undefined;
      // An older habit's daily amount is kept as it was.
      if (!h) h = createHabit(data, { name, color: d.color, frequency }, c);
      else setGoal(h, frequency, currentGoal(h).target, c);
      // Keep only lists that still exist.
      const todoListIds = d.todoListIds.filter((id) => data.todoLists.some((l) => l.id === id));
      Object.assign(h, { name, color: d.color, status: d.status, minimum, todoListIds, updatedAt: c.now });
    });
    props.close();
  };

  return (
    <div class="stack editor" style={{ '--c': d.color }}>
      <section class="ed-group">
        <label class="ed-label" for="habit-name">
          What would you like to do?
        </label>
        <input id="habit-name" class="input name" placeholder="Read, walk, stretch…" value={d.name} onInput={(e) => set({ name: (e.target as HTMLInputElement).value })} />
      </section>

      <section class="ed-group">
        <span class="ed-label">Color</span>
        <ColorPicker value={d.color} onChange={(color) => set({ color })} />
      </section>

      <section class="ed-group">
        <label class="ed-label" for="habit-often">
          How often?
        </label>
        <select id="habit-often" class="input" value={d.kind} onChange={(e) => set({ kind: (e.target as HTMLSelectElement).value as Kind })}>
          <option value="daily">Every day</option>
          <option value="weekdays">Specific days of the week</option>
          <option value="perWeek">A number of times per week</option>
          <option value="perMonth">A number of times per month</option>
          <option value="interval">Every few days</option>
        </select>
        {d.kind === 'weekdays' && (
          <div class="ed-days" role="group" aria-label="Days of the week">
            {WEEKDAY_SHORT.map((label, day) => (
              <button key={day} type="button" class={d.days.includes(day) ? 'on' : ''} aria-pressed={d.days.includes(day)} onClick={() => set({ days: d.days.includes(day) ? d.days.filter((x) => x !== day) : [...d.days, day] })}>
                {label.slice(0, 2)}
              </button>
            ))}
          </div>
        )}
        {(d.kind === 'perWeek' || d.kind === 'perMonth' || d.kind === 'interval') && (
          <div class="ed-inline">
            {d.kind === 'interval' && <span>Every</span>}
            <input
              class="input count"
              type="number"
              inputMode="numeric"
              min="1"
              max={d.kind === 'perWeek' ? 21 : d.kind === 'perMonth' ? 90 : undefined}
              aria-label={d.kind === 'interval' ? 'Every how many days' : d.kind === 'perWeek' ? 'Times per week' : 'Times per month'}
              value={d.kind === 'interval' ? d.every : d.times}
              onInput={(e) => {
                const n = Number((e.target as HTMLInputElement).value);
                set(d.kind === 'interval' ? { every: n } : { times: n });
              }}
            />
            <span>{d.kind === 'interval' ? 'days' : d.kind === 'perWeek' ? 'times a week' : 'times a month'}</span>
          </div>
        )}
        {habit && habit.goals.length > 1 && <p class="muted small">Changes apply from today. Earlier days keep the goal they had.</p>}
      </section>

      <section class="ed-group">
        <span class="ed-label" id="min-label">
          Smallest unit <span class="ed-optional">optional</span>
        </span>
        <div class="ed-inline" role="group" aria-labelledby="min-label">
          <input class="input count" type="number" inputMode="decimal" min="0" placeholder="1" aria-label="Smallest unit: number" value={d.minAmount} onInput={(e) => set({ minAmount: (e.target as HTMLInputElement).value })} />
          <input class="input" placeholder="page, minute, push-up…" aria-label="Smallest unit: what it counts" value={d.minUnit} onInput={(e) => set({ minUnit: (e.target as HTMLInputElement).value })} />
        </div>
        <p class="muted small">The least you can do on a hard day and still keep going.</p>
      </section>

      <section class="ed-group">
        <span class="ed-label" id="lists-label">
          To-do lists <span class="ed-optional">optional</span>
        </span>
        {lists.length ? (
          <>
            <div class="chips" role="group" aria-labelledby="lists-label">
              {lists.map((l) => {
                const on = d.todoListIds.includes(l.id);
                return (
                  <button key={l.id} type="button" class={`chip ed-list${on ? ' on' : ''}`} style={{ '--lc': l.color }} aria-pressed={on} onClick={() => set({ todoListIds: on ? d.todoListIds.filter((x) => x !== l.id) : [...d.todoListIds, l.id] })}>
                    <span class="dot" style={{ background: l.color }} />
                    {l.name}
                  </button>
                );
              })}
            </div>
            <p class="muted small">Ticking off something on a chosen list marks this habit done for that day. Unticking it takes the mark back.</p>
          </>
        ) : (
          <p class="muted small">Make a to-do list first, then you can choose it here: ticking off something on it will mark this habit done for that day.</p>
        )}
      </section>

      {habit && (
        <section class="ed-group">
          <span class="ed-label">Status</span>
          <Segmented
            label="Status"
            value={d.status}
            onChange={(status) => set({ status })}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'paused', label: 'Paused' },
              { value: 'archived', label: 'Archived' },
            ]}
          />
        </section>
      )}

      {error && <p class="error">{error}</p>}
      <button class="btn ed-save" onClick={save}>
        {habit ? 'Save changes' : 'Create habit'}
      </button>
      {habit && (
        <button
          class="btn danger-text"
          onClick={() =>
            confirmSheet(`Delete ${habit.name}?`, 'This deletes the habit and all of its history. To keep the history, set it to Archived instead.', 'Delete habit and history', () => {
              mutate((data, c) => deleteHabit(data, habit.id, c));
              props.close();
            })
          }
        >
          Delete habit
        </button>
      )}
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
                <span class="dot big" style={{ background: h.color }} />
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
            <span class="dot big" style={{ background: h.color }} />
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

