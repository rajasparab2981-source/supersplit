// Spending analytics, computed from real expense records in integer paise.
//
// Rules that every figure follows:
//  * What you SPENT is your share of each expense, never the full bill.
//  * What you PAID is tracked separately from what you consumed.
//  * Recorded settlements are repayments, not spending: they are only
//    counted in settlementTotals() and in people's outstanding balances.
//  * Nothing is estimated. With too little data, functions return null or
//    an empty list rather than a guess.

import { toPaise, toRupees } from './money';
import { expenseEffect } from './splits';
import type { Expense } from '../types';

export interface AnalyticsExpense extends Expense {
  group_id: string;
  is_settlement?: boolean;
}
export interface DateRange { from?: string; to?: string } // inclusive YYYY-MM-DD
export type FullRange = Required<DateRange>;
export type SelfMap = Record<string, string | null | undefined>;

// ---------- Dates (pure calendar maths on YYYY-MM-DD, no timezones) ----------
const pad = (n: number) => String(n).padStart(2, '0');
const toUTC = (iso: string) => { const [y, m, d] = iso.split('-').map(Number) as [number, number, number]; return Date.UTC(y, m - 1, d); };
const fromUTC = (t: number) => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
export const addDays = (iso: string, n: number) => fromUTC(toUTC(iso) + n * 86_400_000);
/** Number of calendar days from a to b, inclusive. */
export const daysInclusive = (a: string, b: string) => Math.max(1, Math.round((toUTC(b) - toUTC(a)) / 86_400_000) + 1);
const monthKey = (iso: string) => iso.slice(0, 7);
const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const monthStart = (y: number, m: number) => `${y}-${pad(m)}-01`;
const monthEnd = (y: number, m: number) => `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}`;
/** Shift (year, month) by n months. */
const shiftMonth = (y: number, m: number, n: number): [number, number] => { const i = y * 12 + (m - 1) + n; return [Math.floor(i / 12), (i % 12) + 1]; };
const isWeekend = (iso: string) => { const d = new Date(toUTC(iso)).getUTCDay(); return d === 0 || d === 6; };
export const monthLabel = (key: string) => new Date(toUTC(key + '-01')).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });
export const dayLabel = (iso: string) => new Date(toUTC(iso)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** First and last day of the month containing `today`. */
export function monthRange(today: string): FullRange {
  const [y, m] = today.split('-').map(Number) as [number, number];
  return { from: monthStart(y, m), to: monthEnd(y, m) };
}

export type Preset = 'last7' | 'last30' | 'thisMonth' | 'prevMonth' | 'last3m' | 'last6m' | 'thisYear' | 'prevYear' | 'all' | 'custom';
export const PRESETS: { id: Preset; label: string }[] = [
  { id: 'last7', label: 'Last 7 days' }, { id: 'last30', label: 'Last 30 days' },
  { id: 'thisMonth', label: 'This month' }, { id: 'prevMonth', label: 'Last month' },
  { id: 'last3m', label: 'Last 3 months' }, { id: 'last6m', label: 'Last 6 months' },
  { id: 'thisYear', label: 'This year' }, { id: 'prevYear', label: 'Last year' },
  { id: 'all', label: 'All time' }, { id: 'custom', label: 'Custom dates' },
];

export interface Period {
  /** The selected period. `to` never runs past today for current periods. */
  range: DateRange;
  /** The period it is compared with (the one just before), or null for "all time". */
  previous: FullRange | null;
  label: string;
  previousLabel: string;
}

/**
 * Resolve a preset to dates. Current periods end today (so averages use days
 * that have actually happened); the comparison period is the one just before.
 */
export function periodFor(preset: Preset, today: string, custom?: DateRange): Period {
  const [y, m] = today.split('-').map(Number) as [number, number];
  const windowed = (days: number, label: string): Period => {
    const from = addDays(today, -(days - 1));
    return { range: { from, to: today }, previous: { from: addDays(from, -days), to: addDays(from, -1) }, label, previousLabel: `the ${days} days before` };
  };
  const months = (startOffset: number, count: number, label: string, endToday: boolean): Period => {
    const [sy, sm] = shiftMonth(y, m, startOffset);
    const [ey, em] = shiftMonth(sy, sm, count - 1);
    const [py, pm] = shiftMonth(sy, sm, -count);
    const [pey, pem] = shiftMonth(sy, sm, -1);
    return {
      range: { from: monthStart(sy, sm), to: endToday ? today : monthEnd(ey, em) },
      previous: { from: monthStart(py, pm), to: monthEnd(pey, pem) },
      label, previousLabel: count === 1 ? monthLabel(`${py}-${pad(pm)}`) : `the ${count} months before`,
    };
  };
  switch (preset) {
    case 'last7': return windowed(7, 'the last 7 days');
    case 'last30': return windowed(30, 'the last 30 days');
    case 'thisMonth': return months(0, 1, monthLabel(`${y}-${pad(m)}`), true);
    case 'prevMonth': { const [py, pm] = shiftMonth(y, m, -1); return months(-1, 1, monthLabel(`${py}-${pad(pm)}`), false); }
    case 'last3m': return months(-2, 3, 'the last 3 months', true);
    case 'last6m': return months(-5, 6, 'the last 6 months', true);
    case 'thisYear': return { range: { from: `${y}-01-01`, to: today }, previous: { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }, label: String(y), previousLabel: String(y - 1) };
    case 'prevYear': return { range: { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }, previous: { from: `${y - 2}-01-01`, to: `${y - 2}-12-31` }, label: String(y - 1), previousLabel: String(y - 2) };
    case 'custom': {
      const from = custom?.from, to = custom?.to;
      if (from && to && from <= to) {
        const n = daysInclusive(from, to);
        return { range: { from, to }, previous: { from: addDays(from, -n), to: addDays(from, -1) }, label: `${dayLabel(from)} – ${dayLabel(to)}`, previousLabel: `the ${n} days before` };
      }
      return { range: { from, to }, previous: null, label: 'the selected dates', previousLabel: '' };
    }
    default: return { range: {}, previous: null, label: 'all time', previousLabel: '' };
  }
}

// ---------- My entries: the basis of every personal figure ----------
export interface MyEntry {
  id: string; date: string; description: string; category: string; group_id: string; trip_id: string;
  paid_by: string;
  /** Full bill, my share of it, and what I paid for it (paise). */
  amount: number; mine: number; paid: number;
}

const inRange = (d: string, r: DateRange) => (!r.from || d >= r.from) && (!r.to || d <= r.to);

/** Expenses I had a share in or paid for, within the range. Settlements excluded. */
export function myEntries(expenses: AnalyticsExpense[], self: SelfMap, range: DateRange = {}): MyEntry[] {
  const out: MyEntry[] = [];
  for (const e of expenses) {
    if (e.is_settlement) continue;
    const me = self[e.group_id];
    if (!me || !inRange(e.expense_date, range)) continue;
    const { payer, paidPaise, owed } = expenseEffect(e);
    const mine = owed[me] ?? 0;
    const paid = payer === me ? paidPaise : 0;
    if (mine === 0 && paid === 0) continue;
    out.push({ id: e.id, date: e.expense_date, description: e.description, category: e.category || 'other',
      group_id: e.group_id, trip_id: e.trip_id, paid_by: e.paid_by, amount: toPaise(e.amount), mine, paid });
  }
  return out;
}

const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0);
const R = toRupees;

