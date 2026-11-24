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
