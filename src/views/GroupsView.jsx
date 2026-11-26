import React from 'react';
import { fmtINR } from '../lib/money';
import { Li } from '../ui/LineIcons';

const sign = (n) => (Math.abs(n) < 0.5 ? 'zero' : n > 0 ? 'pos' : 'neg');

function GroupsArt() {
  return (
    <svg width="132" height="104" viewBox="0 0 132 104" aria-hidden="true">
      <ellipse cx="66" cy="92" rx="52" ry="8" fill="rgb(var(--ink-rgb) / .06)" />
      <circle cx="42" cy="42" r="20" fill="rgb(var(--accent2-rgb) / .22)" />
      <circle cx="90" cy="42" r="20" fill="rgb(var(--accent-rgb) / .28)" />
      <circle cx="66" cy="34" r="22" fill="var(--surface)" stroke="var(--accent-ink)" strokeWidth="3" />
      <path d="M36 88c2-18 14-28 30-28s28 10 30 28" fill="var(--surface)" stroke="var(--accent-ink)" strokeWidth="3" strokeLinecap="round" />
      <path d="M58 34h16M66 26v16" stroke="var(--accent-ink)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Your groups as cards: who's in, what was spent, where you stand. */
export function GroupsView({ groups, groupSummaries, memberCounts = {}, pendingCounts = {}, onOpen, onAdd }) {
  if (groups.length === 0) {
    return (
      <div className="empty fade-in">
        <GroupsArt />
        <h3>Create your first group</h3>
        <p>A group is the people you share costs with: a trip, your flat, a night out. Add them by name and invite them later.</p>
        <div className="spacer-3" />
        <button className="btn btn-primary" onClick={onAdd}><Li.GroupAdd size={20} /> Create group</button>
      </div>
    );
  }
  return (
    <div className="fade-in">
      <button type="button" className="btn btn-soft btn-full" style={{ marginTop: 8 }} onClick={onAdd}><Li.GroupAdd size={20} /> Create group</button>
      <div className="gcard-list">
        {groups.map((g) => {
          const s = groupSummaries[g.id] || { totalSpent: 0, net: 0, hasSelf: false };
          const n = memberCounts[g.id] || 0;
          const pending = pendingCounts[g.id] || 0;
          return (
            <button key={g.id} type="button" className="gcard" onClick={() => onOpen(g.id)}>
              <span className="gcard-top">
                <span className="gcard-ico" style={{ background: `${g.color}26` }}>{g.emoji}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="gcard-name">{g.name}</span>
                  <span className="gcard-sub">{n} member{n === 1 ? '' : 's'} · {s.totalSpent > 0 ? `${fmtINR(s.totalSpent)} spent` : 'no expenses yet'}</span>
                </span>
                <span className="gcard-chev"><Li.Chevron size={18} /></span>
              </span>
              <span className="gcard-foot">
                <span>
                  <span className="gcard-label">{!s.hasSelf ? 'Your balance' : sign(s.net) === 'zero' ? 'You are settled' : s.net > 0 ? 'You are owed' : 'You owe'}</span>
                  <span className={`gcard-amt ${sign(s.net)}`}>{sign(s.net) === 'zero' ? fmtINR(0) : fmtINR(Math.abs(s.net))}</span>
                </span>
                {pending > 0
                  ? <span className="pill warn">{pending} to settle</span>
                  : s.totalSpent > 0 ? <span className="pill ok">All settled</span> : null}
              </span>
            </button>
          );
        })}
      </div>
      <div className="spacer-fab" />
    </div>
  );
}
