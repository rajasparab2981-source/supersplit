import { describe, expect, it } from 'vitest';
import { dayPlan, estimate, itemShares, peoplePlan, planSummary, sectionOfCategory, tripLength, type BudgetItem, type TripExpense } from './tripPlan';

let n = 0;
const item = (p: Partial<BudgetItem>): BudgetItem => {
  const unit = p.unit_price_minor ?? 100000, q = p.quantity ?? 1, people = p.people ?? 1, days = p.days ?? 1;
  return { id: `i${++n}`, trip_id: 't', section: 'food', label: 'x', day_date: null, unit_price_minor: unit, quantity: q, people, days,
    estimated_minor: estimate(unit, q, people, days), notes: null, booking_status: 'none', paid: false, split_members: null, shares: null,
    source: 'user', status: 'accepted', ...p };
};
const exp = (amount: number, category: string, date = '2026-12-21', extra: Partial<TripExpense> = {}): TripExpense => ({
  id: `e${++n}`, trip_id: 't', description: 'x', amount, paid_by: 'Asha', split_among: ['Asha', 'Bilal'], shares: null,
  category, expense_date: date, created_at: date, ...extra });
const trip = { id: 't', start_date: '2026-12-20', end_date: '2026-12-24', adults: 4, children: 0, budget_minor: 7000000, buffer_pct: 10, alert_thresholds: [50, 75, 90, 100] };

describe('estimate', () => {
  it('unit price × quantity × people × days', () => {
    expect(estimate(25000, 1, 4, 5)).toBe(500000);    // ₹250 × 4 people × 5 days = ₹5,000
    expect(estimate(33333, 1.5, 1, 1)).toBe(50000);   // rounds to the paisa
    expect(tripLength(trip)).toBe(5);
    expect(tripLength({ id: 't', start_date: '2026-12-20' })).toBeNull();
  });
  it('maps expense categories to budget sections', () => {
    expect(['travel', 'fuel', 'stay', 'groceries', 'fun', 'medical', 'other', 'c_custom'].map(sectionOfCategory))
      .toEqual(['transport', 'transport', 'stay', 'food', 'activities', 'essentials', 'misc', 'misc']);
  });
});

describe('planSummary', () => {
  const items = [
    item({ section: 'food', unit_price_minor: 25000, people: 4, days: 5 }),          // 5,000
    item({ section: 'food', unit_price_minor: 60000, people: 4, days: 5 }),          // 12,000
    item({ section: 'stay', unit_price_minor: 3200000, booking_status: 'booked', paid: true }), // 32,000
    item({ section: 'transport', unit_price_minor: 450000, people: 4, booking_status: 'to_book' }), // 18,000
    item({ section: 'activities', unit_price_minor: 400000, status: 'suggested' }),  // 4,000 suggested only
  ];
  const expenses = [exp(9500, 'food'), exp(4000, 'drinks'), exp(33000, 'stay'), exp(1200, 'shopping'),
    exp(5000, 'other', '2026-12-21', { is_settlement: true })];
  const s = planSummary(trip, items, expenses, 3);

  it('totals: accepted lines, buffer, actual from real expenses (settlements excluded)', () => {
    expect(s).toMatchObject({ planned: 67000, buffer: 6700, plannedWithBuffer: 73700, suggested: 4000, actual: 47700, remaining: 26000 });
    expect(Math.round(s.used!)).toBe(65);
    expect(s).toMatchObject({ target: 70000, overTarget: 3700, travellers: 4, perPersonPlanned: 18425, perPersonActual: 11925 });
    expect(s).toMatchObject({ bookedCount: 1, toBookCount: 1, paidAmount: 32000 });
  });
  it('per section: planned, actual, remaining and % used', () => {
    const by = Object.fromEntries(s.sections.map((x) => [x.id, x]));
    expect(by.food).toMatchObject({ planned: 17000, actual: 13500, remaining: 3500, lines: 2, alert: 75 });
    expect(Math.round(by.food!.used!)).toBe(79);
    expect(by.stay).toMatchObject({ planned: 32000, actual: 33000, remaining: -1000, alert: 100 });
    expect(by.transport).toMatchObject({ planned: 18000, actual: 0, alert: null });
    expect(by.shopping).toMatchObject({ planned: 0, actual: 1200, used: null, unplanned: true });
    expect(s.sections.reduce((t, x) => t + x.actual, 0)).toBe(s.actual);
    expect(s.sections.reduce((t, x) => t + x.planned, 0)).toBe(s.planned);
  });
  it('alerts use the trip thresholds, worst first', () => {
    expect(s.alerts).toEqual([{ section: 'Stay', level: 100, used: 103 }, { section: 'Food & drinks', level: 75, used: 79 }]);
    const custom = planSummary({ ...trip, alert_thresholds: [80] }, items, expenses, 3);
    expect(custom.alerts.map((a) => a.level)).toEqual([80]);
  });
  it('an empty plan shows zeros, not guesses; travellers fall back to the member count', () => {
    const e = planSummary({ id: 't' }, [], [], 3);
    expect(e).toMatchObject({ planned: 0, actual: 0, used: null, target: null, travellers: 3, alerts: [] });
  });
});

