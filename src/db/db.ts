/* ============================================================
   SplitPro data layer: a typed port of the original db.js.

   Two backends behind one API:
     - Local:    localStorage (no network)
     - Supabase: REST + Realtime + 5 s polling fallback

   Behaviour is unchanged from the Phase 0 version, including the group
   passcode lockdown (header `x-splitpro-key`, see supabase/phase0-lockdown.sql).
   Phase 2 replaces this with a proper schema, auth and per-group sync.
   ============================================================ */

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { builtinConfig } from '../config';
import { todayISO } from '../lib/dates';
import type { Expense, Group, Member, Snapshot, Trip } from '../types';

const STORAGE_KEY = 'splitpro_data_v1';
const SUPA_CONFIG_KEY = 'splitpro_supabase_v1';
const PASSCODE_KEY = 'splitpro_passcode_v1';
const TABLES = ['groups', 'members', 'trips', 'expenses'] as const;

export type Mode = 'local' | 'supabase';
export type Access = 'ok' | 'needs_passcode';
export interface SupaConfig { url: string; key: string; fromBuiltin?: boolean }

export type NewGroup = Pick<Group, 'name'> & Partial<Pick<Group, 'emoji' | 'color'>>;
export type NewTrip = Pick<Trip, 'name'> & Partial<Pick<Trip, 'emoji'>>;
export type NewExpense = Omit<Expense, 'id' | 'created_at' | 'category' | 'expense_date' | 'shares'> &
  Partial<Pick<Expense, 'category' | 'expense_date' | 'shares'>>;
export type ExpensePatch = Partial<Omit<Expense, 'id' | 'created_at' | 'trip_id'>>;

export class PasscodeError extends Error {
  constructor(msg = 'Group passcode required') { super(msg); this.name = 'PasscodeError'; }
}

