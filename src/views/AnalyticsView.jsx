import React, { useMemo, useState } from 'react';
import { monthRange, personalSummary } from '../lib/analytics';
import { CAT_BY_ID } from '../lib/constants';
import { todayISO } from '../lib/dates';
import { fmtINR } from '../lib/money';

/**
 * Basic (free) dashboard: your real share of spending and where it went.
 * Every number comes from personalSummary() over actual expense records.
 */
export function AnalyticsView({ expenses, selfMap }) {
  const [period, setPeriod] = useState('month'); // 'month' | 'all'
  const range = useMemo(() => (period === 'month' ? monthRange(todayISO()) : {}), [period]);
  const s = useMemo(() => personalSummary(expenses, selfMap, range), [expenses, selfMap, range]);
  const monthName = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <React.Fragment>
      <div className="tabs" role="tablist" style={{ marginTop: 4 }}>
        <button className={`tab ${period === 'month' ? 'active' : ''}`} onClick={() => setPeriod('month')}>This month</button>
        <button className={`tab ${period === 'all' ? 'active' : ''}`} onClick={() => setPeriod('all')}>All time</button>
      </div>

      <div className="summary">
        <div className="grain" />
        <p className="label">Your spending · {period === 'month' ? monthName : 'all time'}</p>
        <p className="net" style={{ color: 'var(--text)' }}>{fmtINR(s.myShare)}</p>
        <p className="sub">Your share across {s.count} expense{s.count === 1 ? '' : 's'}. Not the full bills, only your part.</p>
        <div className="summary-split">
          <div>
            <div className="col-label">You paid</div>
            <div className="col-amt" style={{ color: 'var(--text)' }}>{fmtINR(s.paid)}</div>
          </div>
          <div>
            <div className="col-label">For others</div>
            <div className="col-amt" style={{ color: 'var(--primary)' }}>{fmtINR(s.paidForOthers)}</div>
          </div>
          <div>
            <div className="col-label">Paid for you</div>
            <div className="col-amt" style={{ color: 'var(--text)' }}>{fmtINR(s.coveredByOthers)}</div>
          </div>
        </div>
      </div>

      <p className="section-title">Where it went</p>
      {s.byCategory.length === 0 ? (
        <div className="empty" style={{ paddingTop: 24 }}>
          <div className="emoji-bubble">📊</div>
          <h3>Nothing to show yet</h3>
          <p>{period === 'month' ? 'No expenses with your share this month. Try “All time”.' : 'Add expenses in a group and your spending by category appears here.'}</p>
        </div>
      ) : (
        <div className="cat-list">
          {s.byCategory.map((c) => {
            const info = CAT_BY_ID[c.category] || { label: c.category, emoji: '📌' };
            return (
              <div key={c.category} className="cat-row">
                <span className="cat-emoji" aria-hidden="true">{info.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="cat-line">
                    <span className="cat-name">{info.label}</span>
                    <span className="cat-amt">{fmtINR(c.amount)}</span>
                  </div>
                  <div className="cat-bar" role="img" aria-label={`${info.label}: ${Math.round(c.pct)}% of your spending`}>
                    <span style={{ width: `${Math.max(2, c.pct)}%` }} />
                  </div>
                  <div className="cat-meta">{Math.round(c.pct)}% · {c.count} expense{c.count === 1 ? '' : 's'}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="plan-banner" style={{ cursor: 'default', marginTop: 20 }}>
        <span className="plan-star" aria-hidden="true">★</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="plan-title">More analytics are on the way</span>
          <span className="plan-sub">Month-on-month comparison, trends, group and people breakdowns, insights and exports (Premium).</span>
        </span>
      </div>
      <div className="spacer-fab" />
    </React.Fragment>
  );
}
