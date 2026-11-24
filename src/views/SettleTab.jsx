import React from 'react';
import { fmtDate } from '../lib/dates';
import { fmtINR } from '../lib/money';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/primitives';

const pillStyle = (primary) => ({
  fontFamily: 'Manrope', fontWeight: 700, fontSize: 12,
  color: primary ? '#0A1A14' : 'var(--text)',
  background: primary ? 'var(--primary)' : 'var(--surface-3)',
  padding: '8px 12px', borderRadius: 999, minHeight: 36,
  boxShadow: primary ? '0 0 0 1px rgba(0,229,160,.4), 0 4px 12px rgba(0,229,160,.3)' : 'none',
  whiteSpace: 'nowrap',
});

export function SettleRow({ s, self, onPay, onMarkPaid }) {
  const youArePayer = self && s.from === self;
  const involvesYou = self && (s.from === self || s.to === self);
  return (
    <div className="settle-row">
      <Avatar name={s.from} size="sm" />
      <span className="who">{s.from === self ? 'You' : s.from}</span>
      <Icon.Arrow className="arrow" />
      <Avatar name={s.to} size="sm" />
      <span className="who">{s.to === self ? 'you' : s.to}</span>
      <span className="pay-amt">{fmtINR(s.amount)}</span>
      {(youArePayer || (involvesYou && onMarkPaid)) && (
        <div className="settle-actions">
          {youArePayer && <button onClick={() => onPay(s)} style={pillStyle(true)}>Pay via UPI</button>}
          {/* Anyone involved can record that the money changed hands (cash, UPI, bank). */}
          {involvesYou && onMarkPaid && (
            <button onClick={() => onMarkPaid(s)} style={pillStyle(false)} aria-label={`Mark ${fmtINR(s.amount)} from ${s.from} to ${s.to} as paid`}>
              Mark as paid
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PaymentsList({ payments, self, onUndoPayment }) {
  if (!payments || payments.length === 0) return null;
  const sorted = [...payments].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return (
    <React.Fragment>
      <p className="section-title">Recorded payments</p>
      <div>
        {sorted.map((p) => (
          <div key={p.id} className="settle-row" style={{ opacity: 0.9 }}>
            <Avatar name={p.paid_by} size="sm" />
            <span className="who">{p.paid_by === self ? 'You' : p.paid_by}</span>
            <Icon.Arrow className="arrow" />
            <Avatar name={p.split_among[0]} size="sm" />
            <span className="who">{p.split_among[0] === self ? 'you' : p.split_among[0]}</span>
            <span className="pay-amt" style={{ color: 'var(--text-soft)' }}>
              {fmtINR(p.amount)}
              <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-mute)' }}>
                {(p.settlement?.method || 'paid').toUpperCase()} · {fmtDate(p.expense_date)}
              </span>
            </span>
            {onUndoPayment && (
              <div className="settle-actions">
                <button onClick={() => onUndoPayment(p)} style={pillStyle(false)} aria-label="Undo this payment">Undo</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </React.Fragment>
  );
}

export function SettleTab({ settlements, balances, self, payments, onPay, onMarkPaid, onUndoPayment }) {
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
      <React.Fragment>
        <div className="empty">
          <div className="emoji-bubble">🎉</div>
          <h3>All settled!</h3>
          <p>No transfers needed — everyone's even.</p>
        </div>
        <PaymentsList payments={payments} self={self} onUndoPayment={onUndoPayment} />
      </React.Fragment>
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
            {yours.map((s, i) => <SettleRow key={'y' + i} s={s} self={self} onPay={onPay} onMarkPaid={onMarkPaid} />)}
          </div>
        </React.Fragment>
      )}
      {others.length > 0 && (
        <React.Fragment>
          <p className="section-title">{yours.length > 0 ? 'Between others' : `${settlements.length} transfer${settlements.length === 1 ? '' : 's'}`}</p>
          <div>
            {others.map((s, i) => <SettleRow key={'o' + i} s={s} self={self} onPay={onPay} onMarkPaid={onMarkPaid} />)}
          </div>
        </React.Fragment>
      )}
      <PaymentsList payments={payments} self={self} onUndoPayment={onUndoPayment} />
    </React.Fragment>
  );
}
