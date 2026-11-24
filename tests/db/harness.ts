/**
 * Runs the real supabase/migrations/*.sql in an in-memory PostgreSQL (PGlite)
 * with a minimal stand-in for Supabase's auth schema, so RLS, roles and RPCs
 * can be tested exactly as they will run on Supabase. No network, no real data.
 */
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text unique, raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
grant usage on schema public to authenticated, anon;
`;

export class Db {
  constructor(public pg: PGlite) {}

  /** Create an auth user (like Supabase sign-up) and return its id. */
  async createUser(name: string, lang = 'mr'): Promise<string> {
    const id = randomUUID();
    await this.asAdmin();
    await this.pg.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
      id, `${name.toLowerCase().replace(/\W+/g, '')}.${id.slice(0, 6)}@test.local`, JSON.stringify({ full_name: name, preferred_language: lang }),
    ]);
    return id;
  }

  async asUser(userId: string | null) {
    await this.pg.exec(`reset role`);
    await this.pg.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? '']);
    await this.pg.exec(`set role ${userId ? 'authenticated' : 'anon'}`);
  }

  async asAdmin() {
    await this.pg.exec(`reset role`);
    await this.pg.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }

  /** Call an RPC with named arguments, as supabase.rpc() does. Returns the JSON result. */
  async rpc<T = any>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const names = Object.keys(args);
    const params = names.map((n) => {
      const v = args[n];
      return v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v;
    });
    const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`;
    const res = await this.pg.query<{ r: T }>(sql, params);
    return res.rows[0]?.r as T;
  }

  /** Expect an RPC to fail; returns the error message. */
  async rpcError(fn: string, args: Record<string, unknown> = {}): Promise<string> {
    try {
      await this.rpc(fn, args);
    } catch (e) {
      return (e as Error).message;
    }
    throw new Error(`expected ${fn} to fail`);
  }

  async rows<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.pg.query<T>(sql, params)).rows;
  }

  async one<T = any>(sql: string, params: unknown[] = []): Promise<T> {
    return (await this.rows<T>(sql, params))[0];
  }
}

let template: Uint8Array | null = null;

/** Fresh database with all migrations applied (schema built once, then cloned). */
export async function freshDb(): Promise<Db> {
  if (!template) {
    const pg = new PGlite();
    await pg.exec(SUPABASE_STUB);
    const dir = path.join(root, 'supabase/migrations');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
      try {
        await pg.exec(readFileSync(path.join(dir, f), 'utf8'));
      } catch (e) {
        throw new Error(`Migration ${f} failed: ${(e as Error).message}`);
      }
    }
    const dump = await pg.dumpDataDir('none');
    template = new Uint8Array(await (dump as Blob).arrayBuffer());
    await pg.close();
  }
  const pg = new PGlite({ loadDataDir: new Blob([template]) });
  await pg.waitReady;
  return new Db(pg);
}

export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
export const daysAgo = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() - n * 864e5));
