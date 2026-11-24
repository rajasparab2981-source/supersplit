/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import type { Expense } from '../types';
import { allocateByWeights, splitEvenly, toPaise } from './money';
import {
  calcBalances, calcSettlements, computeSplit, expenseEffect, expenseShares,
  netPaise, seedSplitInputs, youLine,
} from './splits';
import { todayISO } from './dates';

let n = 0;
function exp(p: Partial<Expense> & Pick<Expense, 'amount' | 'paid_by' | 'split_among'>): Expense {
  n += 1;
  return {
    id: `e${n}`, trip_id: 't1', description: 'x', shares: null, category: 'other',
    expense_date: '2026-11-01', created_at: `2026-11-01T00:00:0${n % 10}Z`, ...p,
  };
}
const sumValues = (m: Map<string, number> | Record<string, number>) =>
  [...(m instanceof Map ? m.values() : Object.values(m))].reduce((s, v) => s + v, 0);

describe('money', () => {
  it('converts rupees to paise without float drift', () => {
    expect(toPaise(276.78)).toBe(27678);
    expect(toPaise('0.1')).toBe(10);
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(toPaise(NaN)).toBe(0);
    expect(toPaise(null)).toBe(0);
  });

  it('splits evenly and exactly', () => {
    expect(splitEvenly(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(sumValues(Object.fromEntries(splitEvenly(97700, 6).map((v, i) => [i, v])))).toBe(97700);
    expect(splitEvenly(5, 0)).toEqual([]);
  });

  it('allocates by weights with no paisa lost', () => {
    const parts = allocateByWeights(10000, [33.33, 33.33, 33.34]);
    expect(parts.reduce((s, p) => s + p, 0)).toBe(10000);
    expect(allocateByWeights(99, [1, 1, 1])).toEqual([33, 33, 33]);
    expect(allocateByWeights(100, [1, 1, 1])).toEqual([34, 33, 33]);
  });
});

describe('expense effects', () => {
  it('equal split of ₹100 among 3 adds back to exactly ₹100', () => {
    const e = exp({ amount: 100, paid_by: 'A', split_among: ['A', 'B', 'C'] });
    const { owed, paidPaise } = expenseEffect(e);
    expect(owed).toEqual({ A: 3334, B: 3333, C: 3333 });
    expect(paidPaise).toBe(10000);
  });

  it('uses custom shares when present', () => {
    const e = exp({ amount: 300, paid_by: 'A', split_among: ['A', 'B'], shares: { A: 100, B: 200 } });
    expect(expenseShares(e)).toEqual({ A: 100, B: 200 });
  });

  it('legacy shares that do not add up: payer absorbs the gap', () => {
    // Real case from production: ₹977 with shares totalling ₹976.89.
    const e = exp({ amount: 977, paid_by: 'A', split_among: ['A', 'B', 'C', 'D'],
      shares: { A: 276.78, B: 276.78, C: 276.78, D: 146.55 } });
    expect(expenseEffect(e).paidPaise).toBe(97689);
    expect(sumValues(netPaise([e]))).toBe(0);
  });

  it('ignores expenses with nobody to split among', () => {
    const e = exp({ amount: 50, paid_by: 'A', split_among: [] });
    expect(calcBalances([e])).toEqual([]);
  });
});

describe('balances and settlements', () => {
  const trip = [
    exp({ amount: 900, paid_by: 'A', split_among: ['A', 'B', 'C'] }),
    exp({ amount: 100, paid_by: 'B', split_among: ['A', 'B', 'C', 'D'] }),
    exp({ amount: 333.33, paid_by: 'C', split_among: ['B', 'C', 'D'] }),
    exp({ amount: 50, paid_by: 'D', split_among: ['A'], shares: null }),
  ];

  it('nets always sum to exactly zero', () => {
    expect(sumValues(netPaise(trip))).toBe(0);
  });

  it('settlements clear every balance to the paisa', () => {
    const balances = calcBalances(trip);
    const transfers = calcSettlements(balances);
    const left = new Map(balances.map((b) => [b.name, toPaise(b.net)]));
    for (const t of transfers) {
      expect(t.amount).toBeGreaterThan(0);
      left.set(t.from, left.get(t.from)! + toPaise(t.amount));
      left.set(t.to, left.get(t.to)! - toPaise(t.amount));
    }
    expect([...left.values()].every((v) => v === 0)).toBe(true);
    expect(transfers.length).toBeLessThanOrEqual(balances.length - 1);
  });

  it('no transfers when everyone is even', () => {
    const even = [exp({ amount: 100, paid_by: 'A', split_among: ['A'] })];
    expect(calcSettlements(calcBalances(even))).toEqual([]);
  });

  it('youLine shows each person\'s effect', () => {
    const e = exp({ amount: 100, paid_by: 'A', split_among: ['A', 'B', 'C'] });
    expect(youLine(e, 'A')).toBe(66.66);
    expect(youLine(e, 'B')).toBe(-33.33);
    expect(youLine(e, 'Z')).toBeNull();
    expect(youLine(e, null)).toBeNull();
  });
});

describe('expense form splits', () => {
  it('percent split converts to rupees that add up exactly', () => {
    const r = computeSplit('percentage', 100, [], { A: '33.33', B: '33.33', C: '33.34' });
    expect(r.error).toBeNull();
    expect(sumValues(r.shares!)).toBeCloseTo(100, 10);
    expect(Object.values(r.shares!).map(toPaise).reduce((s, v) => s + v, 0)).toBe(10000);
  });

  it('rejects percentages that do not total 100', () => {
    expect(computeSplit('percentage', 100, [], { A: '50', B: '49' }).error).toMatch(/must total 100/);
  });

  it('exact split must match to the paisa', () => {
    expect(computeSplit('exact', 977, [], { A: '500', B: '476.89' }).error).toMatch(/short by ₹0.11/);
    expect(computeSplit('exact', 977, [], { A: '500', B: '477' }).error).toBeNull();
  });

  it('equal mode saves no custom shares', () => {
    expect(computeSplit('equal', 100, ['A', 'B'], {})).toMatchObject({ shares: null, splitAmong: ['A', 'B'] });
  });

  it('pre-filled values always pass validation', () => {
    for (const people of [['A'], ['A', 'B', 'C'], ['A', 'B', 'C', 'D', 'E', 'F', 'G']]) {
      for (const amount of [100, 977, 0.05, 333.33]) {
        expect(computeSplit('percentage', amount, [], seedSplitInputs('percentage', amount, people)).error).toBeNull();
        expect(computeSplit('exact', amount, [], seedSplitInputs('exact', amount, people)).error).toBeNull();
      }
    }
  });
});

describe('dates', () => {
  it('uses the local calendar day, not UTC', () => {
    // 1:00 AM local on 5 Nov must be 5 Nov, whatever the UTC date is.
    expect(todayISO(new Date(2026, 10, 5, 1, 0))).toBe('2026-11-05');
    expect(todayISO(new Date(2026, 0, 1, 23, 59))).toBe('2026-01-01');
  });

  it('1:30 AM IST is already "today" in India (old UTC bug)', () => {
    const prev = process.env.TZ;
    process.env.TZ = 'Asia/Kolkata';
    try {
      const at = new Date('2026-11-04T20:00:00Z'); // = 5 Nov, 01:30 IST
      expect(todayISO(at)).toBe('2026-11-05');
      expect(at.toISOString().slice(0, 10)).toBe('2026-11-04'); // what the old code used
    } finally {
      process.env.TZ = prev;
    }
  });
});
