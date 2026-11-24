/// <reference types="node" />
// The v1 -> v2 import must reproduce the balances the current app shows,
// to the paisa. "Current app" = src/lib/splits.ts (calcBalances).
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calcBalances } from '../../src/lib/splits';
import { toPaise } from '../../src/lib/money';
import type { Expense } from '../../src/types';
import { createTestDb } from './harness';

interface V1 {
  groups: { id: string; name: string; emoji: string; color: string; created_at: string }[];
  members: { id: string; group_id: string; name: string; created_at: string }[];
  trips: { id: string; group_id: string; name: string; emoji: string; created_at: string }[];
  expenses: Expense[];
}

const V1_SCHEMA = `
  create table public.legacy_groups (id uuid primary key, name text not null, emoji text, color text, created_at timestamptz);
  create table public.legacy_members (id uuid primary key, group_id uuid, name text not null, created_at timestamptz);
  create table public.legacy_trips (id uuid primary key, group_id uuid, name text not null, emoji text, created_at timestamptz);
  create table public.legacy_expenses (id uuid primary key, trip_id uuid, description text, amount numeric(12,2),
    paid_by text, split_among text[], category text, expense_date date, shares jsonb, reactions jsonb,
    image_url text, created_at timestamptz);`;

async function importAndCompare(v1: V1, ownerName: string) {
  const db = await createTestDb();
  await db.pg.exec(V1_SCHEMA);
  for (const g of v1.groups) await db.admin('insert into legacy_groups values ($1,$2,$3,$4,$5)', [g.id, g.name, g.emoji, g.color, g.created_at]);
  for (const m of v1.members) await db.admin('insert into legacy_members values ($1,$2,$3,$4)', [m.id, m.group_id, m.name, m.created_at]);
  for (const t of v1.trips) await db.admin('insert into legacy_trips values ($1,$2,$3,$4,$5)', [t.id, t.group_id, t.name, t.emoji, t.created_at]);
  for (const e of v1.expenses) {
    await db.admin('insert into legacy_expenses values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [
      e.id, e.trip_id, e.description, e.amount, e.paid_by, e.split_among, e.category, e.expense_date,
      e.shares ? JSON.stringify(e.shares) : null, e.reactions ? JSON.stringify(e.reactions) : null, e.image_url ?? null, e.created_at]);
  }

  const owner = await db.createUser(ownerName);
  const summary = (await db.admin<{ r: Record<string, number> }>('select private.import_legacy($1, $2) as r', [owner, ownerName]))[0]!.r;

  const results: { group: string; expected: Record<string, number>; actual: Record<string, number> }[] = [];
  for (const g of v1.groups) {
    const tripIds = new Set(v1.trips.filter((t) => t.group_id === g.id).map((t) => t.id));
    const expected = Object.fromEntries(calcBalances(v1.expenses.filter((e) => tripIds.has(e.trip_id)))
      .map((b) => [b.name, toPaise(b.net)]));
    const rows = await db.as<{ display_name: string; net_minor: string }>(owner,
      'select display_name, net_minor from group_balances($1)', [g.id]);
    const actual = Object.fromEntries(rows.map((r) => [r.display_name, Number(r.net_minor)]));
    // Members who never appear in an expense have 0 in v2 and are absent in v1.
    for (const [name, v] of Object.entries(actual)) if (!(name in expected) && v === 0) delete actual[name];
    results.push({ group: g.name, expected, actual });
  }
  const counts = (await db.as<{ n: string }>(owner, 'select count(*) as n from expenses'))[0]!;
  return { summary, results, expenseCount: Number(counts.n), db, owner };
}