// ---------- Personal summary ----------
export interface CategoryTotal { category: string; amount: number; count: number; pct: number }
export interface PersonalSummary {
  myShare: number; paid: number; paidForOthers: number; coveredByOthers: number; count: number;
  byCategory: CategoryTotal[];
}

export function personalSummary(expenses: AnalyticsExpense[], self: SelfMap, range: DateRange = {}): PersonalSummary {
  const es = myEntries(expenses, self, range);
  const myShare = sum(es, (e) => e.mine);
  const cats = categoryBreakdown(es);
  return {
    myShare: R(myShare), paid: R(sum(es, (e) => e.paid)),
    paidForOthers: R(sum(es, (e) => (e.paid > 0 ? e.paid - e.mine : 0))),
    coveredByOthers: R(sum(es, (e) => (e.paid > 0 ? 0 : e.mine))),
    count: es.filter((e) => e.mine > 0).length,
    byCategory: cats.map((c) => ({ category: c.category, amount: c.amount, count: c.count, pct: c.pct })),
  };
}

/** Repayments recorded in the range: what I received and what I sent. */
export function settlementTotals(expenses: AnalyticsExpense[], self: SelfMap, range: DateRange = {}) {
  let received = 0, sent = 0, count = 0;
  for (const e of expenses) {
    if (!e.is_settlement || !inRange(e.expense_date, range)) continue;
    const me = self[e.group_id];
    if (!me) continue;
    if (e.paid_by === me) { sent += toPaise(e.amount); count++; }
    else if (e.split_among[0] === me) { received += toPaise(e.amount); count++; }
  }
  return { received: R(received), sent: R(sent), count };
}

