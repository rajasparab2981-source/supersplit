/* ============================================================
   SplitPro data layer (v2): Supabase auth + the v2 schema.

   The screens still work with the original v1 shapes (names, rupees). This
   module converts:
     reads:  v2 rows (member IDs, paise, payers/splits)  ->  v1-shaped objects
     writes: v1-shaped payloads  ->  v2 database functions (validated server-side)

   Recorded settlements are exposed as synthetic expenses (payer = who paid
   back, split = who received), which is exactly their effect on balances,
   so the existing balance maths needs no changes.
   ============================================================ */

import { createClient, type RealtimeChannel, type Session } from '@supabase/supabase-js';
import { builtinConfig } from '../config';
import { splitEvenly, toPaise, toRupees } from '../lib/money';
import { todayISO } from '../lib/dates';
import type { Expense, Group, Member, Reactions, Shares, Trip } from '../types';

export const supabase = createClient(builtinConfig.supabaseUrl, builtinConfig.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});

// ---------- v2 row shapes ----------
interface V2Member { id: string; group_id: string; user_id: string | null; display_name: string; role: 'owner' | 'admin' | 'member'; created_at: string; left_at: string | null }
interface V2Share { member_id: string; amount_minor: number }
interface V2Expense {
  id: string; group_id: string; trip_id: string | null; description: string; amount_minor: number; currency: string;
  category: string; expense_date: string; split_mode: 'equal' | 'percentage' | 'exact'; receipt_path: string | null;
  created_at: string; version: number;
  expense_payers: V2Share[]; expense_splits: V2Share[]; expense_reactions: { member_id: string; emoji: string }[];
}
interface V2Settlement {
  id: string; group_id: string; trip_id: string | null; from_member: string; to_member: string;
  amount_minor: number; method: string; note: string | null; settled_on: string; created_at: string;
}
export interface Profile { id: string; display_name: string; upi_id: string | null; avatar_url: string | null }

/** Extra fields the v2 app adds to the v1 expense shape. */
export interface AppExpense extends Expense {
  group_id: string;
  version: number;
  split_mode: 'equal' | 'percentage' | 'exact';
  receipt_path: string | null;
  /** True for a recorded settlement shown as a synthetic expense. */
  is_settlement?: boolean;
  settlement?: { id: string; method: string; note: string | null; from: string; to: string };
}
export interface AppMember extends Member { user_id: string | null; role: V2Member['role']; left_at: string | null }

export type AuthState = 'loading' | 'signed_out' | 'signed_in';

// ---------- State ----------
let session: Session | null = null;
let authState: AuthState = 'loading';
let profile: Profile | null = null;
let raw = { groups: [] as Group[], members: [] as V2Member[], trips: [] as Trip[], expenses: [] as V2Expense[], settlements: [] as V2Settlement[], profiles: [] as Profile[] };
export interface AppSnapshot { groups: Group[]; members: AppMember[]; trips: Trip[]; expenses: AppExpense[] }
let snap: AppSnapshot = { groups: [], members: [], trips: [], expenses: [] };
const signedUrls = new Map<string, { url: string; expires: number }>();
const listeners = new Set<(s: AppSnapshot) => void>();
let channel: RealtimeChannel | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let refreshQueued: ReturnType<typeof setTimeout> | null = null;
let loadError: string | null = null;

function emit(): void {
  const s = { ...snap };
  listeners.forEach((fn) => { try { fn(s); } catch (e) { console.error(e); } });
}

const myUserId = () => session?.user.id ?? null;

