import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { addTodo, createTodoList, deleteTodo, deleteTodoList, nextListColor, updateTodo, updateTodoList } from '../core/ops';
import type { TodoItem, TodoList } from '../core/types';
import { CHECK, ColorPicker, Icon, PLUS, TitleMenu, type MenuItem } from './common';
import { confirmSheet, openSheet, toast } from './sheet';
import { getData, mutate, useData } from './store';

// To-do lists. The screen opens on an overview of all lists; opening one tints the screen with the
// list's color. The title menu switches between lists.

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

/**
 * One to-do. It shows on a single line, cut short with "…" when it is too long; tapping the text opens it
 * wrapped to its full length, ready to edit. It closes again on Enter, or a tap anywhere else.
 */
function TodoRow(props: { item: TodoItem }) {
  const { item } = props;
  const [text, setText] = useState(item.text);
  const [open, setOpen] = useState(false);
  const row = useRef<HTMLLIElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  // Guards against closing twice (a blur and an outside tap can both fire).
  const isOpen = useRef(false);
  // The latest text, for an outside tap that lands before the screen has redrawn after a keystroke.
  const latest = useRef(item.text);
  const edit = (next: string) => {
    latest.current = next;
    setText(next);
  };
  useEffect(() => edit(item.text), [item.text]);

  const fit = () => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  const expand = () => {
    isOpen.current = true;
    setOpen(true);
  };
  const close = (keep = true) => {
    if (!isOpen.current) return;
    isOpen.current = false;
    setOpen(false);
    if (!keep) return edit(item.text);
    const next = latest.current;
    if (!next.trim()) return removeItem(item);
    if (next.trim() !== item.text) mutate((d, c) => updateTodo(d, item.id, { text: next }, c));
  };

  useLayoutEffect(() => {
    if (!open || !area.current) return;
    fit();
    area.current.focus();
    const end = area.current.value.length;
    area.current.setSelectionRange(end, end);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (!row.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  return (
    <li ref={row} class={`trow${item.done ? ' done' : ''}${open ? ' open' : ''}`}>
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
      {open ? (
        <textarea
          ref={area}
          class="ttext twrap"
          rows={1}
          value={text}
          aria-label="To-do"
          enterkeyhint="done"
          onInput={(e) => {
            edit((e.target as HTMLTextAreaElement).value);
            fit();
          }}
          onBlur={() => close()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).blur();
              close();
            }
            if (e.key === 'Escape') close(false);
          }}
        />
      ) : (
        <button class="ttext tview" aria-label={`${item.text}. Tap to show all and edit`} onClick={expand}>
          {item.text}
        </button>
      )}
      <button class="tdel" aria-label={`Delete: ${item.text}`} onPointerDown={(e) => e.preventDefault()} onClick={() => removeItem(item)}>
        <Icon d="M7 7l10 10M17 7L7 17" size={18} />
      </button>
    </li>
  );
}

/** Name and color of a list, for creating or editing it. */
function ListForm(props: { list?: TodoList; action: string; onSave: (name: string, color: string) => void; close: () => void }) {
  const [name, setName] = useState(props.list?.name ?? '');
  const [color, setColor] = useState(props.list?.color ?? nextListColor(getData()));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!props.list) input.current?.focus();
  }, []);
  const save = () => {
    if (!name.trim()) return;
    props.onSave(name.trim(), color);
    props.close();
  };
  return (
    <form
      class="stack editor"
      style={{ '--c': color }}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <section class="ed-group">
        <label class="ed-label" for="list-name">
          Name
        </label>
        <input id="list-name" ref={input} class="input name" placeholder="Groceries, This week, Someday…" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      </section>
      <section class="ed-group">
        <span class="ed-label">Color</span>
        <ColorPicker value={color} onChange={setColor} />
      </section>
      <button class="btn ed-save" type="submit" disabled={!name.trim()}>
        {props.action}
      </button>
    </form>
  );
}

