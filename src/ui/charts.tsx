import type { Bucket, Slice } from '../core/breakdown';

// Charts drawn as plain SVG, sized by their container.

export function Ring(props: { value: number; size: number; stroke: number; color?: string }) {
  const r = (props.size - props.stroke) / 2;
  const c = 2 * Math.PI * r;
  const value = Math.max(0, Math.min(1, props.value));
  return (
    <svg class="ring" width={props.size} height={props.size} viewBox={`0 0 ${props.size} ${props.size}`} aria-hidden="true">
      <circle cx={props.size / 2} cy={props.size / 2} r={r} fill="none" stroke="var(--track)" stroke-width={props.stroke} />
      {value > 0 && (
        <circle
          cx={props.size / 2}
          cy={props.size / 2}
          r={r}
          fill="none"
          stroke={props.color ?? 'var(--accent)'}
          stroke-width={props.stroke}
          stroke-linecap="round"
          stroke-dasharray={`${c * value} ${c}`}
          transform={`rotate(-90 ${props.size / 2} ${props.size / 2})`}
        />
      )}
    </svg>
  );
}

/** Shares of a whole, with the total in the middle. */
export function Donut(props: { slices: Slice[]; center: string; caption: string }) {
  const total = props.slices.reduce((sum, s) => sum + s.value, 0);
  const size = 160;
  const stroke = 26;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  // A small gap between slices, so neighbours are told apart by more than colour.
  const gap = props.slices.length > 1 ? 3 : 0;
  return (
    <svg class="donut" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${props.caption}: ${props.slices.map((s) => `${s.name} ${Math.round((s.value / total) * 100)}%`).join(', ')}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" stroke-width={stroke} />
      {total > 0 &&
        props.slices.map((slice) => {
          const length = (slice.value / total) * c;
          const el = (
            <circle
              key={slice.id}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={slice.color}
              stroke-width={stroke}
              stroke-dasharray={`${Math.max(0.5, length - gap)} ${c}`}
              stroke-dashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += length;
          return el;
        })}
      <text x={size / 2} y={size / 2 - 2} text-anchor="middle" class="donut-total">
        {props.center}
      </text>
      <text x={size / 2} y={size / 2 + 16} text-anchor="middle" class="donut-caption">
        {props.caption}
      </text>
    </svg>
  );
}

/** Amounts per week or month, each bar split by activity type. */
export function StackedBars(props: { buckets: Bucket[]; colors: Map<string, string>; format: (value: number) => string; label: string }) {
  const { buckets } = props;
  const max = Math.max(1, ...buckets.map((b) => b.total));
  const width = 320;
  const height = 150;
  const top = 16;
  const bottom = 20;
  const slot = width / buckets.length;
  const bar = Math.min(28, slot * 0.66);
  const scale = (height - top - bottom) / max;
  const every = Math.ceil(buckets.length / 6);
  return (
    <svg class="bars" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${props.label}: ${buckets.map((b) => `${b.label} ${props.format(b.total)}`).join(', ')}`}>
      <line x1="0" x2={width} y1={height - bottom} y2={height - bottom} stroke="var(--line)" />
      {buckets.map((bucket, i) => {
        const x = i * slot + (slot - bar) / 2;
        let y = height - bottom;
        return (
          <g key={bucket.from}>
            {[...bucket.parts.entries()].map(([id, value]) => {
              const h = value * scale;
              y -= h;
              return <rect key={id} x={x} y={y + 1} width={bar} height={Math.max(0, h - 1)} rx="2" fill={props.colors.get(id) ?? '#a3a8ad'} />;
            })}
            {bucket.total > 0 && buckets.length <= 8 && (
              <text x={x + bar / 2} y={y - 4} text-anchor="middle" class="bar-value">
                {props.format(bucket.total)}
              </text>
            )}
            {i % every === 0 && (
              <text x={x + bar / 2} y={height - 5} text-anchor="middle" class="bar-label">
                {bucket.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Percentages over time, one bar per period; periods with nothing due are left empty. */
export function RateBars(props: { points: { label: string; value: number | null }[]; label: string }) {
  const width = 320;
  const height = 110;
  const bottom = 20;
  const top = 6;
  const slot = width / props.points.length;
  const bar = Math.min(28, slot * 0.66);
  const every = Math.ceil(props.points.length / 6);
  return (
    <svg class="bars" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${props.label}: ${props.points.map((p) => `${p.label} ${p.value === null ? 'nothing due' : `${p.value}%`}`).join(', ')}`}>
      <line x1="0" x2={width} y1={top} y2={top} stroke="var(--line)" stroke-dasharray="3 4" />
      <line x1="0" x2={width} y1={height - bottom} y2={height - bottom} stroke="var(--line)" />
      {props.points.map((point, i) => {
        const x = i * slot + (slot - bar) / 2;
        const h = ((point.value ?? 0) / 100) * (height - bottom - top);
        return (
          <g key={i}>
            {point.value !== null && <rect x={x} y={height - bottom - Math.max(2, h)} width={bar} height={Math.max(2, h)} rx="2" fill="var(--accent)" />}
            {i % every === 0 && (
              <text x={x + bar / 2} y={height - 5} text-anchor="middle" class="bar-label">
                {point.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
