/// <reference types="node" />
// Spins up an in-memory Postgres (PGlite) with Supabase stand-ins and every
// migration applied, plus helpers to act as a given user.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

export interface TestDb {
  pg: PGlite;
  /** Create an auth user (fires the profile trigger) and return its id. */
  createUser(name: string): Promise<string>;
  /** Run SQL as a signed-in user (role authenticated). */
  as<T = Record<string, unknown>>(userId: string, sql: string, params?: unknown[]): Promise<T[]>;
  /** Run SQL as a signed-out visitor (role anon). */
  asAnon<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Run SQL as the database owner (like the Supabase SQL editor). */
  admin<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export async function createTestDb(): Promise<TestDb> {
  const pg = await PGlite.create({ extensions: { pgcrypto } });
  await pg.exec(readFileSync(join(ROOT, 'tests', 'supabase-stubs.sql'), 'utf8'));
  const dir = join(ROOT, 'migrations');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await pg.exec(readFileSync(join(dir, file), 'utf8'));
    } catch (e) {
      throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
    }
  }

  // Each call runs in its own transaction so deferred checks fire at the end,
  // exactly like one PostgREST request.
  async function run<T>(role: string | null, sub: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
    return pg.transaction(async (tx) => {
      if (role) {
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub ?? '']);
        await tx.exec(`set local role ${role}`);
      }
      const res = await tx.query<T>(sql, params);
      return res.rows;
    });
  }

  return {
    pg,
    async createUser(name) {
      const rows = await run<{ id: string }>(null, null,
        `insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
        [`${name.toLowerCase()}@example.test`, name]);
      return rows[0]!.id;
    },
    as: (userId, sql, params) => run('authenticated', userId, sql, params),
    asAnon: (sql, params) => run('anon', null, sql, params),
    admin: (sql, params) => run(null, null, sql, params),
  };
}

/** Postgres error SQLSTATE from a rejected promise. */
export async function sqlstate(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as { code?: string }).code ?? 'unknown';
  }
  return 'no error';
}
