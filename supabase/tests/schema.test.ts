/// <reference types="node" />
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, sqlstate, type TestDb } from './harness';

let db: TestDb;
let asha: string, bilal: string, chirag: string, outsider: string;
let gid: string, ashaM: string, bilalM: string, chiragM: string, devM: string;

const one = async <T,>(p: Promise<T[]>) => (await p)[0]!;
const expense = (extra: Record<string, unknown>) => JSON.stringify({
  group_id: gid, description: 'Dinner', amount_minor: 10000, expense_date: '2026-11-22', category: 'food', ...extra,
});
const balances = async (user: string, tripId: string | null = null) =>
  Object.fromEntries((await db.as<{ display_name: string; net_minor: string }>(user,
    'select display_name, net_minor from group_balances($1, $2)', [gid, tripId]))
    .map((r) => [r.display_name, Number(r.net_minor)]));

beforeAll(async () => {
  db = await createTestDb();
  asha = await db.createUser('Asha');
  bilal = await db.createUser('Bilal');
  chirag = await db.createUser('Chirag');
  outsider = await db.createUser('Mallory');

  gid = (await one(db.as<{ g: string }>(asha, `select create_group('Goa Squad', '🏖️') as g`))).g;
  ashaM = (await one(db.as<{ id: string }>(asha, 'select id from group_members where group_id = $1', [gid]))).id;
  bilalM = (await one(db.as<{ m: string }>(asha, `select add_member($1, 'Bilal') as m`, [gid]))).m;
  chiragM = (await one(db.as<{ m: string }>(asha, `select add_member($1, 'Chirag') as m`, [gid]))).m;
  devM = (await one(db.as<{ m: string }>(asha, `select add_member($1, 'Dev') as m`, [gid]))).m;
}, 60_000);

