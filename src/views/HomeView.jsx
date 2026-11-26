import React, { useMemo, useState } from 'react';
import { CAT_BY_ID } from '../lib/constants';
import { fmtDate } from '../lib/dates';
import { homeCards, loadDismissed, saveDismissed } from '../lib/homeCards';
import { fmtINR } from '../lib/money';
import { youLine } from '../lib/splits';
import { Li } from '../ui/LineIcons';

const sign = (n) => (Math.abs(n) < 0.5 ? 'zero' : n > 0 ? 'pos' : 'neg');
const CARD_ICON = { wallet: Li.Wallet, handshake: Li.Handshake, alert: Li.Alert, star: Li.Star };

/** Kept for Profile: plan status line. */
export function PlanBanner({ plan, onOpen }) {
  if (!plan) return null;
  const text = plan.plan === 'trial' ? `Premium trial · ${plan.days_left} day${plan.days_left === 1 ? '' : 's'} left`
    : plan.plan === 'premium' ? 'Premium is active' : 'Your Premium trial has ended';
  return (
    <button type="button" className="plan-banner" onClick={onOpen}>
      <span className="plan-star" aria-hidden="true"><Li.Star size={18} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="plan-title">{text}</span>
        <span className="plan-sub">{plan.plan === 'free' ? 'Splitting, balances and settling up stay free.' : 'Analytics and the Smart Trip Planner are unlocked.'}</span>
      </span>
    </button>
  );
}

