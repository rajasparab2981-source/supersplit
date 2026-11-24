import { useState, useEffect, useMemo, useCallback } from 'react';
import { DB } from './db/db';
import { fmtINR } from './lib/money';
import { youLine } from './lib/splits';
import { loadSelf, loadUpiMap, saveSelf, saveUpiMap } from './lib/storage';
import { AddExpenseSheet } from './sheets/AddExpenseSheet';
import { CalculatorSheet } from './sheets/CalculatorSheet';
import { PasscodeGate } from './sheets/PasscodeGate';
import { SettingsSheet } from './sheets/SettingsSheet';
import { AddGroupSheet, AddMemberSheet, AddTripSheet, SelfPickerSheet } from './sheets/SimpleSheets';
import { SupabaseSetupSheet } from './sheets/SupabaseSetupSheet';
import { UpiPaySheet } from './sheets/UpiPaySheet';
import { Icon } from './ui/Icon';
import { ActionsSheet, ConfirmSheet, Header, ToastStack, useToasts } from './ui/primitives';
import { GroupView } from './views/GroupView';
import { GroupsView } from './views/GroupsView';
import { TripView } from './views/TripView';

export function App() {
  const [snap, setSnap] = useState(DB.snapshot());
  const [mode, setMode] = useState(DB.getMode ? DB.getMode() : 'local');
  const [supaConfig, setSupaConfig] = useState(DB.getConfig ? DB.getConfig() : null);
  // Guarded: a stale cached db.js (pre-lockdown) has no getAccess().
  const [access, setAccess] = useState(DB.getAccess ? DB.getAccess() : 'ok');

  useEffect(() => DB.subscribe((s) => {
    setSnap(s);
    if (DB.getMode) setMode(DB.getMode());
    if (DB.getConfig) setSupaConfig(DB.getConfig());
    if (DB.getAccess) setAccess(DB.getAccess());
  }), []);

  const [selfMap, setSelfMap] = useState(loadSelf());
  const persistSelf = useCallback((m) => { saveSelf(m); setSelfMap(m); }, []);

  const [upiMap, setUpiMap] = useState(loadUpiMap());
  const persistUpi = useCallback((m) => { saveUpiMap(m); setUpiMap(m); }, []);

  const [view, setView] = useState({ name: 'groups' });
  const [sheet, setSheet] = useState(null);
  const [selfPickerOpen, setSelfPickerOpen] = useState(false);
  const [supabaseOpen, setSupabaseOpen] = useState(false);
  const [upiPay, setUpiPay] = useState(null); // { transfer, trip }
  const [calcOpen, setCalcOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(null); // 'group' | 'trip' | null
  const [confirm, setConfirm] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { toasts, push: toast } = useToasts();

  const groups = useMemo(() => DB.getGroups(), [snap]);
  const currentGroup = useMemo(() => {
    if (view.name === 'group' || view.name === 'trip') return groups.find((g) => g.id === view.groupId) || null;
    return null;
  }, [view, groups]);
  const currentGroupMembers = useMemo(() => currentGroup ? DB.getMembers(currentGroup.id) : [], [currentGroup, snap]);
  const currentGroupTrips = useMemo(() => currentGroup ? DB.getTrips(currentGroup.id) : [], [currentGroup, snap]);
  const currentTrip = useMemo(() => {
    if (view.name !== 'trip' || !currentGroup) return null;
    return currentGroupTrips.find((t) => t.id === view.tripId) || null;
  }, [view, currentGroup, currentGroupTrips]);
  const currentTripExpenses = useMemo(() => currentTrip ? DB.getExpenses(currentTrip.id) : [], [currentTrip, snap]);
  const currentSelf = currentGroup ? selfMap[currentGroup.id] : null;

  // Auto-pick self if a group has exactly one member
  useEffect(() => {
    if (currentGroup && !currentSelf && currentGroupMembers.length === 1) {
      persistSelf({ ...selfMap, [currentGroup.id]: currentGroupMembers[0].name });
    }
  }, [currentGroup, currentSelf, currentGroupMembers, selfMap, persistSelf]);

  // ---------- Aggregates ----------
  const groupSummaries = useMemo(() => {
    const out = {};
    for (const g of (snap.groups || [])) {
      const myName = selfMap[g.id];
      const tripIds = (snap.trips || []).filter((t) => t.group_id === g.id).map((t) => t.id);
      const tripExpenses = (snap.expenses || []).filter((e) => tripIds.includes(e.trip_id));
      const totalSpent = tripExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
      let net = 0;
      if (myName) for (const e of tripExpenses) net += youLine(e, myName) || 0;
      out[g.id] = { totalSpent, net, hasSelf: !!myName };
    }
    return out;
  }, [snap, selfMap]);

  const tripSummaries = useMemo(() => {
    const out = {};
    if (!currentGroup) return out;
    const myName = selfMap[currentGroup.id];
    for (const t of currentGroupTrips) {
      const expenses = (snap.expenses || []).filter((e) => e.trip_id === t.id);
      const totalSpent = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
      let net = 0;
      if (myName) for (const e of expenses) net += youLine(e, myName) || 0;
      out[t.id] = { totalSpent, net, hasSelf: !!myName };
    }
    return out;
  }, [snap, currentGroup, currentGroupTrips, selfMap]);

  useEffect(() => {
    if (view.name === 'group' && !currentGroup) { setView({ name: 'groups' }); toast('Group was deleted', 'error'); }
    else if (view.name === 'trip' && (!currentGroup || !currentTrip)) {
      if (currentGroup) { setView({ name: 'group', groupId: currentGroup.id }); toast('Trip was deleted', 'error'); }
      else { setView({ name: 'groups' }); toast('Group was deleted', 'error'); }
    }
  }, [view.name, currentGroup, currentTrip, toast]);

  // ---------- Mutations ----------
  // Wrap async mutations so any backend error surfaces as a toast (and the
  // sheet still closes). Without this, a Supabase rejection silently kills
  // the click and leaves the user thinking nothing happened.
  const safeMutate = async (label, fn) => {
    try {
      return await fn();
    } catch (e) {
      console.error(label + ' failed:', e);
      const msg = (e && (e.message || e.error_description || e.hint)) || String(e);
      toast(`${label} failed: ${msg}`, 'error');
      throw e;
    }
  };

  const createGroup = async (g) => {
    try {
      const c = await safeMutate('Create group', () => DB.addGroup(g));
      setSheet(null);
      toast(`"${c.name}" created`, 'success');
    } catch {}
  };
  const addMember = async (name) => {
    try {
      const m = await safeMutate('Add member', () => DB.addMember(currentGroup.id, name));
      setSheet(null);
      toast(`${name} added`, 'success');
      if (!currentSelf && currentGroupMembers.length === 0) {
        persistSelf({ ...selfMap, [currentGroup.id]: m.name });
      }
    } catch {}
  };
  const removeMember = (m) => setConfirm({
    title: `Remove ${m.name}?`,
    message: `Past expenses with ${m.name} stay in history. They won't appear in new expense forms.`,
    confirmLabel: 'Remove',
    onConfirm: async () => {
      try {
        await safeMutate('Remove member', () => DB.deleteMember(m.id));
        if (currentSelf === m.name) {
          const next = { ...selfMap }; delete next[currentGroup.id]; persistSelf(next);
        }
        toast(`${m.name} removed`, 'success');
        setConfirm(null);
      } catch { setConfirm(null); }
    },
  });
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
      toast(`Added ${fmtINR(e.amount)} expense`, 'success');
    } catch {}
  };
  const editExpense = (e) => setSheet({ kind: 'expense', editing: e });
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
        toast('Expense deleted', 'success');
        setConfirm(null);
      } catch { setConfirm(null); }
    },
  });
  const removeTrip = () => setConfirm({
    title: `Delete "${currentTrip.name}"?`,
    message: `Removes the trip and all ${currentTripExpenses.length} expense${currentTripExpenses.length === 1 ? '' : 's'} inside.`,
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
    message: `Removes the group, ${currentGroupMembers.length} member${currentGroupMembers.length === 1 ? '' : 's'}, ${currentGroupTrips.length} trip${currentGroupTrips.length === 1 ? '' : 's'}, and every expense inside.`,
    confirmLabel: 'Delete group',
    onConfirm: async () => {
      try {
        const id = currentGroup.id; const n = currentGroup.name;
        await safeMutate('Delete group', () => DB.deleteGroup(id));
        const next = { ...selfMap }; delete next[id]; persistSelf(next);
        toast(`"${n}" deleted`, 'success');
        setConfirm(null);
      } catch { setConfirm(null); }
    },
  });
  const resetAll = () => {
    setSettingsOpen(false);
    setConfirm({
      title: 'Reset all data?',
      message: mode === 'supabase'
        ? 'Deletes every group, member, trip and expense in your Supabase database. Affects everyone connected. Cannot be undone.'
        : 'Deletes every group, member, trip and expense from this device. Cannot be undone.',
      confirmLabel: 'Reset everything',
      onConfirm: async () => {
        await DB.resetAll();
        persistSelf({});
        setView({ name: 'groups' });
        toast('All data cleared', 'success');
        setConfirm(null);
      },
    });
  };
  const onPay = (transfer, trip) => setUpiPay({ transfer, trip });
  const saveVpa = (name, vpa) => persistUpi({ ...upiMap, [name]: vpa });
  const reactToExpense = async (expenseId, nextReactions) => {
    try {
      await safeMutate('React', () => DB.updateExpense(expenseId, { reactions: nextReactions }));
    } catch {}
  };

  const pickSelf = (name) => {
    if (!currentGroup) return;
    const next = { ...selfMap };
    if (name) next[currentGroup.id] = name; else delete next[currentGroup.id];
    persistSelf(next);
    toast(name ? `You're set as ${name}` : 'Self cleared', 'success');
  };

  const connectSupabase = async (url, key) => {
    try {
      await DB.connectSupabase(url, key);
      toast('Connected to Supabase', 'success');
    } catch (e) {
      toast('Connection failed: ' + (e.message || e), 'error');
    }
  };
  const disconnectSupabase = async () => {
    await DB.disconnect();
    toast('Disconnected — using local storage', 'success');
  };
  const forgetPasscode = async () => {
    setSettingsOpen(false);
    setView({ name: 'groups' });
    await DB.forgetPasscode();
    toast('Passcode removed from this device', 'success');
  };

  if (mode === 'supabase' && access === 'needs_passcode') {
    return (
      <div className="app">
        <Header title="SplitPro" subtitle="Split bills in ₹" />
        <PasscodeGate onUseLocal={disconnectSupabase} />
        <ToastStack toasts={toasts} />
      </div>
    );
  }

  let headerProps;
  const baseHeader = { onCalc: () => setCalcOpen(true), onSettings: () => setSettingsOpen(true), syncStatus: mode === 'supabase' ? 'live' : null };
  if (view.name === 'groups')      headerProps = { ...baseHeader, title: 'SplitPro', subtitle: 'Split bills in ₹' };
  else if (view.name === 'group')  headerProps = { ...baseHeader, title: currentGroup?.name || 'Group', subtitle: null, onBack: () => setView({ name: 'groups' }) };
  else                              headerProps = { ...baseHeader, title: currentTrip?.name || 'Trip', subtitle: currentGroup?.name, onBack: () => setView({ name: 'group', groupId: currentGroup.id }) };

  return (
    <div className="app">
      <Header {...headerProps} />
      <main className="app-content">
        {view.name === 'groups' && (
          <GroupsView
            groups={groups}
            groupSummaries={groupSummaries}
            onOpen={(id) => setView({ name: 'group', groupId: id })}
            onAdd={() => setSheet({ kind: 'group' })}
          />
        )}
        {view.name === 'group' && currentGroup && (
          <GroupView
            group={currentGroup}
            members={currentGroupMembers}
            trips={currentGroupTrips}
            tripSummaries={tripSummaries}
            self={currentSelf}
            onOpenTrip={(id) => setView({ name: 'trip', groupId: currentGroup.id, tripId: id })}
            onAddMember={() => setSheet({ kind: 'member' })}
            onRemoveMember={removeMember}
            onAddTrip={() => setSheet({ kind: 'trip' })}
            onDeleteGroup={removeGroup}
            onChangeSelf={() => setSelfPickerOpen(true)}
            onOpenActions={() => setActionsOpen('group')}
          />
        )}
        {view.name === 'trip' && currentGroup && currentTrip && (
          <TripView
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
        editing={sheet?.kind === 'expense' ? sheet.editing : null}
      />
      <SelfPickerSheet open={selfPickerOpen} onClose={() => setSelfPickerOpen(false)} members={currentGroupMembers} current={currentSelf} onPick={pickSelf} />
      <CalculatorSheet open={calcOpen} onClose={() => setCalcOpen(false)} />
      <ActionsSheet
        open={actionsOpen === 'group'}
        onClose={() => setActionsOpen(null)}
        title={currentGroup ? `${currentGroup.emoji} ${currentGroup.name}` : 'Group actions'}
        actions={[
          { label: 'Change who I am', icon: <Icon.More />, onClick: () => { setActionsOpen(null); setSelfPickerOpen(true); } },
          { label: 'Delete group', icon: <Icon.Trash />, danger: true, onClick: () => { setActionsOpen(null); removeGroup(); } },
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
        knownVpa={upiPay ? upiMap[upiPay.transfer.to] : ''}
        onSaveVpa={saveVpa}
        toast={toast}
      />
      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        mode={mode}
        supaConfig={supaConfig}
        onOpenSupabase={() => { setSettingsOpen(false); setSupabaseOpen(true); }}
        onResetAll={resetAll}
        onForgetPasscode={forgetPasscode}
      />
      <SupabaseSetupSheet
        open={supabaseOpen}
        onClose={() => setSupabaseOpen(false)}
        onConnect={connectSupabase}
        onDisconnect={disconnectSupabase}
        config={supaConfig}
        mode={mode}
        toast={toast}
      />
      <ConfirmSheet open={!!confirm} onClose={() => setConfirm(null)} onConfirm={confirm?.onConfirm} title={confirm?.title || ''} message={confirm?.message || ''} confirmLabel={confirm?.confirmLabel} />
      <ToastStack toasts={toasts} />
    </div>
  );
}