// ---------- Read model: v2 -> v1 shapes ----------
function rebuild(): void {
  const memberById = new Map(raw.members.map((m) => [m.id, m]));
  const name = (id: string) => memberById.get(id)?.display_name ?? '(unknown)';

  const members: AppMember[] = raw.members.map((m) => ({
    id: m.id, group_id: m.group_id, name: m.display_name, created_at: m.created_at,
    user_id: m.user_id, role: m.role, left_at: m.left_at,
  }));

  const expenses: AppExpense[] = raw.expenses.map((e) => {
    const payers = [...e.expense_payers].sort((a, b) => b.amount_minor - a.amount_minor);
    const shares: Shares = {};
    for (const s of e.expense_splits) shares[name(s.member_id)] = (shares[name(s.member_id)] ?? 0) + toRupees(s.amount_minor);
    const reactions: Reactions = {};
    for (const r of e.expense_reactions) reactions[name(r.member_id)] = r.emoji;
    const cached = e.receipt_path ? signedUrls.get(e.receipt_path) : undefined;
    return {
      id: e.id, trip_id: e.trip_id ?? '', group_id: e.group_id, description: e.description,
      amount: toRupees(e.amount_minor), paid_by: payers[0] ? name(payers[0].member_id) : '',
      split_among: e.expense_splits.map((s) => name(s.member_id)),
      // Exact stored amounts always drive the maths, so balances match the database.
      shares, reactions, image_url: cached?.url ?? null, receipt_path: e.receipt_path,
      category: e.category, expense_date: e.expense_date, created_at: e.created_at,
      version: e.version, split_mode: e.split_mode,
    };
  });

  for (const s of raw.settlements) {
    const from = name(s.from_member);
    const to = name(s.to_member);
    expenses.push({
      id: `settlement:${s.id}`, trip_id: s.trip_id ?? '', group_id: s.group_id,
      description: `${from} paid ${to}`, amount: toRupees(s.amount_minor), paid_by: from,
      split_among: [to], shares: { [to]: toRupees(s.amount_minor) }, reactions: null, image_url: null, receipt_path: null,
      category: 'other', expense_date: s.settled_on, created_at: s.created_at, version: 1, split_mode: 'exact',
      is_settlement: true, settlement: { id: s.id, method: s.method, note: s.note, from, to },
    });
  }

  snap = { groups: raw.groups, members, trips: raw.trips, expenses };
  emit();
}

// ---------- Loading ----------
async function refreshAll(): Promise<void> {
  if (!session) return;
  const [groups, members, trips, expenses, settlements, profiles] = await Promise.all([
    supabase.from('groups').select('id, name, emoji, color, created_at'),
    supabase.from('group_members').select('id, group_id, user_id, display_name, role, created_at, left_at'),
    supabase.from('trips').select('id, group_id, name, emoji, created_at').is('deleted_at', null),
    supabase.from('expenses')
      .select('id, group_id, trip_id, description, amount_minor, currency, category, expense_date, split_mode, receipt_path, created_at, version, expense_payers(member_id, amount_minor), expense_splits(member_id, amount_minor), expense_reactions(member_id, emoji)')
      .is('deleted_at', null),
    supabase.from('settlements').select('id, group_id, trip_id, from_member, to_member, amount_minor, method, note, settled_on, created_at').is('deleted_at', null),
    supabase.from('profiles').select('id, display_name, upi_id, avatar_url'),
  ]);
  const err = groups.error || members.error || trips.error || expenses.error || settlements.error || profiles.error;
  if (err) { loadError = err.message; throw err; }
  loadError = null;
  raw = {
    groups: (groups.data ?? []) as Group[],
    members: (members.data ?? []) as V2Member[],
    trips: (trips.data ?? []) as Trip[],
    expenses: (expenses.data ?? []) as V2Expense[],
    settlements: (settlements.data ?? []) as V2Settlement[],
    profiles: (profiles.data ?? []) as Profile[],
  };
  profile = raw.profiles.find((p) => p.id === myUserId()) ?? profile;
  rebuild();
  void signReceipts();
}

/** Coalesce bursts of realtime events into one reload. */
function queueRefresh(delay = 300): void {
  if (refreshQueued) clearTimeout(refreshQueued);
  refreshQueued = setTimeout(() => { refreshQueued = null; refreshAll().catch((e) => console.warn('Refresh failed', e)); }, delay);
}

async function signReceipts(): Promise<void> {
  const now = Date.now();
  const need = raw.expenses.map((e) => e.receipt_path).filter((p): p is string => !!p)
    .filter((p) => { const c = signedUrls.get(p); return !c || c.expires < now + 60_000; });
  if (need.length === 0) return;
  const { data, error } = await supabase.storage.from('receipts').createSignedUrls(need, 3600);
  if (error || !data) return;
  for (const d of data) if (d.path && d.signedUrl) signedUrls.set(d.path, { url: d.signedUrl, expires: now + 3600_000 });
  rebuild();
}

