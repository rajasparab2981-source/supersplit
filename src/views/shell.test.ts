// Render smoke test for the five-tab shell screens with realistic data.
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/db', () => ({
  DB: {
    getUser: () => ({ email: 'me@example.test' }),
    getProfile: () => ({ display_name: 'Asha Rao', upi_id: 'asha@oksbi' }),
    isStaging: () => false, signOut: async () => {}, updateProfile: async () => {},
  },
}));

import { BottomNav } from '../ui/BottomNav';
import { AnalyticsView } from './AnalyticsView';
import { HomeView } from './HomeView';
import { ProfileView } from './ProfileView';
import { TripsView } from './TripsView';

const groups = [{ id: 'g1', name: 'Goa Squad', emoji: '🏖️', color: '#00E5A0', created_at: '2026-11-01T00:00:00Z' }];
const trips = [{ id: 't1', group_id: 'g1', name: 'Goa Weekend', emoji: '🏖️', created_at: '2026-11-02T00:00:00Z' }];
const today = new Date().toISOString().slice(0, 10);
const expenses = [
  { id: 'e1', trip_id: 't1', group_id: 'g1', description: 'Dinner', amount: 300, paid_by: 'Asha', split_among: ['Asha', 'Bilal', 'Chirag'],
    shares: null, category: 'food', expense_date: today, created_at: '2026-11-03T10:00:00Z' },
  { id: 'settlement:s1', trip_id: 't1', group_id: 'g1', description: 'Bilal paid Asha', amount: 100, paid_by: 'Bilal', split_among: ['Asha'],
    shares: { Asha: 100 }, category: 'other', expense_date: today, created_at: '2026-11-04T10:00:00Z', is_settlement: true },
];
const selfMap = { g1: 'Asha' };
const groupSummaries = { g1: { totalSpent: 300, net: 100, hasSelf: true } };
const plan = { plan: 'trial', trial_ends_at: '2026-12-25T00:00:00Z', premium_until: null, days_left: 30 };
const noop = () => {};

describe('app shell screens render from real-shaped data', () => {
  it('Home shows balance, plan banner and recent activity', () => {
    const html = renderToString(h(HomeView, { name: 'Asha Rao', groups, trips, expenses, groupSummaries, selfMap, plan,
      onOpenGroup: noop, onOpenTrip: noop, onAddGroup: noop, onOpenPlan: noop }));
    expect(html).toContain('Hi Asha');
    expect(html).toContain('Premium trial');
    expect(html).toContain('30 days left');
    expect(html).toContain('Dinner');
    expect(html).toContain('Bilal paid Asha');
  });

  it('Home with no groups and no plan still renders', () => {
    const html = renderToString(h(HomeView, { name: '', groups: [], trips: [], expenses: [], groupSummaries: {}, selfMap: {}, plan: null,
      onOpenGroup: noop, onOpenTrip: noop, onAddGroup: noop, onOpenPlan: noop }));
    expect(html).toContain('New group');
    expect(html).not.toContain('Premium trial');
  });

  it('Analytics shows my share (₹100 of a ₹300 bill), not the bill', () => {
    const props = { expenses, selfMap, groups, trips, groupSummaries, toast: noop, onOpenPlan: noop };
    const free = renderToString(h(AnalyticsView as never, { ...props, premium: false }));
    expect(free).toContain('₹100');
    expect(free).toContain('₹200'); // paid for others
    expect(free).toContain('This is a Premium feature');
    expect(free).not.toContain('Last 7 days'); // free plan: this month / all time only
    const paid = renderToString(h(AnalyticsView as never, { ...props, premium: true }));
    expect(paid).toContain('Last 7 days');
    expect(paid).toContain('Download CSV');
    expect(paid).toContain('Owed to you');
    expect(paid).not.toContain('This is a Premium feature');
  });

  it('Trips lists trips with spending that excludes settlements', () => {
    const props = { groups, trips, tripTotals: { t1: { totalSpent: 300, net: 100, hasSelf: true, count: 1 } }, plannedTotals: { t1: 1000 },
      toast: noop, onOpenPlanner: noop, onGoGroups: noop, onOpenPlan: noop };
    const strip = (s: string) => s.split('<!-- -->').join('');
    const html = strip(renderToString(h(TripsView as never, { ...props, premium: true })));
    expect(html).toContain('Goa Weekend');
    expect(html).toContain('spent ₹300 of ₹1,000 planned');
    expect(html).toContain('1 expense');
    expect(renderToString(h(TripsView as never, { ...props, premium: false }))).toContain('Planning is part of Premium');
  });

  it('Profile shows the plan and details; free plan explains the pause', () => {
    expect(renderToString(h(ProfileView, { plan, toast: noop }))).toContain('Premium trial');
    const free = renderToString(h(ProfileView, { plan: { ...plan, plan: 'free', days_left: 0 }, toast: noop }));
    expect(free).toContain('Premium features are paused');
    expect(renderToString(h(ProfileView, { plan: null, toast: noop }))).toContain('Sign out');
  });

  it('Bottom nav marks the active tab', () => {
    const html = renderToString(h(BottomNav, { active: 'analytics', onChange: noop }));
    expect(html.match(/aria-current="page"/g)?.length).toBe(1);
    for (const label of ['Home', 'Groups', 'Trips', 'Analytics', 'Profile']) expect(html).toContain(label);
  });
});
