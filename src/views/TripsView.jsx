import React, { useEffect, useState } from 'react';
import { DB } from '../db/db';
import { dayLabel } from '../lib/analytics';
import { fmtINR } from '../lib/money';
import { PlanTripSheet } from '../sheets/PlanTripSheet';
import { Li } from '../ui/LineIcons';

const STATUS = { planning: 'Planning', active: 'In progress', completed: 'Completed' };

function TripArt() {
  return (
    <svg width="140" height="104" viewBox="0 0 140 104" aria-hidden="true">
      <ellipse cx="70" cy="94" rx="54" ry="7" fill="rgb(var(--ink-rgb) / .06)" />
      <circle cx="104" cy="26" r="13" fill="rgb(var(--warning-rgb) / .55)" />
      <path d="M8 86 44 38l22 28 14-16 52 36Z" fill="rgb(var(--accent-rgb) / .22)" />
      <path d="M8 86 44 38l22 28" fill="none" stroke="var(--accent-ink)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M58 76 80 50l52 36" fill="none" stroke="var(--accent-ink)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M30 22h22M38 30h22" stroke="rgb(var(--ink-rgb) / .22)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** All your trips across groups, and the way into the Smart Trip Planner. */
export function TripsView({ groups, trips, tripTotals, plannedTotals = {}, premium, toast, onOpenPlanner, onGoGroups, onOpenPlan, autoPlan }) {
  const [planning, setPlanning] = useState(false);
  // Arriving from Home's "Plan a trip": open the form straight away.
  useEffect(() => { if (autoPlan && premium && groups.length > 0) setPlanning(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const groupById = Object.fromEntries(groups.map((g) => [g.id, g]));
  const sorted = [...trips].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const create = async ({ group_id, name, emoji, details }) => {
    try {
      const id = await DB.planTrip(group_id, name, emoji, details);
      setPlanning(false);
      toast(`"${name}" created`, 'success');
      onOpenPlanner(group_id, id);
    } catch (e) {
      toast(`Could not create the trip: ${e?.code === 'P0003' ? 'planning is a Premium feature.' : e?.message || e}`, 'error');
    }
  };
  const startPlan = () => {
    if (!premium) return onOpenPlan();
    if (groups.length === 0) { toast('Create a group first: a trip belongs to the people going', 'error'); return onGoGroups(); }
    setPlanning(true);
  };

  return (
    <div className="fade-in">
      <section className="trip-hero">
        <span className="trip-hero-ico"><Li.Compass size={24} /></span>
        <h2>Plan the trip before you spend</h2>
        <p>Budget it line by line and day by day. Once you travel, real expenses are tracked against the plan.</p>
        <button type="button" className="btn trip-hero-btn" onClick={startPlan}><Li.Plus size={18} /> Plan a trip</button>
        {!premium && <p className="trip-hero-note">Planning is part of Premium. Tracking trip expenses stays free.</p>}
      </section>

      {sorted.length === 0 ? (
        <div className="empty">
          <TripArt />
          <h3>No trips yet</h3>
          <p>Plan one above, or open a group and add a trip to start tracking its expenses.</p>
        </div>
      ) : (
        <React.Fragment>
          <div className="section-head"><h2>Your trips</h2></div>
          <div className="gcard-list" style={{ marginTop: 0 }}>
            {sorted.map((t) => {
              const g = groupById[t.group_id];
              const s = tripTotals[t.id] || { totalSpent: 0, net: 0, hasSelf: false, count: 0 };
              const planned = plannedTotals[t.id] || 0;
              const when = t.start_date && t.end_date ? `${dayLabel(t.start_date)} – ${dayLabel(t.end_date)}` : null;
              const used = planned > 0 ? Math.round((s.totalSpent / planned) * 100) : 0;
              return (
                <button key={t.id} type="button" className="gcard" onClick={() => onOpenPlanner(t.group_id, t.id)}>
                  <span className="gcard-top">
                    <span className="gcard-ico" style={{ background: `${g?.color || '#00B8A9'}26` }}>{t.emoji}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="gcard-name">{t.name}</span>
                      <span className="gcard-sub">{[t.destination, when, g?.name].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className={`pill ${t.status === 'active' ? 'ok' : t.status === 'planning' ? 'info' : 'mute'}`}>{STATUS[t.status] || 'Trip'}</span>
                  </span>
                  <span className="gcard-foot">
                    <span>
                      <span className="gcard-label">{planned > 0 ? `Spent of ${fmtINR(planned)} planned` : `Spent · ${s.count} expense${s.count === 1 ? '' : 's'}`}</span>
                      <span className="gcard-amt">{fmtINR(s.totalSpent)}</span>
                    </span>
                    {planned > 0 && <span className={`pill ${used > 100 ? 'bad' : used >= 75 ? 'warn' : 'ok'}`}>{used}% used</span>}
                  </span>
                  {planned > 0 && (
                    <span className="trip-bar" role="img" aria-label={`${used}% of the planned budget used`}>
                      <span className={used > 100 ? 'over' : ''} style={{ width: `${Math.min(100, used)}%` }} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </React.Fragment>
      )}
      <div className="spacer-fab" />
      <PlanTripSheet open={planning} onClose={() => setPlanning(false)} groups={groups} onSave={create} />
    </div>
  );
}
