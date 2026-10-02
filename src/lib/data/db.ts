/**
 * Neon/PostgreSQL database access. SQLite is isolated in a test-only adapter.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Client, Pool, type PoolClient } from "pg";
import {
  recordDatabaseConnectionWait,
  recordDatabaseQuery,
} from "../server-metrics";

export type QueryResult<T = Record<string, unknown>> = {
  rows: T[];
  rowCount: number;
};

export interface DbClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
  transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T>;
  isPostgres(): boolean;
}

type DbRuntimeState = {
  client: DbClient | null;
  pgPool: Pool | null;
};

const globalForDb = globalThis as typeof globalThis & {
  __jobspaceDbRuntime?: DbRuntimeState;
};
const runtime = globalForDb.__jobspaceDbRuntime ??= {
  client: null,
  pgPool: null,
};

function normalizeParams(params: unknown[]): unknown[] {
  return params.map((value) => (value === undefined ? null : value));
}

class PgClient implements DbClient {
  constructor(private readonly pool: Pool) {}

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    const startedAt = performance.now();
    try {
      const result = await this.pool.query(sql, normalizeParams(params));
      return {
        rows: result.rows as T[],
        rowCount: result.rowCount ?? result.rows.length,
      };
    } finally {
      recordPgQuery(sql, startedAt, this.pool);
    }
  }

  async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
    const acquireStartedAt = performance.now();
    const client = await this.pool.connect();
    const acquireDurationMs = performance.now() - acquireStartedAt;
    recordDatabaseConnectionWait(acquireDurationMs);
    if (acquireDurationMs >= 500) {
      console.warn("[db:pool-wait]", {
        durationMs: Math.round(acquireDurationMs),
        total: this.pool.totalCount,
        idle: this.pool.idleCount,
        waiting: this.pool.waitingCount,
      });
    }

    try {
      await runTrackedPgQuery(client, "BEGIN", this.pool);
      const result = await fn(createPoolTransactionClient(client, this.pool));
      await runTrackedPgQuery(client, "COMMIT", this.pool);
      return result;
    } catch (error) {
      try {
        await runTrackedPgQuery(client, "ROLLBACK", this.pool);
      } catch {
        // Keep the original transaction error.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  isPostgres(): boolean {
    return true;
  }
}

/**
 * Hyperdrive owns the long-lived database connection pool. A short-lived pg
 * Client per operation avoids retaining sockets or request-specific bindings
 * in a Worker isolate between requests.
 */
class HyperdriveDbClient implements DbClient {
  constructor(private readonly connectionString: string) {}

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    const client = new Client({ connectionString: this.connectionString });
    const connectStartedAt = performance.now();
    let connected = false;
    try {
      await client.connect();
      connected = true;
      recordDatabaseConnectionWait(performance.now() - connectStartedAt);
      const startedAt = performance.now();
      try {
        const result = await client.query(sql, normalizeParams(params));
        return {
          rows: result.rows as T[],
          rowCount: result.rowCount ?? result.rows.length,
        };
      } finally {
        recordHyperdriveQuery(sql, startedAt);
      }
    } finally {
      if (connected) await client.end();
    }
  }

  async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
    const client = new Client({ connectionString: this.connectionString });
    const connectStartedAt = performance.now();
    let connected = false;
    try {
      await client.connect();
      connected = true;
      recordDatabaseConnectionWait(performance.now() - connectStartedAt);
      await runTrackedHyperdriveQuery(client, "BEGIN");
      const result = await fn(createHyperdriveTransactionClient(client));
      await runTrackedHyperdriveQuery(client, "COMMIT");
      return result;
    } catch (error) {
      if (connected) {
        try {
          await runTrackedHyperdriveQuery(client, "ROLLBACK");
        } catch {
          // Keep the original transaction error.
        }
      }
      throw error;
    } finally {
      if (connected) await client.end();
    }
  }

  isPostgres(): boolean {
    return true;
  }
}

function createPoolTransactionClient(client: PoolClient, pool: Pool): DbClient {
  return {
    async query<T = Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ): Promise<QueryResult<T>> {
      const startedAt = performance.now();
      try {
        const result = await client.query(sql, normalizeParams(params));
        return {
          rows: result.rows as T[],
          rowCount: result.rowCount ?? result.rows.length,
        };
      } finally {
        recordPgQuery(sql, startedAt, pool);
      }
    },
    async transaction() {
      throw new Error("Nested transactions are not supported");
    },
    isPostgres: () => true,
  };
}