describe('dayPlan', () => {
  const items = [
    item({ day_date: '2026-12-20', unit_price_minor: 100000 }), item({ day_date: '2026-12-20', unit_price_minor: 180000 }),
    item({ day_date: '2026-12-21', unit_price_minor: 400000 }), item({ unit_price_minor: 3200000, section: 'stay' }),
  ];
  const expenses = [exp(2500, 'food', '2026-12-20'), exp(4600, 'activities', '2026-12-21'), exp(900, 'food', '2026-12-21'), exp(700, 'travel', '2026-12-18')];
  const d = dayPlan(trip, items, expenses);
  it('one row per trip day with planned, actual and remaining', () => {
    expect(d.days.map((r) => [r.index, r.date, r.planned, r.actual, r.remaining])).toEqual([
      [1, '2026-12-20', 2800, 2500, 300], [2, '2026-12-21', 4000, 5500, -1500],
      [3, '2026-12-22', 0, 0, 0], [4, '2026-12-23', 0, 0, 0], [5, '2026-12-24', 0, 0, 0]]);
    expect(d.highest?.date).toBe('2026-12-21');
    expect(d.lowest?.date).toBe('2026-12-20');
  });
  it('keeps undated lines and out-of-trip spending visible instead of dropping them', () => {
    expect(d.unscheduledPlanned).toBe(32000);
    expect(d.outsideActual).toBe(700);
  });
  it('without trip dates there are no day rows', () => {
    expect(dayPlan({ id: 't' }, [], expenses).days).toEqual([]);
  });
});

describe('peoplePlan', () => {
  const members = [{ id: 'a', name: 'Asha' }, { id: 'b', name: 'Bilal' }, { id: 'c', name: 'Chirag' }];
  it('shares each line: everyone, selected members, or exact amounts', () => {
    expect(itemShares(item({ unit_price_minor: 10000 }), ['a', 'b', 'c'])).toEqual({ a: 3334, b: 3333, c: 3333 });
    expect(itemShares(item({ unit_price_minor: 10000, split_members: ['a', 'c'] }), ['a', 'b', 'c'])).toEqual({ a: 5000, c: 5000 });
    expect(itemShares(item({ unit_price_minor: 10000, shares: { b: 10000 } }), ['a', 'b', 'c'])).toEqual({ b: 10000 });
  });
  it('planned contribution per person (with buffer) against their actual share', () => {
    const items = [item({ unit_price_minor: 900000 }), item({ unit_price_minor: 400000, split_members: ['a', 'b'] }), item({ unit_price_minor: 100000, shares: { c: 100000 } })];
    const rows = peoplePlan({ ...trip, buffer_pct: 10 }, items, [exp(3000, 'food')], members);
    const by = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(by.Asha).toMatchObject({ planned: 5500, actual: 1500, remaining: 4000 });   // (3000 + 2000) × 1.1
    expect(by.Bilal).toMatchObject({ planned: 5500, actual: 1500 });
    expect(by.Chirag).toMatchObject({ planned: 4400, actual: 0 });                     // (3000 + 1000) × 1.1
    expect(rows.reduce((t, r) => t + r.planned, 0)).toBe(15400);                       // 14,000 × 1.1
  });
});
