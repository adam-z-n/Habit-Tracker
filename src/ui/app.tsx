import { useEffect, useState } from 'preact/hooks';
import { localDay } from '../core/dates';
import { JournalScreen } from './journal';
import { SettingsScreen } from './settings';
import { SheetHost } from './sheet';
import { backupIfDue, useData } from './store';
import { TodayScreen } from './today';
import { TodoScreen } from './todo';

type Tab = 'habits' | 'todo' | 'journal' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'habits', label: 'Habits', icon: 'M5 12.5l4.5 4.5L19 7.5' },
  { id: 'todo', label: 'To-do', icon: 'M10 6.5h10M10 12h10M10 17.5h10M4 6.5l1.2 1.2L7.5 5.3M4 12l1.2 1.2L7.5 10.8M4.5 17.5h2' },
  { id: 'journal', label: 'Journal', icon: 'M6 4h10a2 2 0 012 2v14H8a2 2 0 01-2-2V4zM9 9h6M9 13h6' },
  { id: 'settings', label: 'Settings', icon: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 4.5v5M8 14.5v5' },
];

export function App() {
  const { data } = useData();
  const [tab, setTab] = useState<Tab>('habits');
  const [today, setToday] = useState(localDay());

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

  // Keep the date current, and send waiting backups when the app comes and goes.
  useEffect(() => {
    const tick = () => setToday(localDay());
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

  return (
    <div class="app">
      <main>
        {tab === 'habits' && <TodayScreen key={today} today={today} />}
        {tab === 'todo' && <TodoScreen />}
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
