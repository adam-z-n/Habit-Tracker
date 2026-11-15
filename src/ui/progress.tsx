import { useState } from 'preact/hooks';
import { breakdown, formatMetric, metricsFor, series, SESSIONS, sliceMeta } from '../core/breakdown';
import { addDays, addMonths, diffDays, formatDay, localDay, MONTH_LONG, monthEnd, monthStart, weekday, weekStart, WEEKDAY_SHORT } from '../core/dates';
import { PERIOD_LABELS, resolvePeriod, type Period, type PeriodKey } from '../core/periods';
import { currentGoal, dayInfo, daySummary, describeFrequency, goalOn, habitStart, isScheduled, percent, rate, recordsBetween, recordsOn, streak, totals, type Rate } from '../core/stats';
import type { AppData, Day, Habit } from '../core/types';
import { formatNumber } from '../core/units';
import { Donut, RateBars, StackedBars } from './charts';
import { Segmented } from './common';
import { openHabitEditor } from './habitEditor';
import { openSheet } from './sheet';
import { useData } from './store';
import { DayList, RecordRow } from './today';

function earliestDay(data: AppData, today: Day): Day {
  let first = today;
  for (const h of data.habits) if (h.startDate < first) first = h.startDate;
  for (const r of data.records) if (r.date < first) first = r.date;
  return first;
}

function PeriodPicker(props: { value: PeriodKey; custom: { from: Day; to: Day }; onChange: (key: PeriodKey) => void; onCustom: (range: { from: Day; to: Day }) => void; period: Period; today: Day }) {
  return (
    <div class="stack tight">
      <div class="period-row">
        <select class="input" value={props.value} aria-label="Reporting period" onChange={(e) => props.onChange((e.target as HTMLSelectElement).value as PeriodKey)}>
          {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((key) => (
            <option key={key} value={key}>
              {PERIOD_LABELS[key]}
            </option>
          ))}
        </select>
        <span class="muted small">
          {formatDay(props.period.from, props.today.slice(0, 4)).slice(5)} – {formatDay(props.period.to, props.today.slice(0, 4)).slice(5)}
        </span>
      </div>
      {props.value === 'custom' && (
        <div class="row2">
          <input class="input" type="date" aria-label="From" value={props.custom.from} onInput={(e) => props.onCustom({ ...props.custom, from: (e.target as HTMLInputElement).value || props.custom.from })} />
          <input class="input" type="date" aria-label="To" value={props.custom.to} onInput={(e) => props.onCustom({ ...props.custom, to: (e.target as HTMLInputElement).value || props.custom.to })} />
        </div>
      )}
    </div>
  );
}

function usePeriod(today: Day, initial: PeriodKey) {
  const { data } = useData();
  const [key, setKey] = useState<PeriodKey>(initial);
  const [custom, setCustom] = useState({ from: addDays(today, -29), to: today });
  const period = resolvePeriod(key, today, data.settings.weekStart, earliestDay(data, today), custom);
  const picker = <PeriodPicker value={key} custom={custom} onChange={setKey} onCustom={setCustom} period={period} today={today} />;
  return { period, picker };
}

function Delta(props: { now: number | null; before: number | null; unit: string; label: string }) {
  if (props.now === null || props.before === null) return null;
  const diff = props.now - props.before;
  if (diff === 0) return <span class="delta">Same as {props.label}</span>;
  return (
    <span class={`delta ${diff > 0 ? 'up' : 'down'}`}>
      {diff > 0 ? '▲' : '▼'} {formatNumber(Math.abs(diff))}
      {props.unit} vs {props.label}
    </span>
  );
}

function Tile(props: { label: string; value: string; note?: preact.ComponentChildren }) {
  return (
    <div class="stat">
      <div class="stat-label">{props.label}</div>
      <div class="stat-value">{props.value}</div>
      {props.note && <div class="stat-note">{props.note}</div>}
    </div>
  );
}

const sumRate = (list: Rate[]): Rate => list.reduce((a, b) => ({ done: a.done + b.done, due: a.due + b.due }), { done: 0, due: 0 });

