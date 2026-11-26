import { describe, expect, it } from 'vitest';
import { homeCards } from './homeCards';

const money = (r: number) => `₹${r}`;
const groups = [{ id: 'g1', name: 'Goa Squad' }, { id: 'g2', name: 'Flat' }, { id: 'g3', name: 'Office' }];

describe('homeCards', () => {
  it('shows nothing when there is nothing to act on', () => {
    expect(homeCards({ groups, groupSummaries: { g1: { net: 0, hasSelf: true } }, tripAlerts: [], plan: { plan: 'trial', days_left: 20 }, money })).toEqual([]);
    expect(homeCards({ groups: [], groupSummaries: {}, tripAlerts: [], plan: null, money })).toEqual([]);
  });

  it('builds cards from real balances: debts first, then money pending', () => {
    const cards = homeCards({ groups, groupSummaries: { g1: { net: 1250, hasSelf: true }, g2: { net: -400.4, hasSelf: true }, g3: { net: 900, hasSelf: false } },
      tripAlerts: [], plan: null, money });
    expect(cards.map((c) => c.text)).toEqual(['You owe ₹400.4 in Flat.', 'You have ₹1250 pending from Goa Squad.']);
    expect(cards[0]).toMatchObject({ tone: 'warn', cta: 'Settle up', target: { kind: 'settle', groupId: 'g2' } });
    expect(cards[1]!.target).toEqual({ kind: 'group', groupId: 'g1' });
  });

  it('a dismissed card comes back when the amount changes (id includes the figure)', () => {
    const at = (net: number) => homeCards({ groups, groupSummaries: { g1: { net, hasSelf: true } }, tripAlerts: [], plan: null, money })[0]!.id;
    expect(at(1250)).not.toBe(at(1300));
    expect(at(1250)).toBe(at(1250.2));
  });

  it('trip budget alerts and the trial reminder', () => {
    const cards = homeCards({ groups, groupSummaries: {}, plan: { plan: 'trial', days_left: 1 }, money,
      tripAlerts: [{ groupId: 'g1', tripId: 't1', tripName: 'Goa', section: 'Food & drinks', used: 85 }, { groupId: 'g1', tripId: 't1', tripName: 'Goa', section: 'Stay', used: 104 }] });
    expect(cards.map((c) => c.text)).toEqual([
      'Stay for Goa is over budget (104% used).', 'Food & drinks budget for Goa is 85% used.',
      'Your Premium trial ends in 1 day. Splitting and settling stay free.']);
  });
});
