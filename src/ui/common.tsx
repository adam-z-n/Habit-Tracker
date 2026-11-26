import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { SOFT_COLORS } from '../core/importer';

// Small shared pieces: palettes, pickers and form rows.

/** App accent colors: deeper, so white text on them stays readable. */
export const ACCENTS = ['#2f6f5e', '#3f8f6b', '#3d8a85', '#4a7fc1', '#5b63c7', '#8a6fc9', '#c75b7a', '#d9584a', '#c9772f', '#7d8a99', '#4b5563'];

/** A labelled form row. Use `group` when the content is a set of buttons rather than one input. */
export function Field(props: { label: string; hint?: string; group?: boolean; children: ComponentChildren }) {
  if (props.group) {
    return (
      <div class="field" role="group" aria-label={props.label}>
        <span class="field-label">{props.label}</span>
        {props.children}
        {props.hint && <span class="field-hint">{props.hint}</span>}
      </div>
    );
  }
  return (
    <label class="field">
      <span class="field-label">{props.label}</span>
      {props.children}
      {props.hint && <span class="field-hint">{props.hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>(props: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; label?: string }) {
  return (
    <div class="segmented" role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button key={o.value} type="button" class={o.value === props.value ? 'on' : ''} aria-pressed={o.value === props.value} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Habit colors are soft and bright (text on them is dark); pass `palette` for others. */
export function ColorPicker(props: { value: string; onChange: (color: string) => void; allowNone?: boolean; palette?: string[] }) {
  return (
    <div class="swatches" role="group" aria-label="Color">
      {props.allowNone && (
        <button type="button" class={`swatch none${props.value ? '' : ' on'}`} aria-label="Automatic color" onClick={() => props.onChange('')}>
          A
        </button>
      )}
      {(props.palette ?? SOFT_COLORS).map((c) => (
        <button key={c} type="button" class={`swatch${c === props.value ? ' on' : ''}`} style={{ background: c }} aria-label={`Color ${c}`} aria-pressed={c === props.value} onClick={() => props.onChange(c)} />
      ))}
    </div>
  );
}

/** Thin line icons, drawn on a 24 grid. */
export function Icon(props: { d: string; size?: number; width?: number }) {
  const size = props.size ?? 22;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={props.d} fill="none" stroke="currentColor" stroke-width={props.width ?? 1.6} stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export const PLUS = 'M12 5v14M5 12h14';
export const CARET = 'M7 10l5 5 5-5';
export const CHECK = 'M5 12.5l4.5 4.5L19 7.5';

export interface MenuItem {
  key: string;
  label: string;
  color?: string;
  on?: boolean;
  /** Draws a line above the item. */
  divider?: boolean;
  danger?: boolean;
  run: () => void;
}

/** A title that opens a menu below it: "Journal ⌄". */
/** `color` puts a dot before the title; `tint` sets the title itself in a (deepened) color. */
export function TitleMenu(props: { title: string; items: MenuItem[]; label: string; color?: string; tint?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div class="title-menu" ref={box}>
      <button class="title-btn" aria-haspopup="menu" aria-expanded={open} aria-label={`${props.title}. ${props.label}`} onClick={() => setOpen(!open)}>
        {props.color && <span class="dot" style={{ background: props.color }} />}
        <span class={`title-text${props.tint ? ' tinted' : ''}`} style={props.tint ? { '--tint': props.tint } : undefined}>
          {props.title}
        </span>
        <span class={`caret${open ? ' up' : ''}`}>
          <Icon d={CARET} size={20} />
        </span>
      </button>
      {open && (
        <div class="menu" role="menu">
          {props.items.map((item) => (
            <button
              key={item.key}
              role="menuitemradio"
              aria-checked={!!item.on}
              class={`menu-item${item.on ? ' on' : ''}${item.divider ? ' divider' : ''}${item.danger ? ' danger' : ''}`}
              onClick={() => {
                setOpen(false);
                item.run();
              }}
            >
              <span class="dot" style={item.color ? { background: item.color } : { visibility: 'hidden' }} />
              <span class="grow">{item.label}</span>
              {item.on && <Icon d={CHECK} size={18} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Thursday, November 26", with the year when it is not this year. */
export function longDay(day: string, today: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const text = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return day.slice(0, 4) === today.slice(0, 4) ? text : `${text}, ${y}`;
}

/** Saves a file: the share sheet on phones that support it, a download elsewhere. */
export async function saveFile(name: string, content: string | Uint8Array, type: string): Promise<void> {
  const blob = new Blob([content as BlobPart], { type });
  const file = new File([blob], name, { type });
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
