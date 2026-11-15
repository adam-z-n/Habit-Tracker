import { useEffect, useState } from 'preact/hooks';
import { localDay } from '../core/dates';
import { JournalScreen } from './journal';
import { ProgressScreen } from './progress';
import { dueReminders, markShown, notify, snooze, type DueReminder } from './reminders';
import { SettingsScreen } from './settings';
import { SheetHost } from './sheet';
import { backupIfDue, useData } from './store';
import { openLog, TodayScreen } from './today';

type Tab = 'habits' | 'progress' | 'journal' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'habits', label: 'Habits', icon: 'M5 12.5l4.5 4.5L19 7.5' },
  { id: 'progress', label: 'Progress', icon: 'M5 20V11M12 20V4M19 20v-6' },
  { id: 'journal', label: 'Journal', icon: 'M6 4h10a2 2 0 012 2v14H8a2 2 0 01-2-2V4zM9 9h6M9 13h6' },
  { id: 'settings', label: 'Settings', icon: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 4.5v5M8 14.5v5' },
];

export function App() {
  const { data } = useData();
  const [tab, setTab] = useState<Tab>('habits');
  const [today, setToday] = useState(localDay());
  const [due, setDue] = useState<DueReminder[]>([]);

  // Theme and accent follow the settings.
  useEffect(() => {
    const dark = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const theme = data.settings.theme === 'auto' ? (dark.matches ? 'dark' : 'light') : data.settings.theme;
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.setProperty('--accent', data.settings.accent);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#141614' : '#f6f5f2');
    };
    apply();
    dark.addEventListener('change', apply);
    return () => dark.removeEventListener('change', apply);
  }, [data.settings.theme, data.settings.accent]);

  // Keep the date current, check reminders, and send waiting backups when the app comes and goes.
  useEffect(() => {
    const tick = () => {
      setToday(localDay());
      const list = dueReminders();
      setDue((shown) => {
        for (const item of list) if (!shown.some((s) => s.reminder.id === item.reminder.id)) void notify(item);
        return list;
      });
    };
    tick();
    backupIfDue();
    const timer = setInterval(tick, 30000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
      backupIfDue();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const dismiss = (id: string, later: boolean) => {
    if (later) snooze(id);
    else markShown(id);
    setDue(dueReminders());
  };

  return (
    <div class="app">
      {due.map((item) => (
        <div class="reminder" key={item.reminder.id} role="alert">
          <div class="grow">
            <strong>{item.title}</strong>
            <div class="small">{item.body}</div>
          </div>
          <button
            onClick={() => {
              const habit = data.habits.find((h) => h.id === item.reminder.habitId);
              dismiss(item.reminder.id, false);
              if (habit) {
                setTab('habits');
                openLog(habit, today);
              }
            }}
          >
            Log
          </button>
          <button onClick={() => dismiss(item.reminder.id, true)}>Snooze</button>
          <button onClick={() => dismiss(item.reminder.id, false)} aria-label="Dismiss reminder">
            ✕
          </button>
        </div>
      ))}
      <main>
        {tab === 'habits' && <TodayScreen key={today} today={today} />}
        {tab === 'progress' && <ProgressScreen today={today} />}
        {tab === 'journal' && <JournalScreen today={today} />}
        {tab === 'settings' && <SettingsScreen />}
      </main>
      <nav class="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} class={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <path d={t.icon} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <SheetHost />
    </div>
  );
}