function newList(onCreated: (id: string) => void): void {
  openSheet('New list', (close) => (
    <ListForm
      action="Create list"
      close={close}
      onSave={(name, color) => {
        let id = '';
        mutate((d, c) => {
          id = createTodoList(d, name, c, color).id;
        });
        onCreated(id);
      }}
    />
  ));
}

const openCount = (todos: TodoItem[], listId: string) => todos.filter((t) => t.listId === listId && !t.done).length;

export function TodoScreen() {
  const { data } = useData();
  const [shown, setShown] = useState<string | null>(null);
  const lists = [...data.todoLists].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const list = shown ? lists.find((l) => l.id === shown) : undefined;

  // An open list tints the whole screen, the tab bar and its sheets with its color. A layout effect, so
  // the tint is set and removed in step with the screen even when the tab changes straight away.
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!list) return;
    root.classList.add('tinted');
    root.style.setProperty('--tint', list.color);
    return () => {
      root.classList.remove('tinted');
      root.style.removeProperty('--tint');
    };
  }, [list?.color]);

  if (!list) return <Overview lists={lists} open={setShown} />;
  return <ListView list={list} lists={lists} show={setShown} />;
}

function Overview(props: { lists: TodoList[]; open: (id: string) => void }) {
  const { data } = useData();
  return (
    <div class="screen calm">
      <header class="calm-top">
        <h1 class="calm-title">To-do</h1>
        <button class="plain-btn" aria-label="New list" onClick={() => newList(props.open)}>
          <Icon d={PLUS} size={26} />
        </button>
      </header>
      {props.lists.length ? (
        <ul class="lists">
          {props.lists.map((l) => {
            const n = openCount(data.todos, l.id);
            return (
              <li key={l.id}>
                <button class="list-card" style={{ '--c': l.color }} onClick={() => props.open(l.id)}>
                  <span class="list-name">{l.name}</span>
                  <span class="list-count">{n ? `${n} to-do${n === 1 ? '' : 's'}` : 'All done'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p class="calm-empty">No lists yet. Tap + to start one.</p>
      )}
    </div>
  );
}

function ListView(props: { list: TodoList; lists: TodoList[]; show: (id: string | null) => void }) {
  const { data } = useData();
  const { list } = props;
  const [draft, setDraft] = useState('');
  const [showDone, setShowDone] = useState(false);
  const items = data.todos.filter((t) => t.listId === list.id);
  const open = items.filter((t) => !t.done).sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
  const done = items.filter((t) => t.done).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    mutate((d, c) => void addTodo(d, list.id, text, c));
    setDraft('');
  };

  const menu: MenuItem[] = [
    { key: 'all', label: 'All lists', run: () => props.show(null) },
    ...props.lists.map((l, i) => ({ key: l.id, label: l.name, color: l.color, on: l.id === list.id, divider: i === 0, run: () => props.show(l.id) })),
    { key: 'new', label: 'New list…', divider: true, run: () => newList(props.show) },
    { key: 'edit', label: 'Edit list…', run: () => openSheet('Edit list', (close) => <ListForm list={list} action="Save" close={close} onSave={(name, color) => mutate((d, c) => updateTodoList(d, list.id, { name, color }, c))} />) },
    {
      key: 'delete',
      label: 'Delete list',
      danger: true,
      run: () =>
        confirmSheet(`Delete “${list.name}”?`, items.length ? `Its ${items.length} to-do${items.length === 1 ? '' : 's'} will be deleted too.` : 'The list is empty.', 'Delete list', () => {
          mutate((d, c) => deleteTodoList(d, list.id, c));
          props.show(null);
        }),
    },
  ];

  return (
    <div class="screen calm">
      <header class="calm-top">
        <TitleMenu title={list.name} tint={list.color} items={menu} label="Choose or manage lists" />
      </header>
      <ul class="tlist">
        {open.map((item) => (
          <TodoRow key={item.id} item={item} />
        ))}
        <li class="trow tadd">
          <span class="tcheck ghost" aria-hidden="true" />
          <input
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
