import React from 'react';
import { fmtINR } from '../lib/money';

/** All your trips across groups. The Smart Trip Planner will live here. */
export function TripsView({ groups, trips, tripTotals, onOpenTrip, onGoGroups }) {
  const groupById = Object.fromEntries(groups.map((g) => [g.id, g]));
  const sorted = [...trips].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return (
    <React.Fragment>
      <div className="plan-banner" style={{ cursor: 'default' }}>
        <span className="plan-star" aria-hidden="true">🧭</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="plan-title">Smart Trip Planner is coming</span>
          <span className="plan-sub">Plan a budget before you travel, track it live, and compare with past trips. Your trips below will feed it.</span>
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="empty">
          <div className="emoji-bubble">🏖️</div>
          <h3>No trips yet</h3>
          <p>Trips live inside a group. Open a group and add a trip to start tracking its expenses.</p>
          <div className="spacer-3" />
          <button className="btn btn-primary" onClick={onGoGroups}>Go to groups</button>
        </div>
      ) : (
        <React.Fragment>
          <p className="section-title">Your trips</p>
          <div>
            {sorted.map((t) => {
              const g = groupById[t.group_id];
              const s = tripTotals[t.id] || { totalSpent: 0, net: 0, hasSelf: false, count: 0 };
              const settled = Math.abs(s.net) < 0.5;
              return (
                <div key={t.id} className="row" role="button" tabIndex={0} style={{ '--accent-color': g?.color }}
                  onClick={() => onOpenTrip(t.group_id, t.id)} onKeyDown={(ev) => { if (ev.key === 'Enter') onOpenTrip(t.group_id, t.id); }}>
                  <span className="row-emoji" style={{ '--accent-color': g?.color }}>{t.emoji}</span>
                  <div className="row-main">
                    <p className="row-title">{t.name}</p>
                    <p className="row-sub">{g?.name} · {s.count} expense{s.count === 1 ? '' : 's'} · {fmtINR(s.totalSpent)}</p>
                  </div>
                  <div className="row-balance">
                    <div className="b-label">{!s.hasSelf ? '' : settled ? 'settled' : s.net > 0 ? "you're owed" : 'you owe'}</div>
                    <div className={`b-amt ${settled ? 'zero' : s.net > 0 ? 'pos' : 'neg'}`}>{settled ? '—' : fmtINR(Math.abs(s.net))}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </React.Fragment>
      )}
      <div className="spacer-fab" />
    </React.Fragment>
  );
}