export function ProgressScreen(props: { today: Day }) {
  const [tab, setTab] = useState<'overview' | 'calendar'>('overview');
  return (
    <div class="screen">
      <header class="top">
        <h1>Progress</h1>
      </header>
      <Segmented
        label="View"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'calendar', label: 'Calendar' },
        ]}
      />
      {tab === 'overview' ? <Overview today={props.today} /> : <CalendarView today={props.today} />}
    </div>
  );
}

function Overview(props: { today: Day }) {
  const { data, index } = useData();
  const { today } = props;
  const ws = data.settings.weekStart;
  const { period, picker } = usePeriod(today, 'week');
  const habits = data.habits.filter((h) => h.status !== 'archived').sort((a, b) => a.order - b.order);
  if (!data.habits.length) return <p class="muted pad">Your progress will show here once you have a habit.</p>;

  const measure = (from: Day, to: Day) => {
    const r = sumRate(habits.map((h) => rate(h, index, from, to, today, ws)));
    const t = habits.map((h) => totals(h, index, from, to));
    return { rate: percent(r), completions: t.reduce((n, x) => n + x.completions, 0), sessions: t.reduce((n, x) => n + x.sessions, 0) };
  };
  const now = measure(period.from, period.to);
  const before = period.previous ? measure(period.previous.from, period.previous.to) : null;
  const label = period.previous?.label ?? '';
  const todaySummary = daySummary(data, index, today);
  const week = percent(sumRate(habits.map((h) => rate(h, index, weekStart(today, ws), today, today, ws))));
  const month = percent(sumRate(habits.map((h) => rate(h, index, monthStart(today), today, today, ws))));
  const streaks = habits.map((h) => ({ habit: h, s: streak(h, index, today, ws) }));
  const best = [...streaks].sort((a, b) => b.s.current - a.s.current)[0];
  const longest = [...streaks].sort((a, b) => b.s.longest - a.s.longest)[0];
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

  return (
    <div class="stack">
      <div class="stats">
        <Tile label="Today" value={`${todaySummary.done}/${todaySummary.due}`} note={todaySummary.due ? `${Math.round((todaySummary.done / todaySummary.due) * 100)}% of today's habits` : 'Nothing due today'} />
        <Tile label="This week" value={week === null ? '–' : `${week}%`} note="of what was due" />
        <Tile label="This month" value={month === null ? '–' : `${month}%`} note="of what was due" />
        <Tile label="Best current streak" value={best && best.s.current ? plural(best.s.current, best.s.unit) : '–'} note={best && best.s.current ? best.habit.name : 'No streak yet'} />
      </div>

      {picker}
      <div class="stats">
        <Tile label="Completion rate" value={now.rate === null ? '–' : `${now.rate}%`} note={<Delta now={now.rate} before={before?.rate ?? null} unit=" pts" label={label} />} />
        <Tile label="Completions" value={String(now.completions)} note={<Delta now={now.completions} before={before?.completions ?? null} unit="" label={label} />} />
        <Tile label="Activity sessions" value={String(now.sessions)} note={<Delta now={now.sessions} before={before?.sessions ?? null} unit="" label={label} />} />
        <Tile label="Longest streak ever" value={longest && longest.s.longest ? plural(longest.s.longest, longest.s.unit) : '–'} note={longest && longest.s.longest ? longest.habit.name : ''} />
      </div>

      <div class="list-label">Habits</div>
      <div class="card list">
        {habits.map((h) => {
          const r = rate(h, index, period.from, period.to, today, ws);
          const p = percent(r);
          const t = totals(h, index, period.from, period.to);
          return (
            <button key={h.id} class="progress-row" onClick={() => openHabitDetail(h.id)}>
              <span class="tile small" style={{ '--c': h.color }}>
                {h.icon}
              </span>
              <span class="progress-text">
                <span class="habit-name">{h.name}</span>
                <span class="meter" style={{ '--c': h.color }}>
                  <span style={{ width: `${p ?? 0}%` }} />
                </span>
                <span class="habit-sub">
                  {p === null ? (t.sessions ? 'In progress' : 'Nothing due yet') : `${formatNumber(r.done)} of ${formatNumber(r.due)} · ${p}%`} · {plural(t.sessions, 'session')}
                </span>
              </span>
              <span class="chev">›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---- Calendar ----

type CellKind = 'future' | 'off' | 'none' | 'min' | 'partial' | 'met' | 'exceeded';

function habitCell(habit: Habit, index: ReturnType<typeof useData>['index'], day: Day, today: Day): CellKind {
  if (day > today) return 'future';
  const recs = recordsOn(index, habit.id, day);
  if (!recs.length) return isScheduled(habit, day) && habit.status === 'active' ? 'none' : 'off';
  return dayInfo(habit, recs, goalOn(habit, day)).status as CellKind;
}

function MonthGrid(props: { month: Day; today: Day; weekStart: number; cell: (day: Day) => { kind: CellKind; fraction?: number; dots?: string[]; color?: string }; onPick: (day: Day) => void }) {
  const first = monthStart(props.month);
  const lead = (weekday(first) - props.weekStart + 7) % 7;
  const count = Number(monthEnd(first).slice(8));
  const cells: (Day | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, i) => addDays(first, i))];
  return (
    <div class="month">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={`h${i}`} class="month-head">
          {WEEKDAY_SHORT[(props.weekStart + i) % 7].slice(0, 2)}
        </div>
      ))}
      {cells.map((day, i) => {
        if (!day) return <div key={`e${i}`} />;
        const c = props.cell(day);
        const names: Record<CellKind, string> = { future: '', off: 'not scheduled', none: 'nothing recorded', min: 'smallest unit', partial: 'partly done', met: 'done', exceeded: 'goal exceeded' };
        return (
          <button key={day} class={`day ${c.kind}${day === props.today ? ' today' : ''}`} style={{ '--c': c.color ?? 'var(--accent)', '--f': `${Math.round((c.fraction ?? 0) * 100)}%` }} disabled={c.kind === 'future'} onClick={() => props.onPick(day)} aria-label={`${formatDay(day)}${names[c.kind] ? `, ${names[c.kind]}` : ''}`}>
            <span class="day-num">{Number(day.slice(8))}</span>
            {c.dots && c.dots.length > 0 && (
              <span class="day-dots">
                {c.dots.slice(0, 3).map((color, n) => (
                  <i key={n} style={{ background: color }} />
                ))}
              </span>
            )}
          </button>
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

function openDay(day: Day, today: Day, only?: (habit: Habit) => boolean): void {
  openSheet(formatDay(day, today.slice(0, 4)), () => <DayList date={day} today={today} only={only} />, { tall: true });
}

function CalendarView(props: { today: Day }) {
  const { data, index } = useData();
  const [month, setMonth] = useState(monthStart(props.today));
  const [filter, setFilter] = useState('all');
  const habits = data.habits.filter((h) => h.status !== 'archived').sort((a, b) => a.order - b.order);
  const categories = [...new Set(habits.map((h) => h.category).filter(Boolean))].sort();
  const single = filter.startsWith('h:') ? habits.find((h) => h.id === filter.slice(2)) : undefined;
  const only = single ? (h: Habit) => h.id === single.id : filter.startsWith('c:') ? (h: Habit) => h.category === filter.slice(2) : undefined;
  const group = only ? habits.filter(only) : habits;
  const meta = single ? sliceMeta(single, data.activityTypes) : null;

  const cell = (day: Day) => {
    if (single) {
      const recs = recordsOn(index, single.id, day);
      const info = dayInfo(single, recs, goalOn(single, day));
      const dots = [...new Set(recs.map((r) => r.activityTypeId).filter(Boolean))].map((id) => meta!.get(id!)?.color ?? '#a3a8ad');
      return { kind: habitCell(single, index, day, props.today), color: single.color, fraction: info.target ? Math.min(1, info.amount / info.target) : 0.5, dots };
    }
    if (day > props.today) return { kind: 'future' as CellKind };
    let due = 0;
    let done = 0;
    let any = false;
    for (const h of group) {
      const kind = habitCell(h, index, day, props.today);
      if (kind === 'off') continue;
      due++;
      if (kind !== 'none') any = true;
      if (kind === 'met' || kind === 'exceeded') done++;
    }
    if (!due) return { kind: 'off' as CellKind };
    const kind: CellKind = done === due ? 'met' : any ? 'partial' : 'none';
    return { kind, fraction: done / due || 0.15 };
  };

  return (
    <div class="stack">
      <select class="input" value={filter} aria-label="Show" onChange={(e) => setFilter((e.target as HTMLSelectElement).value)}>
        <option value="all">All habits</option>
        {categories.length > 0 && (
          <optgroup label="Categories">
            {categories.map((c) => (
              <option key={c} value={`c:${c}`}>
                {c}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="Habits">
          {habits.map((h) => (
            <option key={h.id} value={`h:${h.id}`}>
              {h.icon} {h.name}
            </option>
          ))}
        </optgroup>
      </select>
      <div class="card pad">
        <MonthNav month={month} today={props.today} onChange={setMonth} />
        <MonthGrid month={month} today={props.today} weekStart={data.settings.weekStart} cell={cell} onPick={(day) => openDay(day, props.today, only)} />
        <Legend />
      </div>
      <p class="muted small">Tap a day to see what was recorded, change it, or add something you forgot.</p>
    </div>
  );
}

// ---- One habit ----

export function openHabitDetail(habitId: string): void {
  openSheet('Habit', () => <HabitDetail habitId={habitId} />, { tall: true });
}

function HabitDetail(props: { habitId: string }) {
  const { data, index } = useData();
  const todayDay = localDay();
  const ws = data.settings.weekStart;
  const { period, picker } = usePeriod(todayDay, 'month');
  const [month, setMonth] = useState(monthStart(todayDay));
  const [metricKey, setMetricKey] = useState('sessions');
  const [shown, setShown] = useState(10);
  const habit = data.habits.find((h) => h.id === props.habitId);
  if (!habit) return <p class="muted">This habit no longer exists.</p>;

  const goal = currentGoal(habit);
  const targetField = goal.target ? habit.fields.find((f) => f.id === goal.target!.fieldId) : undefined;
  const run = streak(habit, index, todayDay, ws);
  const r = rate(habit, index, period.from, period.to, todayDay, ws);
  const t = totals(habit, index, period.from, period.to);
  const prev = period.previous;
  const prevRate = prev ? percent(rate(habit, index, prev.from, prev.to, todayDay, ws)) : null;
  const prevTotals = prev ? totals(habit, index, prev.from, prev.to) : null;
  const recs = recordsBetween(index, habit.id, period.from, period.to);
  const metrics = metricsFor(habit, recs, data.settings);
  const metric = metrics.find((m) => m.key === metricKey) ?? SESSIONS;
  const slices = breakdown(habit, data.activityTypes, recs, metric);
  const total = slices.reduce((n, s) => n + s.value, 0);
  const prevSlices = prev ? breakdown(habit, data.activityTypes, recordsBetween(index, habit.id, prev.from, prev.to), metric) : [];
  const prevTotal = prevSlices.reduce((n, s) => n + s.value, 0);
  const meta = sliceMeta(habit, data.activityTypes);
  const colors = new Map([...meta].map(([id, m]) => [id, m.color]));
  const end = period.to < todayDay ? period.to : todayDay;
  const start = period.from > habitStart(habit, index) ? period.from : habitStart(habit, index);
  const by: 'week' | 'month' = diffDays(start, end) > 120 ? 'month' : 'week';
  const buckets = start <= end ? series(habit, recs, metric, start, end, by, ws) : [];
  const trend = buckets.map((b) => ({ label: b.label, value: percent(rate(habit, index, b.from < start ? start : b.from, b.to, todayDay, ws)) }));
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  const history = [...recs].reverse();

  return (
    <div class="stack detail">
      <div class="name-row">
        <span class="tile big" style={{ '--c': habit.color }}>
          {habit.icon}
        </span>
        <div class="grow">
          <h2 class="detail-name">{habit.name}</h2>
          <div class="muted small">
            {describeFrequency(goal.frequency)}
            {goal.target && targetField ? ` · ${formatNumber(goal.target.amount)} ${targetField.unit ?? targetField.name} a day` : ''}
            {habit.status !== 'active' ? ` · ${habit.status}` : ''}
          </div>
        </div>
        <button class="chip" onClick={() => openHabitEditor(habit.id)}>
          Edit
        </button>
      </div>

      <div class="stats">
        <Tile label="Current streak" value={plural(run.current, run.unit)} />
        <Tile label="Longest streak" value={plural(run.longest, run.unit)} />
      </div>

      {picker}
      <div class="stats">
        <Tile label="Completion rate" value={percent(r) === null ? '–' : `${percent(r)}%`} note={<Delta now={percent(r)} before={prevRate} unit=" pts" label={prev?.label ?? ''} />} />
        <Tile label="Completions" value={String(t.completions)} note={<Delta now={t.completions} before={prevTotals?.completions ?? null} unit="" label={prev?.label ?? ''} />} />
        <Tile label="Sessions" value={String(t.sessions)} note={<Delta now={t.sessions} before={prevTotals?.sessions ?? null} unit="" label={prev?.label ?? ''} />} />
        <Tile label="Active days" value={String(t.activeDays)} />
      </div>

      <div class="card pad">
        <h3>Calendar</h3>
        <MonthNav month={month} today={todayDay} onChange={setMonth} />
        <MonthGrid
          month={month}
          today={todayDay}
          weekStart={ws}
          cell={(day) => {
            const dayRecs = recordsOn(index, habit.id, day);
            const info = dayInfo(habit, dayRecs, goalOn(habit, day));
            const dots = [...new Set(dayRecs.map((x) => x.activityTypeId).filter(Boolean))].map((id) => meta.get(id!)?.color ?? '#a3a8ad');
            return { kind: habitCell(habit, index, day, todayDay), color: habit.color, fraction: info.target ? Math.min(1, info.amount / info.target) : 0.5, dots };
          }}
          onPick={(day) => openDay(day, todayDay, (h) => h.id === habit.id)}
        />
        <Legend />
      </div>

      {recs.length > 0 ? (
        <>
          <div class="card pad">
            <h3>How you did it</h3>
            {metrics.length > 1 && (
              <div class="chips" role="group" aria-label="Compare by">
                {metrics.map((m) => (
                  <button key={m.key} class={`chip${m.key === metric.key ? ' on' : ''}`} aria-pressed={m.key === metric.key} onClick={() => setMetricKey(m.key)}>
                    {m.label}
                  </button>
                ))}
              </div>
            )}
            {slices.length > 0 ? (
              <div class="donut-row">
                <Donut slices={slices} center={formatMetric(total, metric)} caption={metric.label.toLowerCase()} />
                <ul class="legend-list">
                  {slices.map((s) => (
                    <li key={s.id}>
                      <span class="swatch-dot" style={{ background: s.color }} />
                      <span class="grow">{s.name}</span>
                      <strong>{formatMetric(s.value, metric)}</strong>
                      <span class="muted small pct">{Math.round((s.value / total) * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p class="muted">Nothing measured this way in this period.</p>
            )}
            {metric.key !== 'sessions' && slices.length > 0 && <p class="muted small">Only entries with a {metric.label.toLowerCase()} are included.</p>}
            {prev && (
              <p class="muted small">
                {formatMetric(total, metric)} in this period, {formatMetric(prevTotal, metric)} in the {prev.label}.
              </p>
            )}
          </div>

          {buckets.length > 1 && (
            <div class="card pad">
              <h3>
                {metric.label} by {by}
              </h3>
              <StackedBars buckets={buckets} colors={colors} format={(v) => formatMetric(v, metric)} label={`${metric.label} by ${by}`} />
            </div>
          )}
        </>
      ) : (
        <p class="muted">Nothing recorded in this period.</p>
      )}

      {trend.length > 1 && trend.some((p) => p.value !== null) && (
        <div class="card pad">
          <h3>Goal reached, by {by}</h3>
          <RateBars points={trend} label={`Share of the goal reached by ${by}`} />
        </div>
      )}

      {history.length > 0 && (
        <>
          <div class="list-label">Entries</div>
          <ul class="entries card">
            {history.slice(0, shown).map((rec) => (
              <RecordRow key={rec.id} habit={habit} rec={rec} showDate />
            ))}
          </ul>
          {history.length > shown && (
            <button class="btn" onClick={() => setShown(shown + 30)}>
              Show more
            </button>
          )}
        </>
      )}
    </div>
  );
}
