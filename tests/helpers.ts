import type { Clock } from '../src/core/ops';
import { emptyData, type AppData } from '../src/core/types';

export function clockAt(today: string, time = '09:00'): Clock {
  return { now: `${today}T${time}:00.000Z`, today, time, tz: 'America/New_York' };
}

export function freshData(): AppData {
  return emptyData('2026-01-01T00:00:00.000Z');
}
