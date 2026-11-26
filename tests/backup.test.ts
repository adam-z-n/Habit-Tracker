import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT_VERSION, makeBackup, tables, toCsv } from '../src/core/exporter';
import { checkBackup, mergeData, migrate, OLD_COLORS, SOFT_COLORS } from '../src/core/importer';
import { addActivityType, addTodo, createHabit, createTodoList, deleteHabit, deleteRecord, deleteTodo, deleteTodoList, logRecord, makeMinimum, renameTodoList, saveJournal, updateTodo } from '../src/core/ops';
import type { AppData } from '../src/core/types';
import { sheetsBackup, sheetsRestore } from '../src/core/sheets';
import { crc32, zip } from '../src/core/zip';
import { clockAt, freshData } from './helpers';

function sample() {
  const data = freshData();
  const clock = clockAt('2026-11-02');
  const habit = createHabit(data, { name: 'Exercise, "daily"', fields: [{ id: 'dur', name: 'Duration', kind: 'number', unit: 'min' }] }, clock);
  const run = addActivityType(data, habit.id, { name: 'Running' }, clock);
  const rec = logRecord(data, { habitId: habit.id, activityTypeId: run.id, values: [{ fieldId: 'dur', value: 30, unit: 'min' }], note: 'line one\nline two' }, clock);
  saveJournal(data, { date: '2026-11-02', text: '=SUM(A1) felt good', mood: 5, habitIds: [habit.id] }, clock);
  return { data, habit, run, rec };
}

describe('export', () => {
  it('writes linked tables with stable ids', () => {
    const { data, habit, run, rec } = sample();
    const all = tables(data);
    expect(all.map((t) => t.name)).toEqual(['habits', 'activity_types', 'activity_records', 'habit_completions', 'journal_entries', 'todo_lists', 'todo_items']);
    const records = all[2];
    const row = records.rows[0];
    expect(row[records.header.indexOf('id')]).toBe(rec.id);
    expect(row[records.header.indexOf('habit_id')]).toBe(habit.id);
    expect(row[records.header.indexOf('activity_type_id')]).toBe(run.id);
    expect(row[records.header.indexOf('summary')]).toBe('Running · 30 min');
    const completions = all[3];
    expect(completions.rows).toHaveLength(1);
    expect(completions.rows[0][completions.header.indexOf('record_ids')]).toBe(rec.id);
    expect(completions.rows[0][completions.header.indexOf('status')]).toBe('complete');
  });

  it('quotes CSV cells that need it', () => {
    const { data } = sample();
    const csv = toCsv(tables(data)[0]);
    expect(csv).toContain('"Exercise, ""daily"""');
    expect(toCsv(tables(data)[2])).toContain('"line one\nline two"');
  });

  it('builds a readable zip', () => {
    const bytes = zip([{ name: 'a.csv', content: 'x,y\r\n' }], new Date(2026, 10, 2));
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(new TextDecoder().decode(bytes.slice(0, 2))).toBe('PK');
    expect(new TextDecoder().decode(bytes)).toContain('x,y');
  });
});

describe('restore', () => {
  it('rejects files that are not backups, or are from a newer version', () => {
    expect(checkBackup('not json').ok).toBe(false);
    expect(checkBackup('{"hello":1}').ok).toBe(false);
    const { data } = sample();
    const backup = makeBackup(data, '2026-11-10T00:00:00.000Z', '0.1.0', 'UTC');
    expect(checkBackup(JSON.stringify({ ...backup, formatVersion: BACKUP_FORMAT_VERSION + 1 })).errors[0]).toMatch(/newer version/);
    const broken = structuredClone(backup);
    broken.data.records[0].date = 'yesterday';
    expect(checkBackup(JSON.stringify(broken)).ok).toBe(false);
  });

  it('merges without duplicating, and the newer edit wins', () => {
    const { data, habit, rec } = sample();
    const phone = structuredClone(data);
    const backup = structuredClone(data);
    // On the phone: rename the habit and add a record after the backup was made.
    phone.habits[0].name = 'Move';
    phone.habits[0].updatedAt = '2026-11-05T00:00:00.000Z';
    logRecord(phone, { habitId: habit.id }, clockAt('2026-11-05'));
    // In the backup: a record the phone never saw, and an older edit of the same record.
    logRecord(backup, { habitId: habit.id }, clockAt('2026-11-03'));
    backup.records[0].note = 'older text';
    backup.records[0].updatedAt = '2026-11-01T00:00:00.000Z';
    const merged = mergeData(phone, backup);
    expect(merged.habits).toHaveLength(1);
    expect(merged.habits[0].name).toBe('Move');
    expect(merged.records).toHaveLength(3);
    expect(merged.records.find((r) => r.id === rec.id)!.note).toBe('line one\nline two');
    expect(merged.journal).toHaveLength(1);
  });

  it('does not bring back something deleted after the backup was made', () => {
    const { data, rec } = sample();
    const backup = structuredClone(data);
    deleteRecord(data, rec.id, clockAt('2026-11-06'));
    expect(mergeData(data, backup).records).toHaveLength(0);
    // But an item edited after the deletion elsewhere survives.
    backup.records[0].updatedAt = '2026-11-07T00:00:00.000Z';
    expect(mergeData(data, backup).records).toHaveLength(1);
  });

  it('deleting a habit removes its records and remembers the deletion', () => {
    const { data, habit } = sample();
    const backup = structuredClone(data);
    deleteHabit(data, habit.id, clockAt('2026-11-06'));
    expect([data.habits.length, data.activityTypes.length, data.records.length]).toEqual([0, 0, 0]);
    expect(data.journal[0].habitIds).toEqual([]);
    const merged = mergeData(data, backup);
    expect([merged.habits.length, merged.records.length]).toEqual([0, 0]);
  });
});