// ---------- Averages, highs and lows ----------
export interface SpendingStats {
  total: number; days: number; activeDays: number;
  avgDaily: number; avgWeekly: number; avgMonthly: number;
  /** Expenses per week over the period. */
  perWeek: number;
  highestDay: { date: string; amount: number } | null;
  /** Only when the data covers at least two calendar months. */
  highestMonth: { month: string; amount: number } | null;
  lowestMonth: { month: string; amount: number } | null;
}

/**
 * Averages over the calendar days of the period (days without spending count),
 * so "average daily spending" is not inflated. For an open range the period
 * runs from the first to the last expense.
 */
export function spendingStats(entries: MyEntry[], range: DateRange = {}): SpendingStats | null {
  const es = entries.filter((e) => e.mine > 0);
  if (es.length === 0) return null;
  const dates = es.map((e) => e.date).sort();
  const from = range.from ?? dates[0]!;
  const to = range.to ?? dates[dates.length - 1]!;
  const days = daysInclusive(from, to);
  const total = sum(es, (e) => e.mine);

  const byDay = new Map<string, number>();
  const byMonth = new Map<string, number>();
  for (const e of es) {
    byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.mine);
    byMonth.set(monthKey(e.date), (byMonth.get(monthKey(e.date)) ?? 0) + e.mine);
  }
  const top = <K,>(m: Map<K, number>, dir: 1 | -1) => [...m.entries()].sort((a, b) => dir * (b[1] - a[1]))[0]!;
  const hd = top(byDay, 1);
  // Months in the period, including months with no spending.
  const months: string[] = [];
  for (let k = monthKey(from); k <= monthKey(to);) {
    months.push(k);
    const [y, m] = k.split('-').map(Number) as [number, number];
    const [ny, nm] = shiftMonth(y, m, 1);
    k = `${ny}-${pad(nm)}`;
  }
  const monthTotals = new Map(months.map((k) => [k, byMonth.get(k) ?? 0]));
  const multi = months.length >= 2;

  return {
    total: R(total), days, activeDays: byDay.size,
    avgDaily: R(Math.round(total / days)),
    avgWeekly: R(Math.round((total / days) * 7)),
    avgMonthly: R(Math.round((total / days) * 30.4375)),
    perWeek: Math.round((es.length / days) * 7 * 10) / 10,
    highestDay: { date: hd[0], amount: R(hd[1]) },
    highestMonth: multi ? (([k, v]) => ({ month: k, amount: R(v) }))(top(monthTotals, 1)) : null,
    lowestMonth: multi ? (([k, v]) => ({ month: k, amount: R(v) }))(top(monthTotals, -1)) : null,
  };
}

// ---------- Categories ----------
export interface CategoryRow {
  category: string; amount: number; pct: number; count: number; avg: number;
  max: { description: string; amount: number; date: string };
  /** Same category in the comparison period (0 if none), and the difference. */
  prevAmount: number; change: number; changePct: number | null;
}

