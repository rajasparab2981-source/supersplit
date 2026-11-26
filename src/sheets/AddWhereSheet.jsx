import React from 'react';
import { Li } from '../ui/LineIcons';
import { Sheet } from '../ui/primitives';

const KEY = 'splitpro_last_trip';
export const lastTripId = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const rememberTrip = (id) => { try { localStorage.setItem(KEY, id); } catch { /* storage blocked */ } };

/** First step of "Add expense" from the tab bar: which trip is it for? */
export function AddWhereSheet({ open, onClose, groups, trips, onPick, onNewTrip }) {
  const last = lastTripId();
  const groupById = Object.fromEntries(groups.map((g) => [g.id, g]));
  const sorted = [...trips].sort((a, b) => (a.id === last ? -1 : b.id === last ? 1 : a.created_at < b.created_at ? 1 : -1));
  return (
    <Sheet open={open} onClose={onClose} title="Add an expense to…">
      {sorted.length === 0 ? (
        <div className="empty" style={{ paddingTop: 12 }}>
          <div className="emoji-bubble">🧾</div>
          <h3>No trips yet</h3>
          <p>Expenses are added inside a trip or plan. Create one in a group first.</p>
          <div className="spacer-2" />
          <button className="btn btn-primary" onClick={onNewTrip}>Go to groups</button>
        </div>
      ) : (
        <div>
          {sorted.map((t) => {
            const g = groupById[t.group_id];
            return (
              <div key={t.id} className="row" role="button" tabIndex={0} onClick={() => onPick(t)}
                onKeyDown={(ev) => { if (ev.key === 'Enter') onPick(t); }}>
                <span className="row-emoji" style={{ background: `${g?.color || '#00B8A9'}22` }}>{t.emoji}</span>
                <div className="row-main">
                  <p className="row-title">{t.name}</p>
                  <p className="row-sub">{g?.name}{t.id === last ? ' · last used' : ''}</p>
                </div>
                <span style={{ color: 'var(--text-mute)' }}><Li.Chevron size={18} /></span>
              </div>
            );
          })}
        </div>
      )}
      <div className="spacer-2" />
    </Sheet>
  );
}