function startSync(): void {
  stopSync();
  // RLS applies to Realtime too: each user only receives changes for their groups.
  channel = supabase.channel('splitpro-v2');
  for (const table of ['groups', 'group_members', 'trips', 'expenses', 'expense_reactions', 'settlements']) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => queueRefresh());
  }
  channel.subscribe();
  // Safety net if a realtime event is missed (backgrounded tab, flaky network).
  pollTimer = setInterval(() => { if (document.visibilityState === 'visible') queueRefresh(0); }, 30_000);
  document.addEventListener('visibilitychange', onVisible);
}
function stopSync(): void {
  if (channel) { void supabase.removeChannel(channel); channel = null; }
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  document.removeEventListener('visibilitychange', onVisible);
}
function onVisible(): void { if (document.visibilityState === 'visible') queueRefresh(0); }

// ---------- Auth ----------
async function onSession(s: Session | null): Promise<void> {
  const changedUser = (s?.user.id ?? null) !== myUserId() || authState === 'loading';
  session = s;
  if (!s) {
    authState = 'signed_out';
    profile = null;
    raw = { groups: [], members: [], trips: [], expenses: [], settlements: [], profiles: [] };
    stopSync();
    rebuild();
    return;
  }
  authState = 'signed_in';
  if (changedUser) {
    try { await refreshAll(); } catch (e) { console.error('Initial load failed', e); emit(); }
    startSync();
  } else {
    emit();
  }
}

supabase.auth.onAuthStateChange((_event, s) => {
  // Defer: supabase-js warns against awaiting other calls inside this callback.
  setTimeout(() => { void onSession(s); }, 0);
});

function redirectTo(): string {
  return window.location.origin + window.location.pathname;
}

// ---------- Write helpers ----------
function fail(error: { message: string; code?: string } | null): void {
  if (error) {
    const e = new Error(error.message) as Error & { code?: string };
    e.code = error.code;
    throw e;
  }
}
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  fail(error);
  queueRefresh(0);
  return data as T;
}

function groupMembers(groupId: string): V2Member[] {
  return raw.members.filter((m) => m.group_id === groupId);
}
function memberIdByName(groupId: string, name: string): string {
  const all = groupMembers(groupId);
  const m = all.find((x) => x.display_name === name && !x.left_at) ?? all.find((x) => x.display_name === name);
  if (!m) throw new Error(`"${name}" is not in this group`);
  return m.id;
}
function groupOfTrip(tripId: string): string {
  const t = raw.trips.find((x) => x.id === tripId);
  if (!t) throw new Error('Trip not found');
  return t.group_id;
}

/** v1-shaped expense payload from the form. */
export interface ExpensePayload {
  trip_id?: string; description: string; amount: number; paid_by: string; split_among: string[];
  shares?: Shares | null; split_mode?: 'equal' | 'percentage' | 'exact'; category?: string; expense_date?: string;
  receipt_path?: string | null;
}

/** Convert a form payload to the create/update_expense argument (exported for tests). */
export function toV2Expense(members: { id: string; display_name: string; left_at: string | null }[], groupId: string, p: ExpensePayload) {
  const idByName = (n: string) => {
    const m = members.find((x) => x.display_name === n && !x.left_at) ?? members.find((x) => x.display_name === n);
    if (!m) throw new Error(`"${n}" is not in this group`);
    return m.id;
  };
  const amount = toPaise(p.amount);
  let splits: V2Share[];
  let mode = p.split_mode ?? (p.shares && Object.keys(p.shares).length ? 'exact' : 'equal');
  if (mode !== 'equal' && p.shares && Object.keys(p.shares).length > 0) {
    splits = Object.entries(p.shares).map(([n, r]) => ({ member_id: idByName(n), amount_minor: toPaise(r) }));
  } else {
    const parts = splitEvenly(amount, p.split_among.length);
    splits = p.split_among.map((n, i) => ({ member_id: idByName(n), amount_minor: parts[i]! }));
    mode = 'equal';
  }
  return {
    group_id: groupId, trip_id: p.trip_id || null, description: p.description, amount_minor: amount,
    category: p.category ?? 'other', expense_date: p.expense_date ?? todayISO(), split_mode: mode,
    payers: [{ member_id: idByName(p.paid_by), amount_minor: amount }], splits,
    ...(p.receipt_path !== undefined ? { receipt_path: p.receipt_path } : {}),
  };
}

