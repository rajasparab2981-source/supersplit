import React from 'react';
import { fmtDate } from '../lib/dates';
import { Li } from '../ui/LineIcons';

// Only features that work in the app today are listed.
const ROWS = [
  { label: 'Groups, trips and unlimited expenses', free: true },
  { label: 'Equal, percentage and exact splits', free: true },
  { label: 'Balances, settlements and UPI pay links', free: true },
  { label: 'Receipt photos on expenses', free: true },
  { label: 'Spending overview and categories', free: true },
  { label: 'Category drill-down, trends and comparisons', free: false },
  { label: 'Group analytics and spending insights', free: false },
  { label: 'Smart Trip Planner with budgets by day and person', free: false },
  { label: 'Export your spending to CSV', free: false },
];

const Tick = ({ on }) => (on
  ? <span className="cmp-yes" aria-label="Included"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg></span>
  : <span className="cmp-no" aria-label="Not included">–</span>);

/** Your plan, and an honest Free vs Premium comparison. */
export function PremiumView({ plan }) {
  const kind = plan?.plan || 'free';
  const ends = kind === 'premium' ? plan?.premium_until : plan?.trial_ends_at;
  const endText = ends ? fmtDate(String(ends).slice(0, 10)) : null;
  const title = kind === 'trial' ? 'Premium trial' : kind === 'premium' ? 'Premium' : 'Free plan';
  const line = kind === 'trial'
    ? `${plan.days_left} day${plan.days_left === 1 ? '' : 's'} left${endText ? `, until ${endText}` : ''}. No payment details needed.`
    : kind === 'premium' ? (endText ? `Active until ${endText}.` : 'Active.')
      : 'Your trial has ended. Premium features are paused; everything else keeps working.';

  return (
    <div className="fade-in">
      <section className="overview prem-hero" aria-label="Your plan">
        <span className="prem-star"><Li.Star size={22} /></span>
        <p className="overview-label">Your plan</p>
        <p className="overview-net" style={{ fontSize: 28 }}>{title}</p>
        <p className="overview-sub">{line}</p>
      </section>

      <div className="section-head"><h2>What you get</h2></div>
      <div className="cmp" role="table" aria-label="Free and Premium compared">
        <div className="cmp-row cmp-head" role="row">
          <span role="columnheader">Feature</span><span role="columnheader">Free</span><span role="columnheader">Premium</span>
        </div>
        {ROWS.map((r) => (
          <div key={r.label} className="cmp-row" role="row">
            <span role="cell">{r.label}</span>
            <span role="cell"><Tick on={r.free} /></span>
            <span role="cell"><Tick on /></span>
          </div>
        ))}
      </div>

      <div className="note-card">
        <p><b>Subscriptions are not open yet.</b> Nothing is charged today and SplitPro holds no payment details.</p>
        <p>When the trial ends, Premium features pause and your groups, expenses and balances stay exactly as they are. Planned price when subscriptions open: ₹79 a month or ₹599 a year.</p>
      </div>
      <div className="spacer-fab" />
    </div>
  );
}
