import { useEffect, useState } from 'preact/hooks';
import { localDay, localTime } from '../core/dates';
import { migrate } from '../core/importer';
import type { Clock } from '../core/ops';
import { sheetsBackup, type SheetsConfig } from '../core/sheets';
import { buildIndex, type Index } from '../core/stats';
import { defaultSettings, emptyData, type AppData } from '../core/types';

// The app's state: one AppData object kept in localStorage. Screens read it through useData() and
// change it through mutate(), which saves, redraws and schedules a backup.

declare const __APP_VERSION__: string;
export const APP_VERSION = __APP_VERSION__;

const DATA_KEY = 'habits:data';
const SYNC_KEY = 'habits:sync';
const SNAPSHOT_KEY = 'habits:before-restore';

export interface SyncState extends SheetsConfig {
  auto: 'off' | 'changes' | 'daily';
  lastBackupAt: string | null;
  lastError: string | null;
  /** True when there are changes the sheet has not seen. */
  dirty: boolean;
}

export function clock(): Clock {
  const date = new Date();
  return { now: date.toISOString(), today: localDay(date), time: localTime(date), tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' };
}

function load(): AppData {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppData;
      parsed.settings = { ...defaultSettings(''), ...parsed.settings };
      parsed.deleted ??= [];
      return migrate(parsed);
    }
  } catch (err) {
    console.error('Could not read saved data', err);
  }
  return emptyData(new Date().toISOString());
}

let data = load();
let version = 0;
let cachedIndex: { version: number; index: Index } | null = null;
const listeners = new Set<() => void>();

let sync: SyncState = { url: '', secret: '', auto: 'off', lastBackupAt: null, lastError: null, dirty: false };
try {
  sync = { ...sync, ...JSON.parse(localStorage.getItem(SYNC_KEY) ?? '{}') };
} catch {
  /* keep defaults */
}

function notify(): void {
  version++;
  for (const listener of listeners) listener();
}

export function getData(): AppData {
  return data;
}

export function getIndex(): Index {
  if (!cachedIndex || cachedIndex.version !== version) cachedIndex = { version, index: buildIndex(data.records) };
  return cachedIndex.index;
}

function persist(): boolean {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    console.error('Could not save', err);
    return false;
  }
}

/** Applies a change, saves it and redraws. Returns false when the device refused to store it. */
export function mutate(change: (data: AppData, clock: Clock) => void): boolean {
  change(data, clock());
  const saved = persist();
  markDirty();
  notify();
  return saved;
}

/** Swaps in restored data, keeping a copy of what was there so the restore can be undone. */
export function replaceData(next: AppData): void {
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(data));
  data = next;
  persist();
  markDirty();
  notify();
}

export function hasSnapshot(): boolean {
  return localStorage.getItem(SNAPSHOT_KEY) !== null;
}

export function undoRestore(): boolean {
  const raw = localStorage.getItem(SNAPSHOT_KEY);
  if (!raw) return false;
  data = migrate(JSON.parse(raw) as AppData);
  localStorage.removeItem(SNAPSHOT_KEY);
  persist();
  markDirty();
  notify();
  return true;
}

export function eraseAll(): void {
  data = emptyData(new Date().toISOString());
  localStorage.removeItem(SNAPSHOT_KEY);
  persist();
  notify();
}

export function useData(): { data: AppData; index: Index; sync: SyncState } {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return { data, index: getIndex(), sync };
}

// ---- Google Sheets backup ----

export function getSync(): SyncState {
  return sync;
}

export function setSync(patch: Partial<SyncState>): void {
  sync = { ...sync, ...patch };
  localStorage.setItem(SYNC_KEY, JSON.stringify(sync));
  for (const listener of listeners) listener();
}

let timer: ReturnType<typeof setTimeout> | undefined;
let running: Promise<boolean> | null = null;

export function backupNow(): Promise<boolean> {
  if (running) return running;
  clearTimeout(timer);
  const c = clock();
  running = sheetsBackup(sync, data, c.now, APP_VERSION, c.tz)
    .then((reply) => {
      if (reply.ok) setSync({ lastBackupAt: c.now, lastError: null, dirty: false });
      else setSync({ lastError: reply.error ?? 'Backup failed.' });
      return reply.ok;
    })
    .finally(() => {
      running = null;
    });
  return running;
}

const DAY_MS = 86400000;

function backupDue(): boolean {
  if (sync.auto === 'off' || !sync.url || !sync.dirty) return false;
  if (sync.auto === 'changes') return true;
  return !sync.lastBackupAt || Date.now() - Date.parse(sync.lastBackupAt) >= DAY_MS;
}

function markDirty(): void {
  if (!sync.url) return;
  if (!sync.dirty) setSync({ dirty: true });
  clearTimeout(timer);
  // Wait for a quiet moment so a burst of edits becomes one backup.
  if (backupDue()) timer = setTimeout(() => void backupNow(), 15000);
}

/** Called when the app opens and when it is put away: sends any changes still waiting. */
export function backupIfDue(): void {
  if (backupDue() && navigator.onLine !== false) void backupNow();
}
