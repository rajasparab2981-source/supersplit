import React from 'react';
import { fmtINR } from '../lib/money';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/primitives';

export function SettleRow({ s, self, onPay }) {
  const isYours = self && (s.from === self || s.to === self);
  const youArePayer = self && s.from === self;
  return (
    <div className="settle-row">
      <Avatar name={s.from} size="sm" />
      <span className="who">{s.from === self ? 'You' : s.from}</span>
      <Icon.Arrow className="arrow" />
      <Avatar name={s.to} size="sm" />
      <span className="who">{s.to === self ? 'you' : s.to}</span>
      <span className="pay-amt">{fmtINR(s.amount)}</span>
      {youArePayer && (
        <button
          onClick={() => onPay(s)}
          style={{
            fontFamily: 'Manrope', fontWeight: 700, fontSize: 12,
            color: '#0A1A14', background: 'var(--primary)',
            padding: '6px 14px', borderRadius: 999,
            boxShadow: '0 0 0 1px rgba(0,229,160,.4), 0 4px 12px rgba(0,229,160,.3)',
            marginLeft: 8,
          }}
        >Pay</button>
      )}
    </div>
  );
}

export function SettleTab({ settlements, balances, self, onPay }) {
  if (balances.length === 0) {
    return (
      <div className="empty">
        <div className="emoji-bubble">🎯</div>
        <h3>Nothing to settle</h3>
        <p>Add expenses to generate settle-up suggestions.</p>
      </div>
    );
  }
  if (settlements.length === 0) {
    return (
      <div className="empty">
        <div className="emoji-bubble">🎉</div>
        <h3>All settled!</h3>
        <p>No transfers needed — everyone's even.</p>
      </div>
    );
  }
  const yours = self ? settlements.filter((s) => s.from === self || s.to === self) : [];
  const others = self ? settlements.filter((s) => s.from !== self && s.to !== self) : settlements;
  return (
    <React.Fragment>
      {yours.length > 0 && (
        <React.Fragment>
          <p className="section-title">Your transfers</p>
          <div>
            {yours.map((s, i) => <SettleRow key={'y' + i} s={s} self={self} onPay={onPay} />)}
          </div>
        </React.Fragment>
      )}
      {others.length > 0 && (
        <React.Fragment>
          <p className="section-title">{yours.length > 0 ? 'Between others' : `${settlements.length} transfer${settlements.length === 1 ? '' : 's'}`}</p>
          <div>
            {others.map((s, i) => <SettleRow key={'o' + i} s={s} self={self} onPay={onPay} />)}
          </div>
        </React.Fragment>
      )}
    </React.Fragment>
  );
}
