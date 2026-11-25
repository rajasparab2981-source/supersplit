import React from 'react';

// Small dependency-free SVG charts. Every chart has a text alternative:
// the same numbers are always listed next to it in the view.

export const CHART_COLORS = ['#00E5A0', '#6E5BFF', '#FFC857', '#FF4D6D', '#3DA9FC', '#FF7AB6', '#3FE0D0', '#FFA740', '#A78BFA', '#60A5FA', '#F472B6', '#34D399'];

/** Donut of parts of a whole. data: [{ label, value, color }] */
export function Donut({ data, size = 168, thickness = 22, centerTop, centerBottom }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={`Spending by category: ${data.map((d) => `${d.label} ${total ? Math.round((d.value / total) * 100) : 0}%`).join(', ')}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={thickness} />
      {total > 0 && data.map((d, i) => {
        const len = (d.value / total) * c;
        const el = (
          <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color} strokeWidth={thickness}
            strokeDasharray={`${Math.max(0, len - 1.5)} ${c - Math.max(0, len - 1.5)}`} strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        );
        offset += len;
        return el;
      })}
      {centerTop && <text x="50%" y="47%" textAnchor="middle" fill="#fff" style={{ font: '800 20px Manrope, sans-serif' }}>{centerTop}</text>}
      {centerBottom && <text x="50%" y="60%" textAnchor="middle" fill="#8A8A9C" style={{ font: '600 11px Inter, sans-serif' }}>{centerBottom}</text>}
    </svg>
  );
}

/**
 * Vertical bars. data: [{ key, label, amount }]. Labels are thinned out so
 * they never overlap; `format` turns an amount into text for the summary.
 */
export function Bars({ data, height = 150, color = '#00E5A0', format = (n) => String(n), highlightKey, title }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.amount), 1);
  const W = 320, padB = 20, padT = 14;
  const slot = W / data.length;
  const bw = Math.max(2, Math.min(28, slot * 0.66));
  const every = Math.ceil(data.length / 6);
  const peak = data.reduce((a, b) => (b.amount > a.amount ? b : a), data[0]);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" style={{ display: 'block', height: 'auto' }}
      aria-label={`${title || 'Chart'}: ${data.length} points, highest ${format(peak.amount)} at ${peak.label}`}>
      <line x1="0" x2={W} y1={height - padB} y2={height - padB} stroke="rgba(255,255,255,.10)" strokeWidth="1" />
      {data.map((d, i) => {
        const h = d.amount > 0 ? Math.max(2, ((height - padB - padT) * d.amount) / max) : 0;
        const x = i * slot + (slot - bw) / 2;
        return (
          <g key={d.key}>
            <rect x={x} y={height - padB - h} width={bw} height={h} rx={Math.min(4, bw / 2)}
              fill={color} opacity={highlightKey && highlightKey !== d.key ? 0.45 : 1} />
            {(i % every === 0) && (
              <text x={i * slot + slot / 2} y={height - 6} textAnchor="middle" fill="#8A8A9C" style={{ font: '500 9px Inter, sans-serif' }}>{d.label}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Two horizontal bars comparing a current and a previous value. */
export function CompareBar({ current, previous, format }) {
  const max = Math.max(current, previous, 1);
  const row = (label, v, color) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-soft)' }}>
      <span style={{ width: 44 }}>{label}</span>
      <span style={{ flex: 1, height: 8, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${(v / max) * 100}%`, background: color, borderRadius: 999 }} />
      </span>
      <span style={{ width: 76, textAlign: 'right', color: 'var(--text)', fontWeight: 600 }}>{format(v)}</span>
    </div>
  );
  return <div style={{ display: 'grid', gap: 5 }}>{row('Now', current, 'var(--primary)')}{row('Before', previous, '#6E5BFF')}</div>;
}
