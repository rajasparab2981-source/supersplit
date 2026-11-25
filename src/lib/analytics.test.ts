import { describe, expect, it } from 'vitest';
import {
  addDays, bucketFor, categoryBreakdown, categorySeries, comparePeriods, daysInclusive, groupAnalytics, insights,
  monthRange, myEntries, periodFor, personalSummary, recurringPatterns, series, settlementTotals, spendingStats,
  unusualDays, weekdayWeekend, type AnalyticsExpense, type MyEntry,
} from './analytics';

let n = 0;
const exp = (p: Partial<AnalyticsExpense>): AnalyticsExpense => ({
  id: `e${++n}`, trip_id: 't', group_id: 'g1', description: 'x', amount: 300, paid_by: 'Me',
  split_among: ['Me', 'A', 'B'], shares: null, category: 'food', expense_date: '2026-11-10',
  created_at: '2026-11-10T00:00:00Z', ...p,
});
const self = { g1: 'Me', g2: 'Myself' };
/** An expense where my share is exactly `rupees`. */
const mine = (rupees: number, date: string, extra: Partial<AnalyticsExpense> = {}) =>
  exp({ amount: rupees, paid_by: 'A', split_among: ['Me'], expense_date: date, ...extra });
const entries = (list: AnalyticsExpense[], range = {}) => myEntries(list, self, range);
const money = (r: number) => `₹${r}`;
const name = (id: string) => id[0]!.toUpperCase() + id.slice(1);