export function categoryBreakdown(entries: MyEntry[], previous: MyEntry[] = []): CategoryRow[] {
  const es = entries.filter((e) => e.mine > 0);
  const total = sum(es, (e) => e.mine);
  const groups = new Map<string, MyEntry[]>();
  for (const e of es) groups.set(e.category, [...(groups.get(e.category) ?? []), e]);
  const prev = new Map<string, number>();
  for (const e of previous) if (e.mine > 0) prev.set(e.category, (prev.get(e.category) ?? 0) + e.mine);

  return [...groups.entries()].map(([category, list]) => {
    const amount = sum(list, (e) => e.mine);
    const biggest = [...list].sort((a, b) => b.mine - a.mine)[0]!;
    const p = prev.get(category) ?? 0;
    return {
      category, amount: R(amount), pct: total > 0 ? (amount / total) * 100 : 0, count: list.length,
      avg: R(Math.round(amount / list.length)),
      max: { description: biggest.description, amount: R(biggest.mine), date: biggest.date },
      prevAmount: R(p), change: R(amount - p), changePct: p > 0 ? ((amount - p) / p) * 100 : null,
    };
  }).sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
}

// ---------- Time series ----------
export interface Point { key: string; label: string; amount: number }
export type Bucket = 'day' | 'week' | 'month';

/** My spending per day, week (starting Monday) or month. Gaps are filled with 0. */
export function series(entries: MyEntry[], bucket: Bucket, range: DateRange = {}): Point[] {
  const es = entries.filter((e) => e.mine > 0);
  if (es.length === 0) return [];
  const dates = es.map((e) => e.date).sort();
  const from = range.from ?? dates[0]!;
  const to = range.to ?? dates[dates.length - 1]!;
  const weekStart = (iso: string) => addDays(iso, -((new Date(toUTC(iso)).getUTCDay() + 6) % 7));
  const keyOf = (iso: string) => (bucket === 'day' ? iso : bucket === 'week' ? weekStart(iso) : monthKey(iso));
  const totals = new Map<string, number>();
  for (const e of es) totals.set(keyOf(e.date), (totals.get(keyOf(e.date)) ?? 0) + e.mine);

  const out: Point[] = [];
  if (bucket === 'month') {
    for (let k = monthKey(from); k <= monthKey(to);) {
      out.push({ key: k, label: monthLabel(k), amount: R(totals.get(k) ?? 0) });
      const [y, m] = k.split('-').map(Number) as [number, number];
      const [ny, nm] = shiftMonth(y, m, 1);
      k = `${ny}-${pad(nm)}`;
    }
  } else {
    const step = bucket === 'day' ? 1 : 7;
    for (let k = keyOf(from); k <= to; k = addDays(k, step)) out.push({ key: k, label: dayLabel(k), amount: R(totals.get(k) ?? 0) });
  }
  return out;
}

/** Sensible default bucket for a period length. */
export function bucketFor(days: number): Bucket {
  return days <= 31 ? 'day' : days <= 183 ? 'week' : 'month';
}

/** Monthly totals of one category (for its trend chart). */
export function categorySeries(entries: MyEntry[], category: string, range: DateRange = {}): Point[] {
  const all = series(entries, 'month', range);
  const own = new Map(series(entries.filter((e) => e.category === category), 'month', range).map((p) => [p.key, p.amount]));
  return all.map((p) => ({ ...p, amount: own.get(p.key) ?? 0 }));
}

// ---------- Patterns ----------
export interface WeekdaySplit { weekdayAvg: number; weekendAvg: number; weekdayDays: number; weekendDays: number }

/** Average spend per weekday vs per weekend day, over every calendar day of the period. */
export function weekdayWeekend(entries: MyEntry[], range: DateRange = {}): WeekdaySplit | null {
  const es = entries.filter((e) => e.mine > 0);
  if (es.length === 0) return null;
  const dates = es.map((e) => e.date).sort();
  const from = range.from ?? dates[0]!;
  const to = range.to ?? dates[dates.length - 1]!;
  let wd = 0, we = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) { if (isWeekend(d)) we++; else wd++; }
  const wdTotal = sum(es.filter((e) => !isWeekend(e.date)), (e) => e.mine);
  const weTotal = sum(es.filter((e) => isWeekend(e.date)), (e) => e.mine);
  return { weekdayAvg: wd ? R(Math.round(wdTotal / wd)) : 0, weekendAvg: we ? R(Math.round(weTotal / we)) : 0, weekdayDays: wd, weekendDays: we };
}

