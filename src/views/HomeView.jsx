import React, { useMemo } from 'react';
import { CAT_BY_ID } from '../lib/constants';
import { fmtDate } from '../lib/dates';
import { fmtINR } from '../lib/money';
import { youLine } from '../lib/splits';
import { Icon } from '../ui/Icon';

const sign = (n) => (Math.abs(n) < 0.5 ? 'zero' : n > 0 ? 'pos' : 'neg');

/** Shown on Home and Profile while a trial or paid plan is known. */
export function PlanBanner({ plan, onOpen }) {
  if (!plan) return null;
  const text = plan.plan === 'trial'
    ? `Premium trial · ${plan.days_left} day${plan.days_left === 1 ? '' : 's'} left`
    : plan.plan === 'premium' ? 'Premium is active' : 'Your Premium trial has ended';
  const sub = plan.plan === 'free'
    ? 'Splitting, balances and settling up stay free. Premium features are paused.'
    : 'Advanced analytics, trip planning and more are unlocked as they arrive.';
  return (
    <button type="button" className="plan-banner" onClick={onOpen}>
      <span className="plan-star" aria-hidden="true">★</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="plan-title">{text}</span>
        <span className="plan-sub">{sub}</span>
      </span>
    </button>
  );
}

/** Dashboard: where you stand overall, and what happened recently. */
export function HomeView({ name, groups, trips, expenses, groupSummaries, selfMap, plan, onOpenGroup, onOpenTrip, onAddGroup, onOpenPlan }) {
  const totals = useMemo(() => {
    let owed = 0, owe = 0;
    for (const s of Object.values(groupSummaries)) {
      if (!s?.hasSelf) continue;
      if (s.net > 0) owed += s.net; else owe += -s.net;
    }
    return { owed, owe, net: owed - owe };
  }, [groupSummaries]);

  const recent = useMemo(() => {
    const groupById = Object.fromEntries(groups.map((g) => [g.id, g]));
    const tripById = Object.fromEntries(trips.map((t) => [t.id, t]));
    return [...expenses]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, 6)
      .map((e) => ({ e, group: groupById[e.group_id], trip: tripById[e.trip_id], you: youLine(e, selfMap[e.group_id]) }));
  }, [expenses, groups, trips, selfMap]);

  if (groups.length === 0) {
    return (
      <div className="empty">
        <div className="emoji-bubble">👋</div>
        <h3>Welcome{name ? `, ${name.split(' ')[0]}` : ''}</h3>
        <p>Create a group for a trip, your flat or a night out, then invite your friends.</p>
        <div className="spacer-3" />
        <button className="btn btn-primary" onClick={onAddGroup}><Icon.Plus /> New group</button>
        <div className="spacer-3" />
        <PlanBanner plan={plan} onOpen={onOpenPlan} />
      </div>
    );
  }

  return (
    <React.Fragment>
      <div className="summary">
        <div className="grain" />
        <p className="label">{name ? `Hi ${name.split(' ')[0]} · your balance` : 'Your balance'}</p>
        <p className={`net ${sign(totals.net)}`}>
          {Math.abs(totals.net) < 0.5 ? fmtINR(0) : (totals.net > 0 ? '+' : '−') + fmtINR(Math.abs(totals.net))}
        </p>
        <p className="sub">
          {Math.abs(totals.net) < 0.5 ? "You're all settled up" : totals.net > 0 ? 'Overall, you are owed' : 'Overall, you owe'}
        </p>
        <div className="summary-split">
          <div>
            <div className="col-label">You're owed</div>
            <div className="col-amt" style={{ color: 'var(--primary)' }}>{fmtINR(totals.owed)}</div>
          </div>
          <div>
            <div className="col-label">You owe</div>
            <div className="col-amt" style={{ color: totals.owe > 0.5 ? 'var(--negative)' : 'var(--text)' }}>{fmtINR(totals.owe)}</div>
          </div>
          <div>
            <div className="col-label">Groups</div>
            <div className="col-amt" style={{ color: 'var(--text)' }}>{groups.length}</div>
          </div>
        </div>
      </div>

      <PlanBanner plan={plan} onOpen={onOpenPlan} />

      <p className="section-title">Your groups</p>
      <div>
        {groups.slice(0, 4).map((g) => {
          const s = groupSummaries[g.id] || { net: 0, totalSpent: 0, hasSelf: false };
          return (
            <div key={g.id} className="row" role="button" tabIndex={0} style={{ '--accent-color': g.color }}
              onClick={() => onOpenGroup(g.id)} onKeyDown={(ev) => { if (ev.key === 'Enter') onOpenGroup(g.id); }}>
              <span className="row-emoji" style={{ '--accent-color': g.color }}>{g.emoji}</span>
              <div className="row-main">
                <p className="row-title">{g.name}</p>
                <p className="row-sub">{s.totalSpent > 0 ? `${fmtINR(s.totalSpent)} spent` : 'No expenses yet'}</p>
              </div>
              <div className="row-balance">
                <div className="b-label">{!s.hasSelf ? '' : sign(s.net) === 'zero' ? 'settled' : s.net > 0 ? "you're owed" : 'you owe'}</div>
                <div className={`b-amt ${sign(s.net)}`}>{sign(s.net) === 'zero' ? '—' : fmtINR(Math.abs(s.net))}</div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="section-title">Recent activity</p>
      {recent.length === 0 ? (
        <p style={{ color: 'var(--text-mute)', fontSize: 14, padding: '0 4px' }}>No expenses yet. Open a group to add the first one.</p>
      ) : (
        <div>
          {recent.map(({ e, group, trip, you }) => (
            <div key={e.id} className="row" role="button" tabIndex={0}
              onClick={() => (trip ? onOpenTrip(e.group_id, trip.id) : onOpenGroup(e.group_id))}
              onKeyDown={(ev) => { if (ev.key === 'Enter') (trip ? onOpenTrip(e.group_id, trip.id) : onOpenGroup(e.group_id)); }}>
              <span className="row-emoji">{e.is_settlement ? '💸' : (CAT_BY_ID[e.category] || CAT_BY_ID.other)?.emoji || '📌'}</span>
              <div className="row-main">
                <p className="row-title">{e.description}</p>
                <p className="row-sub">{group?.name}{trip ? ` · ${trip.name}` : ''} · {fmtDate(e.expense_date)}</p>
              </div>
              <div className="row-balance">
                <div className="b-label">{e.is_settlement ? 'payment' : you == null ? 'not involved' : you > 0 ? 'you lent' : you < 0 ? 'you owe' : 'even'}</div>
                <div className={`b-amt ${you == null || e.is_settlement ? 'zero' : sign(you)}`}>
                  {e.is_settlement || you == null ? fmtINR(e.amount) : fmtINR(Math.abs(you))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="spacer-fab" />
    </React.Fragment>
  );
}
