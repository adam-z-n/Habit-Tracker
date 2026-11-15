import { useState } from 'preact/hooks';
import { formatDay } from '../core/dates';
import { deleteJournal, saveJournal } from '../core/ops';
import type { Day, JournalEntry } from '../core/types';
import { Field, MOODS, Segmented } from './common';
import { confirmSheet, openSheet } from './sheet';
import { clock, mutate, useData } from './store';

// Writing: general journal entries, and notes tied to one habit. Both are optional.

type Kind = JournalEntry['kind'];
type Show = 'all' | Kind;

export function EntryCard(props: { entry: JournalEntry; today: Day }) {
  const { data } = useData();
  const { entry } = props;
  const habits = entry.habitIds.map((id) => data.habits.find((h) => h.id === id)).filter((h) => !!h);
  const note = entry.kind === 'note';
  return (
    <button class="card journal-entry" onClick={() => openJournalEditor(entry, props.today)}>
      <span class="journal-head">
        <span class="muted small">{formatDay(entry.date, props.today.slice(0, 4))}</span>
        {note ? <span class="tag">{habits[0] ? `${habits[0].icon} ${habits[0].name}` : 'Habit note'}</span> : entry.mood !== null && <span aria-label={`Mood ${entry.mood} of 5`}>{MOODS[entry.mood - 1]}</span>}
      </span>
      <span class="journal-text">{entry.text}</span>
      {!note && habits.length > 0 && <span class="muted small">{habits.map((h) => `${h.icon} ${h.name}`).join('  ·  ')}</span>}
    </button>
  );
}

export function JournalScreen(props: { today: Day }) {
  const { data } = useData();
  const [query, setQuery] = useState('');
  const [show, setShow] = useState<Show>('all');
  const [habitId, setHabitId] = useState('');
  const [newest, setNewest] = useState(true);
  const habitName = new Map(data.habits.map((h) => [h.id, h.name.toLowerCase()]));
  const q = query.trim().toLowerCase();
  // Habits that have something written about them, for the filter.
  const linked = data.habits.filter((h) => data.journal.some((e) => e.habitIds.includes(h.id))).sort((a, b) => a.order - b.order);
  const entries = data.journal
    .filter((e) => show === 'all' || e.kind === show)
    .filter((e) => !habitId || e.habitIds.includes(habitId))
    .filter((e) => !q || e.text.toLowerCase().includes(q) || e.date.includes(q) || e.habitIds.some((id) => habitName.get(id)?.includes(q)))
    .sort((a, b) => (a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)) * (newest ? -1 : 1));
  const filtered = show !== 'all' || !!habitId || !!q;
  const wroteToday = data.journal.some((e) => e.date === props.today && e.kind === 'journal');
  return (
    <div class="screen">
      <header class="top">
        <h1>Journal</h1>
        <button class="chip on" onClick={() => openJournalEditor(null, props.today, show === 'note' ? { kind: 'note', habitId } : undefined)}>
          ＋ Write
        </button>
      </header>
      {data.journal.length > 0 && (
        <>
          <Segmented
            label="Show"
            value={show}
            onChange={setShow}
            options={[
              { value: 'all', label: 'All' },
              { value: 'journal', label: 'Journal' },
              { value: 'note', label: 'Habit notes' },
            ]}
          />
          <div class="row2">
            <select class="input" value={habitId} aria-label="Habit" onChange={(e) => setHabitId((e.target as HTMLSelectElement).value)}>
              <option value="">Any habit</option>
              {linked.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.icon} {h.name}
                </option>
              ))}
            </select>
            <select class="input" value={newest ? 'new' : 'old'} aria-label="Sort" onChange={(e) => setNewest((e.target as HTMLSelectElement).value === 'new')}>
              <option value="new">Newest first</option>
              <option value="old">Oldest first</option>
            </select>
          </div>
          <input class="input" type="search" placeholder="Search" value={query} aria-label="Search journal and notes" onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
        </>
      )}
      {!wroteToday && !filtered && (
        <button class="card prompt-card" onClick={() => openJournalEditor(null, props.today)}>
          <span class="muted small">{formatDay(props.today)}</span>
          <span>How did today go?</span>
        </button>
      )}
      {entries.map((entry) => (
        <EntryCard key={entry.id} entry={entry} today={props.today} />
      ))}
      {filtered && !entries.length && <p class="muted pad">Nothing matches.</p>}
      {!data.journal.length && <p class="muted pad">Writing here is optional. Keep a journal of your days, or jot a note about a habit.</p>}
    </div>
  );
}

export function openJournalEditor(entry: JournalEntry | null, today: Day, preset?: { kind: Kind; habitId?: string }): void {
  const title = entry ? (entry.kind === 'note' ? 'Edit note' : 'Edit entry') : 'Write';
  openSheet(title, (close) => <JournalEditor entry={entry} today={today} preset={preset} close={close} />, { tall: true });
}