const empty = (): Snapshot => ({ groups: [], members: [], trips: [], expenses: [] });
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function readJSON<T>(key: string): T | null {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
}
function loadPasscode(): string {
  try { return localStorage.getItem(PASSCODE_KEY) || ''; } catch { return ''; }
}
function savePasscode(p: string): void {
  try { if (p) localStorage.setItem(PASSCODE_KEY, p); else localStorage.removeItem(PASSCODE_KEY); } catch { /* storage blocked */ }
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ---------- Shared state ----------
let state: Snapshot = empty();
let mode: Mode = 'local';
let access: Access = 'ok';
let supaConfig: SupaConfig | null = null;
const listeners = new Set<(s: Snapshot) => void>();

function setState(next: Partial<Snapshot>): void {
  state = {
    groups: arr<Group>(next.groups),
    members: arr<Member>(next.members),
    trips: arr<Trip>(next.trips),
    expenses: arr<Expense>(next.expenses),
  };
  emit();
}
function emit(): void {
  const snap = { ...state };
  listeners.forEach((fn) => { try { fn(snap); } catch (e) { console.error(e); } });
}

interface Backend {
  addGroup(g: NewGroup): Promise<Group> | Group;
  updateGroup(id: string, patch: Partial<Group>): Promise<void> | void;
  deleteGroup(id: string): Promise<void> | void;
  addMember(groupId: string, name: string): Promise<Member> | Member;
  deleteMember(id: string): Promise<void> | void;
  addTrip(groupId: string, t: NewTrip): Promise<Trip> | Trip;
  deleteTrip(id: string): Promise<void> | void;
  addExpense(e: NewExpense): Promise<Expense> | Expense;
  updateExpense(id: string, patch: ExpensePatch): Promise<void> | void;
  deleteExpense(id: string): Promise<void> | void;
  resetAll(): Promise<void> | void;
}

// ============================================================
// Local backend (localStorage)
// ============================================================
const Local = (() => {
  function load(): Snapshot {
    const parsed = readJSON<Partial<Snapshot>>(STORAGE_KEY);
    if (!parsed) return empty();
    return { groups: arr(parsed.groups), members: arr(parsed.members), trips: arr(parsed.trips), expenses: arr(parsed.expenses) };
  }
  function persist(): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { console.error('SplitPro: failed to write local storage', e); }
  }
  function commit(next: Snapshot): void { state = next; persist(); emit(); }
  function onStorage(e: StorageEvent): void {
    if (e.key === STORAGE_KEY && mode === 'local') setState(load());
  }
  const now = () => new Date().toISOString();

  const api: Backend & { attach(): void; detach(): void } = {
    attach() { setState(load()); window.addEventListener('storage', onStorage); },
    detach() { window.removeEventListener('storage', onStorage); },

    addGroup({ name, emoji, color }) {
      const g: Group = { id: uuid(), name: name.trim(), emoji: emoji || '👥', color: color || '#0D9488', created_at: now() };
      commit({ ...state, groups: [...state.groups, g] });
      return g;
    },
    updateGroup(id, patch) {
      commit({ ...state, groups: state.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) });
    },
    deleteGroup(id) {
      const tripIds = new Set(state.trips.filter((t) => t.group_id === id).map((t) => t.id));
      commit({
        groups: state.groups.filter((g) => g.id !== id),
        members: state.members.filter((m) => m.group_id !== id),
        trips: state.trips.filter((t) => t.group_id !== id),
        expenses: state.expenses.filter((e) => !tripIds.has(e.trip_id)),
      });
    },
    addMember(groupId, name) {
      const m: Member = { id: uuid(), group_id: groupId, name: name.trim(), created_at: now() };
      commit({ ...state, members: [...state.members, m] });
      return m;
    },
    deleteMember(id) {
      commit({ ...state, members: state.members.filter((m) => m.id !== id) });
    },
    addTrip(groupId, { name, emoji }) {
      const t: Trip = { id: uuid(), group_id: groupId, name: name.trim(), emoji: emoji || '🏖️', created_at: now() };
      commit({ ...state, trips: [...state.trips, t] });
      return t;
    },
    deleteTrip(id) {
      commit({ ...state, trips: state.trips.filter((t) => t.id !== id), expenses: state.expenses.filter((e) => e.trip_id !== id) });
    },
    addExpense(e) {
      const row: Expense = {
        id: uuid(),
        trip_id: e.trip_id,
        description: e.description.trim(),
        amount: Number(e.amount),
        paid_by: e.paid_by,
        split_among: [...e.split_among],
        shares: e.shares && typeof e.shares === 'object' ? { ...e.shares } : null,
        reactions: e.reactions && typeof e.reactions === 'object' ? { ...e.reactions } : null,
        image_url: e.image_url || null,
        category: e.category || 'other',
        expense_date: e.expense_date || todayISO(),
        created_at: now(),
      };
      commit({ ...state, expenses: [...state.expenses, row] });
      return row;
    },
    updateExpense(id, patch) {
      commit({ ...state, expenses: state.expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
    },
    deleteExpense(id) {
      commit({ ...state, expenses: state.expenses.filter((e) => e.id !== id) });
    },
    resetAll() { commit(empty()); },
  };
  return api;
})();

// ============================================================
// Supabase backend (REST + Realtime + polling fallback)
// ============================================================
const Supa = (() => {
  let client: SupabaseClient | null = null;
  let channel: RealtimeChannel | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let lastFetchAt = 0;

  function db(): SupabaseClient {
    if (!client) throw new Error('Not connected to Supabase');
    return client;
  }

  async function checkAccess(): Promise<boolean> {
    if (!client) return false;
    const { data, error } = await client.rpc('splitpro_check_access');
    if (error) {
      // Function missing → lockdown SQL not applied → database still open.
      if (error.code === 'PGRST202' || error.code === '42883') return true;
      throw error;
    }
    return data === true;
  }

  function lockOut(): void {
    stopPolling();
    stopRealtime();
    access = 'needs_passcode';
    setState(empty());
  }

  async function refreshAll(): Promise<void> {
    if (!client) return;
    const c = client;
    const [groups, members, trips, expenses] = await Promise.all(TABLES.map((t) => c.from(t).select('*')));
    const err = groups!.error || members!.error || trips!.error || expenses!.error;
    if (err) throw err;
    // RLS hides rows silently. If everything vanished, the passcode was
    // probably rotated: re-check before wiping the screen.
    const hadData = state.groups.length > 0 || state.expenses.length > 0;
    const gotNothing = (groups!.data ?? []).length === 0 && (expenses!.data ?? []).length === 0;
    if (hadData && gotNothing && !(await checkAccess())) { lockOut(); return; }
    setState({ groups: groups!.data ?? [], members: members!.data ?? [], trips: trips!.data ?? [], expenses: expenses!.data ?? [] });
    lastFetchAt = Date.now();
  }

  function startRealtime(): void {
    if (!client) return;
    channel = client
      .channel('splitpro_changes')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        refreshAll().catch((e) => console.warn('Supa refresh failed', e));
      })
      .subscribe();
  }
  function stopRealtime(): void {
    if (channel && client) { try { void client.removeChannel(channel); } catch { /* already closed */ } }
    channel = null;
  }
  function startPolling(): void {
    stopPolling();
    pollTimer = setInterval(() => {
      if (Date.now() - lastFetchAt < 3000) return; // realtime just refreshed
      refreshAll().catch(() => { /* next tick retries */ });
    }, 5000);
  }
  function stopPolling(): void {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  async function mutate(run: (c: SupabaseClient) => PromiseLike<{ error: unknown }>): Promise<void> {
    const { error } = await run(db());
    if (error) throw error;
    await refreshAll();
  }
  async function insert<T>(table: string, row: object): Promise<T> {
    const { data, error } = await db().from(table).insert(row).select().single();
    if (error) throw error;
    await refreshAll();
    return data as T;
  }

  const api: Backend & {
    connect(url: string, key: string, passcode: string): Promise<void>;
    disconnect(): Promise<void>;
    testConnection(url: string, key: string): Promise<boolean>;
  } = {
    async connect(url, key, passcode) {
      stopPolling();
      stopRealtime();
      client = createClient(url, key, {
        realtime: { params: { eventsPerSecond: 5 } },
        global: passcode ? { headers: { 'x-splitpro-key': passcode } } : {},
      });
      if (!(await checkAccess())) {
        lockOut();
        throw new PasscodeError(passcode ? 'Wrong passcode' : 'Group passcode required');
      }
      access = 'ok';
      await refreshAll();
      startRealtime();
      startPolling();
    },
    async disconnect() { stopPolling(); stopRealtime(); client = null; },

    addGroup: ({ name, emoji, color }) =>
      insert<Group>('groups', { name: name.trim(), emoji: emoji || '👥', color: color || '#0D9488' }),
    updateGroup: (id, patch) => mutate((c) => c.from('groups').update(patch).eq('id', id)),
    deleteGroup: (id) => mutate((c) => c.from('groups').delete().eq('id', id)),

    addMember: (groupId, name) => insert<Member>('members', { group_id: groupId, name: name.trim() }),
    deleteMember: (id) => mutate((c) => c.from('members').delete().eq('id', id)),

    addTrip: (groupId, { name, emoji }) => insert<Trip>('trips', { group_id: groupId, name: name.trim(), emoji: emoji || '🏖️' }),
    deleteTrip: (id) => mutate((c) => c.from('trips').delete().eq('id', id)),

    addExpense: (e) => {
      const row: Record<string, unknown> = {
        trip_id: e.trip_id,
        description: e.description.trim(),
        amount: Number(e.amount),
        paid_by: e.paid_by,
        split_among: [...e.split_among],
        category: e.category || 'other',
        expense_date: e.expense_date || todayISO(),
      };
      // Optional columns only when set, so older projects without them still work.
      if (e.shares && Object.keys(e.shares).length > 0) row.shares = e.shares;
      if (e.reactions && Object.keys(e.reactions).length > 0) row.reactions = e.reactions;
      if (e.image_url) row.image_url = e.image_url;
      return insert<Expense>('expenses', row);
    },
    updateExpense: (id, patch) => {
      const clean: Record<string, unknown> = { ...patch };
      delete clean.id; delete clean.created_at; delete clean.trip_id;
      if (patch.description != null) clean.description = String(patch.description).trim();
      if (patch.amount != null) clean.amount = Number(patch.amount);
      if (patch.split_among != null) clean.split_among = [...patch.split_among];
      // shares / reactions: explicit null clears, object replaces, absent leaves alone.
      if ('shares' in patch) clean.shares = patch.shares && Object.keys(patch.shares).length > 0 ? patch.shares : null;
      if ('reactions' in patch) clean.reactions = patch.reactions && Object.keys(patch.reactions).length > 0 ? patch.reactions : null;
      if ('image_url' in patch) clean.image_url = patch.image_url || null;
      return mutate((c) => c.from('expenses').update(clean).eq('id', id));
    },
    deleteExpense: (id) => mutate((c) => c.from('expenses').delete().eq('id', id)),

    resetAll: async () => {
      // Disabled: this wiped the shared database for every friend at once.
      throw new Error('Reset is disabled for shared cloud data. Delete groups individually instead.');
    },

    async testConnection(url, key) {
      try {
        const tmp = createClient(url, key);
        for (const t of TABLES) {
          const { error } = await tmp.from(t).select('id', { count: 'exact', head: true });
          if (error) throw new Error(`Table "${t}": ${error.message}`);
        }
        return true;
      } catch (e) {
        console.error('Supabase test failed:', e);
        alert('Connection test failed: ' + ((e as Error).message || e) + '\n\nMake sure you ran the schema SQL in your Supabase project.');
        return false;
      }
    },
  };
  return api;
})();