describe('personalSummary', () => {
  it('counts my share as spending, not the whole bill I paid', () => {
    expect(personalSummary([exp({})], self)).toMatchObject({ myShare: 100, paid: 300, paidForOthers: 200, coveredByOthers: 0, count: 1 });
  });
  it('counts my share when someone else paid', () => {
    expect(personalSummary([exp({ paid_by: 'A' })], self)).toMatchObject({ myShare: 100, paid: 0, paidForOthers: 0, coveredByOthers: 100 });
  });
  it('paying for others with no share of my own is not my spending', () => {
    const s = personalSummary([exp({ split_among: ['A', 'B'] })], self);
    expect(s).toMatchObject({ myShare: 0, paid: 300, paidForOthers: 300, count: 0 });
    expect(s.byCategory).toEqual([]);
  });
  it('ignores settlements, expenses I am not part of, and groups where I am unknown', () => {
    const s = personalSummary([
      exp({ is_settlement: true, split_among: ['A'], shares: { A: 500 }, amount: 500 }),
      exp({ paid_by: 'A', split_among: ['A', 'B'] }),
      exp({ group_id: 'g9' }),
    ], self);
    expect(s).toMatchObject({ myShare: 0, paid: 0, count: 0 });
  });
  it('uses my name per group and exact custom shares', () => {
    const s = personalSummary([
      exp({ group_id: 'g2', paid_by: 'Myself', split_among: ['Myself', 'Z'], shares: { Myself: 250.5, Z: 49.5 }, category: 'stay' }),
      exp({ category: 'food' }),
    ], self);
    expect(s.myShare).toBe(350.5);
    expect(s.byCategory.map((c) => [c.category, c.amount])).toEqual([['stay', 250.5], ['food', 100]]);
  });
  it('filters by date range, inclusive', () => {
    const list = [exp({ expense_date: '2026-10-31' }), exp({ expense_date: '2026-11-01' }), exp({ expense_date: '2026-11-30' }), exp({ expense_date: '2026-12-01' })];
    expect(personalSummary(list, self, monthRange('2026-11-15')).count).toBe(2);
    expect(monthRange('2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});

describe('periods', () => {
  const today = '2026-11-25';
  it('date helpers', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(daysInclusive('2026-11-01', '2026-11-30')).toBe(30);
  });
  it('rolling windows end today and compare with the same number of days before', () => {
    const p = periodFor('last7', today);
    expect(p.range).toEqual({ from: '2026-11-19', to: today });
    expect(p.previous).toEqual({ from: '2026-11-12', to: '2026-11-18' });
    expect(periodFor('last30', today).range.from).toBe('2026-10-27');
  });
  it('this month runs to today and compares with the whole previous month', () => {
    const p = periodFor('thisMonth', today);
    expect(p.range).toEqual({ from: '2026-11-01', to: today });
    expect(p.previous).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });
  it('last month, multi-month and year presets, across year boundaries', () => {
    expect(periodFor('prevMonth', '2026-01-10')).toMatchObject({ range: { from: '2025-12-01', to: '2025-12-31' }, previous: { from: '2025-11-01', to: '2025-11-30' } });
    expect(periodFor('last3m', today)).toMatchObject({ range: { from: '2026-09-01', to: today }, previous: { from: '2026-06-01', to: '2026-08-31' } });
    expect(periodFor('last6m', '2026-02-15').range.from).toBe('2025-09-01');
    expect(periodFor('thisYear', today)).toMatchObject({ range: { from: '2026-01-01', to: today }, previous: { from: '2025-01-01', to: '2025-12-31' } });
    expect(periodFor('prevYear', today).range).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });
  it('all time has no comparison; custom compares with the same length before', () => {
    expect(periodFor('all', today)).toMatchObject({ range: {}, previous: null });
    expect(periodFor('custom', today, { from: '2026-11-10', to: '2026-11-14' }).previous).toEqual({ from: '2026-11-05', to: '2026-11-09' });
    expect(periodFor('custom', today, { from: '2026-11-10' }).previous).toBeNull();
  });
});

describe('settlements are separate from spending', () => {
  it('totals what I received and sent', () => {
    const list = [
      exp({ is_settlement: true, paid_by: 'A', split_among: ['Me'], shares: { Me: 500 }, amount: 500 }),
      exp({ is_settlement: true, paid_by: 'Me', split_among: ['B'], shares: { B: 120 }, amount: 120 }),
      exp({ is_settlement: true, paid_by: 'A', split_among: ['B'], shares: { B: 999 }, amount: 999 }),
    ];
    expect(settlementTotals(list, self)).toEqual({ received: 500, sent: 120, count: 2 });
    expect(entries(list)).toEqual([]);
  });
});

describe('spendingStats', () => {
  it('averages over calendar days, including days with no spending', () => {
    const s = spendingStats(entries([mine(300, '2026-11-01'), mine(600, '2026-11-10')]), { from: '2026-11-01', to: '2026-11-30' })!;
    expect(s).toMatchObject({ total: 900, days: 30, activeDays: 2, avgDaily: 30, avgWeekly: 210 });
    expect(s.highestDay).toEqual({ date: '2026-11-10', amount: 600 });
    expect(s.highestMonth).toBeNull(); // one month only: no highest/lowest month claim
  });
  it('highest and lowest month include months with no spending', () => {
    const s = spendingStats(entries([mine(100, '2026-09-05'), mine(400, '2026-11-05')]), { from: '2026-09-01', to: '2026-11-30' })!;
    expect(s.highestMonth).toEqual({ month: '2026-11', amount: 400 });
    expect(s.lowestMonth).toEqual({ month: '2026-10', amount: 0 });
  });
  it('open range runs from first to last expense; nothing to show without data', () => {
    expect(spendingStats(entries([mine(100, '2026-11-01'), mine(100, '2026-11-04')]))!.days).toBe(4);
    expect(spendingStats([])).toBeNull();
  });
});

describe('categories', () => {
  const cur = entries([mine(400, '2026-11-02'), mine(200, '2026-11-03'), mine(400, '2026-11-04', { category: 'travel', description: 'Flight' })]);
  const prev = entries([mine(300, '2026-10-02'), mine(100, '2026-10-03', { category: 'fuel' })]);
  it('amount, share, count, average, biggest and change vs the previous period', () => {
    const rows = categoryBreakdown(cur, prev);
    expect(rows.map((r) => r.category)).toEqual(['food', 'travel']);
    expect(rows[0]).toMatchObject({ amount: 600, pct: 60, count: 2, avg: 300, prevAmount: 300, change: 300, changePct: 100 });
    expect(rows[0]!.max).toMatchObject({ amount: 400, date: '2026-11-02' });
    expect(rows[1]).toMatchObject({ amount: 400, prevAmount: 0, changePct: null });
    expect(rows.reduce((s, r) => s + r.pct, 0)).toBeCloseTo(100, 6);
  });
  it('monthly series for one category keeps every month in the period', () => {
    const pts = categorySeries(entries([mine(100, '2026-09-10'), mine(50, '2026-11-10'), mine(70, '2026-10-10', { category: 'fuel' })]), 'food');
    expect(pts.map((p) => [p.key, p.amount])).toEqual([['2026-09', 100], ['2026-10', 0], ['2026-11', 50]]);
  });
});

describe('time series', () => {
  it('fills gaps for days, weeks start on Monday, months are continuous', () => {
    const es = entries([mine(100, '2026-11-02'), mine(50, '2026-11-04'), mine(25, '2026-11-11')]);
    expect(series(es, 'day', { from: '2026-11-02', to: '2026-11-05' }).map((p) => p.amount)).toEqual([100, 0, 50, 0]);
    expect(series(es, 'week').map((p) => [p.key, p.amount])).toEqual([['2026-11-02', 150], ['2026-11-09', 25]]); // 2 Nov 2026 is a Monday
    expect(series(es, 'month', { from: '2026-10-01', to: '2026-11-30' }).map((p) => p.amount)).toEqual([0, 175]);
    expect(series(es, 'day').reduce((s, p) => s + p.amount, 0)).toBe(175);
  });
  it('picks a readable bucket for the period length', () => {
    expect([bucketFor(7), bucketFor(31), bucketFor(90), bucketFor(365)]).toEqual(['day', 'day', 'week', 'month']);
  });
});

describe('patterns', () => {
  it('weekday vs weekend averages use every calendar day of that kind', () => {
    // 2–15 Nov 2026: 10 weekdays, 4 weekend days. 7 and 8 Nov are Sat/Sun.
    const es = entries([mine(1000, '2026-11-03'), mine(800, '2026-11-07'), mine(400, '2026-11-08')]);
    expect(weekdayWeekend(es, { from: '2026-11-02', to: '2026-11-15' })).toEqual({ weekdayAvg: 100, weekendAvg: 300, weekdayDays: 10, weekendDays: 4 });
  });
  it('flags unusually expensive days only with enough history', () => {
    const few = entries([mine(100, '2026-11-01'), mine(5000, '2026-11-02')]);
    expect(unusualDays(few)).toEqual([]);
    const many = entries([...Array.from({ length: 9 }, (_, i) => mine(100, `2026-11-0${i + 1}`)), mine(5000, '2026-11-20')]);
    expect(unusualDays(many)).toEqual([{ date: '2026-11-20', amount: 5000, typical: 100 }]);
  });
  it('recurring = same description in at least three different months', () => {
    const es = entries([
      mine(500, '2026-09-01', { description: 'Rent ' }), mine(500, '2026-10-01', { description: 'rent' }), mine(520, '2026-11-01', { description: 'Rent' }),
      mine(90, '2026-11-02', { description: 'Chai' }), mine(90, '2026-11-03', { description: 'Chai' }), mine(90, '2026-11-04', { description: 'Chai' }),
    ]);
    expect(recurringPatterns(es)).toEqual([{ description: 'Rent', months: 3, avg: 506.67 }]);
  });
});

describe('comparePeriods', () => {
  it('totals, % change, averages, category and group changes, top five', () => {
    const cur = entries([mine(1000, '2026-11-02'), mine(240, '2026-11-03', { category: 'travel', group_id: 'g2', split_among: ['Myself'] })]);
    const prev = entries([mine(600, '2026-10-02'), mine(400, '2026-10-03', { category: 'fuel' })]);
    const c = comparePeriods(cur, prev, 25, 31);
    expect(c).toMatchObject({ total: 1240, prevTotal: 1000, changePct: 24, count: 2, prevCount: 2, avgTxn: 620, prevAvgTxn: 500 });
    expect(c.dailyAvg).toBe(49.6);
    expect(c.categories).toEqual([
      { key: 'food', current: 1000, previous: 600, change: 400 },
      { key: 'fuel', current: 0, previous: 400, change: -400 },
      { key: 'travel', current: 240, previous: 0, change: 240 },
    ]);
    expect(c.groups.find((g) => g.key === 'g2')).toEqual({ key: 'g2', current: 240, previous: 0, change: 240 });
    expect(c.top.map((e) => e.mine)).toEqual([100000, 24000]);
  });
  it('no % change without a previous period to compare', () => {
    expect(comparePeriods(entries([mine(10, '2026-11-02')]), [], 5, 5).changePct).toBeNull();
  });
});

describe('groupAnalytics', () => {
  const list = [
    exp({ amount: 900, paid_by: 'A', split_among: ['Me', 'A', 'B'], category: 'stay' }),
    exp({ amount: 300, paid_by: 'Me', split_among: ['A', 'B'], category: 'food' }),
    exp({ is_settlement: true, amount: 200, paid_by: 'B', split_among: ['A'], shares: { A: 200 } }),
    exp({ group_id: 'g2', amount: 5000, paid_by: 'Myself', split_among: ['Myself'] }),
  ];
  const g = groupAnalytics(list, 'g1');
  it('separates what people paid from their share, and never double counts', () => {
    expect(g).toMatchObject({ total: 1200, count: 2, memberCount: 3, avgPerMember: 400, settledAmount: 200, settlementCount: 1 });
    expect(g.topPayer).toEqual({ name: 'A', amount: 900 });
    const by = Object.fromEntries(g.people.map((p) => [p.name, p]));
    expect(by.A).toMatchObject({ paid: 900, share: 450, paidCount: 1 });
    expect(by.Me).toMatchObject({ paid: 300, share: 300, net: 0 });
    expect(by.B).toMatchObject({ paid: 0, share: 450 });
    expect(g.people.reduce((s, p) => s + p.paid, 0)).toBe(g.total);
    expect(g.people.reduce((s, p) => s + p.share, 0)).toBe(g.total);
  });
  it('outstanding balances include recorded settlements and sum to zero', () => {
    const by = Object.fromEntries(g.people.map((p) => [p.name, p.net]));
    expect(by).toEqual({ A: 250, Me: 0, B: -250 });
    expect(g.unsettled).toBe(2);
    expect(g.categories.map((c) => [c.category, c.amount, c.pct])).toEqual([['stay', 900, 75], ['food', 300, 25]]);
  });
});

describe('insights', () => {
  const today = '2026-11-25';
  const run = (cur: AnalyticsExpense[], prev: AnalyticsExpense[] = [], preset: Parameters<typeof periodFor>[0] = 'thisMonth') => {
    const period = periodFor(preset, today);
    const all = entries([...cur, ...prev]);
    return insights({ entries: entries(cur, period.range), previous: period.previous ? entries(prev, period.previous) : [], allEntries: all, period, today, categoryName: name, money });
  };
  it('says nothing with too little data', () => {
    expect(run([mine(100, '2026-11-02'), mine(100, '2026-11-03')])).toEqual([]);
  });
  it('month-on-month statement names the real numbers and the categories that moved', () => {
    const cur = [mine(3000, '2026-11-02'), mine(2000, '2026-11-05'), mine(1200, '2026-11-09', { category: 'transport' })];
    const prev = [mine(2600, '2026-10-02'), mine(1350, '2026-10-05', { category: 'transport' }), mine(1050, '2026-10-09', { category: 'transport' })];
    const [first] = run(cur, prev);
    expect(first).toBe('You spent 24% more in Nov 26 than in Oct 26 (₹6200 vs ₹5000). Food went up by ₹2400, while Transport went down by ₹1200.');
  });
  it('no comparison claim when the previous period is nearly empty', () => {
    const out = run([mine(300, '2026-11-02'), mine(200, '2026-11-05'), mine(100, '2026-11-09')], [mine(10, '2026-10-02')]);
    expect(out.some((s) => s.startsWith('You spent'))).toBe(false);
  });
  it('biggest category, recurring expenses and paying for others, when supported', () => {
    const cur = [
      ...['2026-11-01', '2026-11-03', '2026-11-05', '2026-11-07'].map((d) => exp({ amount: 900, paid_by: 'Me', split_among: ['Me', 'A', 'B'], expense_date: d })),
      mine(100, '2026-11-08', { category: 'fuel' }), mine(500, '2026-11-01', { description: 'Rent', category: 'rent' }),
    ];
    const history = [mine(500, '2026-09-01', { description: 'Rent', category: 'rent' }), mine(500, '2026-10-01', { description: 'Rent', category: 'rent' })];
    const out = run(cur, history);
    expect(out).toContain('Food is your biggest category: 67% of your spending (₹1200 across 4 expenses).');
    expect(out).toContain('You have 1 recurring expense: Rent (about ₹500).');
    expect(out).toContain('67% of what you paid (₹2400 of ₹3600) was for other people\'s shares.');
  });
  it('weekend statement needs enough days of both kinds', () => {
    const cur = [mine(1000, '2026-11-03'), mine(800, '2026-11-07'), mine(400, '2026-11-08'), mine(300, '2026-11-14'), mine(300, '2026-11-15'), mine(100, '2026-11-17')];
    // 1–25 Nov 2026 has 7 weekend days (1, 7, 8, 14, 15, 21, 22) and 18 weekdays.
    // Weekend ₹1,800 / 7 = ₹257.14 a day; weekday ₹1,100 / 18 = ₹61.11: about 4 times.
    expect(run(cur)).toContain('On an average weekend day you spend about 4 times what you spend on a weekday (₹257.14 vs ₹61.11).');
    const mild = [mine(1700, '2026-11-03'), mine(1200, '2026-11-07'), mine(100, '2026-11-17')];
    // Weekend ₹1,200 / 7 = ₹171.43; weekday ₹1,800 / 18 = ₹100: 71% more.
    expect(run(mild)).toContain('On an average weekend day you spend 71% more than on a weekday (₹171.43 vs ₹100).');
    expect(run(cur, [], 'last7').some((s) => s.includes('weekend'))).toBe(false);
  });
});

// Keep the type import used.
const _typecheck: MyEntry | null = null;
void _typecheck;