// A stand-in for the Google Sheets services, enough to run apps-script/Code.gs as written.
function fakeSheets(secret: string) {
  const sheets = new Map<string, string[][]>();
  const sheet = (name: string) => ({
    clearContents: () => sheets.set(name, []),
    setFrozenRows: () => {},
    getLastRow: () => sheets.get(name)!.length,
    getRange: (_r: number, _c: number, rows: number, cols: number) => {
      const range = {
        setNumberFormat: () => range,
        setValues: (values: string[][]) => {
          if (values.length !== rows || values.some((row) => row.length !== cols)) throw new Error('range size mismatch');
          for (const row of values) for (const cell of row) if (cell.length > 50000) throw new Error('cell too large');
          sheets.set(name, values);
        },
        getValues: () => sheets.get(name)!.slice(0, rows),
      };
      return range;
    },
  });
  const book = {
    getSheetByName: (name: string) => (sheets.has(name) ? sheet(name) : null),
    insertSheet: (name: string) => (sheets.set(name, []), sheet(name)),
  };
  const globals = {
    SpreadsheetApp: { getActiveSpreadsheet: () => book },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text: string) => ({ text, setMimeType() { return this; } }) },
  };
  const code = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8').replace("var SECRET = 'change-me'", `var SECRET = '${secret}'`);
  const doPost = new Function(...Object.keys(globals), `${code}; return doPost;`)(...Object.values(globals)) as (e: unknown) => { text: string };
  const fetcher = async (_url: string, init: RequestInit) => new Response(doPost({ postData: { contents: init.body } }).text);
  return { sheets, fetcher };
}

describe('Google Sheets backup', () => {
  const url = 'https://script.google.com/macros/s/abc/exec';

  it('round-trips a backup through the sheet script', async () => {
    const { data } = sample();
    // Enough records that the stored backup spans several cells.
    for (let i = 0; i < 400; i++) logRecord(data, { habitId: data.habits[0].id, note: `entry ${i}` }, clockAt('2026-11-03'));
    const { sheets, fetcher } = fakeSheets('open sesame');
    const config = { url, secret: 'open sesame' };
    const saved = await sheetsBackup(config, data, '2026-11-10T00:00:00.000Z', '0.1.0', 'UTC', fetcher);
    expect(saved).toEqual({ ok: true, savedAt: '2026-11-10T00:00:00.000Z' });
    expect(sheets.get('activity_records')!).toHaveLength(402);
    expect(sheets.get('_backup')!.length).toBeGreaterThan(4);
    const restored = await sheetsRestore(config, fetcher);
    expect(restored.ok).toBe(true);
    expect(checkBackup(restored.text!).backup!.data).toEqual(data);
  });

  it('refuses a wrong passphrase and a bad address', async () => {
    const { data } = sample();
    const { fetcher } = fakeSheets('open sesame');
    expect((await sheetsBackup({ url, secret: 'guess' }, data, 'now', '0.1.0', 'UTC', fetcher)).ok).toBe(false);
    expect((await sheetsBackup({ url: 'https://example.com/x', secret: 'open sesame' }, data, 'now', '0.1.0', 'UTC', fetcher)).ok).toBe(false);
    expect((await sheetsRestore({ url, secret: 'open sesame' }, fetcher)).error).toMatch(/no backup yet/);
  });
});