// ============================================================
// Backend selection
// ============================================================
let backend: Backend = Local;

function loadConfig(): SupaConfig | null {
  try {
    const parsed = readJSON<SupaConfig & { disconnected?: boolean }>(SUPA_CONFIG_KEY);
    if (parsed?.disconnected) return null; // user chose local mode
    if (parsed?.url && parsed.key) return parsed;
    // First visit: use the credentials built into the deployed app.
    if (builtinConfig.supabaseUrl && builtinConfig.supabaseKey) {
      const cfg: SupaConfig = { url: builtinConfig.supabaseUrl, key: builtinConfig.supabaseKey, fromBuiltin: true };
      localStorage.setItem(SUPA_CONFIG_KEY, JSON.stringify(cfg));
      return cfg;
    }
    return null;
  } catch { return null; }
}
function saveConfig(cfg: SupaConfig | null): void {
  if (cfg) localStorage.setItem(SUPA_CONFIG_KEY, JSON.stringify(cfg));
  else localStorage.removeItem(SUPA_CONFIG_KEY);
}

async function bootstrap(): Promise<void> {
  supaConfig = loadConfig();
  if (supaConfig) {
    try {
      Local.detach();
      mode = 'supabase';
      backend = Supa;
      await Supa.connect(supaConfig.url, supaConfig.key, loadPasscode());
      return;
    } catch (e) {
      // Locked database: stay in cloud mode and let the UI ask for the passcode.
      if (e instanceof PasscodeError) return;
      console.warn('SplitPro: Supabase connect failed, falling back to local.', e);
    }
  }
  mode = 'local';
  backend = Local;
  Local.attach();
}

