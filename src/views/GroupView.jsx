import React, { useMemo } from 'react';
import { fmtINR } from '../lib/money';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/primitives';

// ---------- Group view ----------
export function GroupView({ group, members, trips, self, tripSummaries, onOpenTrip, onAddMember, onRemoveMember, onAddTrip, onDeleteGroup, onChangeSelf, onOpenActions }) {
  const totalSpent = useMemo(() => Object.values(tripSummaries).reduce((s, x) => s + (x?.totalSpent || 0), 0), [tripSummaries]);
  const net = useMemo(() => Object.values(tripSummaries).reduce((s, x) => s + (x?.net || 0), 0), [tripSummaries]);
  const youGet = useMemo(() => Object.values(tripSummaries).reduce((s, x) => s + Math.max(0, x?.net || 0), 0), [tripSummaries]);
  const youOwe = useMemo(() => Object.values(tripSummaries).reduce((s, x) => s + Math.max(0, -(x?.net || 0)), 0), [tripSummaries]);

  return (
    <React.Fragment>
      {members.length > 0 && (
        <div className="self-bar">
          <span className="self-label">I am</span>
          <span className="self-current">
            {self ? (
              <React.Fragment><Avatar name={self} size="sm" /> {self}</React.Fragment>
            ) : (
              <span style={{ color: 'var(--text-mute)' }}>not set</span>
            )}
          </span>
          <button onClick={onChangeSelf}>{self ? 'Change' : 'Pick'}</button>
        </div>
      )}

      {/* Hero */}
      <div className="summary" style={{
        background: `radial-gradient(120% 100% at 0% 0%, ${group.color}30 0%, transparent 60%), radial-gradient(100% 80% at 100% 100%, ${group.color}20 0%, transparent 60%), linear-gradient(140deg, #15151E 0%, #1C1C2C 100%)`,
        borderColor: `${group.color}40`,
      }}>
        <div className="grain" />
        <button
          onClick={onOpenActions}
          aria-label="Group actions"
          style={{
            position: 'absolute', top: 8, right: 8,
            // 36px → 44px: this kebab sits in a corner where mis-taps are
            // most likely, and it was the smallest control on the screen.
            width: 44, height: 44, borderRadius: 999,
            background: 'rgba(0,0,0,.25)',
            color: 'rgba(255,255,255,.8)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid rgba(255,255,255,.08)',
            backdropFilter: 'blur(8px)',
            zIndex: 2,
            cursor: 'pointer',
          }}
        ><Icon.More /></button>
        <p className="label" style={{ color: group.color }}>{group.emoji} {group.name}</p>
        {self ? (
          <React.Fragment>
            <p className={`net ${Math.abs(net) < 0.5 ? 'zero' : net > 0 ? 'pos' : 'neg'}`}>
              {Math.abs(net) < 0.5 ? fmtINR(0) : (net > 0 ? '+' : '−') + fmtINR(Math.abs(net))}
            </p>
            <p className="sub">
              {Math.abs(net) < 0.5 ? 'You\'re settled in this group' : net > 0 ? 'You are owed (net)' : 'You owe (net)'}
            </p>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <p className="net" style={{ color: group.color }}>{fmtINR(totalSpent)}</p>
            <p className="sub">Total spent · pick yourself for personalized balance</p>
          </React.Fragment>
        )}
        <div className="summary-split">
          <div>
            <div className="col-label">You're owed</div>
            <div className="col-amt pos">{fmtINR(youGet)}</div>
          </div>
          <div>
            <div className="col-label">You owe</div>
            <div className="col-amt neg">{fmtINR(youOwe)}</div>
          </div>
          <div>
            <div className="col-label">Total spent</div>
            <div className="col-amt" style={{ color: 'var(--text)' }}>{fmtINR(totalSpent)}</div>
          </div>
        </div>
      </div>

      <div className="section-row">
        <p className="section-title">Members</p>
        <button className="add-btn" onClick={onAddMember}>+ Add</button>
      </div>

      {members.length === 0 ? (
        <div className="row" style={{ '--accent-color': 'var(--text-faint)', cursor: 'default' }}>
          <div className="row-main">
            <p className="row-sub" style={{ color: 'var(--text-soft)', textTransform: 'none', letterSpacing: 0, fontSize: 14 }}>
              Add members to start splitting expenses.
            </p>
          </div>
        </div>
      ) : (
        <div style={{ padding: '8px 8px 4px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-3)' }}>
          <div className="chips" style={{ padding: 8 }}>
            {members.map((m) => (
              <span key={m.id} className="member-pill">
                <Avatar name={m.name} />
                {m.name === self && <span className="you-tag" style={{ color: 'var(--primary)' }}>YOU</span>}
                {m.name}
                <button className="x" onClick={() => onRemoveMember(m)} aria-label={`Remove ${m.name}`}>✕</button>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="section-row">
        <p className="section-title">Trips & plans</p>
        <button className="add-btn" onClick={onAddTrip}>+ Add</button>
      </div>

      {trips.length === 0 ? (
        <div className="row" style={{ '--accent-color': 'var(--text-faint)', cursor: 'default' }}>
          <div className="row-main">
            <p className="row-sub" style={{ color: 'var(--text-soft)', textTransform: 'none', letterSpacing: 0, fontSize: 14 }}>
              No trips yet. Create one to start adding expenses.
            </p>
          </div>
        </div>
      ) : (
        <div>
          {trips.map((t) => {
            const ts = tripSummaries[t.id] || { totalSpent: 0, net: 0, hasSelf: false };
            return (
              <div key={t.id} className="row" style={{ '--accent-color': group.color }} onClick={() => onOpenTrip(t.id)}>
                <span className="row-emoji" style={{ '--accent-color': group.color }}>{t.emoji}</span>
                <div className="row-main">
                  <p className="row-title">{t.name}</p>
                  <p className="row-sub">{ts.totalSpent > 0 ? `${fmtINR(ts.totalSpent)} spent` : 'No expenses yet'}</p>
                </div>
                <div className="row-balance">
                  {ts.hasSelf && Math.abs(ts.net) >= 0.5 ? (
                    <React.Fragment>
                      <div className="b-label">{ts.net > 0 ? 'you\'re owed' : 'you owe'}</div>
                      <div className={`b-amt ${ts.net > 0 ? 'pos' : 'neg'}`}>{fmtINR(Math.abs(ts.net))}</div>
                    </React.Fragment>
                  ) : (
                    <div className="b-label">{ts.hasSelf ? 'settled' : 'tap to view'}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="spacer-fab" />
    </React.Fragment>
  );
}
