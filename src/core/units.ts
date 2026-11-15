// Units that can be converted into one another, grouped by what they measure. Records always keep
// the value and unit they were entered with; conversion only happens when totals are shown.

export type Dimension = 'duration' | 'distance' | 'weight' | 'volume';

interface UnitInfo {
  dimension: Dimension;
  /** Size of one unit in the dimension's base unit. */
  factor: number;
}

const UNITS: Record<string, UnitInfo> = {
  sec: { dimension: 'duration', factor: 1 / 60 },
  min: { dimension: 'duration', factor: 1 },
  h: { dimension: 'duration', factor: 60 },
  m: { dimension: 'distance', factor: 0.001 },
  km: { dimension: 'distance', factor: 1 },
  mi: { dimension: 'distance', factor: 1.609344 },
  kg: { dimension: 'weight', factor: 1 },
  lb: { dimension: 'weight', factor: 0.45359237 },
  ml: { dimension: 'volume', factor: 0.001 },
  L: { dimension: 'volume', factor: 1 },
};

const ALIASES: Record<string, string> = {
  s: 'sec',
  secs: 'sec',
  second: 'sec',
  seconds: 'sec',
  mins: 'min',
  minute: 'min',
  minutes: 'min',
  hr: 'h',
  hrs: 'h',
  hour: 'h',
  hours: 'h',
  meter: 'm',
  meters: 'm',
  metre: 'm',
  metres: 'm',
  kilometer: 'km',
  kilometers: 'km',
  kilometre: 'km',
  kilometres: 'km',
  kms: 'km',
  mile: 'mi',
  miles: 'mi',
  kilogram: 'kg',
  kilograms: 'kg',
  kgs: 'kg',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  milliliter: 'ml',
  milliliters: 'ml',
  l: 'L',
  liter: 'L',
  liters: 'L',
  litre: 'L',
  litres: 'L',
};

/** The canonical spelling of a known unit, or null for a custom unit. */
export function canonicalUnit(unit: string | undefined): string | null {
  if (!unit) return null;
  const trimmed = unit.trim();
  if (UNITS[trimmed]) return trimmed;
  const lower = trimmed.toLowerCase();
  if (UNITS[lower]) return lower;
  return ALIASES[lower] ?? null;
}

export function dimensionOf(unit: string | undefined): Dimension | null {
  const canonical = canonicalUnit(unit);
  return canonical ? UNITS[canonical].dimension : null;
}

/** Converts between compatible units; null when the two cannot be compared. */
export function convert(value: number, from: string | undefined, to: string | undefined): number | null {
  if ((from ?? '') === (to ?? '')) return value;
  const a = canonicalUnit(from);
  const b = canonicalUnit(to);
  if (!a || !b) return null;
  if (a === b) return value;
  if (UNITS[a].dimension !== UNITS[b].dimension) return null;
  return (value * UNITS[a].factor) / UNITS[b].factor;
}

export function formatNumber(value: number, precision = 2): string {
  const rounded = Number(value.toFixed(precision));
  return rounded.toLocaleString('en-US', { maximumFractionDigits: precision });
}

/** `95` minutes as `1h 35m`. */
export function formatMinutes(minutes: number): string {
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export const UNIT_SUGGESTIONS = ['min', 'h', 'mi', 'km', 'pages', 'reps', 'sets', 'kg', 'lb', 'L', 'steps'];