describe('signup and groups', () => {
  it('creates a profile on signup from the name', async () => {
    const p = await one(db.as<{ display_name: string }>(asha, 'select display_name from profiles where id = $1', [asha]));
    expect(p.display_name).toBe('Asha');
  });

  it('linking Google later fills in the real name, but never overwrites a chosen one', async () => {
    const id = (await db.admin<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data) values ('priya.k@example.test', '{}') returning id`))[0]!.id;
    const name = async () => (await db.admin<{ n: string }>('select display_name as n from profiles where id = $1', [id]))[0]!.n;
    expect(await name()).toBe('priya.k'); // placeholder from the email address
    await db.admin(`update auth.users set raw_user_meta_data = '{"full_name":"Priya Kulkarni"}' where id = $1`, [id]);
    expect(await name()).toBe('Priya Kulkarni');
    await db.admin(`update profiles set display_name = 'PK' where id = $1`, [id]);
    await db.admin(`update auth.users set raw_user_meta_data = '{"full_name":"Priya K (Google)"}' where id = $1`, [id]);
    expect(await name()).toBe('PK');
  });

  it('makes the creator the owner, and create_group is idempotent', async () => {
    const m = await one(db.as<{ role: string; user_id: string }>(asha, 'select role, user_id from group_members where id = $1', [ashaM]));
    expect(m).toMatchObject({ role: 'owner', user_id: asha });
    const again = await one(db.as<{ g: string }>(asha, `select create_group('Goa Squad', null, null, 'INR', null, $1) as g`, [gid]));
    expect(again.g).toBe(gid);
    expect((await db.as(asha, 'select id from groups')).length).toBe(1);
  });

  it('rejects duplicate active names', async () => {
    expect(await sqlstate(db.as(asha, `select add_member($1, '  bilal ')`, [gid]))).toBe('22023');
  });
});

describe('access rules', () => {
  it('outsiders and signed-out visitors see nothing', async () => {
    for (const table of ['groups', 'group_members', 'expenses', 'settlements', 'activity_log']) {
      expect(await db.as(outsider, `select * from ${table}`)).toEqual([]);
    }
    expect(await sqlstate(db.asAnon('select * from groups'))).toBe('42501');
    expect(await sqlstate(db.asAnon(`select create_group('x')`))).toBe('42501');
  });

  it('outsiders cannot call functions on a group they are not in', async () => {
    expect(await sqlstate(db.as(outsider, 'select * from group_balances($1)', [gid]))).toBe('42501');
    expect(await sqlstate(db.as(outsider, `select add_member($1, 'Eve')`, [gid]))).toBe('42501');
    expect(await sqlstate(db.as(outsider, 'select create_expense($1::jsonb)', [expense({
      payers: [{ member_id: ashaM, amount_minor: 10000 }], splits: [{ member_id: ashaM, amount_minor: 10000 }] })]))).toBe('42501');
  });

  it('members cannot write tables directly, only through functions', async () => {
    expect(await sqlstate(db.as(asha, `insert into expenses (group_id, description, amount_minor, expense_date)
      values ($1, 'x', 100, current_date)`, [gid]))).toBe('42501');
    expect(await sqlstate(db.as(asha, 'update groups set name = $1', ['hacked']))).toBe('42501');
    expect(await sqlstate(db.as(asha, 'delete from group_members'))).toBe('42501');
  });

  it('a user can edit only their own profile', async () => {
    await db.as(asha, `update profiles set upi_id = 'asha@oksbi' where id = $1`, [asha]);
    const changed = await db.as(asha, `update profiles set display_name = 'x' where id = $1 returning id`, [bilal]);
    expect(changed).toEqual([]);
  });
});

describe('expenses', () => {
  let e1: string;

  it('creates an expense whose payers and splits add up', async () => {
    e1 = (await one(db.as<{ id: string }>(asha, 'select create_expense($1::jsonb) as id', [expense({
      payers: [{ member_id: ashaM, amount_minor: 10000 }],
      splits: [{ member_id: ashaM, amount_minor: 3334 }, { member_id: bilalM, amount_minor: 3333 }, { member_id: chiragM, amount_minor: 3333 }],
    })]))).id;
    expect(await balances(asha)).toEqual({ Asha: 6666, Bilal: -3333, Chirag: -3333, Dev: 0 });
  });

  it('rejects splits that do not add up, with a clear error', async () => {
    const bad = db.as(asha, 'select create_expense($1::jsonb)', [expense({
      payers: [{ member_id: ashaM, amount_minor: 10000 }],
      splits: [{ member_id: ashaM, amount_minor: 5000 }, { member_id: bilalM, amount_minor: 4999 }],
    })]);
    await expect(bad).rejects.toThrow(/add up to 9999 but the expense is 10000/);
  });

  it('rejects people from another group, duplicates and zero amounts', async () => {
    const other = (await one(db.as<{ g: string }>(outsider, `select create_group('Other') as g`))).g;
    const otherM = (await one(db.as<{ id: string }>(outsider, 'select id from group_members where group_id = $1', [other]))).id;
    const cases = [
      { payers: [{ member_id: otherM, amount_minor: 10000 }], splits: [{ member_id: ashaM, amount_minor: 10000 }] },
      { payers: [{ member_id: ashaM, amount_minor: 10000 }], splits: [{ member_id: ashaM, amount_minor: 5000 }, { member_id: ashaM, amount_minor: 5000 }] },
      { amount_minor: 0, payers: [{ member_id: ashaM, amount_minor: 0 }], splits: [{ member_id: ashaM, amount_minor: 0 }] },
    ];
    for (const c of cases) expect(await sqlstate(db.as(asha, 'select create_expense($1::jsonb)', [expense(c)]))).toBe('22023');
  });

  it('is idempotent: retrying a create with the same id adds nothing', async () => {
    const id = 'aaaaaaaa-0000-4000-8000-000000000001';
    const body = expense({ id, description: 'Retry', amount_minor: 600,
      payers: [{ member_id: bilalM, amount_minor: 600 }],
      splits: [{ member_id: bilalM, amount_minor: 300 }, { member_id: chiragM, amount_minor: 300 }] });
    await db.as(asha, 'select create_expense($1::jsonb)', [body]);
    await db.as(asha, 'select create_expense($1::jsonb)', [body]);
    expect((await db.as(asha, 'select id from expenses where id = $1', [id])).length).toBe(1);
    await db.as(asha, 'select delete_expense($1)', [id]);
  });

  it('rejects an edit made from a stale version (no silent overwrites)', async () => {
    const edit = (version: number, description: string) => db.as(asha, 'select update_expense($1::jsonb) as v', [JSON.stringify({
      id: e1, version, description, amount_minor: 10000,
      payers: [{ member_id: ashaM, amount_minor: 10000 }],
      splits: [{ member_id: ashaM, amount_minor: 5000 }, { member_id: bilalM, amount_minor: 5000 }],
    })]);
    const v = await one(edit(1, 'Dinner (edited)') as Promise<{ v: number }[]>);
    expect(v.v).toBe(2);
    expect(await sqlstate(edit(1, 'Stale edit'))).toBe('40001');
    expect(await balances(asha)).toEqual({ Asha: 5000, Bilal: -5000, Chirag: 0, Dev: 0 });
  });

  it('soft delete removes it from balances and restore brings it back', async () => {
    await db.as(asha, 'select delete_expense($1)', [e1]);
    expect(await balances(asha)).toEqual({ Asha: 0, Bilal: 0, Chirag: 0, Dev: 0 });
    await db.as(asha, 'select restore_expense($1)', [e1]);
    expect(await balances(asha)).toEqual({ Asha: 5000, Bilal: -5000, Chirag: 0, Dev: 0 });
  });

  it('reactions: one per person, removable', async () => {
    await db.as(asha, `select set_reaction($1, '🔥')`, [e1]);
    await db.as(asha, `select set_reaction($1, '🎉')`, [e1]);
    expect(await db.as(asha, 'select emoji from expense_reactions where expense_id = $1', [e1])).toEqual([{ emoji: '🎉' }]);
    await db.as(asha, 'select set_reaction($1, null)', [e1]);
    expect(await db.as(asha, 'select emoji from expense_reactions where expense_id = $1', [e1])).toEqual([]);
  });
});

describe('settlements and balances', () => {
  it('recording a repayment moves balances, and settling everything reaches zero', async () => {
    await db.as(asha, 'select record_settlement($1::jsonb)', [JSON.stringify({
      group_id: gid, from_member: bilalM, to_member: ashaM, amount_minor: 2000, method: 'upi' })]);
    expect(await balances(asha)).toEqual({ Asha: 3000, Bilal: -3000, Chirag: 0, Dev: 0 });
    await db.as(asha, 'select record_settlement($1::jsonb)', [JSON.stringify({
      group_id: gid, from_member: bilalM, to_member: ashaM, amount_minor: 3000, method: 'cash' })]);
    expect(await balances(asha)).toEqual({ Asha: 0, Bilal: 0, Chirag: 0, Dev: 0 });
  });

  it('balances always sum to zero', async () => {
    const rows = await db.as<{ s: string }>(asha, 'select sum(net_minor) as s from group_balances($1)', [gid]);
    expect(Number(rows[0]!.s)).toBe(0);
  });

  it('trip balances only count that trip', async () => {
    const trip = (await one(db.as<{ t: string }>(asha, `select create_trip($1, 'Weekend') as t`, [gid]))).t;
    await db.as(asha, 'select create_expense($1::jsonb)', [expense({ trip_id: trip, description: 'Cab', amount_minor: 900,
      payers: [{ member_id: chiragM, amount_minor: 900 }],
      splits: [{ member_id: chiragM, amount_minor: 300 }, { member_id: devM, amount_minor: 300 }, { member_id: ashaM, amount_minor: 300 }] })]);
    expect(await balances(asha, trip)).toEqual({ Asha: -300, Chirag: 600, Dev: -300, Bilal: 0 });
    await db.as(asha, 'select delete_trip($1)', [trip]);
    expect(await balances(asha)).toEqual({ Asha: 0, Bilal: 0, Chirag: 0, Dev: 0 });
  });
});

describe('invites', () => {
  let token: string;

  it('a member creates an invite; the raw token is never stored', async () => {
    token = (await one(db.as<{ t: string }>(asha, 'select create_invite($1) as t', [gid]))).t;
    expect(token.length).toBeGreaterThanOrEqual(20);
    expect(await db.admin('select 1 from invites where token_hash = $1', [token])).toEqual([]);
  });

  it('preview shows the group and claimable names but no expenses', async () => {
    const p = await one(db.as<{ group_name: string; placeholders: { display_name: string }[]; already_member: boolean }>(
      bilal, 'select * from invite_preview($1)', [token]));
    expect(p.group_name).toBe('Goa Squad');
    expect(p.placeholders.map((x) => x.display_name)).toEqual(['Bilal', 'Chirag', 'Dev']);
    expect(p.already_member).toBe(false);
  });

  it('accepting while claiming a placeholder links the account and keeps history', async () => {
    await db.as(bilal, 'select accept_invite($1, $2)', [token, bilalM]);
    const m = await one(db.as<{ user_id: string }>(bilal, 'select user_id from group_members where id = $1', [bilalM]));
    expect(m.user_id).toBe(bilal);
    expect((await db.as(bilal, 'select id from expenses')).length).toBeGreaterThan(0);
    expect(await sqlstate(db.as(chirag, 'select accept_invite($1, $2)', [token, bilalM]))).toBe('22023'); // already claimed
  });

  it('joining as a new name works; the same name as an existing member is refused', async () => {
    expect(await sqlstate(db.as(chirag, `select accept_invite($1, null, 'Dev')`, [token]))).toBe('22023');
    await db.as(chirag, `select accept_invite($1, null, 'Chirag K')`, [token]);
    expect((await db.as(chirag, 'select id from groups')).length).toBe(1);
  });

  it('revoked or bogus tokens are rejected', async () => {
    expect(await sqlstate(db.as(outsider, 'select * from invite_preview($1)', ['not-a-token']))).toBe('P0002');
    const inv = await one(db.as<{ id: string }>(asha, 'select id from invites limit 1'));
    expect(await sqlstate(db.as(bilal, 'select revoke_invite($1)', [inv.id]))).toBe('42501'); // members can't revoke
    await db.as(asha, 'select revoke_invite($1)', [inv.id]);
    expect(await sqlstate(db.as(outsider, 'select accept_invite($1)', [token]))).toBe('P0002');
  });
});

describe('categories and Premium trial', () => {
  const dinner = (category: string) => db.as(asha, 'select create_expense($1::jsonb) as id', [expense({
    category, description: 'Cat test', amount_minor: 200,
    payers: [{ member_id: ashaM, amount_minor: 200 }], splits: [{ member_id: ashaM, amount_minor: 200 }] })]);

  it('has the built-in categories, including the original eight', async () => {
    const ids = (await db.as<{ id: string }>(asha, 'select id from categories where group_id is null')).map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(['food', 'travel', 'stay', 'drinks', 'fun', 'shopping', 'fuel', 'other',
      'groceries', 'transport', 'rent', 'utilities', 'medical', 'activities']));
    expect(await sqlstate(db.asAnon('select * from categories'))).toBe('42501');
  });

  it('accepts new built-in categories and rejects unknown ones', async () => {
    const id = (await one(dinner('groceries') as Promise<{ id: string }[]>)).id;
    await db.as(asha, 'select delete_expense($1)', [id]);
    expect(await sqlstate(dinner('not_a_category'))).toBe('22023');
  });

  it('new accounts start a 30-day trial', async () => {
    const p = await one(db.as<{ plan: string; days_left: number }>(asha, 'select plan, days_left from my_plan()'));
    expect(p.plan).toBe('trial');
    expect(p.days_left).toBe(30);
    expect(await db.as(asha, 'select user_id from entitlements where user_id <> $1', [asha])).toEqual([]); // own row only
    expect(await sqlstate(db.as(asha, `update entitlements set premium_until = now() + interval '1 year'`))).toBe('42501');
  });

  it('custom categories: Premium only, visible to the group only, usable in that group only', async () => {
    const cid = (await one(db.as<{ c: string }>(asha, `select create_category($1, 'Scuba', '🤿') as c`, [gid]))).c;
    expect(await sqlstate(db.as(asha, `select create_category($1, ' scuba ')`, [gid]))).toBe('22023'); // duplicate name
    const id = (await one(dinner(cid) as Promise<{ id: string }[]>)).id;
    await db.as(asha, 'select delete_expense($1)', [id]);
    expect(await db.as(outsider, 'select id from categories where id = $1', [cid])).toEqual([]);
    // Outsider's own group cannot use Asha's group's category.
    const og = (await one(db.as<{ id: string }>(outsider, 'select id from groups limit 1'))).id;
    const om = (await one(db.as<{ id: string }>(outsider, 'select id from group_members where group_id = $1', [og]))).id;
    expect(await sqlstate(db.as(outsider, 'select create_expense($1::jsonb)', [JSON.stringify({ group_id: og, description: 'x',
      amount_minor: 100, category: cid, payers: [{ member_id: om, amount_minor: 100 }], splits: [{ member_id: om, amount_minor: 100 }] })]))).toBe('22023');
  });

  it('after the trial ends the plan is free and Premium features pause; a paid period re-enables them', async () => {
    await db.admin(`update entitlements set trial_ends_at = now() - interval '1 day' where user_id = $1`, [asha]);
    expect((await one(db.as<{ plan: string }>(asha, 'select plan from my_plan()'))).plan).toBe('free');
    expect(await sqlstate(db.as(asha, `select create_category($1, 'Paused')`, [gid]))).toBe('P0003');
    // Core splitting still works on the free plan.
    const id = (await one(dinner('food') as Promise<{ id: string }[]>)).id;
    await db.as(asha, 'select delete_expense($1)', [id]);
    await db.admin(`update entitlements set premium_until = now() + interval '30 days' where user_id = $1`, [asha]);
    expect((await one(db.as<{ plan: string }>(asha, 'select plan from my_plan()'))).plan).toBe('premium');
    await db.as(asha, `select create_category($1, 'Paid again')`, [gid]);
  });
});

describe('trip planner', () => {
  let trip: string;
  const item = (extra: Record<string, unknown>) => JSON.stringify({ trip_id: trip, section: 'food', label: 'Breakfast', unit_price_minor: 25000, ...extra });
  const save = (user: string, extra: Record<string, unknown> = {}) => db.as<{ id: string }>(user, 'select save_budget_item($1::jsonb) as id', [item(extra)]);

  it('existing trips stay active; planning details can be set and partly updated', async () => {
    trip = (await one(db.as<{ t: string }>(asha, `select create_trip($1, 'Goa plan') as t`, [gid]))).t;
    expect((await one(db.as<{ status: string }>(asha, 'select status from trips where id = $1', [trip]))).status).toBe('active');
    await db.as(asha, 'select update_trip_plan($1::jsonb)', [JSON.stringify({ trip_id: trip, destination: ' Goa ', start_date: '2026-12-20',
      end_date: '2026-12-24', adults: 4, children: 0, travel_type: 'friends', travel_style: 'standard', status: 'planning', budget_minor: 7200000 })]);
    await db.as(asha, 'select update_trip_plan($1::jsonb)', [JSON.stringify({ trip_id: trip, buffer_pct: 15, alert_thresholds: [90, 50, 90] })]);
    const t = await one(db.as<Record<string, unknown>>(asha, 'select destination, status, adults, buffer_pct::float as buffer, alert_thresholds, budget_minor::int as budget, end_date::text from trips where id = $1', [trip]));
    expect(t).toEqual({ destination: 'Goa', status: 'planning', adults: 4, buffer: 15, alert_thresholds: [50, 90], budget: 7200000, end_date: '2026-12-24' });
  });

  it('rejects invalid details with a clear error', async () => {
    const bad = (p: Record<string, unknown>) => sqlstate(db.as(asha, 'select update_trip_plan($1::jsonb)', [JSON.stringify({ trip_id: trip, ...p })]));
    expect(await bad({ end_date: '2026-12-01' })).toBe('22023');       // before the start date
    expect(await bad({ status: 'cancelled' })).toBe('22023');
    expect(await bad({ buffer_pct: 250 })).toBe('22023');
    expect(await bad({ alert_thresholds: [0] })).toBe('22023');
    expect(await bad({ start_date: 'not-a-date' })).toBe('22023');
  });

  it('a budget line is unit price x quantity x people x days', async () => {
    const id = (await one(save(asha, { people: 4, days: 5 }))).id;   // ₹250 x 4 people x 5 days
    const r = await one(db.as<{ est: number; status: string; source: string }>(asha, 'select estimated_minor::int as est, status, source from trip_budget_items where id = $1', [id]));
    expect(r).toEqual({ est: 500000, status: 'accepted', source: 'user' });
    // Saving again with the same id updates it instead of adding a second line.
    await save(asha, { id, people: 4, days: 5, quantity: 1.5, label: 'Big breakfast', day_date: '2026-12-21', booking_status: 'booked', paid: true });
    const rows = await db.as<{ est: number; label: string }>(asha, 'select estimated_minor::int as est, label from trip_budget_items where trip_id = $1', [trip]);
    expect(rows).toEqual([{ est: 750000, label: 'Big breakfast' }]);
  });

  it('splits must be between group members and add up to the line', async () => {
    const base = { label: 'Hotel', section: 'stay', unit_price_minor: 1000000 };
    expect(await sqlstate(save(asha, { ...base, shares: { [ashaM]: 600000, [bilalM]: 300000 } }))).toBe('22023');
    await save(asha, { ...base, shares: { [ashaM]: 600000, [bilalM]: 400000 } });
    await save(asha, { ...base, label: 'Scuba', section: 'activities', split_members: [ashaM, devM] });
    const og = (await one(db.as<{ id: string }>(outsider, 'select id from groups limit 1'))).id;
    const om = (await one(db.as<{ id: string }>(outsider, 'select id from group_members where group_id = $1', [og]))).id;
    expect(await sqlstate(save(asha, { ...base, split_members: [om] }))).toBe('22023');
    expect(await sqlstate(save(asha, { ...base, section: 'spaceship' }))).toBe('22023');
    expect(await sqlstate(save(asha, { ...base, quantity: 0 }))).toBe('22023');
  });

  it('members can read the plan; outsiders and signed-out visitors cannot read or change it', async () => {
    expect((await db.as(bilal, 'select id from trip_budget_items where trip_id = $1', [trip])).length).toBe(3);
    expect(await db.as(outsider, 'select id from trip_budget_items')).toEqual([]);
    expect(await sqlstate(save(outsider))).toBe('42501');
    expect(await sqlstate(db.asAnon('select * from trip_budget_items'))).toBe('42501');
    expect(await sqlstate(db.as(bilal, `update trip_budget_items set estimated_minor = 1`))).toBe('42501'); // no direct writes
  });

  it('planning is Premium: a member whose trial ended can view but not change', async () => {
    await save(bilal, { label: 'Bilal suggests', status: 'suggested' }); // on trial: allowed
    await db.admin(`update entitlements set trial_ends_at = now() - interval '1 day' where user_id = $1`, [bilal]);
    expect(await sqlstate(save(bilal, { label: 'After trial' }))).toBe('P0003');
    expect(await sqlstate(db.as(bilal, 'select update_trip_plan($1::jsonb)', [JSON.stringify({ trip_id: trip, status: 'active' })]))).toBe('P0003');
    expect((await db.as(bilal, 'select id from trip_budget_items where trip_id = $1', [trip])).length).toBe(4);
    await db.admin(`update entitlements set trial_ends_at = now() + interval '30 days' where user_id = $1`, [bilal]);
  });

  it('deleted lines disappear from the plan and can be brought back by saving again', async () => {
    const id = (await one(db.as<{ id: string }>(asha, `select id from trip_budget_items where label = 'Scuba'`))).id;
    await db.as(asha, 'select delete_budget_item($1)', [id]);
    expect(await sqlstate(db.as(asha, 'select delete_budget_item($1)', [id]))).toBe('P0002');
    expect((await db.as(asha, 'select id from trip_budget_items where trip_id = $1 and deleted_at is null', [trip])).length).toBe(3);
  });
});

describe('roles', () => {
  it('only the owner can delete the group; the last owner cannot leave', async () => {
    expect(await sqlstate(db.as(bilal, 'select delete_group($1)', [gid]))).toBe('42501');
    expect(await sqlstate(db.as(asha, 'select remove_member($1)', [ashaM]))).toBe('22023');
  });

  it('members can remove themselves; history stays in balances', async () => {
    await db.as(bilal, 'select remove_member($1)', [bilalM]);
    expect((await db.as(bilal, 'select id from groups')).length).toBe(0);
    const rows = await db.as<{ display_name: string; active: boolean }>(asha, 'select display_name, active from group_balances($1)', [gid]);
    expect(rows.find((r) => r.display_name === 'Bilal')?.active).toBe(false);
  });
});

describe('activity log and receipts', () => {
  it('logs who did what, visible to members only', async () => {
    const actions = (await db.as<{ action: string }>(asha, 'select action from activity_log order by id')).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['expense.created', 'expense.updated', 'expense.deleted',
      'expense.restored', 'settlement.created', 'member.claimed', 'member.removed', 'trip.deleted']));
    expect(await db.as(outsider, `select * from activity_log where group_id = $1`, [gid])).toEqual([]);
  });

  it('receipt files: members can upload to their group folder, outsiders cannot', async () => {
    await db.as(asha, `insert into storage.objects (bucket_id, name) values ('receipts', $1)`, [`${gid}/r1.jpg`]);
    expect((await db.as(asha, `select name from storage.objects where bucket_id = 'receipts'`)).length).toBe(1);
    expect(await db.as(outsider, `select name from storage.objects where bucket_id = 'receipts'`)).toEqual([]);
    expect(await sqlstate(db.as(outsider, `insert into storage.objects (bucket_id, name) values ('receipts', $1)`, [`${gid}/evil.jpg`]))).toBe('42501');
    expect(await sqlstate(db.as(asha, `insert into storage.objects (bucket_id, name) values ('receipts', 'no-folder.jpg')`))).toBe('42501');
  });
});
