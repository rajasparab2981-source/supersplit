/// <reference types="node" />
// Rehearses supabase/SWITCHOVER.md against a replica of the LIVE database:
// v1 tables exactly as they exist in production (columns/defaults read from the
// live project on 2026-11-24), RLS + the Phase 0 passcode lockdown, the
// realtime publication, and the real data from backups/.
//
// The real-data part runs only where the private backup exists (not in CI).
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { calcBalances } from '../../src/lib/splits';
import { toPaise } from '../../src/lib/money';
import { applyMigrations, createTestDb } from './harness';

const ROOT = join(__dirname, '..', '..');

// v1 schema exactly as in production (information_schema, 2026-11-24).
const LIVE_V1_SCHEMA = `
create table public.groups (
  id uuid default gen_random_uuid() primary key, name text not null,
  emoji text not null default '👥', color text not null default '#0D9488', created_at timestamptz default now());
create table public.members (
  id uuid default gen_random_uuid() primary key, group_id uuid references public.groups(id) on delete cascade,
  name text not null, created_at timestamptz default now());
create table public.trips (
  id uuid default gen_random_uuid() primary key, group_id uuid references public.groups(id) on delete cascade,
  name text not null, emoji text not null default '🏖️', created_at timestamptz default now());
create table public.expenses (
  id uuid default gen_random_uuid() primary key, trip_id uuid references public.trips(id) on delete cascade,
  description text not null, amount numeric(12,2) not null, paid_by text not null,
  split_among text[] not null default '{}', category text not null default 'other', expense_date date not null,
  created_at timestamptz default now(), shares jsonb, reactions jsonb, image_url text);
grant all on public.groups, public.members, public.trips, public.expenses to anon, authenticated;
create publication supabase_realtime for table public.groups, public.members, public.trips, public.expenses;`;

const RENAME = `
alter table public.groups   rename to legacy_groups;
alter table public.members  rename to legacy_members;
alter table public.trips    rename to legacy_trips;
alter table public.expenses rename to legacy_expenses;`;

const ROLLBACK = `
alter table public.groups   rename to v2_failed_groups;
alter table public.trips    rename to v2_failed_trips;
alter table public.expenses rename to v2_failed_expenses;
alter table public.legacy_groups   rename to groups;
alter table public.legacy_members  rename to members;
alter table public.legacy_trips    rename to trips;
alter table public.legacy_expenses rename to expenses;`;

interface V1Data { groups: any[]; members: any[]; trips: any[]; expenses: any[] }

function latestBackup(): V1Data | null {
  const dir = join(ROOT, 'backups', 'live-2026-11-24');
  if (!existsSync(dir)) return null;
  const file = (t: string) => readdirSync(dir).filter((f) => f.endsWith(`-${t}.json`)).sort().pop();
  const read = (t: string) => JSON.parse(readFileSync(join(dir, file(t)!), 'utf8'));
  return { groups: read('groups'), members: read('members'), trips: read('trips'), expenses: read('expenses') };
}

const SYNTHETIC: V1Data = {
  groups: [{ id: '11111111-0000-4000-8000-000000000001', name: 'Trip', emoji: '🏖️', color: '#0D9488', created_at: '2026-11-01T10:00:00Z' }],
  members: ['Asha', 'Bilal'].map((name, i) => ({ id: `33333333-0000-4000-8000-00000000000${i}`, group_id: '11111111-0000-4000-8000-000000000001', name, created_at: '2026-11-01T10:00:00Z' })),
  trips: [{ id: '22222222-0000-4000-8000-000000000001', group_id: '11111111-0000-4000-8000-000000000001', name: 'Goa', emoji: '🏖️', created_at: '2026-11-01T10:00:00Z' }],
  expenses: [{ id: '44444444-0000-4000-8000-000000000001', trip_id: '22222222-0000-4000-8000-000000000001', description: 'Dinner',
    amount: 100, paid_by: 'Asha', split_among: ['Asha', 'Bilal'], category: 'food', expense_date: '2026-11-02',
    created_at: '2026-11-02T10:00:00Z', shares: null, reactions: null, image_url: null }],
};

/** Build the live v1 state: schema, Phase 0 lockdown, data. */
async function buildLiveReplica(pg: PGlite, data: V1Data): Promise<void> {
  await pg.exec(LIVE_V1_SCHEMA);
  // Phase 0 lockdown exactly as run in production (with a test passcode).
  const phase0 = readFileSync(join(ROOT, 'supabase', 'legacy', 'phase0-lockdown.sql'), 'utf8')
    .replace("'CHANGE-ME-TO-A-LONG-PASSCODE');", "'rehearsal-passcode-123');");
  await pg.exec(phase0);
  for (const g of data.groups) await pg.query('insert into public.groups values ($1,$2,$3,$4,$5)', [g.id, g.name, g.emoji, g.color, g.created_at]);
  for (const m of data.members) await pg.query('insert into public.members values ($1,$2,$3,$4)', [m.id, m.group_id, m.name, m.created_at]);
  for (const t of data.trips) await pg.query('insert into public.trips values ($1,$2,$3,$4,$5)', [t.id, t.group_id, t.name, t.emoji, t.created_at]);
  for (const e of data.expenses) {
    await pg.query('insert into public.expenses values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [
      e.id, e.trip_id, e.description, e.amount, e.paid_by, e.split_among, e.category, e.expense_date, e.created_at,
      e.shares ? JSON.stringify(e.shares) : null, e.reactions ? JSON.stringify(e.reactions) : null, e.image_url ?? null]);
  }
}

