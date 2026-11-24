import React, { useMemo } from 'react';
import { fmtINR, toRupees } from '../lib/money';
import { expenseEffect } from '../lib/splits';
import { Avatar } from '../ui/primitives';

export function BalancesTab({ balances, self, expenses }) {
  // Compute per-person "paid" and "share" totals. Net = paid - share matches calcBalances.
  // Summed in integer paise via expenseEffect, the same source as calcBalances.
  const breakdown = useMemo(() => {
    const paid = new Map();
    const share = new Map();
    const add = (m, n, p) => m.set(n, (m.get(n) || 0) + p);
    for (const e of (expenses || [])) {
      const { payer, paidPaise, owed } = expenseEffect(e);
      if (Object.keys(owed).length === 0) continue;
      add(paid, payer, paidPaise);
      for (const [name, p] of Object.entries(owed)) add(share, name, p);
    }
    const names = new Set([...paid.keys(), ...share.keys()]);
    const rows = [...names].map((name) => ({
      name,
      paid: toRupees(paid.get(name) || 0),
      share: toRupees(share.get(name) || 0),
      net: toRupees((paid.get(name) || 0) - (share.get(name) || 0)),
    })).sort((a, b) => b.paid - a.paid);
    const maxPaid = rows.reduce((m, r) => Math.max(m, r.paid), 0);
    const totalPaid = rows.reduce((s, r) => s + r.paid, 0);
    return { rows, maxPaid, totalPaid };
  }, [expenses]);

  if (balances.length === 0) {
    return (
      <div className="empty">
        <div className="emoji-bubble">⚖️</div>
        <h3>Nothing to balance yet</h3>
        <p>Add expenses to see who owes whom.</p>
      </div>
    );
  }

  const selfRow = self ? breakdown.rows.find((r) => r.name === self) : null;
  const selfPct = selfRow && breakdown.totalPaid > 0
    ? Math.round((selfRow.paid / breakdown.totalPaid) * 100)
    : null;

  return (
    <React.Fragment>
      {selfRow && (
        <div className="summary" style={{ padding: 18, marginTop: 8 }}>
          <p className="label">You paid</p>
          <p className="net" style={{ color: 'var(--primary)' }}>{fmtINR(selfRow.paid)}</p>
          <p className="sub">
            {selfPct != null ? `${selfPct}% of the trip's ${fmtINR(breakdown.totalPaid)} total` : ' '}
            {' · share '}{fmtINR(selfRow.share)}
          </p>
        </div>
      )}

      <p className="section-title">Who paid what</p>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-3)',
        padding: 12,
      }}>
        {breakdown.rows.map((r) => {
          const widthPct = breakdown.maxPaid > 0 ? Math.max(2, (r.paid / breakdown.maxPaid) * 100) : 0;
          const isSelf = r.name === self;
          return (
            <div key={r.name} style={{ padding: '10px 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Avatar name={r.name} size="sm" />
                <span style={{ fontFamily: 'Manrope', fontWeight: 600, fontSize: 14, flex: 1, color: 'var(--text)' }}>
                  {isSelf ? `${r.name} (you)` : r.name}
                </span>
                <span className="amt amt-sm" style={{ color: r.paid > 0 ? 'var(--text)' : 'var(--text-mute)' }}>
                  {fmtINR(r.paid)}
                </span>
              </div>
              <div style={{
                height: 6, borderRadius: 999,
                background: 'rgba(255,255,255,.05)',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', width: widthPct + '%',
                  background: r.paid > 0
                    ? (isSelf
                      ? 'linear-gradient(90deg, var(--primary) 0%, #1BFFB8 100%)'
                      : 'linear-gradient(90deg, rgba(0,229,160,.5) 0%, rgba(0,229,160,.8) 100%)')
                    : 'transparent',
                  borderRadius: 999,
                  transition: 'width .35s cubic-bezier(.2,.8,.25,1)',
                }} />
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                marginTop: 6,
                fontFamily: 'Inter', fontWeight: 500, fontSize: 11,
                color: 'var(--text-mute)',
              }}>
                <span>Share {fmtINR(r.share)}</span>
                <span style={{ color: Math.abs(r.net) < 0.5 ? 'var(--text-mute)' : r.net > 0 ? 'var(--primary)' : 'var(--negative)' }}>
                  Net {Math.abs(r.net) < 0.5 ? fmtINR(0) : (r.net > 0 ? '+' : '−') + fmtINR(Math.abs(r.net))}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="section-title">Net positions</p>
      <div>
        {balances.map((b) => {
          const owes = b.net < -0.5;
          const gets = b.net > 0.5;
          const settled = !owes && !gets;
          const isSelf = b.name === self;
          return (
            <div key={b.name} className="balance-row">
              <Avatar name={b.name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="name">{isSelf ? `${b.name} (you)` : b.name}</div>
                <div className="status">
                  {settled ? 'settled up' : gets ? (isSelf ? 'you get back' : 'gets back') : (isSelf ? 'you owe' : 'owes')}
                </div>
              </div>
              <div className={`amt amt-md ${gets ? 'pos' : owes ? 'neg' : 'zero'}`}>
                {settled ? fmtINR(0) : (gets ? '+' : '−') + fmtINR(Math.abs(b.net))}
              </div>
            </div>
          );
        })}
      </div>
    </React.Fragment>
  );
}
