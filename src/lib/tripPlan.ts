// Smart Trip Planner calculations, in integer paise.
//
// PLANNED comes from budget lines; ACTUAL comes from the trip's real expenses
// (settlements excluded), mapped from expense category to budget section.
// Nothing here is estimated or invented: with no budget lines, planned is 0.

import { splitEvenly, toPaise, toRupees } from './money';
import { expenseEffect } from './splits';
import type { Expense } from '../types';

export type SectionId = 'transport' | 'stay' | 'food' | 'activities' | 'shopping' | 'essentials' | 'misc';

export interface Section {
  id: SectionId; label: string; emoji: string;
  /** Expense categories counted as this section's actual spending. */
  categories: string[];
  /** Suggested line names (the person can type anything). */
  presets: string[];
}

export const SECTIONS: Section[] = [
  { id: 'transport', label: 'Transport', emoji: '✈️', categories: ['travel', 'transport', 'fuel'],
    presets: ['Flights', 'Train tickets', 'Bus tickets', 'Cab to airport or station', 'Airport transfers', 'Local taxi', 'Bike rental', 'Car rental', 'Fuel', 'Parking', 'Tolls', 'Public transport', 'Luggage fees'] },
  { id: 'stay', label: 'Stay', emoji: '🏨', categories: ['stay', 'rent'],
    presets: ['Hotel', 'Resort', 'Hostel', 'Airbnb or homestay', 'Taxes and service charges', 'Security deposit', 'Early check-in', 'Late check-out', 'Extra room charges'] },
  { id: 'food', label: 'Food & drinks', emoji: '🍽️', categories: ['food', 'drinks', 'groceries'],
    presets: ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Coffee', 'Water', 'Drinks', 'Restaurants', 'Street food', 'Food delivery', 'Group meals'] },
  { id: 'activities', label: 'Activities', emoji: '🎟️', categories: ['activities', 'fun'],
    presets: ['Sightseeing', 'Entry tickets', 'Adventure sports', 'Water sports', 'Trekking', 'Scuba diving', 'Theme park', 'Guided tour', 'Nightlife', 'Clubs', 'Events', 'Local experiences'] },
  { id: 'shopping', label: 'Shopping', emoji: '🛍️', categories: ['shopping'],
    presets: ['Clothes', 'Souvenirs', 'Local products', 'Gifts', 'Accessories'] },
  { id: 'essentials', label: 'Essentials', emoji: '🧴', categories: ['medical', 'utilities'],
    presets: ['SIM card', 'Internet', 'Travel insurance', 'Toiletries', 'Medicines', 'Sunscreen', 'Laundry', 'Luggage storage'] },
  { id: 'misc', label: 'Miscellaneous', emoji: '📌', categories: ['other'],
    presets: ['Tips', 'Emergency expenses', 'Unexpected transport', 'Extra food', 'Last-minute bookings', 'Other'] },
];
const SECTION_OF_CATEGORY = new Map<string, SectionId>(SECTIONS.flatMap((s) => s.categories.map((c) => [c, s.id] as [string, SectionId])));
/** Which budget section an expense category counts towards (custom categories go to Miscellaneous). */
export const sectionOfCategory = (category: string): SectionId => SECTION_OF_CATEGORY.get(category) ?? 'misc';

export interface BudgetItem {
  id: string; trip_id: string; section: SectionId; label: string; day_date: string | null;
  unit_price_minor: number; quantity: number; people: number; days: number; estimated_minor: number;
  notes: string | null; booking_status: 'none' | 'to_book' | 'booked'; paid: boolean;
  split_members: string[] | null; shares: Record<string, number> | null;
  source: 'user' | 'personal_history' | 'group_history'; status: 'accepted' | 'suggested';
}
export interface PlanTrip {
  id: string; start_date?: string | null; end_date?: string | null; adults?: number | null; children?: number | null;
  budget_minor?: number | null; buffer_pct?: number | null; alert_thresholds?: number[] | null; status?: string | null;
}
export interface TripExpense extends Expense { is_settlement?: boolean }

/** Unit price × quantity × people × days, in paise (same rounding as the database). */
export function estimate(unitPriceMinor: number, quantity = 1, people = 1, days = 1): number {
  return Math.round(unitPriceMinor * quantity * people * days);
}

const R = toRupees;
const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null);