describe('older data', () => {
  it('restores a version 1 backup, treating its journal entries as journal entries', () => {
    const { data } = sample();
    data.habits[0].color = OLD_COLORS[3];
    const old = structuredClone(data) as unknown as { schemaVersion: number; journal: Record<string, unknown>[]; todoLists?: unknown; todos?: unknown };
    old.schemaVersion = 1;
    delete old.todoLists;
    delete old.todos;
    for (const entry of old.journal) delete entry.kind;
    const checked = checkBackup(JSON.stringify({ ...makeBackup(data, '2026-11-10T00:00:00.000Z', '0.1.0', 'UTC'), data: old }));
    expect(checked.ok).toBe(true);
    // The habit was on the old palette, so it moves to the matching soft color.
    const expected = structuredClone(data);
    for (const h of expected.habits) h.color = SOFT_COLORS[OLD_COLORS.indexOf(h.color)];
    expect(checked.backup!.data).toEqual(JSON.parse(JSON.stringify(expected)));
  });

  it('refuses data from a newer schema', () => {
    const { data } = sample();
    const backup = makeBackup({ ...data, schemaVersion: 99 }, 'now', '9.0.0', 'UTC');
    expect(checkBackup(JSON.stringify(backup)).errors[0]).toMatch(/newer version/);
  });

  it('keeps a habit note tied to its habit through export', () => {
    const { data, habit } = sample();
    saveJournal(data, { kind: 'note', date: '2026-11-03', text: 'New shoes helped', mood: null, habitIds: [habit.id] }, clockAt('2026-11-03'));
    const journal = tables(data)[4];
    const row = journal.rows.find((r) => r[journal.header.indexOf('kind')] === 'note')!;
    expect(row[journal.header.indexOf('habit_ids')]).toBe(habit.id);
  });
});

describe('schema 3', () => {
  it('upgrades a version 2 backup: adds to-do lists and softens old-palette colors only', () => {
    const { data, habit } = sample();
    habit.color = OLD_COLORS[8];
    const custom = createHabit(data, { name: 'Custom', color: '#123456' }, clockAt('2026-11-02'));
    const old = structuredClone(data) as Partial<AppData>;
    old.schemaVersion = 2;
    delete old.todoLists;
    delete old.todos;
    const checked = checkBackup(JSON.stringify({ ...makeBackup(data, 'now', '0.2.0', 'UTC'), data: old }));
    expect(checked.ok).toBe(true);
    const up = checked.backup!.data;
    expect(up.schemaVersion).toBe(3);
    expect([up.todoLists, up.todos]).toEqual([[], []]);
    expect(up.habits.find((h) => h.id === habit.id)!.color).toBe(SOFT_COLORS[OLD_COLORS.indexOf(habit.color)]);
    expect(up.habits.find((h) => h.id === custom.id)!.color).toBe('#123456');
    expect(checked.summary!.todos).toBe(0);
  });

  it('does not recolor habits again once on version 3', () => {
    const data = freshData();
    const h = createHabit(data, { name: 'Run', color: OLD_COLORS[0] }, clockAt('2026-11-02'));
    expect(migrate(data).habits[0].color).toBe(OLD_COLORS[0]);
    expect(h.color).toBe(OLD_COLORS[0]);
  });

  it('keeps to-do lists and items, ticks them off, and remembers deletions through a merge', () => {
    const data = freshData();
    const c1 = clockAt('2026-11-20');
    const list = createTodoList(data, '  Groceries ', c1);
    expect(list.name).toBe('Groceries');
    const milk = addTodo(data, list.id, 'Milk', c1);
    const eggs = addTodo(data, list.id, 'Eggs', c1);
    expect([milk.order, eggs.order]).toEqual([0, 1]);
    const backup = structuredClone(data);

    const c2 = clockAt('2026-11-21');
    updateTodo(data, milk.id, { done: true }, c2);
    expect(data.todos.find((t) => t.id === milk.id)).toMatchObject({ done: true, doneAt: c2.now, updatedAt: c2.now });
    renameTodoList(data, list.id, 'Shop', c2);
    deleteTodo(data, eggs.id, c2);

    const merged = mergeData(data, backup);
    expect(merged.todoLists.map((l) => l.name)).toEqual(['Shop']);
    expect(merged.todos.map((t) => [t.text, t.done])).toEqual([['Milk', true]]);

    const all = tables(merged);
    const items = all.find((t) => t.name === 'todo_items')!;
    expect(items.rows[0][items.header.indexOf('list_name')]).toBe('Shop');

    deleteTodoList(data, list.id, clockAt('2026-11-22'));
    expect([data.todoLists.length, data.todos.length]).toEqual([0, 0]);
    expect(mergeData(data, backup).todos).toEqual([]);
  });

  it('keeps notes on a deleted habit as journal entries', () => {
    const { data, habit } = sample();
    const note = saveJournal(data, { kind: 'note', date: '2026-11-03', text: 'Felt strong', mood: null, habitIds: [habit.id] }, clockAt('2026-11-03'));
    deleteHabit(data, habit.id, clockAt('2026-11-04'));
    expect(data.journal.find((j) => j.id === note.id)).toMatchObject({ kind: 'journal', habitIds: [], text: 'Felt strong' });
  });

  it('builds the smallest unit from a number and a metric, both optional', () => {
    expect(makeMinimum(1, ' page ', false)).toEqual({ label: '1 page', countsAsComplete: false, amount: 1, unit: 'page' });
    expect(makeMinimum(null, 'a short walk', true)).toEqual({ label: 'a short walk', countsAsComplete: true, unit: 'a short walk' });
    expect(makeMinimum(5, '', false)).toEqual({ label: '5', countsAsComplete: false, amount: 5 });
    expect(makeMinimum(null, '  ', false)).toBeNull();
  });
});