function JournalEditor(props: { entry: JournalEntry | null; today: Day; preset?: { kind: Kind; habitId?: string }; close: () => void }) {
  const { data } = useData();
  const [kind, setKind] = useState<Kind>(props.entry?.kind ?? props.preset?.kind ?? 'journal');
  const [date, setDate] = useState(props.entry?.date ?? props.today);
  const [text, setText] = useState(props.entry?.text ?? '');
  const [mood, setMood] = useState<number | null>(props.entry?.mood ?? null);
  const [habitIds, setHabitIds] = useState<string[]>(props.entry?.habitIds ?? (props.preset?.habitId ? [props.preset.habitId] : []));
  const [error, setError] = useState('');
  const habits = data.habits.filter((h) => h.status !== 'archived' || habitIds.includes(h.id)).sort((a, b) => a.order - b.order);
  const note = kind === 'note';

  const pick = (id: string) => {
    // A note is about one habit; a journal entry can mention several.
    if (note) setHabitIds([id]);
    else setHabitIds(habitIds.includes(id) ? habitIds.filter((x) => x !== id) : [...habitIds, id]);
  };
  const save = () => {
    if (!text.trim() && (note || mood === null)) return setError('Write something first.');
    if (note && habitIds.length !== 1) return setError('Choose the habit this note is about.');
    mutate((d, c) => void saveJournal(d, { id: props.entry?.id, kind, date, text: text.trim(), mood: note ? null : mood, habitIds }, c));
    props.close();
  };

  return (
    <div class="stack">
      <Segmented
        label="What are you writing?"
        value={kind}
        onChange={(next) => {
          setKind(next);
          if (next === 'note') setHabitIds(habitIds.slice(0, 1));
        }}
        options={[
          { value: 'journal', label: 'Journal entry' },
          { value: 'note', label: 'Note on a habit' },
        ]}
      />
      {note &&
        (habits.length > 0 ? (
          <Field group label="Which habit?">
            <div class="chips">
              {habits.map((h) => (
                <button key={h.id} type="button" class={`chip${habitIds.includes(h.id) ? ' on' : ''}`} aria-pressed={habitIds.includes(h.id)} onClick={() => pick(h.id)}>
                  {h.icon} {h.name}
                </button>
              ))}
            </div>
          </Field>
        ) : (
          <p class="muted small">Create a habit first, then you can write notes about it.</p>
        ))}
      <Field label="Date">
        <input class="input" type="date" value={date} max={props.today} onInput={(e) => setDate((e.target as HTMLInputElement).value || date)} />
      </Field>
      {!note && (
        <div class="moods" role="group" aria-label="Mood">
          {MOODS.map((face, i) => (
            <button key={i} type="button" class={mood === i + 1 ? 'on' : ''} aria-pressed={mood === i + 1} aria-label={`Mood ${i + 1} of 5`} onClick={() => setMood(mood === i + 1 ? null : i + 1)}>
              {face}
            </button>
          ))}
        </div>
      )}
      <textarea class="input journal-input" rows={note ? 5 : 8} placeholder={note ? 'What do you want to remember about this habit?' : 'Write anything…'} value={text} aria-label={note ? 'Note text' : 'Journal text'} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
      {!note && habits.length > 0 && (
        <Field group label="About (optional)">
          <div class="chips">
            {habits.map((h) => (
              <button key={h.id} type="button" class={`chip${habitIds.includes(h.id) ? ' on' : ''}`} aria-pressed={habitIds.includes(h.id)} onClick={() => pick(h.id)}>
                {h.icon} {h.name}
              </button>
            ))}
          </div>
        </Field>
      )}
      {error && <p class="error">{error}</p>}
      <button class="btn primary" onClick={save}>
        Save
      </button>
      {props.entry && (
        <button
          class="btn danger-text"
          onClick={() =>
            confirmSheet(note ? 'Delete this note?' : 'Delete this journal entry?', 'This cannot be undone.', 'Delete', () => {
              mutate((d, c) => deleteJournal(d, props.entry!.id, c));
              props.close();
            })
          }
        >
          Delete
        </button>
      )}
    </div>
  );
}

/** What has been written about one habit, newest first, for the habit's own page. */
export function HabitWriting(props: { habitId: string }) {
  const { data } = useData();
  const today = clock().today;
  const entries = data.journal.filter((e) => e.habitIds.includes(props.habitId)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  return (
    <>
      <div class="list-label">Notes</div>
      {entries.slice(0, 5).map((entry) => (
        <EntryCard key={entry.id} entry={entry} today={today} />
      ))}
      {entries.length > 5 && <p class="muted small">{entries.length - 5} more in the Journal tab.</p>}
      <button class="btn" onClick={() => openJournalEditor(null, today, { kind: 'note', habitId: props.habitId })}>
        Add a note
      </button>
    </>
  );
}
