import type { ComponentChildren } from 'preact';

// Small shared pieces: palettes, pickers and form rows.

export const COLORS = ['#2f6f5e', '#3f8f6b', '#5aa9a3', '#4a7fc1', '#5b63c7', '#8a6fc9', '#c75b7a', '#d9584a', '#e08a3c', '#c9a227', '#7d8a99', '#4b5563'];

export const ICONS = ['✅', '🏃', '🚴', '🏋️', '🧘', '📖', '✍️', '🎧', '🎸', '🗣️', '💧', '🥗', '😴', '🧹', '🌱', '💊', '🧠', '⛸️', '🏊', '🚶', '🎨', '💻', '📵', '🙏'];

export const CATEGORIES = ['Health', 'Exercise', 'Learning', 'Mindfulness', 'Personal development', 'Productivity', 'Home', 'Social'];

export const MOODS = ['😞', '😕', '😐', '🙂', '😄'];

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

export function ColorPicker(props: { value: string; onChange: (color: string) => void; allowNone?: boolean }) {
  return (
    <div class="swatches" role="group" aria-label="Color">
      {props.allowNone && (
        <button type="button" class={`swatch none${props.value ? '' : ' on'}`} aria-label="Automatic color" onClick={() => props.onChange('')}>
          A
        </button>
      )}
      {COLORS.map((c) => (
        <button key={c} type="button" class={`swatch${c === props.value ? ' on' : ''}`} style={{ background: c }} aria-label={`Color ${c}`} aria-pressed={c === props.value} onClick={() => props.onChange(c)} />
      ))}
    </div>
  );
}

export function IconPicker(props: { value: string; onChange: (icon: string) => void }) {
  return (
    <div class="stack tight">
      <div class="icon-grid" role="group" aria-label="Icon">
        {ICONS.map((icon) => (
          <button key={icon} type="button" class={icon === props.value ? 'on' : ''} aria-pressed={icon === props.value} onClick={() => props.onChange(icon)}>
            {icon}
          </button>
        ))}
      </div>
      <input class="input" value={props.value} maxLength={8} placeholder="Or type any emoji" aria-label="Custom icon" onInput={(e) => props.onChange((e.target as HTMLInputElement).value)} />
    </div>
  );
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
