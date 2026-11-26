import { useState, useEffect, useMemo, useCallback } from 'react';
import { DB } from './db/db';
import { fmtINR } from './lib/money';
import { youLine } from './lib/splits';
import { loadUpiMap, saveUpiMap } from './lib/storage';
import { AddExpenseSheet, sharesFor } from './sheets/AddExpenseSheet';
import { ReceiptScreen } from './sheets/ReceiptScreen';
import { settlementOverview } from './lib/settlements';
import { SettlementsView } from './views/SettlementsView';
import { CalculatorSheet } from './sheets/CalculatorSheet';
import { InviteSheet } from './sheets/InviteSheet';
import { JoinScreen } from './sheets/JoinScreen';
import { SignInScreen } from './sheets/SignInScreen';
import { AddGroupSheet, AddMemberSheet, AddTripSheet } from './sheets/SimpleSheets';
import { UpiPaySheet } from './sheets/UpiPaySheet';
import { Icon } from './ui/Icon';
import { insights as buildInsights, myEntries, periodFor } from './lib/analytics';
import { CAT_BY_ID } from './lib/constants';
import { todayISO } from './lib/dates';
import { planSummary } from './lib/tripPlan';
import { AddWhereSheet, rememberTrip } from './sheets/AddWhereSheet';
import { AppHeader } from './ui/AppHeader';
import { BottomNav } from './ui/BottomNav';
import { ActionsSheet, ConfirmSheet, ToastStack, useToasts } from './ui/primitives';
import { AnalyticsView } from './views/AnalyticsView';
import { HomeView } from './views/HomeView';
import { PlannerView } from './views/PlannerView';
import { PremiumView } from './views/PremiumView';
import { ProfileView } from './views/ProfileView';
import { TripsView } from './views/TripsView';
import { GroupView } from './views/GroupView';
import { GroupsView } from './views/GroupsView';
import { TripView } from './views/TripView';

const JOIN_KEY = 'splitpro_pending_join';

/** Invite token from /join/<token>, remembered across the sign-in redirect. */
function readJoinToken() {
  const m = window.location.pathname.match(/^\/join\/([A-Za-z0-9_-]{16,})\/?$/);
  if (m) {
    try { sessionStorage.setItem(JOIN_KEY, m[1]); } catch { /* storage blocked */ }
    window.history.replaceState(null, '', '/');
    return m[1];
  }
  try { return sessionStorage.getItem(JOIN_KEY); } catch { return null; }
}

