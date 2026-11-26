import { useEffect, useRef, useState } from 'preact/hooks';
import { deleteJournal, saveJournal } from '../core/ops';
import type { Day, Habit, JournalEntry } from '../core/types';
import { Icon, longDay, PLUS, TitleMenu, type MenuItem } from './common';
import { confirmSheet, openSheet } from './sheet';
import { clock, mutate, useData } from './store';

// Writing: the general journal, and notes on each habit. The screen shows one of them at a time.

type Kind = JournalEntry['kind'];
/** 'journal', or the id of the habit whose notes are shown. */
type Category = string;

// Kept while the app is open, so coming back to the tab shows the same place.
let lastCategory: Category = 'journal';

const newestFirst = (a: JournalEntry, b: JournalEntry) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);

function entriesFor(journal: JournalEntry[], category: Category): JournalEntry[] {
  return journal.filter((e) => (category === 'journal' ? e.kind === 'journal' : e.kind === 'note' && e.habitIds.includes(category))).sort(newestFirst);
}

function EntryRow(props: { entry: JournalEntry; today: Day }) {
  const { entry } = props;
  return (
    <li>
      <button class="jrow" onClick={() => openJournalEditor(entry, props.today)}>
        <span class="jdate">{longDay(entry.date, props.today)}</span>
        {entry.text && <span class="jtext">{entry.text}</span>}
      </button>
    </li>
  );
}

export function JournalScreen(props: { today: Day }) {
  const { data } = useData();
  const habits = data.habits
    .filter((h) => h.status !== 'archived' || data.journal.some((e) => e.kind === 'note' && e.habitIds.includes(h.id)))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const [category, setCategoryState] = useState<Category>(lastCategory);
  const setCategory = (next: Category) => {
    lastCategory = next;
    setCategoryState(next);
  };
  const habit: Habit | undefined = category === 'journal' ? undefined : habits.find((h) => h.id === category);
  const current = habit ? habit.id : 'journal';
  const entries = entriesFor(data.journal, current);
  const items: MenuItem[] = [
    { key: 'journal', label: 'Journal', on: current === 'journal', run: () => setCategory('journal') },
    ...habits.map((h, i) => ({ key: h.id, label: h.name, color: h.color, on: current === h.id, divider: i === 0, run: () => setCategory(h.id) })),
  ];
  return (
    <div class="screen calm">
      <header class="calm-top">
        <TitleMenu title={habit ? habit.name : 'Journal'} color={habit?.color} items={items} label="Choose the journal or a habit" />
        <button class="plain-btn" aria-label={habit ? `New note on ${habit.name}` : 'New journal entry'} onClick={() => openJournalEditor(null, props.today, habit ? { kind: 'note', habitId: habit.id } : { kind: 'journal' })}>
          <Icon d={PLUS} size={26} />
        </button>
      </header>
      {entries.length > 0 ? (
        <ul class="jlist">
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} today={props.today} />
          ))}
        </ul>
      ) : (
        <p class="calm-empty">{habit ? `No notes on ${habit.name} yet.` : 'Nothing written yet.'}</p>
      )}
    </div>
  );
}

export function openJournalEditor(entry: JournalEntry | null, today: Day, preset?: { kind: Kind; habitId?: string }): void {
  openSheet(entry ? 'Journal entry' : 'New journal entry', (close) => <WritePage entry={entry} today={today} preset={preset} close={close} />, { page: true });
}

/** The writing page: the date, Cancel and Save, and the page itself. */
function WritePage(props: { entry: JournalEntry | null; today: Day; preset?: { kind: Kind; habitId?: string }; close: () => void }) {
  const { data } = useData();
  const { entry } = props;
  const kind: Kind = entry?.kind ?? props.preset?.kind ?? 'journal';
  const habitIds = entry?.habitIds ?? (props.preset?.habitId ? [props.preset.habitId] : []);
  const habit = kind === 'note' ? data.habits.find((h) => h.id === habitIds[0]) : undefined;
  const [date, setDate] = useState(entry?.date ?? props.today);
  const [text, setText] = useState(entry?.text ?? '');
  const area = useRef<HTMLTextAreaElement>(null);
  const dirty = text !== (entry?.text ?? '') || date !== (entry?.date ?? props.today);

  useEffect(() => {
    if (!entry) area.current?.focus();
  }, []);

  const cancel = () => {
    if (!dirty) return props.close();
    confirmSheet('Discard this writing?', entry ? 'Your changes will not be saved.' : 'What you wrote will not be saved.', 'Discard', props.close);
  };
  const save = () => {
    if (!text.trim()) return;
    mutate((d, c) => void saveJournal(d, { id: entry?.id, kind, date, text: text.trim(), mood: entry?.mood ?? null, habitIds }, c));
    props.close();
  };

  return (
    <div class="write">
      <header class="write-head">
        <label class="write-date">
          {habit && <span class="dot" style={{ background: habit.color }} aria-label={`Note on ${habit.name}`} />}
          <span>{longDay(date, props.today)}</span>
          <input type="date" value={date} max={clock().today} aria-label="Date" onInput={(e) => setDate((e.target as HTMLInputElement).value || date)} />
        </label>
        <div class="write-actions">
          <button class="text-btn" onClick={cancel}>
            Cancel
          </button>
          <button class="text-btn strong" disabled={!text.trim() || (!!entry && !dirty)} onClick={save}>
            Save
          </button>
        </div>
      </header>
      <textarea ref={area} class="write-text" value={text} aria-label={habit ? `Note on ${habit.name}` : 'Journal entry'} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
      {entry && (
        <button
          class="text-btn danger write-delete"
          onClick={() =>
            confirmSheet('Delete this entry?', 'This cannot be undone.', 'Delete', () => {
              mutate((d, c) => deleteJournal(d, entry.id, c));
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

/** Notes on one habit, newest first, for the habit's stats page. */
export function NoteList(props: { habitId: string }) {
  const { data } = useData();
  const today = clock().today;
  const notes = entriesFor(data.journal, props.habitId);
  return (
    <>
      {notes.length > 0 && (
        <ul class="jlist card">
          {notes.slice(0, 5).map((entry) => (
            <EntryRow key={entry.id} entry={entry} today={today} />
          ))}
        </ul>
      )}
      {notes.length > 5 && <p class="muted small">{notes.length - 5} more in the Journal tab.</p>}
      <button class="btn" onClick={() => openJournalEditor(null, today, { kind: 'note', habitId: props.habitId })}>
        Add a note
      </button>
    </>
  );
}
