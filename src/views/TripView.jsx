import React, { useState, useEffect, useMemo } from 'react';
import { fmtINR } from '../lib/money';
import { calcBalances, calcSettlements } from '../lib/splits';
import { Icon } from '../ui/Icon';
import { Li } from '../ui/LineIcons';
import { Celebration } from '../ui/primitives';
import { BalancesTab } from './BalancesTab';
import { ExpensesTab } from './ExpensesTab';
import { SettleTab } from './SettleTab';
import { TripRecap } from './TripRecap';

// ---------- Trip view ----------
export function TripView({ group, trip, members, expenses: allEntries, self, onAddExpense, onEditExpense, onDeleteTrip, onPay, onMarkPaid, onUndoPayment, onOpenActions, onReact, initialTab }) {
  const [tab, setTab] = useState(initialTab || 'expenses');
  // Recorded payments arrive as synthetic entries (is_settlement): they count
  // towards balances but are not spending, so lists and totals exclude them.
  const expenses = useMemo(() => allEntries.filter((e) => !e.is_settlement), [allEntries]);
  const payments = useMemo(() => allEntries.filter((e) => e.is_settlement), [allEntries]);
  const total = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount || 0), 0), [expenses]);
  const balances = useMemo(() => calcBalances(allEntries), [allEntries]);
  const settlements = useMemo(() => calcSettlements(balances), [balances]);
  const youNet = self ? (balances.find((b) => b.name === self)?.net || 0) : 0;

  // Celebrate when transitioning from "had transfers" → "fully settled" for this trip
  const [celebrating, setCelebrating] = useState(false);
  const prevSettleCountRef = React.useRef(settlements.length);
  const lastTripIdRef = React.useRef(trip.id);
  useEffect(() => {
    // Reset tracking when switching trips so we don't celebrate on initial mount
    if (lastTripIdRef.current !== trip.id) {
      lastTripIdRef.current = trip.id;
      prevSettleCountRef.current = settlements.length;
      return;
    }
    if (prevSettleCountRef.current > 0 && settlements.length === 0 && expenses.length > 0) {
      setCelebrating(true);
      const t = setTimeout(() => setCelebrating(false), 2700);
      prevSettleCountRef.current = settlements.length;
      return () => clearTimeout(t);
    }
    prevSettleCountRef.current = settlements.length;
  }, [settlements.length, expenses.length, trip.id]);

  return (
    <React.Fragment>
      <div className="summary ghero">
        <button onClick={onOpenActions} aria-label="Trip actions" className="icon-btn ghero-more"><Icon.More /></button>
        <div className="ghero-top">
          <span className="gcard-ico" style={{ background: `${group.color}26` }}>{trip.emoji}</span>
          <div style={{ minWidth: 0 }}>
            <p className="ghero-label">{!self ? 'Total spent' : Math.abs(youNet) < 0.5 ? 'You are settled' : youNet > 0 ? 'You are owed' : 'You owe'}</p>
            <p className={`ghero-amt ${!self || Math.abs(youNet) < 0.5 ? 'zero' : youNet > 0 ? 'pos' : 'neg'}`}>{fmtINR(self ? Math.abs(youNet) : total)}</p>
          </div>
        </div>
        <div className="action-row">
          <button type="button" className="btn btn-primary" onClick={onAddExpense}><Li.Receipt size={18} /> Add expense</button>
          <button type="button" className="btn btn-ghost" onClick={() => setTab('settle')}><Li.Handshake size={18} /> Settle</button>
        </div>
        <div className="summary-split">
          <div>
            <div className="col-label">Expenses</div>
            <div className="col-amt" style={{ color: 'var(--text)' }}>{expenses.length}</div>
          </div>
          <div>
            <div className="col-label">People</div>
            <div className="col-amt" style={{ color: 'var(--text)' }}>{balances.length || members.length}</div>
          </div>
          <div>
            <div className="col-label">Spent</div>
            <div className="col-amt" style={{ color: 'var(--text)' }}>{fmtINR(total)}</div>
          </div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'expenses' ? 'active' : ''}`} onClick={() => setTab('expenses')}>Expenses</button>
        <button className={`tab ${tab === 'balances' ? 'active' : ''}`} onClick={() => setTab('balances')}>Balances</button>
        <button className={`tab ${tab === 'settle' ? 'active' : ''}`}   onClick={() => setTab('settle')}>Settle</button>
      </div>

      {tab === 'expenses' && <ExpensesTab expenses={expenses} self={self} onEdit={onEditExpense} onReact={onReact} />}
      {tab === 'balances' && <BalancesTab balances={balances} self={self} expenses={expenses} />}
      {tab === 'settle'   && <SettleTab settlements={settlements} balances={balances} self={self} payments={payments}
        onPay={(s) => onPay(s, trip)} onMarkPaid={(s) => onMarkPaid(s, trip)} onUndoPayment={onUndoPayment} />}

      {expenses.length >= 2 && <TripRecap trip={trip} group={group} expenses={expenses} balances={balances} />}

      {/* Spacer must come AFTER the recap card, otherwise the FAB floats on
          top of it and hides the last rows. */}
      <div className="spacer-fab" />

      {celebrating && <Celebration message={`"${trip.name}" is fully settled!`} />}
    </React.Fragment>
  );
}
