import { describe, expect, it } from 'vitest';
import { settlementOverview, type SettleExpense } from './settlements';

let n = 0;
const exp = (p: Partial<SettleExpense>): SettleExpense => ({
  id: `e${++n}`, trip_id: 't1', group_id: 'g1', description: 'x', amount: 300, paid_by: 'Me', split_among: ['Me', 'A', 'B'],
  shares: null, category: 'food', expense_date: '2026-11-10', created_at: '2026-11-10', ...p });
const paid = (from: string, to: string, amount: number, date = '2026-11-12', trip = 't1'): SettleExpense =>
  exp({ id: `settlement:s${++n}`, trip_id: trip, is_settlement: true, paid_by: from, split_among: [to], shares: { [to]: amount }, amount,
    expense_date: date, settlement: { id: `s${n}`, method: 'upi', note: null, from, to } });
const trips = [{ id: 't1', name: 'Goa', group_id: 'g1' }, { id: 't2', name: 'Flat', group_id: 'g2' }];
const groups = [{ id: 'g1', name: 'Squad' }, { id: 'g2', name: 'Home' }];
const self = { g1: 'Me', g2: 'Myself' };

describe('settlementOverview', () => {
  it('lists what you owe first, then what you are owed, then others; with totals', () => {
    const o = settlementOverview(trips, groups, [
      exp({}),                                                                                   // A and B each owe Me 100
      exp({ trip_id: 't2', group_id: 'g2', amount: 500, paid_by: 'Z', split_among: ['Myself', 'Z'] }), // Myself owes Z 250
    ], self);
    expect(o.pending.map((p) => [p.role, p.from, p.to, p.amount, p.tripName, p.groupName])).toEqual([
      ['pay', 'Myself', 'Z', 250, 'Flat', 'Home'],
      ['receive', 'A', 'Me', 100, 'Goa', 'Squad'], ['receive', 'B', 'Me', 100, 'Goa', 'Squad']]);
    expect(o).toMatchObject({ youOwe: 250, owedToYou: 200, completed: [] });
  });

  it('a recorded payment moves from pending to completed', () => {
    const o = settlementOverview(trips, groups, [exp({}), paid('A', 'Me', 100)], self);
    expect(o.pending.map((p) => p.from)).toEqual(['B']);
    expect(o.owedToYou).toBe(100);
    expect(o.completed).toHaveLength(1);
    expect(o.completed[0]).toMatchObject({ from: 'A', to: 'Me', amount: 100, role: 'receive', method: 'upi', tripName: 'Goa' });
  });

  it('transfers between other people are listed but not counted in your totals', () => {
    const o = settlementOverview(trips, groups, [exp({ paid_by: 'A', split_among: ['A', 'B'] })], self);
    expect(o.pending).toHaveLength(1);
    expect(o.pending[0]!.role).toBe('other');
    expect(o).toMatchObject({ youOwe: 0, owedToYou: 0 });
  });

  it('nothing to settle is an empty overview', () => {
    expect(settlementOverview(trips, groups, [], self)).toEqual({ pending: [], completed: [], youOwe: 0, owedToYou: 0 });
  });
});