function TripArt() {
  return (
    <svg className="promo-art" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="78" cy="42" r="26" fill="rgb(var(--accent-rgb) / .25)" />
      <path d="M12 96c14-22 28-30 42-26s22 20 54 6v26H12Z" fill="rgb(var(--accent2-rgb) / .22)" />
      <path d="M30 78 96 40 70 92 60 74Z" fill="var(--surface)" stroke="var(--accent-ink)" strokeWidth="3" strokeLinejoin="round" />
      <path d="m60 74 36-34" stroke="var(--accent-ink)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Task-first dashboard: balance, quick actions, things that need attention
 * (from real data only), services, groups and recent activity.
 */
export function HomeView({
  name, groups, trips, expenses, members = [], groupSummaries, selfMap, plan, premium, tripAlerts = [], insights = [],
  onAddExpense, onAddGroup, onSettleUp, onPlanTrip, onOpenGroup, onOpenTrip, onOpenPlanner, onGoGroups, onGoTrips,
  onOpenAnalytics, onOpenCalc, onOpenPlan,
}) {
  const [dismissed, setDismissed] = useState(loadDismissed);
  const totals = useMemo(() => {
    let owed = 0, owe = 0;
    for (const s of Object.values(groupSummaries)) { if (!s?.hasSelf) continue; if (s.net > 0) owed += s.net; else owe += -s.net; }
    return { owed, owe, net: owed - owe };
  }, [groupSummaries]);

  const cards = useMemo(() => homeCards({ groups, groupSummaries, tripAlerts, plan, money: (r) => fmtINR(r) })
    .filter((c) => !dismissed.includes(c.id)), [groups, groupSummaries, tripAlerts, plan, dismissed]);
  const dismiss = (id) => { const next = [...dismissed, id]; setDismissed(next); saveDismissed(next); };
  const openCard = (t) => (t.kind === 'group' ? onOpenGroup(t.groupId) : t.kind === 'settle' ? onSettleUp(t.groupId)
    : t.kind === 'planner' ? onOpenPlanner(t.groupId, t.tripId) : onOpenPlan());

  const recent = useMemo(() => {
    const groupById = Object.fromEntries(groups.map((g) => [g.id, g]));
    const tripById = Object.fromEntries(trips.map((t) => [t.id, t]));
    return [...expenses].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 5)
      .map((e) => ({ e, group: groupById[e.group_id], trip: tripById[e.trip_id], you: youLine(e, selfMap[e.group_id]) }));
  }, [expenses, groups, trips, selfMap]);
  const memberCount = (gid) => members.filter((m) => m.group_id === gid && !m.left_at).length;
  const first = name ? name.split(' ')[0] : '';

  const quick = [
    { label: 'Add expense', Icon: Li.Receipt, onClick: onAddExpense },
    { label: 'Create group', Icon: Li.GroupAdd, onClick: onAddGroup, alt: true },
    { label: 'Settle up', Icon: Li.Handshake, onClick: () => onSettleUp(), alt: true },
    { label: 'Plan a trip', Icon: Li.Compass, onClick: onPlanTrip, alt: true },
  ];
  // Only services that exist today. More appear here as they are built.
  const services = [
    { label: 'Groups', Icon: Li.Groups, onClick: onGoGroups },
    { label: 'Trip Planner', Icon: Li.Trips, onClick: onGoTrips },
    { label: 'Analytics', Icon: Li.Chart, onClick: onOpenAnalytics },
    { label: 'Calculator', Icon: Li.Calc, onClick: onOpenCalc },
  ];

  return (
    <div className="fade-in">
      <section className="overview" aria-label="Your balance">
        <p className="overview-label">{first ? `Hi ${first}, your net balance` : 'Your net balance'}</p>
        <p className="overview-net">{sign(totals.net) === 'zero' ? fmtINR(0) : (totals.net > 0 ? '+' : '−') + fmtINR(Math.abs(totals.net))}</p>
        <p className="overview-sub">
          {groups.length === 0 ? 'Create a group to start splitting.' : sign(totals.net) === 'zero' ? "You're all settled up." : totals.net > 0 ? 'Overall, friends owe you.' : 'Overall, you owe friends.'}
        </p>
        <div className="overview-split">
          <div className="overview-cell owed"><span>Owed to you</span><strong>{fmtINR(totals.owed)}</strong></div>
          <div className="overview-cell owe"><span>You owe</span><strong>{fmtINR(totals.owe)}</strong></div>
        </div>
      </section>

      <div className="quick-grid">
        {quick.map(({ label, Icon, onClick, alt }) => (
          <button key={label} type="button" className="quick" onClick={onClick}>
            <span className={`quick-ico ${alt ? 'alt' : ''}`}><Icon /></span>
            {label}
          </button>
        ))}
      </div>

      {cards.length > 0 && (
        <div className="ctx-list" aria-label="Things that need your attention">
          {cards.map((c) => {
            const Icon = CARD_ICON[c.icon];
            return (
              <div key={c.id} className={`ctx-card ${c.tone === 'warn' ? 'warn' : c.tone === 'good' ? 'good' : ''}`}>
                <span className="ctx-ico"><Icon size={20} /></span>
                <div className="ctx-text">
                  {c.text}
                  <div><button type="button" className="ctx-cta" onClick={() => openCard(c.target)}>{c.cta} →</button></div>
                </div>
                <button type="button" className="ctx-x" aria-label="Dismiss" onClick={() => dismiss(c.id)}><Li.Close size={16} /></button>
              </div>
            );
          })}
        </div>
      )}

      <div className="section-head"><h2>Services</h2></div>
      <div className="svc-card">
        <div className="svc-grid">
          {services.map(({ label, Icon, onClick }) => (
            <button key={label} type="button" className="svc" onClick={onClick}>
              <span className="svc-ico"><Icon /></span>
              {label}
            </button>
          ))}
        </div>
      </div>

      {groups.length > 0 && (
        <React.Fragment>
          <div className="section-head"><h2>Your groups</h2>{groups.length > 3 && <button type="button" onClick={onGoGroups}>View all</button>}</div>
          <div>
            {groups.slice(0, 3).map((g) => {
              const s = groupSummaries[g.id] || { net: 0, totalSpent: 0, hasSelf: false };
              const n = memberCount(g.id);
              return (
                <div key={g.id} className="row" role="button" tabIndex={0} onClick={() => onOpenGroup(g.id)}
                  onKeyDown={(ev) => { if (ev.key === 'Enter') onOpenGroup(g.id); }}>
                  <span className="row-emoji" style={{ background: `${g.color}22` }}>{g.emoji}</span>
                  <div className="row-main">
                    <p className="row-title">{g.name}</p>
                    <p className="row-sub">{n} member{n === 1 ? '' : 's'} · {s.totalSpent > 0 ? `${fmtINR(s.totalSpent)} spent` : 'no expenses yet'}</p>
                  </div>
                  <div className="row-balance">
                    <div className="b-label">{!s.hasSelf ? '' : sign(s.net) === 'zero' ? 'settled' : s.net > 0 ? "you're owed" : 'you owe'}</div>
                    <div className={`b-amt ${sign(s.net)}`}>{sign(s.net) === 'zero' ? '—' : fmtINR(Math.abs(s.net))}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </React.Fragment>
      )}

      {recent.length > 0 && (
        <React.Fragment>
          <div className="section-head"><h2>Recent activity</h2></div>
          <div>
            {recent.map(({ e, group, trip, you }) => (
              <div key={e.id} className="row" role="button" tabIndex={0}
                onClick={() => (trip ? onOpenTrip(e.group_id, trip.id) : onOpenGroup(e.group_id))}
                onKeyDown={(ev) => { if (ev.key === 'Enter') (trip ? onOpenTrip(e.group_id, trip.id) : onOpenGroup(e.group_id)); }}>
                <span className="txn-ico">{e.is_settlement ? '💸' : (CAT_BY_ID[e.category] || CAT_BY_ID.other)?.emoji || '📌'}</span>
                <div className="row-main">
                  <p className="row-title">{e.description}</p>
                  <p className="row-sub">{group?.name} · {fmtDate(e.expense_date)}</p>
                </div>
                <div className="row-balance">
                  <div className="b-label">{e.is_settlement ? 'payment' : you == null ? 'not involved' : you > 0 ? 'you lent' : you < 0 ? 'your share' : 'even'}</div>
                  <div className={`b-amt ${e.is_settlement || you == null ? 'zero' : sign(you)}`}>
                    {e.is_settlement || you == null ? fmtINR(e.amount) : fmtINR(Math.abs(you))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </React.Fragment>
      )}

      {premium && insights.length > 0 && (
        <React.Fragment>
          <div className="section-head"><h2>This month</h2><button type="button" onClick={onOpenAnalytics}>Analytics</button></div>
          <ul className="insights">{insights.slice(0, 2).map((t, i) => <li key={i}>{t}</li>)}</ul>
        </React.Fragment>
      )}

      <section className="promo">
        <h3>Planning your next trip?</h3>
        <p>Build a budget line by line, then track your real spending against it.</p>
        <button type="button" className="btn btn-primary" onClick={onPlanTrip}>Plan a trip</button>
        <TripArt />
      </section>

      {plan && plan.plan !== 'premium' && (
        <section className="promo premium">
          <h3>{plan.plan === 'trial' ? `Premium trial · ${plan.days_left} day${plan.days_left === 1 ? '' : 's'} left` : 'SplitPro Premium'}</h3>
          <p>{plan.plan === 'trial' ? 'Analytics and the Smart Trip Planner are unlocked for you.' : 'Advanced analytics and the Smart Trip Planner.'}</p>
          <button type="button" className="btn" onClick={onOpenPlan}>See what's included</button>
        </section>
      )}
      <div className="spacer-fab" />
    </div>
  );
}
