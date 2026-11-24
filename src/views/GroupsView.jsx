import React, { useMemo } from 'react';
import { fmtINR } from '../lib/money';
import { Icon } from '../ui/Icon';

// ---------- Home: groups ----------
export function GroupsView({ groups, groupSummaries, onOpen, onAdd }) {
  const overallNet = useMemo(() => Object.values(groupSummaries).reduce((s, x) => s + (x?.net || 0), 0), [groupSummaries]);
  const totalSpent = useMemo(() => Object.values(groupSummaries).reduce((s, x) => s + (x?.totalSpent || 0), 0), [groupSummaries]);
  const anySelf = useMemo(() => Object.values(groupSummaries).some((x) => x?.hasSelf), [groupSummaries]);
  const hasAny = groups.length > 0;

  return (
    <React.Fragment>
      {hasAny && (
        <div className="summary">
          <div className="grain" />
          <p className="label">{anySelf ? 'Your overall balance' : 'Total tracked'}</p>
          {anySelf ? (
            <React.Fragment>
              <p className={`net ${Math.abs(overallNet) < 0.5 ? 'zero' : overallNet > 0 ? 'pos' : 'neg'}`}>
                {Math.abs(overallNet) < 0.5 ? fmtINR(0) : (overallNet > 0 ? '+' : '−') + fmtINR(Math.abs(overallNet))}
              </p>
              <p className="sub">
                {Math.abs(overallNet) < 0.5 ? 'You\'re all settled up' : overallNet > 0 ? 'You are owed across all groups' : 'You owe across all groups'}
              </p>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <p className="net pos">{fmtINR(totalSpent)}</p>
              <p className="sub">Across {groups.length} group{groups.length === 1 ? '' : 's'}</p>
            </React.Fragment>
          )}
        </div>
      )}

      {groups.length === 0 ? (
        <div className="empty">
          <div className="emoji-bubble">👥</div>
          <h3>Start a new group</h3>
          <p>Create your first split — track everything from chai runs to weekend trips.</p>
          <div className="spacer-3" />
          <button className="btn btn-primary" onClick={onAdd}><Icon.Plus /> New group</button>
        </div>
      ) : (
        <React.Fragment>
          <p className="section-title">Your groups</p>
          <div>
            {groups.map((g) => {
              const s = groupSummaries[g.id] || { totalSpent: 0, net: 0, hasSelf: false };
              return (
                <div key={g.id} className="row" style={{ '--accent-color': g.color }} onClick={() => onOpen(g.id)}>
                  <span className="row-emoji" style={{ '--accent-color': g.color }}>{g.emoji}</span>
                  <div className="row-main">
                    <p className="row-title">{g.name}</p>
                    <p className="row-sub">{s.totalSpent > 0 ? `${fmtINR(s.totalSpent)} spent` : 'No expenses yet'}</p>
                  </div>
                  <div className="row-balance">
                    {s.hasSelf ? (
                      <React.Fragment>
                        <div className="b-label">{Math.abs(s.net) < 0.5 ? 'settled' : s.net > 0 ? 'you\'re owed' : 'you owe'}</div>
                        <div className={`b-amt ${Math.abs(s.net) < 0.5 ? 'zero' : s.net > 0 ? 'pos' : 'neg'}`}>
                          {Math.abs(s.net) < 0.5 ? '—' : fmtINR(Math.abs(s.net))}
                        </div>
                      </React.Fragment>
                    ) : (
                      <div className="b-label">tap to view</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </React.Fragment>
      )}

      <div className="spacer-fab" />
      <button className="fab" onClick={onAdd} aria-label="Add group"><Icon.Plus /></button>
    </React.Fragment>
  );
}
