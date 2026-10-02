#!/usr/bin/env node
/**
 * Applies the PostgreSQL/Neon schema and ordered SQL migrations.
 * Set DATABASE_URL_UNPOOLED to the direct Neon connection string before running.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv(path.join(root, ".env.local"));

const rawUrl = process.env.DATABASE_URL_UNPOOLED?.trim();
if (!rawUrl || !/^postgres(?:ql)?:\/\//i.test(rawUrl)) {
  throw new Error("DATABASE_URL_UNPOOLED (koneksi direct Neon) wajib diatur sebelum migrasi.");
}

const connectionUrl = new URL(rawUrl);
if (connectionUrl.hostname.includes("-pooler.")) {
  throw new Error("Migrasi Neon harus memakai DATABASE_URL_UNPOOLED tanpa hostname -pooler.");
}
for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) {
  connectionUrl.searchParams.delete(key);
}

const { Pool } = await import("pg");
const pool = new Pool({
  connectionString: connectionUrl.toString(),
  ssl: { rejectUnauthorized: true },
  max: 2,
});
const client = await pool.connect();

try {
  await client.query("BEGIN");
  await client.query(fs.readFileSync(path.join(root, "db/schema.sql"), "utf8"));
  const migrationTableSql = [
    "CREATE TABLE IF NOT EXISTS schema_migrations (",
    "version text PRIMARY KEY,",
    "applied_at timestamptz NOT NULL DEFAULT now()",
    ")",
  ].join("\n");
  await client.query(migrationTableSql);
  // Existing installations predate migration tracking; schema.sql is the
  // idempotent baseline, and numbered migrations upgrade it from there.
  await client.query(
    "INSERT INTO schema_migrations (version) VALUES ('000_baseline') ON CONFLICT (version) DO NOTHING",
  );

  const migrationDir = path.join(root, "db/migrations");
  const migrations = fs.existsSync(migrationDir)
    ? fs.readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort()
    : [];

  for (const filename of migrations) {
    const version = filename.slice(0, -4);
    const applied = await client.query(
      "SELECT 1 FROM schema_migrations WHERE version = $1",
      [version],
    );
    if (applied.rowCount) continue;

    await client.query(fs.readFileSync(path.join(migrationDir, filename), "utf8"));
    await client.query(
      "INSERT INTO schema_migrations (version) VALUES ($1)",
      [version],
    );
  }

  await client.query("COMMIT");
  console.log("Neon schema and migrations are up to date.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}

/** Minimal .env.local loader (no dotenv dependency). */
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line);
    if (!match) continue;
    const key = match[1];
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