/** Photos arrive as JPEG data URLs from compressImage(); store them privately. */
async function uploadReceipt(groupId: string, expenseId: string, dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${groupId}/${expenseId}.jpg`;
  const { error } = await supabase.storage.from('receipts').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  fail(error);
  signedUrls.delete(path);
  return path;
}

// ============================================================
// Public API
// ============================================================
export const DB = {
  supabase,
  subscribe(fn: (s: AppSnapshot) => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; },
  snapshot: (): AppSnapshot => ({ ...snap }),
  getAuthState: (): AuthState => authState,
  getUser: () => session?.user ?? null,
  getProfile: (): Profile | null => profile,
  getLoadError: () => loadError,
  isStaging: () => import.meta.env.VITE_APP_ENV === 'staging',

  // ----- Auth -----
  async signInWithEmail(email: string): Promise<void> {
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo() } });
    fail(error);
  },
  async verifyEmailCode(email: string, token: string): Promise<void> {
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
    fail(error);
  },
  async signInWithGoogle(): Promise<void> {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } });
    fail(error);
  },
  /**
   * Staging only: a throwaway anonymous user for testing (no credentials).
   * Anonymous sign-ins are enabled on the staging project only.
   */
  async signInAsTestUser(name: string): Promise<void> {
    if (import.meta.env.VITE_APP_ENV !== 'staging') throw new Error('Not available');
    const { error } = await supabase.auth.signInAnonymously({ options: { data: { full_name: name } } });
    fail(error);
  },
  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  },
  async updateProfile(patch: { display_name?: string; upi_id?: string | null }): Promise<void> {
    const uid = myUserId();
    if (!uid) throw new Error('Sign in required');
    const { error } = await supabase.from('profiles').update(patch).eq('id', uid);
    fail(error);
    await refreshAll();
  },
  refresh: () => refreshAll(),

  // ----- Reads (sync, from the current snapshot) -----
  getGroups: (): Group[] => [...snap.groups].sort((a, b) => (a.created_at > b.created_at ? 1 : -1)),
  getMembers: (groupId: string): AppMember[] =>
    snap.members.filter((m) => m.group_id === groupId && !m.left_at).sort((a, b) => (a.created_at > b.created_at ? 1 : -1)),
  getTrips: (groupId: string): Trip[] =>
    snap.trips.filter((t) => t.group_id === groupId).sort((a, b) => (a.created_at > b.created_at ? 1 : -1)),
  getExpenses: (tripId: string): AppExpense[] =>
    snap.expenses.filter((e) => e.trip_id === tripId)
      .sort((a, b) => (a.expense_date !== b.expense_date ? (a.expense_date < b.expense_date ? 1 : -1) : a.created_at < b.created_at ? 1 : -1)),
  /** Your own member name in a group (replaces the old per-device "who are you?"). */
  getSelfName(groupId: string): string | null {
    const uid = myUserId();
    return raw.members.find((m) => m.group_id === groupId && m.user_id === uid && !m.left_at)?.display_name ?? null;
  },
  getMyRole(groupId: string): V2Member['role'] | null {
    const uid = myUserId();
    return raw.members.find((m) => m.group_id === groupId && m.user_id === uid && !m.left_at)?.role ?? null;
  },
  /** UPI IDs from members' profiles, by member name. */
  getUpiIds(groupId: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const m of groupMembers(groupId)) {
      const p = m.user_id ? raw.profiles.find((x) => x.id === m.user_id) : undefined;
      if (p?.upi_id) out[m.display_name] = p.upi_id;
    }
    return out;
  },

  // ----- Groups, members, trips -----
  addGroup: async ({ name, emoji, color }: { name: string; emoji?: string; color?: string }) => {
    const id = crypto.randomUUID();
    await rpc('create_group', { p_name: name, p_emoji: emoji ?? null, p_color: color ?? null, p_id: id });
    await refreshAll();
    return snap.groups.find((g) => g.id === id) ?? ({ id, name, emoji: emoji ?? '👥', color: color ?? '#00E5A0', created_at: new Date().toISOString() } as Group);
  },
  updateGroup: (id: string, p: Partial<Group>) => rpc('update_group', { p_group_id: id, p_name: p.name ?? null, p_emoji: p.emoji ?? null, p_color: p.color ?? null }),
  deleteGroup: (id: string) => rpc('delete_group', { p_group_id: id }),
  addMember: async (groupId: string, name: string) => {
    const id = crypto.randomUUID();
    await rpc('add_member', { p_group_id: groupId, p_display_name: name, p_id: id });
    return { id, group_id: groupId, name: name.trim(), created_at: new Date().toISOString() } as Member;
  },
  deleteMember: (id: string) => rpc('remove_member', { p_member_id: id }),
  addTrip: async (groupId: string, { name, emoji }: { name: string; emoji?: string }) => {
    const id = crypto.randomUUID();
    await rpc('create_trip', { p_group_id: groupId, p_name: name, p_emoji: emoji ?? null, p_id: id });
    return { id, group_id: groupId, name: name.trim(), emoji: emoji ?? '🏖️', created_at: new Date().toISOString() } as Trip;
  },
  deleteTrip: (id: string) => rpc('delete_trip', { p_trip_id: id }),

  // ----- Expenses -----
  async addExpense(p: ExpensePayload & { trip_id: string; image_url?: string | null }): Promise<{ id: string }> {
    const groupId = groupOfTrip(p.trip_id);
    const id = crypto.randomUUID();
    const receipt_path = p.image_url?.startsWith('data:') ? await uploadReceipt(groupId, id, p.image_url) : null;
    await rpc('create_expense', { p: { id, ...toV2Expense(groupMembers(groupId), groupId, { ...p, receipt_path }) } });
    return { id };
  },
  async updateExpense(id: string, patch: Partial<ExpensePayload> & { reactions?: Reactions | null; image_url?: string | null }): Promise<void> {
    const e = snap.expenses.find((x) => x.id === id);
    if (!e || e.is_settlement) throw new Error('Expense not found');
    // Reaction-only change: set or clear just your own reaction.
    if ('reactions' in patch && Object.keys(patch).length === 1) {
      const me = DB.getSelfName(e.group_id);
      if (!me) throw new Error('You are not in this group');
      await rpc('set_reaction', { p_expense_id: id, p_emoji: patch.reactions?.[me] ?? null });
      return;
    }
    let receipt_path: string | null | undefined;
    if ('image_url' in patch) {
      receipt_path = patch.image_url?.startsWith('data:') ? await uploadReceipt(e.group_id, id, patch.image_url)
        : patch.image_url ? e.receipt_path : null;
    }
    const merged: ExpensePayload = {
      trip_id: e.trip_id, description: e.description, amount: e.amount, paid_by: e.paid_by,
      split_among: e.split_among, shares: e.shares, split_mode: e.split_mode, category: e.category,
      expense_date: e.expense_date, ...patch, receipt_path,
    };
    await rpc('update_expense', { p: { id, version: e.version, ...toV2Expense(groupMembers(e.group_id), e.group_id, merged) } });
  },
  deleteExpense: (id: string) => {
    if (id.startsWith('settlement:')) return rpc('delete_settlement', { p_id: id.slice('settlement:'.length) });
    return rpc('delete_expense', { p_id: id });
  },
  restoreExpense: (id: string) => rpc('restore_expense', { p_id: id }),

  // ----- Settlements -----
  async recordSettlement(tripId: string | null, groupId: string, from: string, to: string, amountRupees: number,
    method: 'upi' | 'cash' | 'bank' | 'other' = 'upi', note?: string): Promise<string> {
    const id = crypto.randomUUID();
    await rpc('record_settlement', { p: {
      id, group_id: groupId, trip_id: tripId, from_member: memberIdByName(groupId, from),
      to_member: memberIdByName(groupId, to), amount_minor: toPaise(amountRupees), method, note: note ?? null,
      settled_on: todayISO(),
    } });
    return id;
  },
  deleteSettlement: (settlementId: string) => rpc('delete_settlement', { p_id: settlementId }),

  // ----- Invites -----
  createInvite: (groupId: string) => rpc<string>('create_invite', { p_group_id: groupId }),
  async invitePreview(token: string) {
    const { data, error } = await supabase.rpc('invite_preview', { p_token: token });
    fail(error);
    return (data as { group_id: string; group_name: string; emoji: string; color: string; member_count: number;
      placeholders: { id: string; display_name: string }[]; already_member: boolean }[])[0] ?? null;
  },
  async acceptInvite(token: string, claimMemberId: string | null, displayName: string | null): Promise<string> {
    const gid = await rpc<string>('accept_invite', { p_token: token, p_claim_member_id: claimMemberId, p_display_name: displayName });
    await refreshAll();
    return gid;
  },
};

export type SplitProDB = typeof DB;

void supabase.auth.getSession().then(({ data }) => onSession(data.session)).catch(() => onSession(null));
