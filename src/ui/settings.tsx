import { useRef, useState } from 'preact/hooks';
import { formatDay } from '../core/dates';
import { makeBackup, tables, toCsv } from '../core/exporter';
import { checkBackup, mergeData, type Checked } from '../core/importer';
import { sheetsPing, sheetsRestore } from '../core/sheets';
import type { Settings } from '../core/types';
import { zip } from '../core/zip';
import { ColorPicker, Field, saveFile, Segmented } from './common';
import { remindersIcs } from './reminders';
import { confirmSheet, openSheet, toast } from './sheet';
import { APP_VERSION, backupNow, clock, eraseAll, getData, hasSnapshot, mutate, replaceData, setSync, undoRestore, useData, type SyncState } from './store';

const stamp = () => clock().today;

function backupText(): string {
  const c = clock();
  return JSON.stringify(makeBackup(getData(), c.now, APP_VERSION, c.tz), null, 2);
}

function when(iso: string | null): string {
  if (!iso) return 'never';
  const date = new Date(iso);
  return `${formatDay(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`)} at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

/** Shows what a backup holds and lets the user merge it in or replace everything with it. */
export function openRestore(text: string, source: string): void {
  const checked = checkBackup(text);
  openSheet('Restore backup', (close) => <Restore checked={checked} source={source} close={close} />);
}

