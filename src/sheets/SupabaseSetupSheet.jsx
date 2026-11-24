import React, { useState, useEffect } from 'react';
import { DB } from '../db/db';
import { Sheet } from '../ui/primitives';

export const SUPABASE_SQL = `-- Paste in Supabase → SQL Editor → Run
create table if not exists groups (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  emoji text not null default '👥',
  color text not null default '#0D9488',
  created_at timestamptz default now()
);
create table if not exists members (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references groups(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);
create table if not exists trips (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references groups(id) on delete cascade,
  name text not null,
  emoji text not null default '🏖️',
  created_at timestamptz default now()
);
create table if not exists expenses (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references trips(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null,
  paid_by text not null,
  split_among text[] not null default '{}',
  category text not null default 'other',
  expense_date date not null,
  created_at timestamptz default now()
);
-- Polish columns (safe to re-run anytime).
alter table expenses add column if not exists shares jsonb;
alter table expenses add column if not exists reactions jsonb;
alter table expenses add column if not exists image_url text;

-- IMPORTANT: now protect the data. Run supabase/legacy/phase0-lockdown.sql
-- from the SplitPro repository (sets a group passcode and turns on
-- Row Level Security). Without it, anyone with your URL can read and
-- delete everything.`;

export function SupabaseSetupSheet({ open, onClose, onConnect, onDisconnect, config, mode, toast }) {
  const [url, setUrl] = useState(config?.url || '');
  const [key, setKey] = useState(config?.key || '');
  const [testing, setTesting] = useState(false);
  const [showSql, setShowSql] = useState(false);

  useEffect(() => {
    // Reset only when sheet opens. `config` may change mid-typing via
    // realtime updates and would otherwise wipe user input.
    if (open) { setUrl(config?.url || ''); setKey(config?.key || ''); setTesting(false); setShowSql(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const test = async () => {
    if (!url || !key) return;
    setTesting(true);
    try {
      const ok = await DB.testConnection(url.trim(), key.trim());
      if (ok) {
        await onConnect(url.trim(), key.trim());
        onClose();
      }
    } finally {
      setTesting(false);
    }
  };

  const copySql = () => {
    try {
      navigator.clipboard.writeText(SUPABASE_SQL);
      toast('SQL copied to clipboard', 'success');
    } catch {
      toast('Copy failed — please select and copy manually', 'error');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Supabase sync">
      {mode === 'supabase' && (
        <div className="summary" style={{ padding: 16, marginBottom: 12 }}>
          <p className="label" style={{ color: 'var(--primary)' }}>● Connected</p>
          <p className="sub" style={{ marginTop: 6 }}>Real-time sync is active. Your group sees changes instantly.</p>
        </div>
      )}

      <p style={{ color: 'var(--text-soft)', fontSize: 13, marginTop: 0 }}>
        Connect to a free Supabase project to sync your group's expenses across phones in real-time.
      </p>

      <div className="spacer-2" />
      <p className="section-title" style={{ margin: '0 0 8px' }}>Step 1 — Create the database</p>
      <button className="btn btn-ghost btn-full" onClick={() => setShowSql((v) => !v)}>
        {showSql ? 'Hide SQL' : 'Show schema SQL'}
      </button>
      {showSql && (
        <React.Fragment>
          <div className="spacer-1" />
          <div className="code-block">{SUPABASE_SQL}</div>
          <div className="spacer-1" />
          <button className="btn btn-soft btn-full" onClick={copySql}>Copy SQL</button>
          <p style={{ color: 'var(--text-mute)', fontSize: 12, marginTop: 8 }}>
            Run this in Supabase → SQL Editor, then enable Realtime on all four tables (Database → Replication).
          </p>
        </React.Fragment>
      )}

      <div className="spacer-3" />
      <p className="section-title" style={{ margin: '0 0 8px' }}>Step 2 — Paste your credentials</p>
      <div className="field">
        <label className="field-label">Project URL</label>
        <input placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} />
      </div>
      <div className="field">
        <label className="field-label">anon public key</label>
        <input placeholder="eyJ..." value={key} onChange={(e) => setKey(e.target.value)} />
      </div>

      <button
        className="btn btn-primary btn-full"
        onClick={test}
        disabled={!url || !key || testing}
      >
        {testing ? 'Testing…' : (mode === 'supabase' ? 'Reconnect' : 'Test & Connect')}
      </button>

      {mode === 'supabase' && (
        <React.Fragment>
          <div className="spacer-2" />
          <button className="btn btn-ghost btn-full" onClick={() => { onDisconnect(); onClose(); }}>
            Disconnect (use local only)
          </button>
        </React.Fragment>
      )}

      <p style={{ color: 'var(--text-mute)', fontSize: 11, textAlign: 'center', marginTop: 16 }}>
        Tip: share the URL + anon key with each friend in your group so they can connect to the same database.
      </p>
    </Sheet>
  );
}
