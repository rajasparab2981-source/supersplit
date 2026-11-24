import type { Balance, Expense, Shares, Transfer } from '../types';
import { allocateByWeights, splitEvenly, toPaise, toRupees, type Paise } from './money';

/** What each person owes on one expense, in paise. Always sums to `paidPaise`. */
export interface ExpenseEffect {
  payer: string;
  /** Amount credited to the payer. Equals the amount, except for legacy rows
   *  whose custom shares don't add up: then the payer absorbs the gap. */
  paidPaise: Paise;
  owed: Record<string, Paise>;
}

export function expenseEffect(e: Expense): ExpenseEffect {
  const amount = toPaise(e.amount);
  const owed: Record<string, Paise> = {};

  if (e.shares && typeof e.shares === 'object' && Object.keys(e.shares).length > 0) {
    let sum = 0;
    for (const [name, rupees] of Object.entries(e.shares)) {
      const p = toPaise(rupees);
      owed[name] = (owed[name] ?? 0) + p;
      sum += p;
    }
    return { payer: e.paid_by, paidPaise: sum, owed };
  }

  const splitters = Array.isArray(e.split_among) ? e.split_among : [];
  if (splitters.length === 0) return { payer: e.paid_by, paidPaise: 0, owed };
  const parts = splitEvenly(amount, splitters.length);
  splitters.forEach((name, i) => {
    owed[name] = (owed[name] ?? 0) + parts[i]!;
  });
  return { payer: e.paid_by, paidPaise: amount, owed };
}

/** { name: rupees } each person owes on this expense. */
export function expenseShares(e: Expense): Record<string, number> {
  const { owed } = expenseEffect(e);
  return Object.fromEntries(Object.entries(owed).map(([k, v]) => [k, toRupees(v)]));
}

/** Net position per person in paise: paid minus owed. Always sums to zero. */
export function netPaise(expenses: Expense[]): Map<string, Paise> {
  const totals = new Map<string, Paise>();
  const add = (name: string, delta: Paise) => totals.set(name, (totals.get(name) ?? 0) + delta);
  for (const e of expenses) {
    const { payer, paidPaise, owed } = expenseEffect(e);
    if (Object.keys(owed).length === 0) continue;
    add(payer, paidPaise);
    for (const [name, p] of Object.entries(owed)) add(name, -p);
  }
  return totals;
}

export function calcBalances(expenses: Expense[]): Balance[] {
  return [...netPaise(expenses).entries()]
    .map(([name, net]) => ({ name, net: toRupees(net) }))
    .sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));
}

/**
 * Suggested transfers that settle everyone, largest debts first. Works in
 * paise, so every transfer is a whole paisa and the result clears exactly.
 */
export function calcSettlements(balances: Balance[]): Transfer[] {
  const creditors = balances
    .map((b) => ({ name: b.name, p: toPaise(b.net) }))
    .filter((b) => b.p > 0)
    .sort((a, b) => b.p - a.p || a.name.localeCompare(b.name));
  const debtors = balances
    .map((b) => ({ name: b.name, p: -toPaise(b.net) }))
    .filter((b) => b.p > 0)
    .sort((a, b) => b.p - a.p || a.name.localeCompare(b.name));

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]!;
    const c = creditors[j]!;
    const amt = Math.min(d.p, c.p);
    transfers.push({ from: d.name, to: c.name, amount: toRupees(amt) });
    d.p -= amt;
    c.p -= amt;
    if (d.p === 0) i++;
    if (c.p === 0) j++;
  }
  return transfers;
}

/** This expense's effect on `self`'s balance, in rupees, or null if not involved. */
export function youLine(e: Expense, self: string | null | undefined): number | null {
  if (!self) return null;
  const { payer, paidPaise, owed } = expenseEffect(e);
  const isPayer = payer === self;
  const myShare = owed[self];
  if (!isPayer && myShare == null) return null;
  return toRupees((isPayer ? paidPaise : 0) - (myShare ?? 0));
}

export type SplitMode = 'equal' | 'percentage' | 'exact';

/**
 * Starting values when the user switches to % or exact mode: an even split
 * that already adds up exactly (e.g. 33.34 / 33.33 / 33.33).
 */
export function seedSplitInputs(mode: 'percentage' | 'exact', amountRupees: number, names: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (names.length === 0) return out;
  if (mode === 'percentage') {
    // Work in hundredths of a percent so the seeds total exactly 100.00.
    const parts = splitEvenly(10_000, names.length);
    names.forEach((n, i) => { out[n] = (parts[i]! / 100).toFixed(2); });
    return out;
  }
  const amount = toPaise(amountRupees);
  if (amount <= 0) {
    for (const n of names) out[n] = '';
    return out;
  }
  const parts = splitEvenly(amount, names.length);
  names.forEach((n, i) => { out[n] = (parts[i]! / 100).toFixed(2); });
  return out;
}

export interface SplitResult {
  /** Rupee shares to save, or null for an equal split. */
  shares: Shares | null;
  splitAmong: string[];
  /** Sum of the inputs (percent or rupees) for the hint line. */
  sum: number;
  error: string | null;
}

/**
 * Turn the expense form's split inputs into what gets saved. Percent splits are
 * converted to rupees that add up exactly; exact splits must match to the paisa.
 */
export function computeSplit(
  mode: SplitMode,
  amountRupees: number,
  splitAmong: string[],
  inputs: Record<string, string>,
): SplitResult {
  if (mode === 'equal') {
    return { shares: null, splitAmong, sum: amountRupees, error: null };
  }

  const entries: [string, number][] = [];
  for (const [name, raw] of Object.entries(inputs)) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) entries.push([name, n]);
  }
  const names = entries.map(([n]) => n);
  const amount = toPaise(amountRupees);

  if (mode === 'percentage') {
    const totalPct = entries.reduce((s, [, n]) => s + n, 0);
    if (Math.abs(totalPct - 100) > 0.005) {
      return { shares: null, splitAmong: names, sum: totalPct, error: `Percentages total ${totalPct.toFixed(2)}%, must total 100%` };
    }
    const parts = allocateByWeights(amount, entries.map(([, n]) => n));
    const shares: Shares = {};
    names.forEach((name, i) => { shares[name] = toRupees(parts[i]!); });
    return { shares, splitAmong: names, sum: totalPct, error: null };
  }

  const totalPaise = entries.reduce((s, [, n]) => s + toPaise(n), 0);
  if (totalPaise !== amount) {
    const diff = toRupees(Math.abs(amount - totalPaise)).toFixed(2);
    const verb = totalPaise < amount ? 'short by' : 'over by';
    return { shares: null, splitAmong: names, sum: toRupees(totalPaise), error: `Amounts are ${verb} ₹${diff}` };
  }
  const shares: Shares = {};
  for (const [name, n] of entries) shares[name] = toRupees(toPaise(n));
  return { shares, splitAmong: names, sum: toRupees(totalPaise), error: null };
}