async function rehearse(data: V1Data) {
  const db = await createTestDb({ migrate: false, setup: (pg) => buildLiveReplica(pg, data) });
  const counts = async (prefix = '') => Object.fromEntries(await Promise.all(['groups', 'members', 'trips', 'expenses'].map(async (t) =>
    [t, Number((await db.admin<{ n: string }>(`select count(*) n from public.${prefix}${t}`))[0]!.n)])));

  // Step 3: rename v1 tables (one transaction, as in the runbook).
  await db.pg.exec(`begin;${RENAME}commit;`);
  // Step 4: apply all v2 migrations on top of the live state.
  const applied = await applyMigrations(db.pg);
  // Step 5: owner signs up, then import linking them to their v1 member name.
  const ownerName = data.members[0].name as string;
  const owner = await db.createUser(ownerName);
  const summary = (await db.admin<{ r: Record<string, number> }>('select private.import_legacy($1, $2) as r', [owner, ownerName]))[0]!.r;

  // Step 6: verify balances per group against the v1 app's maths.
  const groups = [];
  for (const g of data.groups) {
    const tripIds = new Set(data.trips.filter((t) => t.group_id === g.id).map((t) => t.id));
    const expected = Object.fromEntries(calcBalances(data.expenses.filter((e) => tripIds.has(e.trip_id))).map((b) => [b.name, toPaise(b.net)]));
    const actual = Object.fromEntries((await db.as<{ display_name: string; net_minor: string }>(owner,
      'select display_name, net_minor from group_balances($1)', [g.id])).map((r) => [r.display_name, Number(r.net_minor)]));
    for (const [n, v] of Object.entries(actual)) if (!(n in expected) && v === 0) delete actual[n];
    groups.push({ expected, actual });
  }
  return { db, applied, summary, groups, owner, ownerName, counts };
}

async function checkRehearsal(data: V1Data) {
  const r = await rehearse(data);
  expect(r.applied.length).toBeGreaterThanOrEqual(8);
  expect(r.summary).toMatchObject({ groups: data.groups.length, trips: data.trips.length, expenses: data.expenses.length });
  for (const g of r.groups) {
    expect(g.actual).toEqual(g.expected);
    expect(Object.values(g.actual).reduce((s, v) => s + v, 0)).toBe(0);
  }
  // Legacy tables kept intact for 30 days, still locked by the passcode rules.
  expect(await r.counts('legacy_')).toEqual({ groups: data.groups.length, members: data.members.length, trips: data.trips.length, expenses: data.expenses.length });
  expect(await r.db.asAnon('select * from public.legacy_expenses')).toEqual([]);
  // The owner is linked and is an owner; signed-out visitors see nothing in v2.
  const me = (await r.db.as<{ role: string }>(r.owner, 'select role from group_members where user_id = $1', [r.owner]))[0]!;
  expect(me.role).toBe('owner');
  expect(await r.db.as(await r.db.createUser('Stranger'), 'select * from expenses')).toEqual([]);
  // New tables are published for realtime; renamed v1 tables stay published harmlessly.
  const pub = (await r.db.admin<{ t: string }>(`select tablename t from pg_publication_tables where pubname = 'supabase_realtime' order by 1`)).map((x) => x.t);
  expect(pub).toEqual(expect.arrayContaining(['expenses', 'groups', 'group_members', 'settlements', 'legacy_expenses']));
  return r;
}

describe('switch-over rehearsal on a replica of the live database', () => {
  it('works on synthetic v1 data (runs everywhere)', async () => {
    await checkRehearsal(SYNTHETIC);
  });

  const real = latestBackup();
  it.skipIf(!real)('works on the real live data: every balance matches to the paisa', async () => {
    await checkRehearsal(real!);
  });

  it('rollback restores the v1 app\'s tables and data untouched', async () => {
    const data = real ?? SYNTHETIC;
    const r = await rehearse(data);
    await r.db.pg.exec(`begin;${ROLLBACK}commit;`);
    expect(await r.counts()).toEqual({ groups: data.groups.length, members: data.members.length, trips: data.trips.length, expenses: data.expenses.length });
    // The v1 app reads with the passcode header: still works after rollback.
    const rows = await r.db.pg.transaction(async (tx) => {
      await tx.query(`select set_config('request.headers', '{"x-splitpro-key":"rehearsal-passcode-123"}', true)`);
      await tx.exec('set local role anon');
      return (await tx.query('select id from public.expenses')).rows;
    });
    expect(rows.length).toBe(data.expenses.length);
  });
});
