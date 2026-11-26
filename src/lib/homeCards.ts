// Contextual cards for the Home screen. Every card is derived from the
// person's real data; when nothing needs attention the list is empty.

export interface HomeCard {
  /** Stable id including the figure, so a dismissed card returns when the number changes. */
  id: string;
  tone: 'info' | 'warn' | 'good';
  icon: 'wallet' | 'handshake' | 'alert' | 'star';
  text: string;
  cta: string;
  target: { kind: 'group'; groupId: string } | { kind: 'settle'; groupId: string } | { kind: 'planner'; groupId: string; tripId: string } | { kind: 'plan' };
}

export interface CardInput {
  groups: { id: string; name: string }[];
  groupSummaries: Record<string, { net: number; hasSelf: boolean } | undefined>;
  tripAlerts: { groupId: string; tripId: string; tripName: string; section: string; used: number }[];
  plan: { plan: string; days_left: number } | null;
  money: (rupees: number) => string;
}

export function homeCards({ groups, groupSummaries, tripAlerts, plan, money }: CardInput): HomeCard[] {
  const cards: HomeCard[] = [];
  const balances = groups
    .map((g) => ({ g, net: groupSummaries[g.id]?.hasSelf ? groupSummaries[g.id]!.net : 0 }))
    .filter((x) => Math.abs(x.net) >= 1);

  // What you owe comes first: it needs action from you.
  for (const { g, net } of balances.filter((x) => x.net < 0).sort((a, b) => a.net - b.net).slice(0, 2)) {
    cards.push({ id: `owe:${g.id}:${Math.round(-net)}`, tone: 'warn', icon: 'handshake',
      text: `You owe ${money(-net)} in ${g.name}.`, cta: 'Settle up', target: { kind: 'settle', groupId: g.id } });
  }
  for (const { g, net } of balances.filter((x) => x.net > 0).sort((a, b) => b.net - a.net).slice(0, 2)) {
    cards.push({ id: `owed:${g.id}:${Math.round(net)}`, tone: 'info', icon: 'wallet',
      text: `You have ${money(net)} pending from ${g.name}.`, cta: 'View group', target: { kind: 'group', groupId: g.id } });
  }
  for (const a of [...tripAlerts].sort((x, y) => y.used - x.used).slice(0, 2)) {
    cards.push({ id: `budget:${a.tripId}:${a.section}:${a.used}`, tone: 'warn', icon: 'alert',
      text: a.used > 100
        ? `${a.section} for ${a.tripName} is over budget (${a.used}% used).`
        : `${a.section} budget for ${a.tripName} is ${a.used}% used.`,
      cta: 'View plan', target: { kind: 'planner', groupId: a.groupId, tripId: a.tripId } });
  }
  if (plan?.plan === 'trial' && plan.days_left <= 7) {
    cards.push({ id: `trial:${plan.days_left}`, tone: 'info', icon: 'star',
      text: `Your Premium trial ends in ${plan.days_left} day${plan.days_left === 1 ? '' : 's'}. Splitting and settling stay free.`,
      cta: 'See plan', target: { kind: 'plan' } });
  }
  return cards;
}

const KEY = 'splitpro_dismissed_cards';
export function loadDismissed(): string[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function saveDismissed(ids: string[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(ids.slice(-60))); } catch { /* storage blocked */ }
}