export interface SectionRow {
  id: SectionId; label: string; emoji: string;
  planned: number; actual: number;
  /** planned − actual: positive = budget left, negative = overspent. */
  remaining: number;
  /** % of the planned amount used; null when nothing was planned. */
  used: number | null;
  /** Highest alert level reached (e.g. 75), or null. */
  alert: number | null;
  /** Spending in a section with no budget at all. */
  unplanned: boolean;
  lines: number;
}
export interface PlanSummary {
  sections: SectionRow[];
  planned: number;           // sum of accepted lines
  buffer: number;            // planned × buffer %
  plannedWithBuffer: number;
  suggested: number;         // lines still only suggested (not in `planned`)
  actual: number;
  remaining: number;         // plannedWithBuffer − actual
  used: number | null;
  /** The overall budget typed when creating the trip, and how the plan compares. */
  target: number | null; overTarget: number | null;
  travellers: number;
  perPersonPlanned: number; perPersonActual: number;
  alerts: { section: string; level: number; used: number }[];
  bookedCount: number; toBookCount: number; paidAmount: number;
}

const liveItems = (items: BudgetItem[]) => items.filter((i) => i.status === 'accepted');
const spending = (expenses: TripExpense[]) => expenses.filter((e) => !e.is_settlement);

export function planSummary(trip: PlanTrip, items: BudgetItem[], expenses: TripExpense[], memberCount: number): PlanSummary {
  const live = liveItems(items);
  const thresholds = [...(trip.alert_thresholds?.length ? trip.alert_thresholds : [50, 75, 90, 100])].sort((a, b) => a - b);
  const plannedBy = new Map<SectionId, number>(), linesBy = new Map<SectionId, number>(), actualBy = new Map<SectionId, number>();
  for (const i of live) {
    plannedBy.set(i.section, (plannedBy.get(i.section) ?? 0) + i.estimated_minor);
    linesBy.set(i.section, (linesBy.get(i.section) ?? 0) + 1);
  }
  for (const e of spending(expenses)) {
    const s = sectionOfCategory(e.category);
    actualBy.set(s, (actualBy.get(s) ?? 0) + toPaise(e.amount));
  }
  const level = (used: number | null) => (used == null ? null : [...thresholds].reverse().find((t) => used >= t) ?? null);

  const sections: SectionRow[] = SECTIONS.map((s) => {
    const p = plannedBy.get(s.id) ?? 0, a = actualBy.get(s.id) ?? 0;
    const used = pct(a, p);
    return { id: s.id, label: s.label, emoji: s.emoji, planned: R(p), actual: R(a), remaining: R(p - a), used,
      alert: level(used), unplanned: p === 0 && a > 0, lines: linesBy.get(s.id) ?? 0 };
  });

  const planned = live.reduce((t, i) => t + i.estimated_minor, 0);
  const buffer = Math.round((planned * (trip.buffer_pct ?? 0)) / 100);
  const actual = [...actualBy.values()].reduce((t, v) => t + v, 0);
  const travellers = Math.max(1, (trip.adults ?? 0) + (trip.children ?? 0) || memberCount || 1);
  const target = trip.budget_minor ?? null;
  const total = planned + buffer;

  return {
    sections, planned: R(planned), buffer: R(buffer), plannedWithBuffer: R(total),
    suggested: R(items.filter((i) => i.status === 'suggested').reduce((t, i) => t + i.estimated_minor, 0)),
    actual: R(actual), remaining: R(total - actual), used: pct(actual, total),
    target: target == null ? null : R(target), overTarget: target == null ? null : R(total - target),
    travellers, perPersonPlanned: R(Math.round(total / travellers)), perPersonActual: R(Math.round(actual / travellers)),
    alerts: sections.filter((s) => s.alert != null).map((s) => ({ section: s.label, level: s.alert!, used: Math.round(s.used!) }))
      .sort((a, b) => b.used - a.used),
    bookedCount: live.filter((i) => i.booking_status === 'booked').length,
    toBookCount: live.filter((i) => i.booking_status === 'to_book').length,
    paidAmount: R(live.filter((i) => i.paid).reduce((t, i) => t + i.estimated_minor, 0)),
  };
}

// ---------- Day-by-day ----------
export interface DayRow { date: string; index: number; planned: number; actual: number; remaining: number; items: BudgetItem[] }
export interface DayPlan {
  days: DayRow[];
  /** Planned lines not tied to a day (flights, hotel totals…). */
  unscheduled: BudgetItem[]; unscheduledPlanned: number;
  /** Actual spending dated outside the trip's dates. */
  outsideActual: number;
  highest: DayRow | null; lowest: DayRow | null;
}

