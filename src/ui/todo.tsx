import { useEffect, useRef, useState } from 'preact/hooks';
import { addTodo, createTodoList, deleteTodo, deleteTodoList, renameTodoList, updateTodo } from '../core/ops';
import type { TodoItem } from '../core/types';
import { CHECK, Icon, PLUS, TitleMenu, type MenuItem } from './common';
import { confirmSheet, openSheet, toast } from './sheet';
import { mutate, useData } from './store';

// To-do lists: several named lists, one shown at a time. Items are ticked off into a Done section.

// The list being shown, kept while the app is open.
let shownList: string | null = null;

function removeItem(item: TodoItem): void {
  const copy = structuredClone(item);
  mutate((d, c) => deleteTodo(d, item.id, c));
  toast('To-do deleted', {
    label: 'Undo',
    run: () =>
      mutate((d, c) => {
        d.deleted = d.deleted.filter((t) => t.id !== copy.id);
        d.todos.push({ ...copy, updatedAt: c.now });
      }),
  });
}

function TodoRow(props: { item: TodoItem }) {
  const { item } = props;
  const [text, setText] = useState(item.text);
  useEffect(() => setText(item.text), [item.text]);
  const commit = () => {
    if (!text.trim()) return removeItem(item);
    if (text.trim() !== item.text) mutate((d, c) => updateTodo(d, item.id, { text }, c));
  };
  return (
    <li class={`trow${item.done ? ' done' : ''}`}>
      <button
        class="tcheck"
        role="checkbox"
        aria-checked={item.done}
        aria-label={item.done ? `Mark not done: ${item.text}` : `Mark done: ${item.text}`}
        onClick={() => {
          navigator.vibrate?.(10);
          mutate((d, c) => updateTodo(d, item.id, { done: !item.done }, c));
        }}
      >
        {item.done && <Icon d={CHECK} size={16} width={2} />}
      </button>
      <input
        class="ttext"
        value={text}
        aria-label="To-do"
        onInput={(e) => setText((e.target as HTMLInputElement).value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(item.text);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <button class="tdel" aria-label={`Delete: ${item.text}`} onClick={() => removeItem(item)}>
        <Icon d="M7 7l10 10M17 7L7 17" size={18} />
      </button>
    </li>
  );
}

function NameForm(props: { initial: string; action: string; onSave: (name: string) => void; close: () => void }) {
  const [name, setName] = useState(props.initial);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const save = () => {
    if (!name.trim()) return;
    props.onSave(name.trim());
    props.close();
  };
  return (
    <form
      class="stack"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input ref={input} class="input" placeholder="Groceries, This week, Someday…" aria-label="List name" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      <button class="btn primary" type="submit" disabled={!name.trim()}>
        {props.action}
      </button>
    </form>
  );
}

export function TodoScreen() {
  const { data } = useData();
  const [, redraw] = useState(0);
  const [draft, setDraft] = useState('');
  const [showDone, setShowDone] = useState(false);
  const addInput = useRef<HTMLInputElement>(null);
  const lists = [...data.todoLists].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const list = lists.find((l) => l.id === shownList) ?? lists[0];
  const show = (id: string | null) => {
    shownList = id;
    redraw((n) => n + 1);
  };
  const items = list ? data.todos.filter((t) => t.listId === list.id) : [];
  const open = items.filter((t) => !t.done).sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
  const done = items.filter((t) => t.done).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    mutate((d, c) => {
      // The first to-do creates the first list.
      const id = list?.id ?? createTodoList(d, 'To-do', c).id;
      addTodo(d, id, text, c);
    });
    setDraft('');
  };
  const newList = () =>
    openSheet('New list', (close) => (
      <NameForm
        initial=""
        action="Create list"
        close={close}
        onSave={(name) =>
          mutate((d, c) => {
            shownList = createTodoList(d, name, c).id;
          })
        }
      />
    ));

  const menu: MenuItem[] = [
    ...lists.map((l) => ({ key: l.id, label: l.name, on: l.id === list?.id, run: () => show(l.id) })),
    { key: 'new', label: 'New list…', divider: lists.length > 0, run: newList },
  ];
  if (list) {
    menu.push(
      { key: 'rename', label: 'Rename list…', run: () => openSheet('Rename list', (close) => <NameForm initial={list.name} action="Save" close={close} onSave={(name) => mutate((d, c) => renameTodoList(d, list.id, name, c))} />) },
      {
        key: 'delete',
        label: 'Delete list',
        danger: true,
        run: () =>
          confirmSheet(`Delete “${list.name}”?`, items.length ? `Its ${items.length} to-do${items.length === 1 ? '' : 's'} will be deleted too.` : 'The list is empty.', 'Delete list', () => {
            mutate((d, c) => deleteTodoList(d, list.id, c));
            show(null);
          }),
      },
    );
  }

  return (
    <div class="screen calm">
      <header class="calm-top">
        <TitleMenu title={list?.name ?? 'To-do'} items={menu} label="Choose or manage lists" />
        <button class="plain-btn" aria-label="Add a to-do" onClick={() => addInput.current?.focus()}>
          <Icon d={PLUS} size={26} />
        </button>
      </header>
      <ul class="tlist">
        {open.map((item) => (
          <TodoRow key={item.id} item={item} />
        ))}
        <li class="trow tadd">
          <span class="tcheck ghost" aria-hidden="true" />
          <input
            ref={addInput}
            class="ttext"
            placeholder="Add a to-do"
            aria-label="New to-do"
            enterKeyHint="done"
            value={draft}
            onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            onBlur={add}
          />
        </li>
      </ul>
      {done.length > 0 && (
        <>
          <div class="tdone-head">
            <button class="text-btn muted" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
              Done · {done.length}
            </button>
            {showDone && (
              <button
                class="text-btn muted"
                onClick={() =>
                  confirmSheet('Clear done to-dos?', `${done.length} ticked-off to-do${done.length === 1 ? '' : 's'} will be deleted.`, 'Clear', () =>
                    mutate((d, c) => {
                      for (const item of done) deleteTodo(d, item.id, c);
                    }),
                  )
                }
              >
                Clear
              </button>
            )}
          </div>
          {showDone && (
            <ul class="tlist">
              {done.map((item) => (
                <TodoRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
