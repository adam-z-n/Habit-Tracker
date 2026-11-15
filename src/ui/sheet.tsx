import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';

// Bottom sheets (stacked panels that slide over the screen) and toasts.

type Render = (close: () => void) => ComponentChildren;

interface Entry {
  id: number;
  title: string;
  render: Render;
  tall: boolean;
}

let stack: Entry[] = [];
let nextId = 1;
let toastState: { id: number; text: string; action?: { label: string; run: () => void } } | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function openSheet(title: string, render: Render, options: { tall?: boolean } = {}): void {
  stack = [...stack, { id: nextId++, title, render, tall: options.tall ?? false }];
  notify();
}

function closeSheet(id: number): void {
  stack = stack.filter((s) => s.id !== id);
  notify();
}

export function closeAllSheets(): void {
  stack = [];
  notify();
}

export function toast(text: string, action?: { label: string; run: () => void }): void {
  toastState = { id: nextId++, text, action };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastState = null;
    notify();
  }, action ? 5000 : 2500);
  notify();
}

export function confirmSheet(title: string, message: string, label: string, run: () => void, danger = true): void {
  openSheet(title, (close) => (
    <div class="stack">
      <p class="muted">{message}</p>
      <button
        class={danger ? 'btn danger' : 'btn primary'}
        onClick={() => {
          close();
          run();
        }}
      >
        {label}
      </button>
      <button class="btn" onClick={close}>
        Cancel
      </button>
    </div>
  ));
}

export function SheetHost() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack.length) closeSheet(stack[stack.length - 1].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <>
      {stack.map((entry) => {
        const close = () => closeSheet(entry.id);
        return (
          <div class="sheet-backdrop" key={entry.id} onClick={(e) => e.target === e.currentTarget && close()}>
            <div class={`sheet${entry.tall ? ' tall' : ''}`} role="dialog" aria-modal="true" aria-label={entry.title}>
              <div class="sheet-head">
                <h2>{entry.title}</h2>
                <button class="icon-btn" onClick={close} aria-label="Close">
                  ✕
                </button>
              </div>
              <div class="sheet-body">{entry.render(close)}</div>
            </div>
          </div>
        );
      })}
      {toastState && (
        <div class="toast" key={toastState.id} role="status">
          <span>{toastState.text}</span>
          {toastState.action && (
            <button
              onClick={() => {
                const run = toastState!.action!.run;
                toastState = null;
                notify();
                run();
              }}
            >
              {toastState.action.label}
            </button>
          )}
        </div>
      )}
    </>
  );
}
