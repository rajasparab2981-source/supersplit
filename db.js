/* ============================================================
   SplitPro — Data Layer (Pass 2: dual-backend router)

   Two backends:
     - LocalDB:    localStorage (default, no network)
     - SupabaseDB: Supabase REST + Realtime WebSocket + 5s polling fallback

   The active backend is decided by whether a Supabase config exists in
   localStorage under SUPA_CONFIG_KEY. Switch backends at runtime via
   connectSupabase(url, key) / disconnect().

   All methods return Promises. Public surface on window.SplitProDB:

     subscribe(fn)            -> unsubscribe()
     snapshot()               -> { groups, members, trips, expenses }
     getMode()                -> 'local' | 'supabase'
     getConfig()              -> { url, key } | null
     testConnection(url, key) -> Promise<boolean>
     connectSupabase(url, key)-> Promise<void>
     disconnect()             -> Promise<void>

     getGroups()              -> Group[]
     addGroup({name,emoji,color}) -> Promise<Group>
     updateGroup(id, patch)   -> Promise<void>
     deleteGroup(id)          -> Promise<void>

     getMembers(groupId)      -> Member[]
     addMember(groupId, name) -> Promise<Member>
     deleteMember(id)         -> Promise<void>

     getTrips(groupId)        -> Trip[]
     addTrip(groupId, {name,emoji}) -> Promise<Trip>
     deleteTrip(id)           -> Promise<void>

     getExpenses(tripId)      -> Expense[]
     addExpense(e)            -> Promise<Expense>
     deleteExpense(id)        -> Promise<void>

     resetAll()               -> Promise<void>
   ============================================================ */

