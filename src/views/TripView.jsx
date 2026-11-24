import React, { useState, useEffect, useMemo } from 'react';
import { fmtINR } from '../lib/money';
import { calcBalances, calcSettlements } from '../lib/splits';
import { Icon } from '../ui/Icon';
import { Celebration } from '../ui/primitives';
import { BalancesTab } from './BalancesTab';
import { ExpensesTab } from './ExpensesTab';
import { SettleTab } from './SettleTab';
import { TripRecap } from './TripRecap';

// ---------- Trip view ----------
export function TripView({ group, trip, members, expenses: allEntries, self, onAddExpense, onEditExpense, onDeleteTrip, onPay, onMarkPaid, onUndoPayment, onOpenActions, onReact }) {
  const [tab, setTab] = useState('expenses');
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
      <div className="summary" style={{
        background: `radial-gradient(120% 100% at 0% 0%, ${group.color}28 0%, transparent 60%), radial-gradient(100% 80% at 100% 100%, ${group.color}1A 0%, transparent 60%), linear-gradient(140deg, #15151E 0%, #1C1C2C 100%)`,
        borderColor: `${group.color}40`,
      }}>
        <div className="grain" />
        <button
          onClick={onOpenActions}
          aria-label="Trip actions"
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
        <p className="label" style={{ color: group.color }}>{trip.emoji} {trip.name}</p>
        {self ? (
          <React.Fragment>
            <p className={`net ${Math.abs(youNet) < 0.5 ? 'zero' : youNet > 0 ? 'pos' : 'neg'}`}>
              {Math.abs(youNet) < 0.5 ? fmtINR(0) : (youNet > 0 ? '+' : '−') + fmtINR(Math.abs(youNet))}
            </p>
            <p className="sub">
              {Math.abs(youNet) < 0.5 ? 'Settled in this trip' : youNet > 0 ? 'You are owed in this trip' : 'You owe in this trip'}
            </p>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <p className="net" style={{ color: 'var(--text)' }}>{fmtINR(total)}</p>
            <p className="sub">Total spent · {expenses.length} expense{expenses.length === 1 ? '' : 's'}</p>
          </React.Fragment>
        )}
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

      {tab === 'expenses' && members.length > 0 && (
        <button className="fab" onClick={onAddExpense} aria-label="Add expense"><Icon.Plus /></button>
      )}

      {celebrating && <Celebration message={`"${trip.name}" is fully settled!`} />}
    </React.Fragment>
  );
}
