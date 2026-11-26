import { describe, expect, it } from 'vitest';
import { makeBackup, tables } from '../src/core/exporter';
import { checkBackup, mergeData } from '../src/core/importer';
import { addTodo, createHabit, createTodoList, deleteTodo, deleteTodoList, logRecord, updateTodo } from '../src/core/ops';
import { buildIndex, dayStatus } from '../src/core/stats';
import type { AppData } from '../src/core/types';
import { clockAt, freshData } from './helpers';

const thu = clockAt('2026-11-26');

function setup() {
  const data = freshData();
  const list = createTodoList(data, 'Chores', thu);
  const other = createTodoList(data, 'Shopping', thu);
  const habit = createHabit(data, { name: 'Tidy up', todoListIds: [list.id] }, thu);
  const item = addTodo(data, list.id, 'Hoover the stairs', thu);
  const status = () => dayStatus(habit, buildIndex(data.records), '2026-11-26');
  return { data, list, other, habit, item, status };
}

describe('habits linked to to-do lists', () => {
  it('ticking off an item completes the habit today, and unticking it undoes that', () => {
    const { data, habit, item, status } = setup();
    expect(status()).toBe('none');
    updateTodo(data, item.id, { done: true }, thu);
    expect(status()).toBe('met');
    expect(data.records).toMatchObject([{ habitId: habit.id, date: '2026-11-26', todoId: item.id }]);
    updateTodo(data, item.id, { done: false }, thu);
    expect(status()).toBe('none');
    expect(data.records).toEqual([]);
    // The removal is remembered, so merging an older copy does not bring the record back.
    expect(data.deleted).toHaveLength(1);
  });

  it('unticking takes back only its own record, so other check marks that day stay', () => {
    const { data, habit, list, item, status } = setup();
    const second = addTodo(data, list.id, 'Wipe the counters', thu);
    logRecord(data, { habitId: habit.id }, thu); // ticked on the Habits screen too
    updateTodo(data, item.id, { done: true }, thu);
    updateTodo(data, second.id, { done: true }, thu);
    updateTodo(data, item.id, { done: false }, thu);
    expect(status()).toBe('met');
    expect(data.records.map((r) => r.todoId ?? 'manual').sort()).toEqual(['manual', second.id].sort());
  });

  it('unticking on a later day still takes back the record from the day it was ticked', () => {
    const { data, item, status } = setup();
    updateTodo(data, item.id, { done: true }, thu);
    updateTodo(data, item.id, { done: false }, clockAt('2026-11-27'));
    expect(status()).toBe('none');
  });

  it('ignores lists the habit is not linked to, and paused or archived habits', () => {
    const { data, habit, other, list, status } = setup();
    updateTodo(data, addTodo(data, other.id, 'Milk', thu).id, { done: true }, thu);
    expect(status()).toBe('none');
    habit.status = 'paused';
    updateTodo(data, addTodo(data, list.id, 'Dust', thu).id, { done: true }, thu);
    expect(data.records).toEqual([]);
  });

  it('can link one habit to several lists, and one list to several habits', () => {
    const { data, list, other } = setup();
    const both = createHabit(data, { name: 'Get things done', todoListIds: [list.id, other.id] }, thu);
    updateTodo(data, addTodo(data, other.id, 'Bread', thu).id, { done: true }, thu);
    updateTodo(data, addTodo(data, list.id, 'Bins', thu).id, { done: true }, thu);
    const byHabit = (id: string) => data.records.filter((r) => r.habitId === id).length;
    expect(byHabit(both.id)).toBe(2);
    expect(data.records).toHaveLength(3); // Tidy up gets one, from the Chores item
  });

  it('keeps the day done when a ticked item is deleted or cleared', () => {
    const { data, item, status } = setup();
    updateTodo(data, item.id, { done: true }, thu);
    deleteTodo(data, item.id, thu);
    expect(status()).toBe('met');
  });

  it('unlinks a deleted list from its habits', () => {
    const { data, habit, list } = setup();
    deleteTodoList(data, list.id, clockAt('2026-11-27'));
    expect(habit.todoListIds).toEqual([]);
    expect(habit.updatedAt).toBe(clockAt('2026-11-27').now);
  });

  it('survives export, backup and merge', () => {
    const { data, habit, list, item } = setup();
    updateTodo(data, item.id, { done: true }, thu);
    const all = tables(data);
    const habits = all.find((t) => t.name === 'habits')!;
    expect(habits.rows[0][habits.header.indexOf('todo_list_ids')]).toBe(list.id);
    const records = all.find((t) => t.name === 'activity_records')!;
    expect(records.rows[0][records.header.indexOf('todo_id')]).toBe(item.id);
    const restored = checkBackup(JSON.stringify(makeBackup(data, 'now', '0.5.0', 'UTC'))).backup!.data;
    expect(restored.habits[0].todoListIds).toEqual([list.id]);
    expect(mergeData(freshData(), restored).records[0].todoId).toBe(item.id);
    expect(habit.todoListIds).toEqual([list.id]);
  });

  it('upgrades a version 4 backup: habits start with no linked lists', () => {
    const { data } = setup();
    const old = structuredClone(data) as unknown as { schemaVersion: number; habits: { todoListIds?: string[] }[] };
    old.schemaVersion = 4;
    for (const h of old.habits) delete h.todoListIds;
    const up = checkBackup(JSON.stringify({ ...makeBackup(data, 'now', '0.4.3', 'UTC'), data: old })).backup!.data as AppData;
    expect(up.schemaVersion).toBe(5);
    expect(up.habits.map((h) => h.todoListIds)).toEqual([[]]);
  });
});