/** Days whose spending is far above the usual (needs at least 7 spending days). */
export function unusualDays(entries: MyEntry[]): { date: string; amount: number; typical: number }[] {
  const byDay = new Map<string, number>();
  for (const e of entries) if (e.mine > 0) byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.mine);
  const vals = [...byDay.values()];
  if (vals.length < 7) return [];
  const sorted = [...vals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const mean = sum(vals, (v) => v) / vals.length;
  const sd = Math.sqrt(sum(vals, (v) => (v - mean) ** 2) / vals.length);
  return [...byDay.entries()]
    .filter(([, v]) => v > mean + 2 * sd && v >= median * 2)
    .map(([date, v]) => ({ date, amount: R(v), typical: R(median) }))
    .sort((a, b) => b.amount - a.amount);
}

/** Expenses with the same description in at least 3 different months. */
export function recurringPatterns(entries: MyEntry[]): { description: string; months: number; avg: number }[] {
  const groups = new Map<string, { label: string; months: Set<string>; total: number; n: number }>();
  for (const e of entries) {
    if (e.mine <= 0) continue;
    const key = e.description.trim().toLowerCase().replace(/\s+/g, ' ');
    const g = groups.get(key) ?? { label: e.description.trim(), months: new Set<string>(), total: 0, n: 0 };
    g.months.add(monthKey(e.date)); g.total += e.mine; g.n++;
    groups.set(key, g);
  }
  return [...groups.values()].filter((g) => g.months.size >= 3)
    .map((g) => ({ description: g.label, months: g.months.size, avg: R(Math.round(g.total / g.n)) }))
    .sort((a, b) => b.months - a.months || b.avg - a.avg);
}

// ---------- Period comparison ----------
export interface Delta { key: string; current: number; previous: number; change: number }
export interface Comparison {
  total: number; prevTotal: number; changePct: number | null;
  count: number; prevCount: number;
  avgTxn: number; prevAvgTxn: number;
  dailyAvg: number; prevDailyAvg: number;
  categories: Delta[]; groups: Delta[];
  top: MyEntry[];
}

export function comparePeriods(cur: MyEntry[], prev: MyEntry[], curDays: number, prevDays: number): Comparison {
  const c = cur.filter((e) => e.mine > 0), p = prev.filter((e) => e.mine > 0);
  const tc = sum(c, (e) => e.mine), tp = sum(p, (e) => e.mine);
  const deltas = (key: (e: MyEntry) => string): Delta[] => {
    const a = new Map<string, number>(), b = new Map<string, number>();
    for (const e of c) a.set(key(e), (a.get(key(e)) ?? 0) + e.mine);
    for (const e of p) b.set(key(e), (b.get(key(e)) ?? 0) + e.mine);
    return [...new Set([...a.keys(), ...b.keys()])]
      .map((k) => ({ key: k, current: R(a.get(k) ?? 0), previous: R(b.get(k) ?? 0), change: R((a.get(k) ?? 0) - (b.get(k) ?? 0)) }))
      .sort((x, y) => Math.abs(y.change) - Math.abs(x.change) || x.key.localeCompare(y.key));
  };
  return {
    total: R(tc), prevTotal: R(tp), changePct: tp > 0 ? ((tc - tp) / tp) * 100 : null,
    count: c.length, prevCount: p.length,
    avgTxn: c.length ? R(Math.round(tc / c.length)) : 0, prevAvgTxn: p.length ? R(Math.round(tp / p.length)) : 0,
    dailyAvg: R(Math.round(tc / Math.max(1, curDays))), prevDailyAvg: R(Math.round(tp / Math.max(1, prevDays))),
    categories: deltas((e) => e.category), groups: deltas((e) => e.group_id),
    top: [...c].sort((a, b) => b.mine - a.mine).slice(0, 5),
  };
}

// ---------- Group and people ----------
export interface PersonRow {
  name: string;
  /** Total paid out of pocket, and the share of expenses assigned to them. */
  paid: number; share: number;
  /** Outstanding after recorded settlements: positive = is owed, negative = owes. */
  net: number;
  paidCount: number; avgPaid: number; settlements: number;
}
export interface GroupAnalytics {
  total: number; count: number; memberCount: number; avgPerMember: number;
  topPayer: { name: string; amount: number } | null;
  people: PersonRow[];
  categories: { category: string; amount: number; pct: number; count: number }[];
  settledAmount: number; settlementCount: number;
  /** People whose balance is not zero. */
  unsettled: number;
}

