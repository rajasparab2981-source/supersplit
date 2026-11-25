import { describe, expect, it } from 'vitest';
import { monthRange, personalSummary, type AnalyticsExpense } from './analytics';

let n = 0;
const exp = (p: Partial<AnalyticsExpense>): AnalyticsExpense => ({
  id: `e${++n}`, trip_id: 't', group_id: 'g1', description: 'x', amount: 300, paid_by: 'Me',
  split_among: ['Me', 'A', 'B'], shares: null, category: 'food', expense_date: '2026-11-10',
  created_at: '2026-11-10T00:00:00Z', ...p,
});
const self = { g1: 'Me', g2: 'Myself' };

describe('personalSummary', () => {
  it('counts my share as spending, not the whole bill I paid', () => {
    const s = personalSummary([exp({})], self);
    expect(s).toMatchObject({ myShare: 100, paid: 300, paidForOthers: 200, coveredByOthers: 0, count: 1 });
  });

  it('counts my share when someone else paid', () => {
    const s = personalSummary([exp({ paid_by: 'A' })], self);
    expect(s).toMatchObject({ myShare: 100, paid: 0, paidForOthers: 0, coveredByOthers: 100 });
  });

  it('paying for others with no share of my own is not my spending', () => {
    const s = personalSummary([exp({ split_among: ['A', 'B'] })], self);
    expect(s).toMatchObject({ myShare: 0, paid: 300, paidForOthers: 300, count: 0 });
    expect(s.byCategory).toEqual([]);
  });

  it('ignores settlements, expenses I am not part of, and groups where I am unknown', () => {
    const s = personalSummary([
      exp({ is_settlement: true, paid_by: 'Me', split_among: ['A'], shares: { A: 500 }, amount: 500 }),
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
    expect(Math.round(s.byCategory.reduce((t, c) => t + c.pct, 0))).toBe(100);
  });

  it('filters by date range, inclusive', () => {
    const list = [exp({ expense_date: '2026-10-31' }), exp({ expense_date: '2026-11-01' }), exp({ expense_date: '2026-11-30' }), exp({ expense_date: '2026-12-01' })];
    expect(personalSummary(list, self, monthRange('2026-11-15')).count).toBe(2);
    expect(monthRange('2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});
