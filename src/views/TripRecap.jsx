import React, { useMemo } from 'react';
import { CAT_BY_ID } from '../lib/constants';
import { fmtDate } from '../lib/dates';
import { fmtINR } from '../lib/money';
import { Avatar } from '../ui/primitives';

export function TripRecap({ trip, group, expenses, balances }) {
  const stats = useMemo(() => {
    const total = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    // Date range
    const dates = expenses.map((e) => e.expense_date).filter(Boolean).sort();
    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];
    const dayCount = (firstDate && lastDate)
      ? Math.max(1, Math.round((new Date(lastDate) - new Date(firstDate)) / 86400000) + 1)
      : 1;

    // By date for "busiest day"
    const byDate = new Map();
    for (const e of expenses) {
      const k = e.expense_date;
      byDate.set(k, (byDate.get(k) || 0) + Number(e.amount || 0));
    }
    let busiestDay = null;
    let busiestDayAmt = 0;
    for (const [k, v] of byDate) if (v > busiestDayAmt) { busiestDayAmt = v; busiestDay = k; }

    // By category
    const byCat = new Map();
    for (const e of expenses) byCat.set(e.category || 'other', (byCat.get(e.category || 'other') || 0) + Number(e.amount || 0));
    let topCat = 'other'; let topCatAmt = 0;
    for (const [k, v] of byCat) if (v > topCatAmt) { topCatAmt = v; topCat = k; }
    const topCatPct = total > 0 ? Math.round((topCatAmt / total) * 100) : 0;
    const topCatInfo = CAT_BY_ID[topCat] || CAT_BY_ID.other;

    // Biggest single expense
    const biggest = expenses.reduce((m, e) => (Number(e.amount || 0) > Number(m?.amount || 0) ? e : m), null);

    // Biggest spender
    const paid = new Map();
    for (const e of expenses) paid.set(e.paid_by, (paid.get(e.paid_by) || 0) + Number(e.amount || 0));
    let topSpender = null; let topSpenderAmt = 0;
    for (const [n, v] of paid) if (v > topSpenderAmt) { topSpenderAmt = v; topSpender = n; }

    const memberCount = balances.length || paid.size;
    const avgPerPerson = memberCount > 0 ? total / memberCount : 0;

    return { total, dayCount, busiestDay, busiestDayAmt, topCat: topCatInfo, topCatPct, topCatAmt, biggest, topSpender, topSpenderAmt, memberCount, avgPerPerson };
  }, [expenses, balances]);

  const copyRecap = () => {
    const lines = [
      `${trip.emoji} ${trip.name} — trip recap`,
      `${fmtINR(stats.total)} across ${expenses.length} expenses · ${stats.dayCount} day${stats.dayCount === 1 ? '' : 's'}`,
      stats.topSpender ? `Top spender: ${stats.topSpender} (${fmtINR(stats.topSpenderAmt)})` : null,
      stats.busiestDay ? `Biggest day: ${fmtDate(stats.busiestDay)} (${fmtINR(stats.busiestDayAmt)})` : null,
      `Top category: ${stats.topCat.emoji} ${stats.topCat.label} (${stats.topCatPct}%)`,
      `Avg per person: ${fmtINR(stats.avgPerPerson)}`,
    ].filter(Boolean);
    const text = lines.join('\n');
    try {
      navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  return (
    <React.Fragment>
      <p className="section-title">Trip recap</p>
      <div className="summary" style={{
        background: `radial-gradient(120% 100% at 0% 0%, ${group.color}24 0%, transparent 60%), radial-gradient(100% 80% at 100% 100%, ${group.color}18 0%, transparent 60%), linear-gradient(140deg, var(--surface) 0%, var(--surface-2) 100%)`,
        borderColor: `${group.color}40`,
        padding: 20,
      }}>
        <div className="grain" />
        <div style={{ position: 'relative' }}>
          <p className="label" style={{ color: group.color }}>Recap · {stats.dayCount} day{stats.dayCount === 1 ? '' : 's'}</p>
          <p className="net" style={{ color: 'var(--text)' }}>{fmtINR(stats.total)}</p>
          <p className="sub">across {expenses.length} expense{expenses.length === 1 ? '' : 's'} · avg {fmtINR(stats.avgPerPerson)}/person</p>

          <div className="recap-grid">
            {stats.topSpender && (
              <div className="recap-cell">
                <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 10, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Top spender</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, minWidth: 0 }}>
                  <Avatar name={stats.topSpender} size="sm" />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stats.topSpender}</div>
                    <div style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 13, color: 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmtINR(stats.topSpenderAmt)}</div>
                  </div>
                </div>
              </div>
            )}
            <div className="recap-cell">
              <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 10, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Top category</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, minWidth: 0 }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{stats.topCat.emoji}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stats.topCat.label}</div>
                  <div style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: 12, color: 'var(--text-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stats.topCatPct}% of spend</div>
                </div>
              </div>
            </div>
            {stats.busiestDay && (
              <div className="recap-cell">
                <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 10, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Biggest day</div>
                <div style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 14, color: 'var(--text)', marginTop: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmtDate(stats.busiestDay)}</div>
                <div style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 13, color: 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmtINR(stats.busiestDayAmt)}</div>
              </div>
            )}
            {stats.biggest && (
              <div className="recap-cell">
                <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 10, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Biggest expense</div>
                <div style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 14, color: 'var(--text)', marginTop: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stats.biggest.description}</div>
                <div style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: 13, color: 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmtINR(stats.biggest.amount)}</div>
              </div>
            )}
          </div>

          <button
            className="btn btn-soft btn-full"
            onClick={copyRecap}
            style={{ marginTop: 16 }}
          >Copy recap to share</button>
        </div>
      </div>
    </React.Fragment>
  );
}