/** Whole-group figures (everyone's spending, not just mine). */
export function groupAnalytics(expenses: AnalyticsExpense[], groupId: string, range: DateRange = {}): GroupAnalytics {
  const people = new Map<string, { paid: number; share: number; net: number; paidCount: number; settlements: number }>();
  const get = (n: string) => { let p = people.get(n); if (!p) { p = { paid: 0, share: 0, net: 0, paidCount: 0, settlements: 0 }; people.set(n, p); } return p; };
  const cats = new Map<string, { amount: number; count: number }>();
  let total = 0, count = 0, settled = 0, settlementCount = 0;

  for (const e of expenses) {
    if (e.group_id !== groupId || !inRange(e.expense_date, range)) continue;
    const { payer, paidPaise, owed } = expenseEffect(e);
    if (e.is_settlement) {
      settled += paidPaise; settlementCount++;
      get(payer).net += paidPaise; get(payer).settlements++;
      for (const [n, v] of Object.entries(owed)) { get(n).net -= v; get(n).settlements++; }
      continue;
    }
    if (Object.keys(owed).length === 0) continue;
    total += paidPaise; count++;
    const pp = get(payer); pp.paid += paidPaise; pp.net += paidPaise; pp.paidCount++;
    for (const [n, v] of Object.entries(owed)) { const q = get(n); q.share += v; q.net -= v; }
    const c = cats.get(e.category || 'other') ?? { amount: 0, count: 0 };
    c.amount += paidPaise; c.count++;
    cats.set(e.category || 'other', c);
  }

  const rows: PersonRow[] = [...people.entries()].map(([name, p]) => ({
    name, paid: R(p.paid), share: R(p.share), net: R(p.net), paidCount: p.paidCount,
    avgPaid: p.paidCount ? R(Math.round(p.paid / p.paidCount)) : 0, settlements: p.settlements,
  })).sort((a, b) => b.paid - a.paid || a.name.localeCompare(b.name));
  const spenders = rows.filter((r) => r.share > 0 || r.paid > 0);
  const top = rows.find((r) => r.paid > 0);

  return {
    total: R(total), count, memberCount: spenders.length,
    avgPerMember: spenders.length ? R(Math.round(total / spenders.length)) : 0,
    topPayer: top ? { name: top.name, amount: top.paid } : null,
    people: rows,
    categories: [...cats.entries()].map(([category, c]) => ({ category, amount: R(c.amount), pct: total ? (c.amount / total) * 100 : 0, count: c.count }))
      .sort((a, b) => b.amount - a.amount),
    settledAmount: R(settled), settlementCount,
    unsettled: rows.filter((r) => Math.abs(toPaise(r.net)) > 0).length,
  };
}

// ---------- Insights ----------
export interface InsightInput {
  entries: MyEntry[]; previous: MyEntry[]; allEntries: MyEntry[];
  period: Period; today: string;
  categoryName: (id: string) => string;
  money: (rupees: number) => string;
}

/**
 * Plain-language observations. Each one states a fact computed from the
 * entries and appears only when there is enough data to support it.
 */