function Restore(props: { checked: Checked; source: string; close: () => void }) {
  const { data } = useData();
  const { checked } = props;
  if (!checked.ok || !checked.summary || !checked.backup) {
    return (
      <div class="stack">
        <p class="error">This backup cannot be restored.</p>
        <ul class="plain">
          {checked.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
        <p class="muted small">Nothing was changed.</p>
        <button class="btn" onClick={props.close}>
          Close
        </button>
      </div>
    );
  }
  const s = checked.summary;
  const incoming = checked.backup.data;
  const have = data.habits.length + data.records.length + data.journal.length > 0;
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const finish = (next: typeof incoming, message: string) => {
    replaceData(next);
    props.close();
    toast(message);
  };
  return (
    <div class="stack">
      <p>
        {props.source}
        {s.exportedAt ? `, saved ${when(s.exportedAt)}` : ''}. It contains:
      </p>
      <ul class="plain">
        <li>{n(s.habits, 'habit')} and {n(s.activityTypes, 'activity type')}</li>
        <li>
          {n(s.records, 'activity record')}
          {s.firstDay && s.lastDay ? ` from ${formatDay(s.firstDay)} to ${formatDay(s.lastDay)}` : ''}
        </li>
        <li>{n(s.journal, 'journal entry').replace('entrys', 'entries')} and {n(s.reminders, 'reminder')}</li>
        <li>Your preferences</li>
      </ul>
      {checked.warnings.map((w) => (
        <p class="muted small" key={w}>
          {w}
        </p>
      ))}
      {have ? (
        <>
          <button class="btn primary" onClick={() => finish(mergeData(data, incoming), 'Backup merged')}>
            Merge with what is on this device
          </button>
          <p class="muted small">Keeps everything here and adds what is in the backup. Where both have the same item, the most recently edited one is kept.</p>
          <button class="btn danger" onClick={() => confirmSheet('Replace everything?', `This device has ${n(data.habits.length, 'habit')} and ${n(data.records.length, 'activity record')}. They will be replaced by the backup. You can undo this from Settings afterwards.`, 'Replace with backup', () => finish(incoming, 'Backup restored'))}>
            Replace everything on this device
          </button>
        </>
      ) : (
        <button class="btn primary" onClick={() => finish(incoming, 'Backup restored')}>
          Restore
        </button>
      )}
      <button class="btn" onClick={props.close}>
        Cancel
      </button>
    </div>
  );
}

export function SettingsScreen() {
  const { data, sync } = useData();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [permission, setPermission] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const set = (patch: Partial<Settings>) => mutate((d, c) => Object.assign(d.settings, patch, { updatedAt: c.now }));
  const s = data.settings;

  const exportCsv = () => {
    const files = tables(data).map((t) => ({ name: `${t.name}.csv`, content: toCsv(t) }));
    void saveFile(`habits-csv-${stamp()}.zip`, zip(files), 'application/zip');
  };
  const onFile = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) openRestore(await file.text(), `Backup file "${file.name}"`);
  };
  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(label);
    try {
      await task();
    } finally {
      setBusy('');
    }
  };

  return (
    <div class="screen">
      <header class="top">
        <h1>Settings</h1>
      </header>

      <section class="card pad stack">
        <h3>Appearance</h3>
        <Field group label="Theme">
          <Segmented
            value={s.theme}
            onChange={(theme) => set({ theme })}
            options={[
              { value: 'auto', label: 'Automatic' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </Field>
        <Field group label="Accent color">
          <ColorPicker value={s.accent} onChange={(accent) => set({ accent })} />
        </Field>
        <Field group label="Habit list">
          <Segmented
            value={s.detail}
            onChange={(detail) => set({ detail })}
            options={[
              { value: 'detailed', label: 'With progress' },
              { value: 'compact', label: 'Names only' },
            ]}
          />
        </Field>
      </section>

      <section class="card pad stack">
        <h3>Preferences</h3>
        <Field group label="Week starts on">
          <Segmented
            value={String(s.weekStart) as '0' | '1'}
            onChange={(v) => set({ weekStart: Number(v) as 0 | 1 })}
            options={[
              { value: '1', label: 'Monday' },
              { value: '0', label: 'Sunday' },
            ]}
          />
        </Field>
        <Field group label="Distances shown in" hint="Entries keep the unit they were recorded in.">
          <Segmented
            value={s.distanceUnit}
            onChange={(distanceUnit) => set({ distanceUnit })}
            options={[
              { value: 'mi', label: 'Miles' },
              { value: 'km', label: 'Kilometers' },
            ]}
          />
        </Field>
        <Field group label="Time format">
          <Segmented
            value={s.timeFormat}
            onChange={(timeFormat) => set({ timeFormat })}
            options={[
              { value: '12h', label: '12-hour' },
              { value: '24h', label: '24-hour' },
            ]}
          />
        </Field>
      </section>

      <section class="card pad stack">
        <h3>Reminders</h3>
        <p class="muted small">Reminders are set on each habit. They appear while the app is open or running in the background; a web app cannot wake itself when fully closed.</p>
        {permission === 'default' && (
          <button class="btn" onClick={() => void Notification.requestPermission().then(setPermission)}>
            Allow notifications
          </button>
        )}
        {permission === 'granted' && <p class="muted small">Notifications are allowed.</p>}
        {permission === 'denied' && <p class="muted small">Notifications are blocked for this site in the browser's settings. Reminders will show inside the app only.</p>}
        {permission === 'unsupported' && <p class="muted small">This browser does not offer notifications here. On iPhone, add the app to the Home Screen first.</p>}
        <button class="btn" disabled={!data.reminders.length} onClick={() => void saveFile(`habit-reminders-${stamp()}.ics`, remindersIcs(data), 'text/calendar')}>
          Add reminders to my calendar
        </button>
        <p class="muted small">Downloads a calendar file with your {data.reminders.length || ''} reminder{data.reminders.length === 1 ? '' : 's'} as repeating alerts, so your phone reminds you even when the app is closed.</p>
      </section>

      <section class="card pad stack">
        <h3>Your data</h3>
        <p class="muted small">Everything is stored on this device. Export it whenever you like; it is yours.</p>
        <button class="btn" onClick={() => void saveFile(`habits-backup-${stamp()}.json`, backupText(), 'application/json')}>
          Export all data (JSON backup)
        </button>
        <button class="btn" onClick={exportCsv}>
          Export as spreadsheets (CSV)
        </button>
        <button class="btn" onClick={() => fileInput.current?.click()}>
          Restore from a backup file…
        </button>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={onFile} />
        {hasSnapshot() && (
          <button
            class="btn"
            onClick={() =>
              confirmSheet('Undo the last restore?', 'This puts back the data that was on this device before the last restore or merge.', 'Undo restore', () => {
                undoRestore();
                toast('Restore undone');
              }, false)
            }
          >
            Undo last restore
          </button>
        )}
      </section>

      <SheetsSection sync={sync} busy={busy} run={run} />

      <section class="card pad stack">
        <h3>Privacy</h3>
        <p class="muted small">No account, no tracking. Your data leaves this device only when you export it or back it up to your own Google Sheet.</p>
        <button
          class="btn danger-text"
          onClick={() =>
            confirmSheet('Erase everything on this device?', 'All habits, history and journal entries on this device will be deleted. Export a backup first if you might want them back.', 'Erase all data', () => {
              eraseAll();
              toast('All data erased');
            })
          }
        >
          Erase all data
        </button>
      </section>

      <p class="muted small center">Habits {APP_VERSION}</p>
    </div>
  );
}

function SheetsSection(props: { sync: SyncState; busy: string; run: (label: string, task: () => Promise<void>) => Promise<void> }) {
  const { sync, busy } = props;
  const ready = !!sync.url && !!sync.secret;
  return (
    <section class="card pad stack">
      <h3>Google Sheets backup</h3>
      <p class="muted small">
        Keeps a copy in a Google Sheet you own: readable tabs for habits, activities and journal, plus a complete backup you can restore from.{' '}
        <a href="https://github.com/adam-z-n/Habit-Tracker/blob/main/docs/GOOGLE_SHEETS.md" target="_blank" rel="noreferrer">
          Setup takes about five minutes
        </a>
        .
      </p>
      <Field label="Web app address">
        <input class="input" type="url" inputMode="url" placeholder="https://script.google.com/macros/s/…/exec" value={sync.url} onChange={(e) => setSync({ url: (e.target as HTMLInputElement).value.trim(), dirty: true })} />
      </Field>
      <Field label="Passphrase" hint="The SECRET you set in the script. Stored on this device only, never in exports.">
        <input class="input" type="password" autocomplete="off" value={sync.secret} onChange={(e) => setSync({ secret: (e.target as HTMLInputElement).value })} />
      </Field>
      <Field group label="Back up automatically">
        <Segmented
          value={sync.auto}
          onChange={(auto) => setSync({ auto })}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'changes', label: 'On change' },
            { value: 'daily', label: 'Daily' },
          ]}
        />
      </Field>
      <div class="row2">
        <button
          class="btn primary"
          disabled={!ready || !!busy}
          onClick={() =>
            props.run('backup', async () => {
              toast((await backupNow()) ? 'Backed up to Google Sheets' : 'Backup failed');
            })
          }
        >
          {busy === 'backup' ? 'Backing up…' : 'Back up now'}
        </button>
        <button
          class="btn"
          disabled={!ready || !!busy}
          onClick={() =>
            props.run('restore', async () => {
              const reply = await sheetsRestore(sync);
              if (reply.ok && reply.text) openRestore(reply.text, 'Backup from your Google Sheet');
              else setSync({ lastError: reply.error ?? 'Could not read the sheet.' });
            })
          }
        >
          {busy === 'restore' ? 'Reading…' : 'Restore from sheet'}
        </button>
      </div>
      <button
        class="btn"
        disabled={!ready || !!busy}
        onClick={() =>
          props.run('test', async () => {
            const reply = await sheetsPing(sync);
            setSync({ lastError: reply.ok ? null : reply.error ?? 'No answer.' });
            if (reply.ok) toast('Connection works');
          })
        }
      >
        {busy === 'test' ? 'Testing…' : 'Test connection'}
      </button>
      <p class="muted small">
        Last backup: {when(sync.lastBackupAt)}
        {sync.dirty && sync.url ? ' · changes waiting' : ''}
      </p>
      {sync.lastError && <p class="error">{sync.lastError}</p>}
    </section>
  );
}
