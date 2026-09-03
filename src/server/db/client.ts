import { Pool, type PoolClient } from "pg";

/**
 * The database.
 *
 * One controlled entry point to Postgres, replacing the Supabase SDK. Every
 * read and write in FOLDMARK goes through here, so there is exactly one place
 * that knows a connection string exists.
 *
 * The driver is plain `pg` rather than a vendor SDK, deliberately. FOLDMARK
 * needs Postgres, not a hosting product: the same code has to work against
 * Neon in production, a local Postgres in development, and a throwaway database
 * in a test. A driver that only speaks to one provider's proxy would make the
 * database a dependency on that provider all over again, which is the thing
 * this migration exists to undo.
 *
 * Connections are pooled and the pool is small. A free tier's connection
 * ceiling is a shared resource, and one process holding twenty idle connections
 * is how the next process gets refused. Use the provider's POOLED connection
 * string on serverless, where functions are frozen between requests.
 *
 * Absent configuration is a state, not a crash. With no DATABASE_URL every
 * caller gets null and renders UNAVAILABLE — the same contract the Supabase
 * layer had, and what lets CI build a fresh clone with no secrets at all.
 *
 * DATABASE_URL is server-only. It is never read from a NEXT_PUBLIC_ variable,
 * so it cannot reach a browser bundle; the browser calls the FOLDMARK API and
 * the API queries on its behalf.
 */

function connectionString(): string | null {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? null;
  return url && url.trim() ? url.trim() : null;
}

/** Whether this deployment has a database at all. */
export function isDatabaseConfigured(): boolean {
  return connectionString() !== null;
}

export type Row = Record<string, unknown>;

/**
 * A tagged-template query.
 *
 * Values interpolated into the template become BOUND PARAMETERS — they are
 * never spliced into the statement text. That is the entire reason this is the
 * only sanctioned way to query: there is no code path here that can build SQL
 * by concatenating a caller's value, so injection is not a mistake this
 * codebase is able to make.
 */
export type SqlClient = <T = Row>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T[]>;

let cachedPool: Pool | null = null;
let cachedFor: string | null = null;

function getPool(): Pool | null {
  const url = connectionString();
  if (!url) return null;

  if (!cachedPool || cachedFor !== url) {
    cachedPool = new Pool({
      connectionString: url,
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      // Hosted Postgres terminates TLS at a proxy whose certificate does not
      // match the connection host. Verification is therefore relaxed only when
      // the URL itself asks for SSL; a plain local connection stays plain.
      ssl: /sslmode=(require|prefer)/.test(url) ? { rejectUnauthorized: false } : undefined,
    });

    // An idle client erroring must not take the process down. The pool discards
    // it and the next query gets a fresh connection.
    cachedPool.on("error", () => {});
    cachedFor = url;
  }
  return cachedPool;
}

/**
 * Turn a tagged template into a parameterised statement.
 *
 * Exported so the property that matters can be asserted directly in a test:
 * every interpolated value becomes a numbered placeholder and travels in the
 * params array, so no caller value ever reaches the statement text. A test that
 * feeds this a hostile string and finds it absent from the SQL is worth more
 * than a comment promising the same thing.
 */
export function buildQuery(
  strings: TemplateStringsArray | readonly string[],
  values: readonly unknown[],
): { text: string; params: unknown[] } {
  let text = "";
  for (let i = 0; i < strings.length; i += 1) {
    text += strings[i];
    if (i < values.length) text += `$${i + 1}`;
  }
  return { text, params: [...values] };
}

let cachedSql: SqlClient | null = null;

export function db(): SqlClient | null {
  const p = getPool();
  if (!p) return null;
  if (!cachedSql) {
    cachedSql = async <T = Row>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => {
      const { text, params } = buildQuery(strings, values);
      const res = await p.query(text, params);
      return res.rows as T[];
    };
  }
  return cachedSql;
}

/** The pool itself, for the long-running runner and for transactions. */
export function pool(): Pool | null {
  return getPool();
}

/** Parameterised query inside a transaction. Values are bound, never inlined. */
export type TxQuery = (text: string, params?: readonly unknown[]) => Promise<Row[]>;

/**
 * Run a function inside a real transaction.
 *
 * For sequences that must not be half-applied: writing an observation, choosing
 * the canonical price from it, and publishing the market state are one fact
 * about one moment. Committing part of that would leave a canonical price
 * pointing at an observation that was rolled back, or a market state describing
 * a selection that never happened.
 *
 * Returns null when there is no database, so callers degrade rather than throw.
 */
export async function transaction<T>(fn: (q: TxQuery) => Promise<T>): Promise<T | null> {
  const p = getPool();
  if (!p) return null;

  const client: PoolClient = await p.connect();
  try {
    await client.query("begin");
    const query: TxQuery = async (text, params) => {
      const res = await client.query(text, params as unknown[]);
      return res.rows as Row[];
    };
    const result = await fn(query);
    await client.query("commit");
    return result;
  } catch (error) {
    // A failed transaction leaves nothing behind. The rollback is attempted
    // separately so that a rollback failure cannot mask the original error.
    try {
      await client.query("rollback");
    } catch {
      /* the connection is being discarded anyway */
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run a parameterised statement outside a transaction.
 *
 * The escape hatch for statements a tagged template cannot express — a
 * generated multi-row VALUES list, a dynamic column set. `text` must be a
 * literal the code owns; only `params` may carry caller data.
 */
export async function query<T = Row>(text: string, params: readonly unknown[] = []): Promise<T[] | null> {
  const p = getPool();
  if (!p) return null;
  const res = await p.query(text, params as unknown[]);
  return res.rows as T[];
}

/**
 * Health probe for the status surfaces.
 *
 * Distinguishes "no database configured" from "configured and unreachable",
 * because those are different problems and a reader deserves to know which one
 * they are looking at.
 */
export async function databaseHealth(): Promise<{
  state: "OK" | "UNREACHABLE" | "NOT_CONFIGURED";
  detail: string | null;
  latencyMs: number | null;
}> {
  const sql = db();
  if (!sql) return { state: "NOT_CONFIGURED", detail: "DATABASE_URL is not set for this deployment", latencyMs: null };

  const started = Date.now();
  try {
    await sql`select 1`;
    return { state: "OK", detail: null, latencyMs: Date.now() - started };
  } catch (error) {
    return {
      state: "UNREACHABLE",
      detail: error instanceof Error ? error.message.slice(0, 200) : "unknown error",
      latencyMs: Date.now() - started,
    };
  }
}