(function () {
  const STORAGE_KEY    = 'splitpro_data_v1';
  const SUPA_CONFIG_KEY = 'splitpro_supabase_v1';
  const PASSCODE_KEY    = 'splitpro_passcode_v1';
  const TABLES = ['groups', 'members', 'trips', 'expenses'];

  // Phase 0 lockdown: the database requires a group passcode, sent as the
  // `x-splitpro-key` header (see supabase/phase0-lockdown.sql).
  //   'ok'             — connected (passcode accepted, or DB not locked yet)
  //   'needs_passcode' — DB is locked and we have no valid passcode
  let access = 'ok';

  function loadPasscode() {
    try { return localStorage.getItem(PASSCODE_KEY) || ''; } catch { return ''; }
  }
  function savePasscode(p) {
    try {
      if (p) localStorage.setItem(PASSCODE_KEY, p);
      else localStorage.removeItem(PASSCODE_KEY);
    } catch {}
  }

  class PasscodeError extends Error {
    constructor(msg) { super(msg || 'Group passcode required'); this.name = 'PasscodeError'; }
  }

  // ============================================================
  // Shared listeners + state snapshot
  // ============================================================
  let state = { groups: [], members: [], trips: [], expenses: [] };
  const listeners = new Set();
  let mode = 'local';
  let supaConfig = null;

  function setState(next) {
    state = {
      groups:   Array.isArray(next.groups)   ? next.groups   : [],
      members:  Array.isArray(next.members)  ? next.members  : [],
      trips:    Array.isArray(next.trips)    ? next.trips    : [],
      expenses: Array.isArray(next.expenses) ? next.expenses : [],
    };
    emit();
  }
  function emit() {
    const snap = { ...state };
    listeners.forEach((fn) => { try { fn(snap); } catch (e) { console.error(e); } });
  }

  // ============================================================
  // Local backend (localStorage)
  // ============================================================
  const Local = (() => {
    function load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { groups: [], members: [], trips: [], expenses: [] };
        const parsed = JSON.parse(raw);
        return {
          groups:   Array.isArray(parsed.groups)   ? parsed.groups   : [],
          members:  Array.isArray(parsed.members)  ? parsed.members  : [],
          trips:    Array.isArray(parsed.trips)    ? parsed.trips    : [],
          expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
        };
      } catch (e) {
        console.error('SplitPro: failed to read local storage', e);
        return { groups: [], members: [], trips: [], expenses: [] };
      }
    }
    function persist() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
      catch (e) { console.error('SplitPro: failed to write local storage', e); }
    }

    function onStorage(e) {
      if (e.key === STORAGE_KEY && mode === 'local') {
        setState(load());
      }
    }

    return {
      attach() {
        setState(load());
        window.addEventListener('storage', onStorage);
      },
      detach() {
        window.removeEventListener('storage', onStorage);
      },

      // Local backend methods return synchronously (no Promise wrapper) so
      // the older variants — written before the async upgrade — keep working
      // without changes when in local mode. `await` on a sync value works
      // fine, so the new canonical code is unaffected.
      addGroup({ name, emoji, color }) {
        const g = { id: uuid(), name: name.trim(), emoji: emoji || '👥', color: color || '#0D9488', created_at: new Date().toISOString() };
        state = { ...state, groups: [...state.groups, g] };
        persist(); emit();
        return g;
      },
      updateGroup(id, patch) {
        state = { ...state, groups: state.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) };
        persist(); emit();
      },
      deleteGroup(id) {
        const tripIds = state.trips.filter((t) => t.group_id === id).map((t) => t.id);
        state = {
          groups:   state.groups.filter((g) => g.id !== id),
          members:  state.members.filter((m) => m.group_id !== id),
          trips:    state.trips.filter((t) => t.group_id !== id),
          expenses: state.expenses.filter((e) => !tripIds.includes(e.trip_id)),
        };
        persist(); emit();
      },

      addMember(groupId, name) {
        const m = { id: uuid(), group_id: groupId, name: name.trim(), created_at: new Date().toISOString() };
        state = { ...state, members: [...state.members, m] };
        persist(); emit();
        return m;
      },
      deleteMember(id) {
        state = { ...state, members: state.members.filter((m) => m.id !== id) };
        persist(); emit();
      },

      addTrip(groupId, { name, emoji }) {
        const t = { id: uuid(), group_id: groupId, name: name.trim(), emoji: emoji || '🏖️', created_at: new Date().toISOString() };
        state = { ...state, trips: [...state.trips, t] };
        persist(); emit();
        return t;
      },
      deleteTrip(id) {
        state = {
          ...state,
          trips:    state.trips.filter((t) => t.id !== id),
          expenses: state.expenses.filter((e) => e.trip_id !== id),
        };
        persist(); emit();
      },

      addExpense({ trip_id, description, amount, paid_by, split_among, category, expense_date, shares, reactions, image_url }) {
        const e = {
          id: uuid(),
          trip_id,
          description: description.trim(),
          amount: Number(amount),
          paid_by,
          split_among: [...split_among],
          shares: (shares && typeof shares === 'object') ? { ...shares } : null,
          reactions: (reactions && typeof reactions === 'object') ? { ...reactions } : null,
          image_url: image_url || null,
          category: category || 'other',
          expense_date: expense_date || new Date().toISOString().slice(0, 10),
          created_at: new Date().toISOString(),
        };
        state = { ...state, expenses: [...state.expenses, e] };
        persist(); emit();
        return e;
      },
      updateExpense(id, patch) {
        state = {
          ...state,
          expenses: state.expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        };
        persist(); emit();
      },
      deleteExpense(id) {
        state = { ...state, expenses: state.expenses.filter((e) => e.id !== id) };
        persist(); emit();
      },

      resetAll() {
        state = { groups: [], members: [], trips: [], expenses: [] };
        persist(); emit();
      },
    };
  })();

  // ============================================================
  // Supabase backend (REST + Realtime + polling fallback)
  // ============================================================
  const Supa = (() => {
    let client = null;
    let channel = null;
    let pollTimer = null;
    let lastFetchAt = 0;
    let sdkLoadPromise = null;

    function loadSupabaseSDK() {
      if (window.supabase && window.supabase.createClient) return Promise.resolve();
      if (sdkLoadPromise) return sdkLoadPromise;
      sdkLoadPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
        s.onload = () => {
          if (window.supabase && window.supabase.createClient) resolve();
          else reject(new Error('Supabase SDK loaded but createClient missing'));
        };
        s.onerror = () => reject(new Error('Failed to load Supabase SDK from CDN'));
        document.head.appendChild(s);
      });
      return sdkLoadPromise;
    }

    async function refreshAll() {
      if (!client) return;
      const [groups, members, trips, expenses] = await Promise.all(
        TABLES.map((t) => client.from(t).select('*'))
      );
      const err = groups.error || members.error || trips.error || expenses.error;
      if (err) throw err;
      // RLS hides rows silently instead of erroring. If everything we had just
      // vanished, the passcode was probably rotated — re-check before wiping
      // the screen.
      const hadData = state.groups.length > 0 || state.expenses.length > 0;
      const gotNothing = (groups.data || []).length === 0 && (expenses.data || []).length === 0;
      if (hadData && gotNothing && !(await checkAccess())) {
        lockOut();
        return;
      }
      setState({
        groups:   groups.data || [],
        members:  members.data || [],
        trips:    trips.data || [],
        expenses: expenses.data || [],
      });
      lastFetchAt = Date.now();
    }

    function startRealtime() {
      if (!client) return;
      channel = client
        .channel('splitpro_changes')
        .on('postgres_changes', { event: '*', schema: 'public' }, () => {
          refreshAll().catch((e) => console.warn('Supa refresh failed', e));
        })
        .subscribe();
    }
    function stopRealtime() {
      if (channel && client) {
        try { client.removeChannel(channel); } catch {}
      }
      channel = null;
    }

    function startPolling() {
      // 5 second polling as fallback in case WebSocket misses an event
      stopPolling();
      pollTimer = setInterval(() => {
        // skip if we just refreshed via realtime
        if (Date.now() - lastFetchAt < 3000) return;
        refreshAll().catch(() => {});
      }, 5000);
    }
    function stopPolling() {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    }

    // true  = passcode accepted, or the lockdown SQL hasn't been run yet
    // false = database is locked and this passcode is missing/wrong
    async function checkAccess() {
      if (!client) return false;
      const { data, error } = await client.rpc('splitpro_check_access');
      if (error) {
        // Function doesn't exist → lockdown not applied yet → DB is still open.
        if (error.code === 'PGRST202' || error.code === '42883') return true;
        throw error;
      }
      return data === true;
    }

    function lockOut() {
      stopPolling();
      stopRealtime();
      access = 'needs_passcode';
      setState({ groups: [], members: [], trips: [], expenses: [] });
    }

    return {
      async connect(url, key, passcode) {
        await loadSupabaseSDK();
        stopPolling();
        stopRealtime();
        client = window.supabase.createClient(url, key, {
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
      async disconnect() {
        stopPolling();
        stopRealtime();
        client = null;
      },

      addGroup: async ({ name, emoji, color }) => {
        const row = { name: name.trim(), emoji: emoji || '👥', color: color || '#0D9488' };
        const { data, error } = await client.from('groups').insert(row).select().single();
        if (error) throw error;
        await refreshAll();
        return data;
      },
      updateGroup: async (id, patch) => {
        const { error } = await client.from('groups').update(patch).eq('id', id);
        if (error) throw error;
        await refreshAll();
      },
      deleteGroup: async (id) => {
        const { error } = await client.from('groups').delete().eq('id', id);
        if (error) throw error;
        await refreshAll();
      },

      addMember: async (groupId, name) => {
        const { data, error } = await client.from('members').insert({ group_id: groupId, name: name.trim() }).select().single();
        if (error) throw error;
        await refreshAll();
        return data;
      },
      deleteMember: async (id) => {
        const { error } = await client.from('members').delete().eq('id', id);
        if (error) throw error;
        await refreshAll();
      },

      addTrip: async (groupId, { name, emoji }) => {
        const { data, error } = await client.from('trips').insert({ group_id: groupId, name: name.trim(), emoji: emoji || '🏖️' }).select().single();
        if (error) throw error;
        await refreshAll();
        return data;
      },
      deleteTrip: async (id) => {
        const { error } = await client.from('trips').delete().eq('id', id);
        if (error) throw error;
        await refreshAll();
      },

      addExpense: async ({ trip_id, description, amount, paid_by, split_among, category, expense_date, shares, reactions, image_url }) => {
        const row = {
          trip_id,
          description: description.trim(),
          amount: Number(amount),
          paid_by,
          split_among: [...split_among],
          category: category || 'other',
          expense_date: expense_date || new Date().toISOString().slice(0, 10),
        };
        // Only include optional columns when actually set, so old Supabase
        // projects that haven't run the polish migrations still work.
        if (shares && typeof shares === 'object' && Object.keys(shares).length > 0) row.shares = shares;
        if (reactions && typeof reactions === 'object' && Object.keys(reactions).length > 0) row.reactions = reactions;
        if (image_url) row.image_url = image_url;
        const { data, error } = await client.from('expenses').insert(row).select().single();
        if (error) throw error;
        await refreshAll();
        return data;
      },
      updateExpense: async (id, patch) => {
        // Strip read-only fields and trip_id (relocation isn't supported here).
        const clean = { ...patch };
        delete clean.id; delete clean.created_at; delete clean.trip_id;
        if (clean.description != null) clean.description = String(clean.description).trim();
        if (clean.amount != null) clean.amount = Number(clean.amount);
        if (clean.split_among != null) clean.split_among = [...clean.split_among];
        // shares / reactions: explicit null clears; object replaces; omit when
        // not in patch so partial updates don't clobber existing values.
        if (!('shares' in patch)) {
          // no-op
        } else if (patch.shares && typeof patch.shares === 'object' && Object.keys(patch.shares).length > 0) {
          clean.shares = patch.shares;
        } else {
          clean.shares = null;
        }
        if (!('reactions' in patch)) {
          // no-op
        } else if (patch.reactions && typeof patch.reactions === 'object' && Object.keys(patch.reactions).length > 0) {
          clean.reactions = patch.reactions;
        } else {
          clean.reactions = null;
        }
        if (!('image_url' in patch)) {
          // no-op
        } else {
          clean.image_url = patch.image_url || null;
        }
        const { error } = await client.from('expenses').update(clean).eq('id', id);
        if (error) throw error;
        await refreshAll();
      },
      deleteExpense: async (id) => {
        const { error } = await client.from('expenses').delete().eq('id', id);
        if (error) throw error;
        await refreshAll();
      },

      resetAll: async () => {
        // Disabled: this wiped the shared database for every friend at once.
        // Delete individual groups instead.
        throw new Error('Reset is disabled for shared cloud data. Delete groups individually instead.');
      },

      testConnection: async (url, key) => {
        try {
          await loadSupabaseSDK();
          const tmp = window.supabase.createClient(url, key);
          // Try a minimal HEAD/select on each table — fails loudly if SQL not run
          for (const t of TABLES) {
            const { error } = await tmp.from(t).select('id', { count: 'exact', head: true });
            if (error) throw new Error(`Table "${t}": ${error.message}`);
          }
          return true;
        } catch (e) {
          console.error('Supabase test failed:', e);
          alert('Connection test failed: ' + (e.message || e) + '\n\nMake sure you ran the schema SQL in your Supabase project.');
          return false;
        }
      },
    };
  })();

  // ============================================================
  // Backend selector
  // ============================================================
  let backend = Local;

  function loadConfig() {
    try {
      const raw = localStorage.getItem(SUPA_CONFIG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Explicit opt-out: { disconnected: true } means user clicked Disconnect.
        // Don't auto-apply the built-in config in that case.
        if (parsed && parsed.disconnected) return null;
        if (parsed && parsed.url && parsed.key) return parsed;
      }
      // First-time boot (no localStorage record). If the deployed app ships
      // with built-in cloud credentials in config.js, use those so friends
      // get auto-connected without any setup.
      const builtin = window.SplitProConfig;
      if (builtin && builtin.supabaseUrl && builtin.supabaseKey) {
        const cfg = { url: builtin.supabaseUrl, key: builtin.supabaseKey, fromBuiltin: true };
        localStorage.setItem(SUPA_CONFIG_KEY, JSON.stringify(cfg));
        return cfg;
      }
      return null;
    } catch { return null; }
  }
  function saveConfig(cfg) {
    if (cfg) localStorage.setItem(SUPA_CONFIG_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(SUPA_CONFIG_KEY);
  }

  async function bootstrap() {
    supaConfig = loadConfig();
    if (supaConfig) {
      // Try Supabase. Fall back to local if it fails.
      try {
        Local.detach();
        mode = 'supabase';
        backend = Supa;
        await Supa.connect(supaConfig.url, supaConfig.key, loadPasscode());
        return;
      } catch (e) {
        // Locked database: stay in cloud mode and let the UI ask for the
        // passcode, rather than silently showing an empty local workspace.
        if (e instanceof PasscodeError) return;
        console.warn('SplitPro: Supabase connect failed, falling back to local.', e);
        mode = 'local';
        backend = Local;
        Local.attach();
        return;
      }
    }
    // No config — use local.
    mode = 'local';
    backend = Local;
    Local.attach();
  }

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // ============================================================
  // Public API
  // ============================================================
  window.SplitProDB = {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    snapshot() { return { ...state }; },

    getMode() { return mode; },
    getConfig() { return supaConfig; },

    testConnection: (url, key) => Supa.testConnection(url, key),

    async connectSupabase(url, key) {
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

    getAccess() { return access; },

    // Try a passcode. Saves it on this device only if the database accepts it.
    async unlock(passcode) {
      const p = String(passcode || '').trim();
      if (!supaConfig) throw new Error('Not connected to Supabase');
      await Supa.connect(supaConfig.url, supaConfig.key, p); // throws PasscodeError if wrong
      savePasscode(p);
    },

    // Remove the saved passcode from this device and lock the app.
    async forgetPasscode() {
      savePasscode('');
      if (mode === 'supabase' && supaConfig) {
        try { await Supa.connect(supaConfig.url, supaConfig.key, ''); } catch {}
      }
    },

    async disconnect() {
      await Supa.disconnect();
      access = 'ok';
      // Record explicit opt-out so a built-in config.js doesn't auto-reconnect.
      localStorage.setItem(SUPA_CONFIG_KEY, JSON.stringify({ disconnected: true }));
      supaConfig = null;
      mode = 'local';
      backend = Local;
      Local.attach();
    },

    // Read methods (synchronous, off current state)
    getGroups() {
      return [...state.groups].sort((a, b) => (a.created_at > b.created_at ? 1 : -1));
    },
    getMembers(groupId) {
      return state.members
        .filter((m) => m.group_id === groupId)
        .sort((a, b) => (a.created_at > b.created_at ? 1 : -1));
    },
    getTrips(groupId) {
      return state.trips
        .filter((t) => t.group_id === groupId)
        .sort((a, b) => (a.created_at > b.created_at ? 1 : -1));
    },
    getExpenses(tripId) {
      return state.expenses
        .filter((e) => e.trip_id === tripId)
        .sort((a, b) => {
          if (a.expense_date !== b.expense_date) return a.expense_date < b.expense_date ? 1 : -1;
          return a.created_at < b.created_at ? 1 : -1;
        });
    },

    // Write methods — delegate to active backend
    addGroup:     (g)        => backend.addGroup(g),
    updateGroup:  (id, p)    => backend.updateGroup(id, p),
    deleteGroup:  (id)       => backend.deleteGroup(id),
    addMember:    (gid, n)   => backend.addMember(gid, n),
    deleteMember: (id)       => backend.deleteMember(id),
    addTrip:      (gid, t)   => backend.addTrip(gid, t),
    deleteTrip:   (id)       => backend.deleteTrip(id),
    addExpense:    (e)        => backend.addExpense(e),
    updateExpense: (id, p)    => backend.updateExpense(id, p),
    deleteExpense: (id)       => backend.deleteExpense(id),
    resetAll:     ()         => backend.resetAll(),
  };

  // Kick off
  bootstrap().catch((e) => console.error('SplitPro bootstrap failed', e));
})();
