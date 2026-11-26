import { useState } from 'preact/hooks';
import { addDays, addMonths, formatDay, localDay, MONTH_LONG, monthEnd, monthStart, weekday, WEEKDAY_SHORT } from '../core/dates';
import { currentGoal, dayInfo, describeFrequency, goalOn, isScheduled, recordsOn, streak, type Index } from '../core/stats';
import type { Day, Habit } from '../core/types';
import { formatNumber } from '../core/units';
import { openHabitEditor } from './habitEditor';
import { NoteList } from './journal';
import { openSheet } from './sheet';
import { useData } from './store';

// One habit's page: its streaks, a month calendar to look back on, and its notes.

type CellKind = 'future' | 'off' | 'none' | 'min' | 'partial' | 'met' | 'exceeded';

function habitCell(habit: Habit, index: Index, day: Day, today: Day): CellKind {
  if (day > today) return 'future';
  const recs = recordsOn(index, habit.id, day);
  if (!recs.length) return isScheduled(habit, day) && habit.status === 'active' ? 'none' : 'off';
  return dayInfo(habit, recs, goalOn(habit, day)).status as CellKind;
}

const NAMES: Record<CellKind, string> = { future: '', off: 'not scheduled', none: 'nothing recorded', min: 'smallest unit', partial: 'partly done', met: 'done', exceeded: 'goal exceeded' };

function MonthGrid(props: { month: Day; today: Day; weekStart: number; cell: (day: Day) => { kind: CellKind; fraction: number } }) {
  const first = monthStart(props.month);
  const lead = (weekday(first) - props.weekStart + 7) % 7;
  const count = Number(monthEnd(first).slice(8));
  const cells: (Day | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, i) => addDays(first, i))];
  return (
    <div class="month">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={`h${i}`} class="month-head" aria-hidden="true">
          {WEEKDAY_SHORT[(props.weekStart + i) % 7].slice(0, 2)}
        </div>
      ))}
      {cells.map((day, i) => {
        if (!day) return <div key={`e${i}`} />;
        const c = props.cell(day);
        return (
          <div key={day} class={`day ${c.kind}${day === props.today ? ' today' : ''}`} style={{ '--f': `${Math.round(c.fraction * 100)}%` }} aria-label={`${formatDay(day)}${NAMES[c.kind] ? `, ${NAMES[c.kind]}` : ''}`} role="img">
            <span class="day-num">{Number(day.slice(8))}</span>
          </div>
        );
      })}
    </div>
  );
}

function Legend() {
  return (
    <div class="legend">
      <span>
        <i class="day met" /> Done
      </span>
      <span>
        <i class="day partial" style={{ '--f': '50%' }} /> Partly
      </span>
      <span>
        <i class="day none" /> Nothing recorded
      </span>
      <span>
        <i class="day off" /> Not scheduled
      </span>
    </div>
  );
}

function MonthNav(props: { month: Day; today: Day; onChange: (month: Day) => void }) {
  const [y, m] = props.month.split('-').map(Number);
  return (
    <div class="month-nav">
      <button class="icon-btn small" aria-label="Previous month" onClick={() => props.onChange(addMonths(props.month, -1))}>
        ‹
      </button>
      <strong>
        {MONTH_LONG[m - 1]} {y}
      </strong>
      <button class="icon-btn small" aria-label="Next month" disabled={addMonths(props.month, 1) > props.today} onClick={() => props.onChange(addMonths(props.month, 1))}>
        ›
      </button>
    </div>
  );
}

export function openHabitStats(habitId: string): void {
  openSheet('Stats', () => <HabitStats habitId={habitId} />, { tall: true });
}

function HabitStats(props: { habitId: string }) {
  const { data, index } = useData();
  const today = localDay();
  const ws = data.settings.weekStart;
  const [month, setMonth] = useState(monthStart(today));
  const habit = data.habits.find((h) => h.id === props.habitId);
  if (!habit) return <p class="muted">This habit no longer exists.</p>;

  const goal = currentGoal(habit);
  const targetField = goal.target ? habit.fields.find((f) => f.id === goal.target!.fieldId) : undefined;
  const run = streak(habit, index, today, ws);
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  const about = [describeFrequency(goal.frequency), goal.target && targetField ? `${formatNumber(goal.target.amount)} ${targetField.unit ?? targetField.name} a day` : '', habit.minimum?.label ? `smallest unit: ${habit.minimum.label}` : '', habit.status !== 'active' ? habit.status : ''].filter(Boolean);

  return (
    <div class="stack detail">
      <div class="name-row">
        <span class="dot big" style={{ background: habit.color }} />
        <div class="grow">
          <h2 class="detail-name">{habit.name}</h2>
          <div class="muted small">{about.join(' · ')}</div>
        </div>
        <button class="chip" onClick={() => openHabitEditor(habit.id)}>
          Edit
        </button>
      </div>

      <div class="stats">
        <div class="stat">
          <div class="stat-label">Current streak</div>
          <div class="stat-value">{plural(run.current, run.unit)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Longest streak</div>
          <div class="stat-value">{plural(run.longest, run.unit)}</div>
        </div>
      </div>

      <div class="card pad" style={{ '--c': habit.color }}>
        <MonthNav month={month} today={today} onChange={setMonth} />
        <MonthGrid
          month={month}
          today={today}
          weekStart={ws}
          cell={(day) => {
            const info = dayInfo(habit, recordsOn(index, habit.id, day), goalOn(habit, day));
            return { kind: habitCell(habit, index, day, today), fraction: info.target ? Math.min(1, info.amount / info.target) : 0.5 };
          }}
        />
        <Legend />
      </div>

      <div class="list-label">Notes</div>
      <NoteList habitId={habit.id} />
    </div>
  );
}
