// Settlements across every trip: what is still pending (suggested transfers
// that would clear each trip) and what has been recorded as paid.

import { calcBalances, calcSettlements } from './splits';
import type { Expense } from '../types';

export interface SettleExpense extends Expense {
  group_id: string;
  is_settlement?: boolean;
  settlement?: { id: string; method: string; note: string | null; from: string; to: string };
}
export interface PendingTransfer {
  key: string; from: string; to: string; amount: number;
  tripId: string; tripName: string; groupId: string; groupName: string;
  /** 'pay' = you owe this, 'receive' = you are owed this, 'other' = between other people. */
  role: 'pay' | 'receive' | 'other';
}
export interface CompletedPayment {
  id: string; from: string; to: string; amount: number; date: string; method: string;
  tripId: string; tripName: string; groupId: string; groupName: string;
  role: 'pay' | 'receive' | 'other';
}
export interface SettlementOverview {
  pending: PendingTransfer[]; completed: CompletedPayment[];
  /** Totals of the pending transfers that involve you. */
  youOwe: number; owedToYou: number;
}

export function settlementOverview(
  trips: { id: string; name: string; group_id: string }[],
  groups: { id: string; name: string }[],
  expenses: SettleExpense[],
  selfByGroup: Record<string, string | null | undefined>,
): SettlementOverview {
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const pending: PendingTransfer[] = [];
  const completed: CompletedPayment[] = [];
  let youOwe = 0, owedToYou = 0;

  for (const t of trips) {
    const me = selfByGroup[t.group_id];
    const entries = expenses.filter((e) => e.trip_id === t.id);
    const role = (from: string, to: string) => (me && from === me ? 'pay' : me && to === me ? 'receive' : 'other');
    const base = { tripId: t.id, tripName: t.name, groupId: t.group_id, groupName: groupName.get(t.group_id) ?? '' };

    for (const s of calcSettlements(calcBalances(entries))) {
      const r = role(s.from, s.to);
      if (r === 'pay') youOwe += Math.round(s.amount * 100);
      if (r === 'receive') owedToYou += Math.round(s.amount * 100);
      pending.push({ key: `${t.id}:${s.from}:${s.to}`, from: s.from, to: s.to, amount: s.amount, role: r, ...base });
    }
    for (const e of entries) {
      if (!e.is_settlement) continue;
      const to = e.split_among[0] ?? '';
      completed.push({ id: e.id, from: e.paid_by, to, amount: Number(e.amount), date: e.expense_date,
        method: e.settlement?.method ?? 'other', role: role(e.paid_by, to), ...base });
    }
  }
  const order = { pay: 0, receive: 1, other: 2 };
  pending.sort((a, b) => order[a.role] - order[b.role] || b.amount - a.amount);
  completed.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { pending, completed, youOwe: youOwe / 100, owedToYou: owedToYou / 100 };
}
