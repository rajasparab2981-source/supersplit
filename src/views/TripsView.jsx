import React, { useEffect, useState } from 'react';
import { DB } from '../db/db';
import { dayLabel } from '../lib/analytics';
import { fmtINR } from '../lib/money';
import { PlanTripSheet } from '../sheets/PlanTripSheet';
import { Icon } from '../ui/Icon';

const STATUS = { planning: 'Planning', active: 'In progress', completed: 'Completed' };

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
    <React.Fragment>
      <div className="summary">
        <div className="grain" />
        <p className="label">🧭 Smart Trip Planner</p>
        <p className="sub" style={{ marginTop: 6 }}>Plan what a trip will cost, line by line and day by day. Once you travel, your real expenses are tracked against the plan.</p>
        <div className="spacer-2" />
        <button className="btn btn-primary" onClick={startPlan}><Icon.Plus /> Plan a trip{premium ? '' : ' ★'}</button>
        {!premium && <p className="sub" style={{ fontSize: 12, marginTop: 8 }}>Planning is part of Premium. Tracking trip expenses stays free.</p>}
      </div>

      {sorted.length === 0 ? (
        <div className="empty">
          <div className="emoji-bubble">🏖️</div>
          <h3>No trips yet</h3>
          <p>Plan one above, or open a group and add a trip to start tracking its expenses.</p>
        </div>
      ) : (
        <React.Fragment>
          <p className="section-title">Your trips</p>
          <div>
            {sorted.map((t) => {
              const g = groupById[t.group_id];
              const s = tripTotals[t.id] || { totalSpent: 0, net: 0, hasSelf: false, count: 0 };
              const planned = plannedTotals[t.id] || 0;
              const when = t.start_date && t.end_date ? `${dayLabel(t.start_date)} – ${dayLabel(t.end_date)}` : null;
              return (
                <div key={t.id} className="row" role="button" tabIndex={0} style={{ '--accent-color': g?.color }}
                  onClick={() => onOpenPlanner(t.group_id, t.id)} onKeyDown={(ev) => { if (ev.key === 'Enter') onOpenPlanner(t.group_id, t.id); }}>
                  <span className="row-emoji" style={{ '--accent-color': g?.color }}>{t.emoji}</span>
                  <div className="row-main">
                    <p className="row-title">{t.name}</p>
                    <p className="row-sub">{[t.destination, when, g?.name].filter(Boolean).join(' · ')}</p>
                    <p className="row-sub">{STATUS[t.status] || 'Trip'} · spent {fmtINR(s.totalSpent)}{planned > 0 ? ` of ${fmtINR(planned)} planned` : ''}</p>
                  </div>
                  <div className="row-balance">
                    <div className="b-label">{s.count} expense{s.count === 1 ? '' : 's'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </React.Fragment>
      )}
      <div className="spacer-fab" />
      <PlanTripSheet open={planning} onClose={() => setPlanning(false)} groups={groups} onSave={create} />
    </React.Fragment>
  );
}