export function insights({ entries, previous, allEntries, period, categoryName, money }: InsightInput): string[] {
  const out: string[] = [];
  const es = entries.filter((e) => e.mine > 0);
  const prev = previous.filter((e) => e.mine > 0);
  if (es.length < 3) return out;
  const total = sum(es, (e) => e.mine);
  const cats = categoryBreakdown(es, prev);

  // 1. Period-on-period change, with the categories that drove it.
  if (period.previous && prev.length >= 3) {
    const pt = sum(prev, (e) => e.mine);
    const pct = Math.round(((total - pt) / pt) * 100);
    if (Math.abs(pct) >= 5) {
      const ups = cats.filter((c) => c.change > 0).sort((a, b) => b.change - a.change)[0];
      const prevCats = categoryBreakdown(prev, es);
      const down = prevCats.filter((c) => c.change > 0).sort((a, b) => b.change - a.change)[0]; // fell = was higher before
      let s = `You spent ${Math.abs(pct)}% ${pct > 0 ? 'more' : 'less'} in ${period.label} than in ${period.previousLabel} (${money(R(total))} vs ${money(R(pt))}).`;
      if (ups && ups.change >= 1) s += ` ${categoryName(ups.category)} went up by ${money(ups.change)}`;
      if (down && down.change >= 1 && down.category !== ups?.category) s += `${ups && ups.change >= 1 ? ', while ' : ' '}${categoryName(down.category)} went down by ${money(down.change)}`;
      out.push(s.replace(/\s+$/, '') + (s.endsWith('.') ? '' : '.'));
    }
  }

  // 2. Biggest category (needs a few expenses to mean anything).
  const topCat = cats[0];
  if (topCat && es.length >= 5 && cats.length >= 2) {
    out.push(`${categoryName(topCat.category)} is your biggest category: ${Math.round(topCat.pct)}% of your spending (${money(topCat.amount)} across ${topCat.count} expense${topCat.count === 1 ? '' : 's'}).`);
  }

  // 3. Weekend vs weekday (needs two weekends and spending on both kinds of day).
  const ww = weekdayWeekend(es, period.range);
  if (ww && ww.weekendDays >= 4 && ww.weekdayDays >= 10 && ww.weekdayAvg > 0 && ww.weekendAvg > 0) {
    const diff = Math.round(((ww.weekendAvg - ww.weekdayAvg) / ww.weekdayAvg) * 100);
    const times = ww.weekendAvg / ww.weekdayAvg;
    // Past 3x, a percentage stops being readable: say "about N times" instead.
    if (times >= 3) out.push(`On an average weekend day you spend about ${Math.round(times)} times what you spend on a weekday (${money(ww.weekendAvg)} vs ${money(ww.weekdayAvg)}).`);
    else if (Math.abs(diff) >= 20) out.push(`On an average weekend day you spend ${Math.abs(diff)}% ${diff > 0 ? 'more' : 'less'} than on a weekday (${money(ww.weekendAvg)} vs ${money(ww.weekdayAvg)}).`);
  }

  // 4. A category rising three months in a row.
  const months = [...new Set(allEntries.map((e) => monthKey(e.date)))].sort();
  if (months.length >= 3) {
    const last3 = months.slice(-3);
    for (const c of cats.slice(0, 4)) {
      const v = last3.map((k) => sum(allEntries.filter((e) => e.category === c.category && monthKey(e.date) === k), (e) => e.mine));
      if (v[0]! > 0 && v[1]! > v[0]! && v[2]! > v[1]!) {
        out.push(`${categoryName(c.category)} spending has risen three months in a row, up ${Math.round(((v[2]! - v[0]!) / v[0]!) * 100)}% from ${monthLabel(last3[0]!)} to ${monthLabel(last3[2]!)}.`);
        break;
      }
    }
  }

  // 5. Unusually expensive days.
  const odd = unusualDays(es)[0];
  if (odd) out.push(`${dayLabel(odd.date)} stood out: you spent ${money(odd.amount)}, against a typical spending day of ${money(odd.typical)}.`);

  // 6. Recurring expenses (looked for across all your history).
  const rec = recurringPatterns(allEntries);
  if (rec.length > 0) {
    out.push(`You have ${rec.length} recurring expense${rec.length === 1 ? '' : 's'}: ${rec.slice(0, 3).map((r) => `${r.description} (about ${money(r.avg)})`).join(', ')}.`);
  }

  // 7. Paying for others.
  const forOthers = sum(entries, (e) => (e.paid > 0 ? e.paid - e.mine : 0));
  const paid = sum(entries, (e) => e.paid);
  if (paid > 0 && forOthers / paid >= 0.5 && entries.filter((e) => e.paid > 0).length >= 3) {
    out.push(`${Math.round((forOthers / paid) * 100)}% of what you paid (${money(R(forOthers))} of ${money(R(paid))}) was for other people's shares.`);
  }
  return out;
}
