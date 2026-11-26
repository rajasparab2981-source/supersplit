import React, { useState } from 'react';
import { fmtDate } from '../lib/dates';
import { fmtINR } from '../lib/money';
import { Li } from '../ui/LineIcons';
import { Avatar } from '../ui/primitives';

const METHOD = { upi: 'UPI', cash: 'Cash', bank: 'Bank transfer', other: 'Paid' };

/**
 * Every balance to settle, across all groups (or one group): what is
 * pending, and the payments already recorded.
 */
export function SettlementsView({ overview, selfByGroup, groupName, onPay, onMarkPaid, onOpenTrip, onShowAll }) {
  const [tab, setTab] = useState('pending');
  const { pending, completed, youOwe, owedToYou } = overview;
  const me = (p) => selfByGroup[p.groupId];
  const label = (p, verbs) => {
    const self = me(p);
    return <React.Fragment><b>{p.from === self ? 'You' : p.from}</b> {p.from === self ? verbs[0] : verbs[1]} <b>{p.to === self ? 'you' : p.to}</b></React.Fragment>;
  };

  return (
    <div className="fade-in">
      {groupName && (
        <p className="filter-note">Showing <b>{groupName}</b> only. <button type="button" onClick={onShowAll}>Show all groups</button></p>
      )}
      <section className="overview" aria-label="To settle">
        <p className="overview-label">Still to settle</p>
        <div className="overview-split" style={{ marginTop: 10 }}>
          <div className="overview-cell owe"><span>You owe</span><strong>{fmtINR(youOwe)}</strong></div>
          <div className="overview-cell owed"><span>Owed to you</span><strong>{fmtINR(owedToYou)}</strong></div>
        </div>
      </section>

      <div className="seg two" role="group" aria-label="Show" style={{ marginTop: 16 }}>
        <button type="button" aria-pressed={tab === 'pending'} onClick={() => setTab('pending')}>Pending ({pending.length})</button>
        <button type="button" aria-pressed={tab === 'completed'} onClick={() => setTab('completed')}>Completed ({completed.length})</button>
      </div>

      {tab === 'pending' && (pending.length === 0 ? (
        <div className="empty">
          <span className="receipt-check sm" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </span>
          <h3>All settled up</h3>
          <p>Nobody owes anything right now. New expenses will show up here when there is something to settle.</p>
        </div>
      ) : (
        <div className="settle-list">
          {pending.map((p) => (
            <div key={p.key} className={`settle-card ${p.role}`}>
              <div className="settle-card-top">
                <Avatar name={p.role === 'receive' ? p.from : p.to} size="sm" />
                <span className="list-main">
                  <span className="list-title">{label(p, ['pay', 'pays'])}</span>
                  <span className="list-sub">{p.tripName} · {p.groupName}</span>
                </span>
                <span className={`list-amt ${p.role === 'pay' ? 'neg' : p.role === 'receive' ? 'pos' : ''}`}>{fmtINR(p.amount)}</span>
              </div>
              <div className="settle-card-actions">
                {p.role === 'pay' && <button type="button" className="btn btn-primary" onClick={() => onPay(p)}>Pay via UPI</button>}
                {p.role !== 'other' && <button type="button" className="btn btn-ghost" onClick={() => onMarkPaid(p)}>Mark as paid</button>}
                <button type="button" className="btn btn-ghost" onClick={() => onOpenTrip(p.groupId, p.tripId)}>View trip</button>
              </div>
            </div>
          ))}
          <p className="muted-note">These are the fewest transfers that clear each trip. Paying happens in your own UPI app; SplitPro only keeps the record.</p>
        </div>
      ))}

      {tab === 'completed' && (completed.length === 0 ? (
        <div className="empty">
          <span className="svc-ico" style={{ margin: '0 auto' }}><Li.Handshake /></span>
          <h3>No payments recorded yet</h3>
          <p>When someone pays and it is marked as paid, it is listed here.</p>
        </div>
      ) : (
        <div className="list-card" style={{ marginTop: 14 }}>
          {completed.map((c) => (
            <button key={c.id} type="button" className="list-row" onClick={() => onOpenTrip(c.groupId, c.tripId)}>
              <span className="done-dot" aria-hidden="true">✓</span>
              <span className="list-main">
                <span className="list-title">{label(c, ['paid', 'paid'])}</span>
                <span className="list-sub">{METHOD[c.method] || 'Paid'} · {fmtDate(c.date)} · {c.tripName}</span>
              </span>
              <span className="list-amt">{fmtINR(c.amount)}</span>
            </button>
          ))}
        </div>
      ))}
      <div className="spacer-fab" />
    </div>
  );
}
