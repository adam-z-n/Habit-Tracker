import { useState } from 'preact/hooks';
import { formatDay } from '../core/dates';
import { deleteJournal, saveJournal } from '../core/ops';
import type { Day, JournalEntry } from '../core/types';
import { Field, MOODS } from './common';
import { confirmSheet, openSheet } from './sheet';
import { mutate, useData } from './store';

// An optional daily journal: free text, a mood, and links to habits.

export function JournalScreen(props: { today: Day }) {
  const { data } = useData();
  const [query, setQuery] = useState('');
  const habitName = new Map(data.habits.map((h) => [h.id, `${h.icon} ${h.name}`]));
  const q = query.trim().toLowerCase();
  const entries = [...data.journal]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .filter((e) => !q || e.text.toLowerCase().includes(q) || e.date.includes(q) || e.habitIds.some((id) => habitName.get(id)?.toLowerCase().includes(q)));
  const wroteToday = data.journal.some((e) => e.date === props.today);
  return (
    <div class="screen">
      <header class="top">
        <h1>Journal</h1>
        <button class="chip on" onClick={() => openJournalEditor(null, props.today)}>
          ＋ Write
        </button>
      </header>
      {data.journal.length > 3 && <input class="input" type="search" placeholder="Search entries" value={query} aria-label="Search journal" onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />}
      {!wroteToday && !q && (
        <button class="card prompt-card" onClick={() => openJournalEditor(null, props.today)}>
          <span class="muted small">{formatDay(props.today)}</span>
          <span>How did today go?</span>
        </button>
      )}
      {entries.map((entry) => (
        <button key={entry.id} class="card journal-entry" onClick={() => openJournalEditor(entry, props.today)}>
          <span class="journal-head">
            <span class="muted small">{formatDay(entry.date, props.today.slice(0, 4))}</span>
            {entry.mood !== null && <span aria-label={`Mood ${entry.mood} of 5`}>{MOODS[entry.mood - 1]}</span>}
          </span>
          <span class="journal-text">{entry.text}</span>
          {entry.habitIds.length > 0 && <span class="muted small">{entry.habitIds.map((id) => habitName.get(id)).filter(Boolean).join('  ·  ')}</span>}
        </button>
      ))}
      {q && !entries.length && <p class="muted pad">No entries match.</p>}
      {!data.journal.length && <p class="muted pad">Writing here is optional. A line or two about the day is plenty.</p>}
    </div>
  );
}

function openJournalEditor(entry: JournalEntry | null, today: Day): void {
  openSheet(entry ? 'Edit entry' : 'New entry', (close) => <JournalEditor entry={entry} today={today} close={close} />, { tall: true });
}

function JournalEditor(props: { entry: JournalEntry | null; today: Day; close: () => void }) {
  const { data } = useData();
  const [date, setDate] = useState(props.entry?.date ?? props.today);
  const [text, setText] = useState(props.entry?.text ?? '');
  const [mood, setMood] = useState<number | null>(props.entry?.mood ?? null);
  const [habitIds, setHabitIds] = useState<string[]>(props.entry?.habitIds ?? []);
  const habits = data.habits.filter((h) => h.status !== 'archived' || habitIds.includes(h.id)).sort((a, b) => a.order - b.order);
  return (
    <div class="stack">
      <Field label="Date">
        <input class="input" type="date" value={date} max={props.today} onInput={(e) => setDate((e.target as HTMLInputElement).value || date)} />
      </Field>
      <div class="moods" role="group" aria-label="Mood">
        {MOODS.map((face, i) => (
          <button key={i} type="button" class={mood === i + 1 ? 'on' : ''} aria-pressed={mood === i + 1} aria-label={`Mood ${i + 1} of 5`} onClick={() => setMood(mood === i + 1 ? null : i + 1)}>
            {face}
          </button>
        ))}
      </div>
      <textarea class="input journal-input" rows={8} placeholder="Write anything…" value={text} aria-label="Journal text" onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
      {habits.length > 0 && (
        <Field group label="About (optional)">
          <div class="chips">
            {habits.map((h) => (
              <button key={h.id} type="button" class={`chip${habitIds.includes(h.id) ? ' on' : ''}`} aria-pressed={habitIds.includes(h.id)} onClick={() => setHabitIds(habitIds.includes(h.id) ? habitIds.filter((x) => x !== h.id) : [...habitIds, h.id])}>
                {h.icon} {h.name}
              </button>
            ))}
          </div>
        </Field>
      )}
      <button
        class="btn primary"
        disabled={!text.trim() && mood === null}
        onClick={() => {
          mutate((d, c) => void saveJournal(d, { id: props.entry?.id, date, text: text.trim(), mood, habitIds }, c));
          props.close();
        }}
      >
        Save
      </button>
      {props.entry && (
        <button
          class="btn danger-text"
          onClick={() =>
            confirmSheet('Delete this journal entry?', 'This cannot be undone.', 'Delete entry', () => {
              mutate((d, c) => deleteJournal(d, props.entry!.id, c));
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