const byCreated = <T extends { created_at: string }>(a: T, b: T) => (a.created_at > b.created_at ? 1 : -1);

// ============================================================
// Public API
// ============================================================
export const DB = {
  subscribe(fn: (s: Snapshot) => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; },
  snapshot: (): Snapshot => ({ ...state }),
  getMode: (): Mode => mode,
  getConfig: (): SupaConfig | null => supaConfig,
  getAccess: (): Access => access,

  testConnection: (url: string, key: string) => Supa.testConnection(url, key),

  async connectSupabase(url: string, key: string): Promise<void> {
    const ok = await Supa.testConnection(url, key);
    if (!ok) throw new Error('Connection test failed');
    Local.detach();
    saveConfig({ url, key });
    supaConfig = { url, key };
    mode = 'supabase';
    backend = Supa;
    try {
      await Supa.connect(url, key, loadPasscode());
    } catch (e) {
      if (e instanceof PasscodeError) return; // UI shows the passcode screen
      throw e;
    }
  },

  /** Try a passcode; saved on this device only if the database accepts it. */
  async unlock(passcode: string): Promise<void> {
    const p = String(passcode || '').trim();
    if (!supaConfig) throw new Error('Not connected to Supabase');
    await Supa.connect(supaConfig.url, supaConfig.key, p);
    savePasscode(p);
  },

  async forgetPasscode(): Promise<void> {
    savePasscode('');
    if (mode === 'supabase' && supaConfig) {
      try { await Supa.connect(supaConfig.url, supaConfig.key, ''); } catch { /* expected: locked */ }
    }
  },

  async disconnect(): Promise<void> {
    await Supa.disconnect();
    access = 'ok';
    localStorage.setItem(SUPA_CONFIG_KEY, JSON.stringify({ disconnected: true }));
    supaConfig = null;
    mode = 'local';
    backend = Local;
    Local.attach();
  },

  getGroups: (): Group[] => [...state.groups].sort(byCreated),
  getMembers: (groupId: string): Member[] => state.members.filter((m) => m.group_id === groupId).sort(byCreated),
  getTrips: (groupId: string): Trip[] => state.trips.filter((t) => t.group_id === groupId).sort(byCreated),
  getExpenses: (tripId: string): Expense[] =>
    state.expenses
      .filter((e) => e.trip_id === tripId)
      .sort((a, b) => (a.expense_date !== b.expense_date ? (a.expense_date < b.expense_date ? 1 : -1) : a.created_at < b.created_at ? 1 : -1)),

  addGroup: async (g: NewGroup) => backend.addGroup(g),
  updateGroup: async (id: string, p: Partial<Group>) => backend.updateGroup(id, p),
  deleteGroup: async (id: string) => backend.deleteGroup(id),
  addMember: async (groupId: string, name: string) => backend.addMember(groupId, name),
  deleteMember: async (id: string) => backend.deleteMember(id),
  addTrip: async (groupId: string, t: NewTrip) => backend.addTrip(groupId, t),
  deleteTrip: async (id: string) => backend.deleteTrip(id),
  addExpense: async (e: NewExpense) => backend.addExpense(e),
  updateExpense: async (id: string, p: ExpensePatch) => backend.updateExpense(id, p),
  deleteExpense: async (id: string) => backend.deleteExpense(id),
  resetAll: async () => backend.resetAll(),
};

export type SplitProDB = typeof DB;

bootstrap().catch((e) => console.error('SplitPro bootstrap failed', e));
