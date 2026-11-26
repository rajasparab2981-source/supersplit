import React, { useMemo } from 'react';
import { CAT_BY_ID } from '../lib/constants';
import { fmtDate } from '../lib/dates';
import { fmtINR } from '../lib/money';
import { calcBalances, calcSettlements } from '../lib/splits';
import { Icon } from '../ui/Icon';
import { Li } from '../ui/LineIcons';
import { Avatar } from '../ui/primitives';

const sign = (n) => (Math.abs(n) < 0.5 ? 'zero' : n > 0 ? 'pos' : 'neg');

/**
 * Group dashboard: where you stand, who owes whom, the members, the group's
 * trips and its latest activity.
 */
export function GroupView({ group, members, trips, self, tripSummaries, entries = [], onOpenTrip, onAddMember, onRemoveMember, onAddTrip, onInvite,
  onAddExpense, onSettleUp, onOpenActions }) {
  const totalSpent = useMemo(() => Object.values(tripSummaries).reduce((s, x) => s + (x?.totalSpent || 0), 0), [tripSummaries]);
  const net = useMemo(() => Object.values(tripSummaries).reduce((s, x) => s + (x?.net || 0), 0), [tripSummaries]);
  // Suggested transfers are worked out per trip, the same way the Settle tab does.
  const transfers = useMemo(() => trips.flatMap((t) =>
    calcSettlements(calcBalances(entries.filter((e) => e.trip_id === t.id))).map((s) => ({ ...s, tripId: t.id, tripName: t.name }))), [trips, entries]);
  const netByName = useMemo(() => Object.fromEntries(calcBalances(entries).map((b) => [b.name, b.net])), [entries]);
  const recent = useMemo(() => [...entries].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 4), [entries]);
  const tripName = (id) => trips.find((t) => t.id === id)?.name || '';

  return (
    <div className="fade-in">
      <section className="summary ghero">
        <button onClick={onOpenActions} aria-label="Group actions" className="icon-btn ghero-more"><Icon.More /></button>
        <div className="ghero-top">
          <span className="gcard-ico" style={{ background: `${group.color}26` }}>{group.emoji}</span>
          <div style={{ minWidth: 0 }}>
            <p className="ghero-label">{!self ? 'Total spent' : sign(net) === 'zero' ? 'You are settled' : net > 0 ? 'You are owed' : 'You owe'}</p>
            <p className={`ghero-amt ${self ? sign(net) : 'zero'}`}>{fmtINR(self ? Math.abs(net) : totalSpent)}</p>
          </div>
        </div>
        <p className="ghero-sub">{members.length} member{members.length === 1 ? '' : 's'} · {trips.length} trip{trips.length === 1 ? '' : 's'} · {fmtINR(totalSpent)} spent in total</p>
        <div className="action-row">
          <button type="button" className="btn btn-primary" onClick={onAddExpense}><Li.Receipt size={18} /> Add expense</button>
          <button type="button" className="btn btn-ghost" onClick={onSettleUp}><Li.Handshake size={18} /> Settle</button>
          <button type="button" className="btn btn-ghost" onClick={onInvite}><Li.GroupAdd size={18} /> Invite</button>
        </div>
      </section>

      <div className="section-head"><h2>Who owes whom</h2></div>
      {transfers.length === 0 ? (
        <p className="muted-note">{entries.length === 0 ? 'Nothing yet. Add an expense to see balances here.' : 'Everyone is settled up.'}</p>
      ) : (
        <div className="list-card">
          {transfers.map((t, i) => (
            <button key={i} type="button" className="list-row" onClick={() => onOpenTrip(t.tripId, 'settle')}>
              <Avatar name={t.from} size="sm" />
              <span className="list-main">
                <span className="list-title"><b>{t.from === self ? 'You' : t.from}</b> {t.from === self ? 'owe' : 'owes'} <b>{t.to === self ? 'you' : t.to}</b></span>
                <span className="list-sub">{t.tripName}</span>
              </span>
              <span className={`list-amt ${t.from === self ? 'neg' : t.to === self ? 'pos' : ''}`}>{fmtINR(t.amount)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="section-head"><h2>Members</h2><button type="button" onClick={onAddMember}>+ Add</button></div>
      {members.length === 0 ? <p className="muted-note">Add the people you split with. They can join later with an invite link.</p> : (
        <div className="list-card">
          {members.map((m) => {
            const v = netByName[m.name] || 0;
            return (
              <div key={m.id} className="list-row">
                <Avatar name={m.name} size="sm" />
                <span className="list-main">
                  <span className="list-title">{m.name}{m.name === self ? ' (you)' : ''}</span>
                  <span className="list-sub">{sign(v) === 'zero' ? 'Settled' : v > 0 ? `Gets back ${fmtINR(v)}` : `Owes ${fmtINR(-v)}`}</span>
                </span>
                <button className="ctx-x" onClick={() => onRemoveMember(m)} aria-label={m.name === self ? 'Leave group' : `Remove ${m.name}`}><Li.Close size={15} /></button>
              </div>
            );
          })}
        </div>
      )}

      <div className="section-head"><h2>Trips & plans</h2><button type="button" onClick={onAddTrip}>+ Add</button></div>
      {trips.length === 0 ? <p className="muted-note">No trips yet. Create one to start adding expenses.</p> : (
        <div>
          {trips.map((t) => {
            const ts = tripSummaries[t.id] || { totalSpent: 0, net: 0, hasSelf: false };
            return (
              <div key={t.id} className="row" role="button" tabIndex={0} onClick={() => onOpenTrip(t.id)} onKeyDown={(ev) => { if (ev.key === 'Enter') onOpenTrip(t.id); }}>
                <span className="row-emoji" style={{ background: `${group.color}22` }}>{t.emoji}</span>
                <div className="row-main">
                  <p className="row-title">{t.name}</p>
                  <p className="row-sub">{ts.totalSpent > 0 ? `${fmtINR(ts.totalSpent)} spent` : 'No expenses yet'}</p>
                </div>
                <div className="row-balance">
                  <div className="b-label">{!ts.hasSelf ? '' : sign(ts.net) === 'zero' ? 'settled' : ts.net > 0 ? "you're owed" : 'you owe'}</div>
                  {sign(ts.net) !== 'zero' && <div className={`b-amt ${sign(ts.net)}`}>{fmtINR(Math.abs(ts.net))}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {recent.length > 0 && (
        <React.Fragment>
          <div className="section-head"><h2>Latest activity</h2></div>
          <div className="list-card">
            {recent.map((e) => (
              <button key={e.id} type="button" className="list-row" onClick={() => onOpenTrip(e.trip_id)}>
                <span className="txn-ico">{e.is_settlement ? '💸' : (CAT_BY_ID[e.category] || CAT_BY_ID.other)?.emoji || '📌'}</span>
                <span className="list-main">
                  <span className="list-title">{e.is_settlement ? `${e.paid_by} paid ${e.split_among[0]}` : e.description}</span>
                  <span className="list-sub">{e.is_settlement ? 'Payment' : `Paid by ${e.paid_by === self ? 'you' : e.paid_by}`} · {tripName(e.trip_id)} · {fmtDate(e.expense_date)}</span>
                </span>
                <span className="list-amt">{fmtINR(e.amount)}</span>
              </button>
            ))}
          </div>
        </React.Fragment>
      )}
      <div className="spacer-fab" />
    </div>
  );
}
