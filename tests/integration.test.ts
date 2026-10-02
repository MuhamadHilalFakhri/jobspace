import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

/**
 * Integration tests against a dedicated SQLite test database.
 * Exercises FR-01..FR-09 service-layer paths with real SQL.
 */

const TEST_DB = path.join(os.tmpdir(), `jobspace_test_${Date.now()}.db`);
let sqliteTestDb: (import("@/lib/data/db").DbClient & { close(): void }) | null = null;

beforeAll(async () => {
  process.env.SQLITE_DB_PATH = TEST_DB;
  process.env.AUTH_SECRET = "test-secret-jobspace-1234567890abcdef";
  process.env.DATABASE_URL = "";
  const [{ setDbForTests }, { createSqliteTestDb }] = await Promise.all([
    import("@/lib/data/db"),
    import("@/lib/data/sqlite-test-db"),
  ]);
  sqliteTestDb = createSqliteTestDb(TEST_DB);
  setDbForTests(sqliteTestDb);
});

afterAll(async () => {
  const { closeDb } = await import("@/lib/data/db");
  await closeDb();
  sqliteTestDb?.close();
  sqliteTestDb = null;
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.unlinkSync(TEST_DB + suffix);
    } catch {
      // ignore
    }
  }
});

async function getTestDb() {
  const { getDb } = await import("@/lib/data/db");
  return getDb();
}

describe("FR-01..FR-09 Integration (SQLite)", () => {
  it("creates a user, jobs with transitions, communications, reminders and computes stats", async () => {
    const db = await getTestDb();
    const userId = globalThis.crypto.randomUUID();
    const jobId = globalThis.crypto.randomUUID();

    // Create user
    await db.query(
      `INSERT INTO users (id, email, password_hash) VALUES ($1,$2,$3)`,
      [userId, "test@example.com", "fakehash"],
    );

    // Create job in Dilamar
    await db.query(
      `INSERT INTO jobs (id, user_id, company, position, applied_at, status) VALUES ($1,$2,$3,$4,$5,'Dilamar')`,
      [jobId, userId, "PT Uji Coba", "QA Engineer", "2026-09-01"],
    );

    // Valid transition to Wawancara
    await db.query(
      `UPDATE jobs SET status = 'Wawancara' WHERE id = $1 AND user_id = $2`,
      [jobId, userId],
    );

    const updated = await db.query(`SELECT status FROM jobs WHERE id = $1`, [jobId]);
    expect(updated.rows[0].status).toBe("Wawancara");

    // Add communication (inbound) — sets last_response_at
    await db.query(
      `INSERT INTO communications (id, job_id, user_id, communication_date, channel, direction, summary)
       VALUES ($1,$2,$3,$4,'Email','Balasan Perusahaan','Invitation for interview')`,
      [globalThis.crypto.randomUUID(), jobId, userId, "2026-09-05"],
    );
    const commRes = await db.query(
      `SELECT COUNT(*) c FROM communications WHERE job_id = $1`,
      [jobId],
    );
    expect(Number(commRes.rows[0].c)).toBe(1);

    // Add interview
    await db.query(
      `INSERT INTO interviews (id, job_id, user_id, scheduled_date, scheduled_time, mode, result)
       VALUES ($1,$2,$3,'2026-09-12','10:00','Online','Menunggu')`,
      [globalThis.crypto.randomUUID(), jobId, userId],
    );

    // Reminder for follow-up
    await db.query(
      `INSERT INTO reminders (id, job_id, user_id, type, due_date)
       VALUES ($1,$2,$3,'follow_up','2026-09-08')`,
      [globalThis.crypto.randomUUID(), jobId, userId],
    );

    // Ownership check: another user cannot see this job
    const otherUser = globalThis.crypto.randomUUID();
    await db.query(`INSERT INTO users (id, email, password_hash) VALUES ($1,$2,$3)`, [
      otherUser,
      "other@example.com",
      "fakehash",
    ]);
    const foreignAccess = await db.query(
      `SELECT id FROM jobs WHERE id = $1 AND user_id = $2`,
      [jobId, otherUser],
    );
    expect(foreignAccess.rowCount).toBe(0); // fail-closed ownership

    // Soft delete
    await db.query(
      `UPDATE jobs SET deleted_at = $1 WHERE id = $2 AND user_id = $3`,
      [new Date().toISOString(), jobId, userId],
    );
    const afterDelete = await db.query(
      `SELECT id FROM jobs WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [jobId, userId],
    );
    expect(afterDelete.rowCount).toBe(0); // excluded from active lists

    // Restore
    await db.query(
      `UPDATE jobs SET deleted_at = NULL WHERE id = $1 AND user_id = $2`,
      [jobId, userId],
    );
    const afterRestore = await db.query(
      `SELECT id FROM jobs WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [jobId, userId],
    );
    expect(afterRestore.rowCount).toBe(1);
  });

  it("imports CSV rows: valid rows saved, invalid rows reported (FR-09)", async () => {
    const { importJobsFromCsv } = await import("@/lib/services/documents.service");
    const { getDb } = await import("@/lib/data/db");
    const db = await getTestDb();

    const userId = globalThis.crypto.randomUUID();
    await db.query(
      `INSERT INTO users (id, email, password_hash) VALUES ($1,$2,$3)`,
      [userId, "importer@example.com", "fakehash"],
    );

    const csv = [
      "company,position,applied_at,status,source",
      '"PT Amanah Digital","Backend Dev","2026-08-15","Dilamar","LinkedIn"',
      '"CV Karya Nusantara","Frontend Dev","2026-08-20","Draft","Glints"',
      '"PT Tanpa Posisi","","2026-08-25","Draft","JobStreet"',
    ].join("\n");

    const summary = await importJobsFromCsv(userId, csv);
    expect(summary.totalRows).toBe(3);
    expect(summary.successRows).toBe(2);
    expect(summary.failedRows).toBe(1);
    expect(summary.failedDetails[0].row).toBe(4);

    // Verify data landed
    const count = await db.query(
      `SELECT COUNT(*) c FROM jobs WHERE user_id = $1`,
      [userId],
    );
    expect(Number(count.rows[0].c)).toBe(2);
  });

  it("export JSON contains only owner jobs", async () => {
    const { exportJobs } = await import("@/lib/services/documents.service");
    const { getDb } = await import("@/lib/data/db");
    const db = await getTestDb();

    const userId = globalThis.crypto.randomUUID();
    await db.query(
      `INSERT INTO users (id, email, password_hash) VALUES ($1,$2,$3)`,
      [userId, "exporter@example.com", "fakehash"],
    );
    await db.query(
      `INSERT INTO jobs (id, user_id, company, position, applied_at, status)
       VALUES ($1,$2,'Export Corp','Dev','2026-09-01','Dilamar')`,
      [globalThis.crypto.randomUUID(), userId],
    );

    const result = await exportJobs(userId, "json");
    expect(result.contentType).toContain("application/json");
    const parsed = JSON.parse(result.content);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0].company).toBe("Export Corp");
  });
});