function createHyperdriveTransactionClient(client: Client): DbClient {
  return {
    async query<T = Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ): Promise<QueryResult<T>> {
      const startedAt = performance.now();
      try {
        const result = await client.query(sql, normalizeParams(params));
        return {
          rows: result.rows as T[],
          rowCount: result.rowCount ?? result.rows.length,
        };
      } finally {
        recordHyperdriveQuery(sql, startedAt);
      }
    },
    async transaction() {
      throw new Error("Nested transactions are not supported");
    },
    isPostgres: () => true,
  };
}

function getHyperdriveConnectionString(): string | null {
  try {
    const connectionString = getCloudflareContext({ async: false }).env.HYPERDRIVE
      ?.connectionString;
    return connectionString?.trim() || null;
  } catch {
    // `next dev`, tests, and one-off scripts run outside the Workers context.
    return null;
  }
}

export function getDb(): DbClient {
  const hyperdriveConnectionString = getHyperdriveConnectionString();
  if (hyperdriveConnectionString) {
    return new HyperdriveDbClient(hyperdriveConnectionString);
  }

  if (runtime.client) return runtime.client;

  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    if (!/^postgres(?:ql)?:\/\//i.test(url)) {
      throw new Error("DATABASE_URL harus berupa connection string PostgreSQL Neon.");
    }
    if (!runtime.pgPool) {
      const connectionUrl = new URL(url);
      // node-postgres lets URL SSL options replace the explicit ssl object.
      // Use the platform trust store and keep certificate verification enabled.
      for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) {
        connectionUrl.searchParams.delete(key);
      }
      runtime.pgPool = new Pool({
        connectionString: connectionUrl.toString(),
        ssl: { rejectUnauthorized: true },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        keepAlive: true,
      });
      runtime.pgPool.on("error", (error: Error & { code?: string }) => {
        console.error("[db:pool-error]", {
          code: error.code,
          name: error.name ?? "Error",
        });
      });
    }
    runtime.client = new PgClient(runtime.pgPool);
    return runtime.client;
  }

  throw new Error(
    "DATABASE_URL Neon wajib diatur. SQLite hanya tersedia untuk integration test.",
  );
}

/** Injected by integration tests only; production code must use Neon. */
export function setDbForTests(client: DbClient): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("setDbForTests hanya boleh digunakan saat test.");
  }
  runtime.client = client;
}

export async function closeDb(): Promise<void> {
  if (runtime.pgPool) {
    await runtime.pgPool.end();
    runtime.pgPool = null;
  }
  runtime.client = null;
}

function describeQuery(sql: string) {
  const operation = /^\s*(WITH|SELECT|INSERT|UPDATE|DELETE)/i.exec(sql)?.[1]?.toUpperCase() ?? "QUERY";
  const tables = [...sql.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+([a-z_][a-z0-9_.]*)/gi)]
    .map((match) => match[1])
    .filter((table, index, all) => all.indexOf(table) === index)
    .slice(0, 5);
  return { operation, tables };
}

async function runTrackedPgQuery(client: PoolClient, sql: string, pool: Pool) {
  const startedAt = performance.now();
  try {
    return await client.query(sql);
  } finally {
    recordPgQuery(sql, startedAt, pool);
  }
}

async function runTrackedHyperdriveQuery(client: Client, sql: string) {
  const startedAt = performance.now();
  try {
    return await client.query(sql);
  } finally {
    recordHyperdriveQuery(sql, startedAt);
  }
}

function recordPgQuery(sql: string, startedAt: number, pool: Pool) {
  const durationMs = performance.now() - startedAt;
  recordDatabaseQuery(durationMs);
  if (durationMs < 500) return;

  console.warn("[db:slow-query]", {
    durationMs: Math.round(durationMs),
    ...describeQuery(sql),
    pool: {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    },
  });
}

function recordHyperdriveQuery(sql: string, startedAt: number) {
  const durationMs = performance.now() - startedAt;
  recordDatabaseQuery(durationMs);
  if (durationMs >= 500) {
    console.warn("[db:slow-query]", {
      durationMs: Math.round(durationMs),
      ...describeQuery(sql),
      transport: "hyperdrive",
    });
  }
}
