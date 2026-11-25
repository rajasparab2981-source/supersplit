// Personal spending figures, computed from real expense records in paise.
//
// The key rule: what you SPENT is your share of each expense, never the full
// bill. What you PAID is tracked separately, and recorded settlements are
// repayments, not spending, so they are excluded here.

import { toRupees } from './money';
import { expenseEffect } from './splits';
import type { Expense } from '../types';

export interface AnalyticsExpense extends Expense {
  group_id: string;
  is_settlement?: boolean;
}

export interface DateRange { from?: string; to?: string } // inclusive YYYY-MM-DD

export interface CategoryTotal { category: string; amount: number; count: number; pct: number }

export interface PersonalSummary {
  /** Your share of all expenses (your actual consumption), in rupees. */
  myShare: number;
  /** Total you paid out of pocket. */
  paid: number;
  /** Part of what you paid that was for other people. */
  paidForOthers: number;
  /** Your share that someone else paid for. */
  coveredByOthers: number;
  /** Number of expenses you had a share in. */
  count: number;
  byCategory: CategoryTotal[];
}

const inRange = (d: string, r: DateRange) => (!r.from || d >= r.from) && (!r.to || d <= r.to);

/**
 * @param selfByGroup your member name in each group ({ groupId: name })
 */
export function personalSummary(
  expenses: AnalyticsExpense[],
  selfByGroup: Record<string, string | null | undefined>,
  range: DateRange = {},
): PersonalSummary {
  let myShare = 0, paid = 0, paidForOthers = 0, coveredByOthers = 0, count = 0;
  const cat = new Map<string, { amount: number; count: number }>();

  for (const e of expenses) {
    if (e.is_settlement) continue;
    const me = selfByGroup[e.group_id];
    if (!me || !inRange(e.expense_date, range)) continue;
    const { payer, paidPaise, owed } = expenseEffect(e);
    const mine = owed[me] ?? 0;
    const iPaid = payer === me ? paidPaise : 0;
    if (mine === 0 && iPaid === 0) continue;

    myShare += mine;
    paid += iPaid;
    if (iPaid > 0) paidForOthers += iPaid - mine;
    else coveredByOthers += mine;

    if (mine > 0) {
      count += 1;
      const key = e.category || 'other';
      const c = cat.get(key) ?? { amount: 0, count: 0 };
      c.amount += mine;
      c.count += 1;
      cat.set(key, c);
    }
  }

  const byCategory = [...cat.entries()]
    .map(([category, c]) => ({ category, amount: toRupees(c.amount), count: c.count, pct: myShare > 0 ? (c.amount / myShare) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));

  return {
    myShare: toRupees(myShare), paid: toRupees(paid), paidForOthers: toRupees(paidForOthers),
    coveredByOthers: toRupees(coveredByOthers), count, byCategory,
  };
}

/** First and last day of the month containing `today` (YYYY-MM-DD). */
export function monthRange(today: string): Required<DateRange> {
  const [y, m] = today.split('-').map(Number) as [number, number];
  const last = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}