const addDay = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};

/** One row per day of the trip (from its dates, widened to include any dated line). */
export function dayPlan(trip: PlanTrip, items: BudgetItem[], expenses: TripExpense[]): DayPlan {
  const live = liveItems(items);
  const dated = live.filter((i) => i.day_date);
  const starts = [trip.start_date, ...dated.map((i) => i.day_date)].filter(Boolean).sort() as string[];
  const ends = [trip.end_date, ...dated.map((i) => i.day_date)].filter(Boolean).sort() as string[];
  const from = starts[0], to = ends[ends.length - 1];
  const rows: DayRow[] = [];
  const act = new Map<string, number>();
  for (const e of spending(expenses)) act.set(e.expense_date, (act.get(e.expense_date) ?? 0) + toPaise(e.amount));
  let outside = 0;

  if (from && to && from <= to) {
    for (let d = from, i = 1; d <= to && i <= 400; d = addDay(d, 1), i++) {
      const its = dated.filter((x) => x.day_date === d);
      const p = its.reduce((t, x) => t + x.estimated_minor, 0), a = act.get(d) ?? 0;
      rows.push({ date: d, index: i, planned: R(p), actual: R(a), remaining: R(p - a), items: its });
    }
    for (const [d, v] of act) if (d < from || d > to) outside += v;
  } else {
    for (const v of act.values()) outside += v;
  }
  const withSpend = rows.filter((r) => r.actual > 0);
  const byActual = [...withSpend].sort((a, b) => b.actual - a.actual);
  const unscheduled = live.filter((i) => !i.day_date);
  return {
    days: rows, unscheduled, unscheduledPlanned: R(unscheduled.reduce((t, i) => t + i.estimated_minor, 0)),
    outsideActual: R(outside),
    highest: byActual[0] ?? null, lowest: withSpend.length >= 2 ? byActual[byActual.length - 1]! : null,
  };
}

// ---------- People ----------
export interface PlanMember { id: string; name: string; left_at?: string | null }
export interface PersonPlan { id: string; name: string; planned: number; actual: number; remaining: number }

/** How one budget line is shared between members, in paise. Always sums to the line. */
export function itemShares(item: BudgetItem, activeMemberIds: string[]): Record<string, number> {
  if (item.shares && Object.keys(item.shares).length > 0) return { ...item.shares };
  const ids = item.split_members?.length ? item.split_members : activeMemberIds;
  if (ids.length === 0) return {};
  const parts = splitEvenly(item.estimated_minor, ids.length);
  return Object.fromEntries(ids.map((id, i) => [id, parts[i]!]));
}

/**
 * Each member's planned contribution (their part of every accepted line, plus
 * the same buffer %) against their actual share of the trip's expenses.
 */
export function peoplePlan(trip: PlanTrip, items: BudgetItem[], expenses: TripExpense[], members: PlanMember[]): PersonPlan[] {
  const active = members.filter((m) => !m.left_at).map((m) => m.id);
  const planned = new Map<string, number>();
  for (const i of liveItems(items)) for (const [id, v] of Object.entries(itemShares(i, active))) planned.set(id, (planned.get(id) ?? 0) + v);
  const actualByName = new Map<string, number>();
  for (const e of spending(expenses)) for (const [name, v] of Object.entries(expenseEffect(e).owed)) actualByName.set(name, (actualByName.get(name) ?? 0) + v);
  const buf = 1 + (trip.buffer_pct ?? 0) / 100;
  return members
    .map((m) => {
      const p = Math.round((planned.get(m.id) ?? 0) * buf), a = actualByName.get(m.name) ?? 0;
      return { id: m.id, name: m.name, planned: R(p), actual: R(a), remaining: R(p - a) };
    })
    .filter((r) => r.planned > 0 || r.actual > 0 || members.find((m) => m.id === r.id && !m.left_at))
    .sort((a, b) => b.planned - a.planned || a.name.localeCompare(b.name));
}

/** Number of days in the trip, or null without both dates. */
export function tripLength(trip: PlanTrip): number | null {
  if (!trip.start_date || !trip.end_date || trip.end_date < trip.start_date) return null;
  const ms = Date.UTC(...(trip.end_date.split('-').map(Number) as [number, number, number])) - Date.UTC(...(trip.start_date.split('-').map(Number) as [number, number, number]));
  // Date.UTC months are 0-based on both sides, so the difference is unaffected.
  return Math.round(ms / 86_400_000) + 1;
}