export function App() {
  const [snap, setSnap] = useState(DB.snapshot());
  const [authState, setAuthState] = useState(DB.getAuthState());
  const [joinToken, setJoinToken] = useState(readJoinToken);

  useEffect(() => DB.subscribe((s) => {
    setSnap(s);
    setAuthState(DB.getAuthState());
  }), []);

  // Who "you" are in each group comes from your account now.
  const selfMap = useMemo(() => Object.fromEntries((snap.groups || []).map((g) => [g.id, DB.getSelfName(g.id)])), [snap]);

  // Device-local fallback for UPI IDs of people without an account yet.
  const [upiMap, setUpiMap] = useState(loadUpiMap());
  const persistUpi = useCallback((m) => { saveUpiMap(m); setUpiMap(m); }, []);

  // Top-level tabs: home | groups | trips | analytics | profile. Inside Groups: group, trip.
  const [view, setView] = useState({ name: 'home' });
  const [sheet, setSheet] = useState(null);
  const [upiPay, setUpiPay] = useState(null); // { transfer, trip }
  const [calcOpen, setCalcOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(null); // 'group' | 'trip' | null
  const [confirm, setConfirm] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addWhere, setAddWhere] = useState(false); // false | true (any trip) | group id
  const [receipt, setReceipt] = useState(null);
  const { toasts, push: toast } = useToasts();

  const groups = useMemo(() => DB.getGroups(), [snap]);
  const currentGroup = useMemo(() => {
    if (['group', 'trip', 'planner'].includes(view.name)) return groups.find((g) => g.id === view.groupId) || null;
    return null;
  }, [view, groups]);
  const currentGroupMembers = useMemo(() => currentGroup ? DB.getMembers(currentGroup.id) : [], [currentGroup, snap]);
  const currentGroupTrips = useMemo(() => currentGroup ? DB.getTrips(currentGroup.id) : [], [currentGroup, snap]);
  const currentTrip = useMemo(() => {
    if (!['trip', 'planner'].includes(view.name) || !currentGroup) return null;
    return currentGroupTrips.find((t) => t.id === view.tripId) || null;
  }, [view, currentGroup, currentGroupTrips]);
  const currentTripExpenses = useMemo(() => currentTrip ? DB.getExpenses(currentTrip.id) : [], [currentTrip, snap]);
  const currentSelf = currentGroup ? selfMap[currentGroup.id] : null;
  const myRole = currentGroup ? DB.getMyRole(currentGroup.id) : null;

  // ---------- Aggregates (payments count towards balances, not spending) ----------
  const groupSummaries = useMemo(() => {
    const out = {};
    for (const g of (snap.groups || [])) {
      const myName = selfMap[g.id];
      const tripIds = (snap.trips || []).filter((t) => t.group_id === g.id).map((t) => t.id);
      const entries = (snap.expenses || []).filter((e) => tripIds.includes(e.trip_id));
      const totalSpent = entries.filter((e) => !e.is_settlement).reduce((s, e) => s + Number(e.amount || 0), 0);
      let net = 0;
      if (myName) for (const e of entries) net += youLine(e, myName) || 0;
      out[g.id] = { totalSpent, net, hasSelf: !!myName };
    }
    return out;
  }, [snap, selfMap]);

  const tripSummaries = useMemo(() => {
    const out = {};
    if (!currentGroup) return out;
    const myName = selfMap[currentGroup.id];
    for (const t of currentGroupTrips) {
      const entries = (snap.expenses || []).filter((e) => e.trip_id === t.id);
      const totalSpent = entries.filter((e) => !e.is_settlement).reduce((s, e) => s + Number(e.amount || 0), 0);
      let net = 0;
      if (myName) for (const e of entries) net += youLine(e, myName) || 0;
      out[t.id] = { totalSpent, net, hasSelf: !!myName };
    }
    return out;
  }, [snap, currentGroup, currentGroupTrips, selfMap]);

  const allTripTotals = useMemo(() => {
    const out = {};
    for (const t of (snap.trips || [])) {
      const myName = selfMap[t.group_id];
      const entries = (snap.expenses || []).filter((e) => e.trip_id === t.id);
      const spending = entries.filter((e) => !e.is_settlement);
      let net = 0;
      if (myName) for (const e of entries) net += youLine(e, myName) || 0;
      out[t.id] = { totalSpent: spending.reduce((s, e) => s + Number(e.amount || 0), 0), net, hasSelf: !!myName, count: spending.length };
    }
    return out;
  }, [snap, selfMap]);

  // Pending and completed settlements across every group.
  const settleAll = useMemo(() => settlementOverview(snap.trips || [], snap.groups || [], snap.expenses || [], selfMap), [snap, selfMap]);

  useEffect(() => {
    if (authState !== 'signed_in') return;
    if (view.name === 'group' && !currentGroup) { setView({ name: 'groups' }); toast('Group is no longer available', 'error'); }
    else if (['trip', 'planner'].includes(view.name) && (!currentGroup || !currentTrip)) {
      if (currentGroup) { setView({ name: 'group', groupId: currentGroup.id }); toast('Trip was deleted', 'error'); }
      else { setView({ name: 'groups' }); toast('Group is no longer available', 'error'); }
    }
  }, [authState, view.name, currentGroup, currentTrip, toast]);

  // ---------- Mutations ----------
  // Every backend error surfaces as a toast instead of failing silently.
  const safeMutate = async (label, fn) => {
    try {
      return await fn();
    } catch (e) {
      console.error(label + ' failed:', e);
      const msg = e?.code === '40001'
        ? 'someone else changed this just now. It has been refreshed; please try again.'
        : (e && (e.message || e.error_description || e.hint)) || String(e);
      toast(`${label} failed: ${msg}`, 'error');
      throw e;
    }
  };

  const createGroup = async (g) => {
    try {
      const c = await safeMutate('Create group', () => DB.addGroup(g));
      setSheet(null);
      toast(`"${c.name}" created`, 'success');
      setView({ name: 'group', groupId: c.id });
    } catch {}
  };
  const addMember = async (name) => {
    try {
      await safeMutate('Add member', () => DB.addMember(currentGroup.id, name));
      setSheet(null);
      toast(`${name} added`, 'success');
    } catch {}
  };
  const removeMember = (m) => {
    const isMe = m.name === currentSelf;
    setConfirm({
      title: isMe ? 'Leave this group?' : `Remove ${m.name}?`,
      message: isMe
        ? 'You will lose access to this group. Your past expenses stay in its history.'
        : `Past expenses with ${m.name} stay in history. They won't appear in new expense forms.`,
      confirmLabel: isMe ? 'Leave' : 'Remove',
      onConfirm: async () => {
        try {
          await safeMutate(isMe ? 'Leave group' : 'Remove member', () => DB.deleteMember(m.id));
          toast(isMe ? 'You left the group' : `${m.name} removed`, 'success');
          if (isMe) setView({ name: 'groups' });
          setConfirm(null);
        } catch { setConfirm(null); }
      },
    });
  };
  const createTrip = async (t) => {
    try {
      const c = await safeMutate('Create trip', () => DB.addTrip(currentGroup.id, t));
      setSheet(null);
      toast(`"${c.name}" created`, 'success');
    } catch {}
  };
  const createExpense = async (e) => {
    try {
      await safeMutate('Add expense', () => DB.addExpense({ trip_id: currentTrip.id, ...e }));
      setSheet(null);
      const shares = sharesFor(e.amount, e.split_among, e.shares);
      setReceipt({ kind: 'expense', amount: e.amount, title: e.description, paidBy: e.paid_by, date: e.expense_date, at: Date.now(), self: currentSelf,
        groupName: currentGroup.name, tripName: currentTrip.name, participants: e.split_among.map((n) => ({ name: n, share: shares[n] || 0 })) });
    } catch {}
  };
  const editExpense = (e) => { if (!e.is_settlement) setSheet({ kind: 'expense', editing: e }); };
  const updateExpense = async (id, patch) => {
    try {
      await safeMutate('Update expense', () => DB.updateExpense(id, patch));
      setSheet(null);
      toast('Expense updated', 'success');
    } catch {}
  };
  const removeExpense = (e) => setConfirm({
    title: 'Delete this expense?',
    message: `"${e.description}" — ${fmtINR(e.amount)} paid by ${e.paid_by}.`,
    confirmLabel: 'Delete',
    onConfirm: async () => {
      try {
        await safeMutate('Delete expense', () => DB.deleteExpense(e.id));
        setSheet(null);
        setConfirm(null);
        toast('Expense deleted', 'success');
      } catch { setConfirm(null); }
    },
  });
  const removeTrip = () => setConfirm({
    title: `Delete "${currentTrip.name}"?`,
    message: `Removes the trip and all ${currentTripExpenses.filter((e) => !e.is_settlement).length} expenses inside.`,
    confirmLabel: 'Delete trip',
    onConfirm: async () => {
      try {
        const n = currentTrip.name;
        await safeMutate('Delete trip', () => DB.deleteTrip(currentTrip.id));
        toast(`"${n}" deleted`, 'success');
        setConfirm(null);
      } catch { setConfirm(null); }
    },
  });
  const removeGroup = () => setConfirm({
    title: `Delete "${currentGroup.name}"?`,
    message: `Deletes the group for everyone: ${currentGroupMembers.length} members, ${currentGroupTrips.length} trips and every expense inside.`,
    confirmLabel: 'Delete group',
    onConfirm: async () => {
      try {
        const n = currentGroup.name;
        await safeMutate('Delete group', () => DB.deleteGroup(currentGroup.id));
        toast(`"${n}" deleted`, 'success');
        setConfirm(null);
      } catch { setConfirm(null); }
    },
  });

  const onPay = (transfer, trip) => setUpiPay({ transfer, trip });
  const saveVpa = (name, vpa) => persistUpi({ ...upiMap, [name]: vpa });
  const markPaid = (s, trip) => setConfirm({
    title: `Record ${fmtINR(s.amount, true)} as paid?`,
    message: `${s.from} paid ${s.to}. This updates everyone's balances. You can undo it from the trip's Settle tab.`,
    confirmLabel: 'Mark as paid',
    tone: 'primary',
    onConfirm: async () => {
      try {
        const gid = trip.group_id || currentGroup.id;
        await safeMutate('Record payment', () => DB.recordSettlement(trip.id, gid, s.from, s.to, s.amount, 'upi'));
        setConfirm(null);
        setReceipt({ kind: 'payment', amount: s.amount, from: s.from, to: s.to, date: todayISO(), at: Date.now(), self: selfMap[gid],
          groupName: groups.find((g) => g.id === gid)?.name || '', tripName: trip.name });
      } catch { setConfirm(null); }
    },
  });
  const undoPayment = (p) => setConfirm({
    title: 'Undo this payment?',
    message: `${p.paid_by} → ${p.split_among[0]}, ${fmtINR(p.amount, true)}. Balances go back to before it was recorded.`,
    confirmLabel: 'Undo payment',
    onConfirm: async () => {
      try {
        await safeMutate('Undo payment', () => DB.deleteExpense(p.id));
        setConfirm(null);
        toast('Payment removed', 'success');
      } catch { setConfirm(null); }
    },
  });
  const reactToExpense = async (expenseId, nextReactions) => {
    try { await safeMutate('React', () => DB.updateExpense(expenseId, { reactions: nextReactions })); } catch {}
  };

  const finishJoin = (groupId, already) => {
    try { sessionStorage.removeItem(JOIN_KEY); } catch {}
    setJoinToken(null);
    setView({ name: 'group', groupId });
    toast(already ? "You're already in this group" : 'Welcome to the group!', 'success');
  };
  const cancelJoin = () => {
    try { sessionStorage.removeItem(JOIN_KEY); } catch {}
    setJoinToken(null);
  };

  // ---------- Signed out / loading / joining ----------
  if (authState === 'loading') {
    return (
      <div className="app">
        <AppHeader home bare />
        <main className="app-content" aria-busy="true" aria-label="Loading">
          <div className="skel skel-hero" /><div className="skel-row"><div className="skel" /><div className="skel" /><div className="skel" /><div className="skel" /></div>
          <div className="skel skel-card" /><div className="skel skel-card" />
        </main>
      </div>
    );
  }
  if (authState === 'signed_out') {
    return (
      <div className="app">
        <AppHeader home bare subtitle={DB.isStaging() ? 'Test' : null} />
        <SignInScreen joining={!!joinToken} />
        <ToastStack toasts={toasts} />
      </div>
    );
  }
  if (joinToken) {
    return (
      <div className="app">
        <AppHeader home bare />
        <JoinScreen token={joinToken} onJoined={finishJoin} onCancel={cancelJoin} />
        <ToastStack toasts={toasts} />
      </div>
    );
  }

  let headerProps;
  const baseHeader = { onCalc: () => setCalcOpen(true), syncStatus: DB.getLoadError() ? null : 'live' };
  const TAB_TITLES = { home: 'SplitPro', groups: 'Groups', trips: 'Trips', analytics: 'Analytics', profile: 'Profile' };
  const goHome = () => setView({ name: 'home' });
  const plan = DB.getPlan();
  const openPremium = () => { setView({ name: 'premium', from: view.name }); window.scrollTo(0, 0); };
  const activeTab = view.name === 'analytics' ? 'home' : view.name === 'premium' ? 'profile' : view.name === 'settlements' ? (view.groupId ? 'groups' : 'home') : TAB_TITLES[view.name] ? view.name : view.name === 'planner' || view.from === 'planner' ? 'trips' : (view.from || 'groups');
  const openPlanner = (groupId, tripId) => setView({ name: 'planner', groupId, tripId });
  const plannedTotals = {};
  for (const t of (snap.trips || [])) {
    const planned = DB.getBudgetItems(t.id).filter((i) => i.status === 'accepted').reduce((s, i) => s + i.estimated_minor, 0);
    plannedTotals[t.id] = Math.round(planned * (1 + Number(t.buffer_pct ?? 0) / 100)) / 100;
  }
  const openTrip = (groupId, tripId, from, tab) => setView({ name: 'trip', groupId, tripId, from, tab });

  // ----- Home: actions and data -----
  const startAddExpense = (groupId) => {
    const trips = (snap.trips || []).filter((t) => !groupId || t.group_id === groupId);
    if (groups.length === 0) { toast('Create a group first, then add expenses to it', 'error'); setSheet({ kind: 'group' }); return; }
    if (groupId && trips.length === 0) { toast('Create a trip first, then add expenses to it', 'error'); setSheet({ kind: 'trip' }); return; }
    if (trips.length === 1) { pickTripForExpense(trips[0]); return; }
    setAddWhere(groupId || true);
  };
  // The Add button in the tab bar adds to wherever you are.
  const navAdd = () => {
    if (view.name === 'trip' && currentTrip) { setSheet({ kind: 'expense' }); return; }
    if (view.name === 'planner' && currentTrip) {
      rememberTrip(currentTrip.id);
      setView({ name: 'trip', groupId: currentGroup.id, tripId: currentTrip.id, from: 'planner' });
      setSheet({ kind: 'expense' });
      return;
    }
    startAddExpense(view.name === 'group' && currentGroup ? currentGroup.id : undefined);
  };
  const pickTripForExpense = (t) => {
    rememberTrip(t.id);
    setAddWhere(false);
    setView({ name: 'trip', groupId: t.group_id, tripId: t.id, from: view.name === 'group' ? undefined : 'home' });
    setSheet({ kind: 'expense' });
  };
  const settleUp = (groupId) => { setView({ name: 'settlements', groupId }); window.scrollTo(0, 0); };
  const settleView = view.name === 'settlements'
    ? (view.groupId ? settlementOverview((snap.trips || []).filter((t) => t.group_id === view.groupId), snap.groups || [], snap.expenses || [], selfMap) : settleAll)
    : null;
  const tripById = (id) => (snap.trips || []).find((t) => t.id === id);
  const memberCounts = {};
  for (const m of (snap.members || [])) if (!m.left_at) memberCounts[m.group_id] = (memberCounts[m.group_id] || 0) + 1;
  const pendingCounts = {};
  for (const p of settleAll.pending) if (p.role !== 'other') pendingCounts[p.groupId] = (pendingCounts[p.groupId] || 0) + 1;
  const tripAlerts = [];
  for (const t of (snap.trips || [])) {
    const items = DB.getBudgetItems(t.id);
    if (t.status !== 'active' || items.length === 0) continue;
    const s = planSummary(t, items, DB.getExpenses(t.id), DB.getMembers(t.group_id).length);
    for (const a of s.alerts) if (a.used >= 75) tripAlerts.push({ groupId: t.group_id, tripId: t.id, tripName: t.name, section: a.section, used: a.used });
  }
  let monthInsights = [];
  if (view.name === 'home' && DB.isPremium()) {
    const period = periodFor('thisMonth', todayISO());
    const all = myEntries(snap.expenses || [], selfMap);
    monthInsights = buildInsights({ entries: myEntries(snap.expenses || [], selfMap, period.range),
      previous: period.previous ? myEntries(snap.expenses || [], selfMap, period.previous) : [], allEntries: all, period, today: todayISO(),
      categoryName: (id) => CAT_BY_ID[id]?.label || id, money: (r) => fmtINR(r) });
  }

  if (view.name === 'home')        headerProps = { home: true, plan, name: DB.getProfile()?.display_name, onProfile: () => setView({ name: 'profile' }), onPlan: openPremium, subtitle: DB.isStaging() ? 'Test' : null };
  else if (view.name === 'analytics') headerProps = { ...baseHeader, title: 'Analytics', onBack: goHome };
  else if (view.name === 'premium') headerProps = { ...baseHeader, title: 'Premium', onBack: () => setView({ name: TAB_TITLES[view.from] ? view.from : 'profile' }) };
  else if (view.name === 'settlements') headerProps = { ...baseHeader, title: 'Settlements', onBack: view.groupId && view.from === 'group' ? () => setView({ name: 'group', groupId: view.groupId }) : goHome };
  else if (TAB_TITLES[view.name])  headerProps = { ...baseHeader, title: TAB_TITLES[view.name], subtitle: null };
  else if (view.name === 'group')  headerProps = { ...baseHeader, title: currentGroup?.name || 'Group', subtitle: null, onBack: () => setView({ name: 'groups' }) };
  else if (view.name === 'planner') headerProps = { ...baseHeader, title: currentTrip?.name || 'Trip', subtitle: 'Trip plan', onBack: () => setView({ name: 'trips' }) };
  else                              headerProps = { ...baseHeader, title: currentTrip?.name || 'Trip', subtitle: currentGroup?.name, onBack: () => setView(
    view.from === 'planner' ? { name: 'planner', groupId: currentGroup.id, tripId: currentTrip.id }
      : view.from && view.from !== 'groups' ? { name: view.from } : { name: 'group', groupId: currentGroup.id }) };

  const myMember = currentGroupMembers.find((m) => m.name === currentSelf);

  return (
    <div className="app">
      <AppHeader {...headerProps} />
      <main className="app-content">
        {view.name === 'home' && (
          <HomeView
            name={DB.getProfile()?.display_name}
            groups={groups}
            trips={snap.trips || []}
            expenses={snap.expenses || []}
            groupSummaries={groupSummaries}
            selfMap={selfMap}
            plan={plan}
            premium={DB.isPremium()}
            members={snap.members || []}
            tripAlerts={tripAlerts}
            insights={monthInsights}
            onAddExpense={() => startAddExpense()}
            onSettleUp={settleUp}
            onPlanTrip={() => setView({ name: 'trips', plan: true })}
            onOpenGroup={(id) => setView({ name: 'group', groupId: id })}
            onOpenTrip={(gid, tid) => openTrip(gid, tid, 'home')}
            onOpenPlanner={openPlanner}
            onGoGroups={() => setView({ name: 'groups' })}
            onGoTrips={() => setView({ name: 'trips' })}
            onOpenAnalytics={() => setView({ name: 'analytics' })}
            onOpenCalc={() => setCalcOpen(true)}
            onAddGroup={() => setSheet({ kind: 'group' })}
            onOpenPlan={openPremium}
          />
        )}
        {view.name === 'trips' && (
          <TripsView groups={groups} trips={snap.trips || []} tripTotals={allTripTotals} plannedTotals={plannedTotals}
            premium={DB.isPremium()} toast={toast} onOpenPlanner={openPlanner} autoPlan={!!view.plan}
            onGoGroups={() => setView({ name: 'groups' })} onOpenPlan={openPremium} />
        )}
        {view.name === 'analytics' && (
          <AnalyticsView expenses={snap.expenses || []} selfMap={selfMap} groups={groups} trips={snap.trips || []}
            groupSummaries={groupSummaries} premium={DB.isPremium()} toast={toast} onOpenPlan={openPremium} />
        )}
        {view.name === 'profile' && <ProfileView plan={plan} toast={toast} onOpenPlan={openPremium} />}
        {view.name === 'premium' && <PremiumView plan={plan} />}
        {view.name === 'groups' && (
          <GroupsView
            groups={groups}
            groupSummaries={groupSummaries}
            onOpen={(id) => setView({ name: 'group', groupId: id })}
            memberCounts={memberCounts}
            pendingCounts={pendingCounts}
            onAdd={() => setSheet({ kind: 'group' })}
          />
        )}
        {view.name === 'settlements' && settleView && (
          <SettlementsView overview={settleView} selfByGroup={selfMap}
            groupName={view.groupId ? groups.find((g) => g.id === view.groupId)?.name : null}
            onShowAll={() => setView({ name: 'settlements' })}
            onPay={(p) => onPay({ from: p.from, to: p.to, amount: p.amount }, tripById(p.tripId))}
            onMarkPaid={(p) => markPaid({ from: p.from, to: p.to, amount: p.amount }, tripById(p.tripId))}
            onOpenTrip={(gid, tid) => openTrip(gid, tid, 'home', 'settle')} />
        )}
        {view.name === 'group' && currentGroup && (
          <GroupView
            group={currentGroup}
            members={currentGroupMembers}
            trips={currentGroupTrips}
            tripSummaries={tripSummaries}
            self={currentSelf}
            entries={(snap.expenses || []).filter((e) => e.group_id === currentGroup.id)}
            onOpenTrip={(id, tab) => openTrip(currentGroup.id, id, undefined, tab)}
            onAddMember={() => setSheet({ kind: 'member' })}
            onRemoveMember={removeMember}
            onAddTrip={() => setSheet({ kind: 'trip' })}
            onInvite={() => setInviteOpen(true)}
            onAddExpense={() => startAddExpense(currentGroup.id)}
            onSettleUp={() => setView({ name: 'settlements', groupId: currentGroup.id, from: 'group' })}
            onOpenActions={() => setActionsOpen('group')}
          />
        )}
        {view.name === 'planner' && currentGroup && currentTrip && (
          <PlannerView group={currentGroup} trip={currentTrip} members={currentGroupMembers} expenses={currentTripExpenses}
            items={DB.getBudgetItems(currentTrip.id)} premium={DB.isPremium()} toast={toast}
            onOpenExpenses={() => openTrip(currentGroup.id, currentTrip.id, 'planner')} onOpenPlan={openPremium} />
        )}
        {view.name === 'trip' && currentGroup && currentTrip && (
          <TripView
            key={currentTrip.id + ':' + (view.tab || '')}
            initialTab={view.tab}
            group={currentGroup}
            trip={currentTrip}
            members={currentGroupMembers}
            expenses={currentTripExpenses}
            self={currentSelf}
            onAddExpense={() => {
              if (currentGroupMembers.length === 0) { toast('Add members first', 'error'); return; }
              setSheet({ kind: 'expense' });
            }}
            onEditExpense={editExpense}
            onDeleteTrip={removeTrip}
            onPay={onPay}
            onMarkPaid={markPaid}
            onUndoPayment={undoPayment}
            onOpenActions={() => setActionsOpen('trip')}
            onReact={reactToExpense}
          />
        )}
      </main>

      <AddGroupSheet open={sheet?.kind === 'group'} onClose={() => setSheet(null)} onCreate={createGroup} />
      <AddMemberSheet open={sheet?.kind === 'member'} onClose={() => setSheet(null)} onCreate={addMember} existingNames={currentGroupMembers.map((m) => m.name)} />
      <AddTripSheet open={sheet?.kind === 'trip'} onClose={() => setSheet(null)} onCreate={createTrip} />
      <AddExpenseSheet
        open={sheet?.kind === 'expense'}
        onClose={() => setSheet(null)}
        onCreate={createExpense}
        onUpdate={updateExpense}
        onDelete={removeExpense}
        members={currentGroupMembers}
        self={currentSelf}
        tripName={currentTrip?.name}
        editing={sheet?.kind === 'expense' ? sheet.editing : null}
      />
      <CalculatorSheet open={calcOpen} onClose={() => setCalcOpen(false)} />
      <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} group={currentGroup} toast={toast} />
      <ActionsSheet
        open={actionsOpen === 'group'}
        onClose={() => setActionsOpen(null)}
        title={currentGroup ? `${currentGroup.emoji} ${currentGroup.name}` : 'Group actions'}
        actions={[
          { label: 'Invite people', icon: <Icon.More />, onClick: () => { setActionsOpen(null); setInviteOpen(true); } },
          ...(myMember && myRole !== 'owner' ? [{ label: 'Leave group', icon: <Icon.Trash />, danger: true, onClick: () => { setActionsOpen(null); removeMember(myMember); } }] : []),
          ...(myRole === 'owner' ? [{ label: 'Delete group', icon: <Icon.Trash />, danger: true, onClick: () => { setActionsOpen(null); removeGroup(); } }] : []),
        ]}
      />
      <ActionsSheet
        open={actionsOpen === 'trip'}
        onClose={() => setActionsOpen(null)}
        title={currentTrip ? `${currentTrip.emoji} ${currentTrip.name}` : 'Trip actions'}
        actions={[
          { label: 'Delete trip', icon: <Icon.Trash />, danger: true, onClick: () => { setActionsOpen(null); removeTrip(); } },
        ]}
      />
      <UpiPaySheet
        open={!!upiPay}
        onClose={() => setUpiPay(null)}
        transfer={upiPay?.transfer}
        tripName={upiPay?.trip?.name}
        knownVpa={upiPay ? (DB.getUpiIds(upiPay.trip?.group_id || currentGroup?.id || '')[upiPay.transfer.to] || upiMap[upiPay.transfer.to] || '') : ''}
        onSaveVpa={saveVpa}
        toast={toast}
      />
      <ConfirmSheet open={!!confirm} onClose={() => setConfirm(null)} onConfirm={confirm?.onConfirm} title={confirm?.title || ''} message={confirm?.message || ''} confirmLabel={confirm?.confirmLabel} tone={confirm?.tone} />
      <ToastStack toasts={toasts} />
      <ReceiptScreen receipt={receipt} self={receipt?.self} toast={toast} onDone={() => setReceipt(null)}
        onAddAnother={receipt?.kind === 'expense' && currentTrip ? () => { setReceipt(null); setSheet({ kind: 'expense' }); } : null} />
      <AddWhereSheet open={!!addWhere} onClose={() => setAddWhere(false)} groups={groups}
        trips={(snap.trips || []).filter((t) => addWhere === true || t.group_id === addWhere)}
        onPick={pickTripForExpense} onNewTrip={() => { setAddWhere(false); setView({ name: 'groups' }); }} />
      <BottomNav active={activeTab} onAdd={navAdd} onChange={(tab) => { setView({ name: tab }); window.scrollTo(0, 0); }} />
    </div>
  );
}
