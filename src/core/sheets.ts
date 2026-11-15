import { makeBackup, tables, type Backup } from './exporter';
import type { AppData } from './types';

// Backup to a Google Sheet through the Apps Script in apps-script/Code.gs, which the user deploys
// on their own sheet. The request is sent as plain text so the browser makes no CORS preflight,
// which Apps Script web apps cannot answer.

export interface SheetsConfig {
  url: string;
  secret: string;
}

export interface SheetsReply {
  ok: boolean;
  error?: string;
  savedAt?: string;
  backup?: string;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

async function call(config: SheetsConfig, body: Record<string, unknown>, fetcher: Fetch): Promise<SheetsReply> {
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(config.url.trim())) {
    return { ok: false, error: 'The web app address should start with https://script.google.com/ and end with /exec.' };
  }
  let res: Response;
  try {
    res = await fetcher(config.url.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...body, secret: config.secret }),
      redirect: 'follow',
    });
  } catch {
    return { ok: false, error: 'Could not reach Google. Check the connection and the web app address.' };
  }
  const text = await res.text();
  try {
    const reply = JSON.parse(text) as SheetsReply;
    return typeof reply.ok === 'boolean' ? reply : { ok: false, error: 'Unexpected reply from the sheet.' };
  } catch {
    return { ok: false, error: 'The sheet did not answer as expected. Check that the script is deployed with access set to "Anyone".' };
  }
}

export function sheetsPing(config: SheetsConfig, fetcher: Fetch = fetch): Promise<SheetsReply> {
  return call(config, { action: 'ping' }, fetcher);
}

/** Writes the readable tables to the sheet's tabs and stores the complete backup alongside them. */
export function sheetsBackup(config: SheetsConfig, data: AppData, now: string, appVersion: string, timeZone: string, fetcher: Fetch = fetch): Promise<SheetsReply> {
  const backup = makeBackup(data, now, appVersion, timeZone);
  return call(config, { action: 'backup', savedAt: now, tables: tables(data), backup: JSON.stringify(backup) }, fetcher);
}

/** Fetches the complete backup last stored in the sheet, as backup-file text. */
export async function sheetsRestore(config: SheetsConfig, fetcher: Fetch = fetch): Promise<{ ok: boolean; error?: string; text?: string; savedAt?: string }> {
  const reply = await call(config, { action: 'restore' }, fetcher);
  if (!reply.ok) return { ok: false, error: reply.error };
  if (!reply.backup) return { ok: false, error: 'The sheet has no backup yet.' };
  return { ok: true, text: reply.backup, savedAt: reply.savedAt };
}

export type { Backup };
