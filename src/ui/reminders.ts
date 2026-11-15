import { addDays, localDay, localTime, weekday } from '../core/dates';
import { dayStatus, isDone } from '../core/stats';
import type { AppData, Reminder } from '../core/types';
import { getData, getIndex } from './store';

// Reminders without a server: while the app is open (or still alive in the background) it checks
// the time and shows a notification. For alerts that arrive when the app is closed, the reminders
// can be exported to the phone's calendar as repeating events with alarms.

const FIRED_KEY = 'habits:reminders-fired';
const SNOOZE_MS = 10 * 60 * 1000;

interface Fired {
  day: string;
  ids: string[];
  snoozed: Record<string, number>;
}

function readFired(today: string): Fired {
  try {
    const parsed = JSON.parse(localStorage.getItem(FIRED_KEY) ?? '') as Fired;
    if (parsed.day === today) return parsed;
  } catch {
    /* start fresh */
  }
  return { day: today, ids: [], snoozed: {} };
}

const writeFired = (f: Fired) => localStorage.setItem(FIRED_KEY, JSON.stringify(f));

export interface DueReminder {
  reminder: Reminder;
  title: string;
  body: string;
}

export function reminderText(data: AppData, reminder: Reminder): { title: string; body: string } {
  const habit = data.habits.find((h) => h.id === reminder.habitId);
  const title = habit ? `${habit.icon} ${habit.name}` : 'Habit reminder';
  return { title, body: reminder.text || (habit ? `Time for ${habit.name.toLowerCase()}` : 'Time for your habit') };
}

/** Reminders whose time has come in the last hour and that have not been shown, snoozed or already done. */
export function dueReminders(now: Date = new Date()): DueReminder[] {
  const data = getData();
  const today = localDay(now);
  const time = localTime(now);
  const fired = readFired(today);
  const out: DueReminder[] = [];
  for (const reminder of data.reminders) {
    if (!reminder.enabled || !reminder.days.includes(weekday(today))) continue;
    const habit = data.habits.find((h) => h.id === reminder.habitId);
    if (!habit || habit.status !== 'active') continue;
    if (reminder.time > time) continue;
    const [h, m] = reminder.time.split(':').map(Number);
    const age = now.getHours() * 60 + now.getMinutes() - (h * 60 + m);
    const snoozedUntil = fired.snoozed[reminder.id];
    if (snoozedUntil ? now.getTime() < snoozedUntil : fired.ids.includes(reminder.id) || age > 60) continue;
    // No need to nag about something already done.
    if (isDone(dayStatus(habit, getIndex(), today))) continue;
    out.push({ reminder, ...reminderText(data, reminder) });
  }
  return out;
}

export function markShown(id: string): void {
  const fired = readFired(localDay());
  if (!fired.ids.includes(id)) fired.ids.push(id);
  delete fired.snoozed[id];
  writeFired(fired);
}

export function snooze(id: string): void {
  const fired = readFired(localDay());
  fired.snoozed[id] = Date.now() + SNOOZE_MS;
  writeFired(fired);
}

export async function notify(due: DueReminder): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(due.title, { body: due.body, tag: due.reminder.id, icon: './icon-192.png' });
    else new Notification(due.title, { body: due.body, tag: due.reminder.id });
  } catch {
    /* the in-app banner still shows */
  }
}

/** The reminders as a calendar file: repeating events with an alert at the reminder time. */
export function remindersIcs(data: AppData, stamp: Date = new Date()): string {
  const codes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const compact = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d+/, '');
  const escape = (text: string) => text.replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Habits//Reminders//EN', 'CALSCALE:GREGORIAN'];
  for (const reminder of data.reminders) {
    const habit = data.habits.find((h) => h.id === reminder.habitId);
    if (!reminder.enabled || !habit || habit.status !== 'active' || !reminder.days.length) continue;
    // Start on the first matching day from today.
    let day = localDay(stamp);
    while (!reminder.days.includes(weekday(day))) day = addDays(day, 1);
    const { title, body } = reminderText(data, reminder);
    const start = `${day.replace(/-/g, '')}T${reminder.time.replace(':', '')}00`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${reminder.id}@habits`,
      `DTSTAMP:${compact(stamp.toISOString())}`,
      `DTSTART:${start}`,
      'DURATION:PT5M',
      `RRULE:FREQ=WEEKLY;BYDAY=${[...reminder.days].sort().map((d) => codes[d]).join(',')}`,
      `SUMMARY:${escape(title)}`,
      `DESCRIPTION:${escape(body)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escape(body)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