describe('legacy import', () => {
  it('reproduces v1 balances exactly on tricky synthetic data', async () => {
    const G = '11111111-0000-4000-8000-000000000001';
    const T = '22222222-0000-4000-8000-000000000001';
    const t = (i: number) => `2026-11-0${i}T10:00:00Z`;
    const mem = (i: number, name: string) => ({ id: `33333333-0000-4000-8000-00000000000${i}`, group_id: G, name, created_at: t(1) });
    const ex = (i: number, e: Partial<Expense>): Expense => ({
      id: `44444444-0000-4000-8000-00000000000${i}`, trip_id: T, description: `E${i}`, amount: 100, paid_by: 'Asha',
      split_among: ['Asha', 'Bilal', 'Chirag'], shares: null, reactions: null, image_url: null,
      category: 'food', expense_date: '2026-11-02', created_at: t(2), ...e,
    });
    const v1: V1 = {
      groups: [{ id: G, name: 'Trip', emoji: '🏖️', color: '#00E5A0', created_at: t(1) }],
      members: [mem(1, 'Asha'), mem(2, 'Bilal'), mem(3, 'Chirag')],
      trips: [{ id: T, group_id: G, name: 'Goa', emoji: '🏖️', created_at: t(1) }],
      expenses: [
        ex(1, {}),                                                                  // 100 / 3: leftover paisa
        ex(2, { amount: 977, paid_by: 'Bilal', split_among: ['Asha', 'Bilal', 'Chirag', 'Dev'],
                shares: { Asha: 276.78, Bilal: 276.78, Chirag: 276.78, Dev: 146.55 } }), // shares short by 0.11; Dev was removed
        ex(3, { amount: 50, paid_by: 'Dev', split_among: ['Asha'] }),               // payer no longer a member
        ex(4, { amount: 333.33, paid_by: 'Chirag', split_among: ['Bilal', 'Chirag', 'Dev', 'Asha', 'Bilal'] }), // duplicate name
        ex(5, { amount: 10, split_among: [], reactions: { Asha: '🔥', Dev: '😂' },
                image_url: 'data:image/jpeg;base64,AAAA' }),                       // split among nobody + photo
        ex(6, { amount: 99.99, paid_by: 'Asha', split_among: ['Bilal'], category: 'weird' }),
      ],
    };
    const { summary, results, expenseCount, db, owner } = await importAndCompare(v1, 'Asha');
    expect(summary).toMatchObject({ groups: 1, members: 3, trips: 1, expenses: 6, receipts_to_upload: 1 });
    expect(expenseCount).toBe(6);
    for (const r of results) expect(r.actual).toEqual(r.expected);

    const me = (await db.as<{ role: string; user_id: string }>(owner,
      `select role, user_id from group_members where display_name = 'Asha'`))[0]!;
    expect(me).toMatchObject({ role: 'owner', user_id: owner });
    const dev = (await db.as<{ left: boolean }>(owner, `select left_at is not null as left from group_members where display_name = 'Dev'`))[0]!;
    expect(dev.left).toBe(true);
    expect(await db.admin('select private.import_legacy()').catch((e) => e.message)).toMatch(/already contain data/);
  });

  // Runs only where the private backup exists (your machine, not CI).
  const dir = join(__dirname, '..', '..', 'backups');
  const latest = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('-expenses.json')).sort().pop() : undefined;
  it.skipIf(!latest)('reproduces production balances exactly (local backup)', async () => {
    const prefix = latest!.replace('-expenses.json', '');
    const read = (k: string) => JSON.parse(readFileSync(join(dir, `${prefix}-${k}.json`), 'utf8'));
    const v1: V1 = { groups: read('groups'), members: read('members'), trips: read('trips'), expenses: read('expenses') };
    const ownerName = v1.members[0]!.name;
    const { summary, results, expenseCount } = await importAndCompare(v1, ownerName);
    expect(expenseCount).toBe(v1.expenses.length);
    expect(summary.expenses).toBe(v1.expenses.length);
    for (const r of results) {
      expect(r.actual).toEqual(r.expected);
      expect(Object.values(r.actual).reduce((s, v) => s + v, 0)).toBe(0);
    }
  });
});
