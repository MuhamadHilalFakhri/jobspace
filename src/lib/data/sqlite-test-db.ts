/** Test-only SQLite adapter. Never import this module from application code. */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { DbClient, QueryResult } from "./db";
import { recordDatabaseQuery } from "../server-metrics";

function normalizeSqlForSqlite(sql: string): string {
  return sql.replace(/\$(\d+)/g, "?$1");
}

export function createSqliteTestDb(dbPath: string): DbClient & { close(): void } {
  const resolvedPath = path.resolve(dbPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

  const database = new Database(resolvedPath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  const hasUsersTable = database
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
    .get();
  if (!hasUsersTable) {
    const schemaPath = path.resolve(process.cwd(), "db/schema.sqlite.sql");
    if (!fs.existsSync(schemaPath)) {
      database.close();
      throw new Error("db/schema.sqlite.sql tidak ditemukan untuk integration test.");
    }
    database.exec(fs.readFileSync(schemaPath, "utf8"));
  }

  return new SqliteTestClient(database);
}

class SqliteTestClient implements DbClient {
  constructor(private readonly database: Database.Database) {}

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    const sqliteSql = normalizeSqlForSqlite(sql);
    const trimmed = sqliteSql.trim();
    const returnsRows =
      trimmed.startsWith("SELECT") ||
      trimmed.startsWith("WITH") ||
      trimmed.includes(" RETURNING ");
    const normalizedParams = params.map((value) => {
      if (value === undefined) return null;
      if (value instanceof Date) return value.toISOString();
      if (value instanceof Uint8Array) return value;
      if (value !== null && typeof value === "object") return JSON.stringify(value);
      return value;
    });
    const bindings = Object.fromEntries(
      normalizedParams.map((value, index) => [String(index + 1), value]),
    );

    const startedAt = performance.now();
    try {
      const statement = this.database.prepare(sqliteSql);
      if (returnsRows) {
        const rows = statement.all(bindings) as T[];
        return { rows, rowCount: rows.length };
      }
      const result = statement.run(bindings);
      return { rows: [] as T[], rowCount: result.changes };
    } catch (error) {
      const detail = error as { code?: string; name?: string };
      console.error("[sqlite query failed]", {
        code: detail.code,
        name: detail.name ?? "Error",
      });
      throw error;
    } finally {
      recordDatabaseQuery(performance.now() - startedAt);
    }
  }

  async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
    this.database.prepare("BEGIN IMMEDIATE").run();
    try {
      const result = await fn(this);
      this.database.prepare("COMMIT").run();
      return result;
    } catch (error) {
      try {
        this.database.prepare("ROLLBACK").run();
      } catch {
        // Preserve the original transaction error.
      }
      throw error;
    }
  }

  isPostgres(): boolean {
    return false;
  }

  close(): void {
    this.database.close();
  }
}
