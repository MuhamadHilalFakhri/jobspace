#!/usr/bin/env node
/**
 * Seeds realistic demo data into Neon only when explicitly enabled.
 * Requires ALLOW_DEMO_SEED=true, SEED_USER_EMAIL, and SEED_USER_PASSWORD.
 * - Populates companies, applications in each pipeline stage, communications,
 *   interviews, reminders, documents metadata, tasks, templates, and pages.
 * Existing users and data are never overwritten or deleted.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv(path.join(root, ".env.local"));

const { getDb, closeDb } = await import("../src/lib/data/db.ts");
const { hashPassword } = await import("../src/lib/auth.ts");

if (process.env.NODE_ENV === "production" || process.env.ALLOW_DEMO_SEED !== "true") {
  throw new Error("Seed demo dinonaktifkan. Set ALLOW_DEMO_SEED=true hanya untuk data uji.");
}
const DEMO_EMAIL = process.env.SEED_USER_EMAIL?.trim().toLowerCase();
const DEMO_PASS = process.env.SEED_USER_PASSWORD;
if (!DEMO_EMAIL || !DEMO_PASS || DEMO_PASS.length < 16) {
  throw new Error("Set SEED_USER_EMAIL dan SEED_USER_PASSWORD minimal 16 karakter.");
}

const db = getDb();
console.log(`Seeding demo data into ${db.isPostgres() ? "PostgreSQL" : "SQLite"}...`);


try {
  // 1. Ensure user
  const existingUser = await db.query(
    "SELECT id FROM users WHERE email = $1",
    [DEMO_EMAIL],
  );

  let userId;
  const passwordHash = await hashPassword(DEMO_PASS);

  if (existingUser.rowCount > 0) {
    throw new Error("Akun seed sudah ada; seed menolak menghapus atau menimpa data.");
  } else {
    userId = globalThis.crypto.randomUUID();
    await db.query(
      `INSERT INTO users (id, email, password_hash, name, workspace_name)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, DEMO_EMAIL, passwordHash, "Hilal Fakhri", "Hilal's Job Space"],
    );
  }

  // 2. Companies
  const companies = [
    {
      name: "PT Example Technology",
      industry: "Financial Technology",
      website: "https://example-tech.id",
      location: "Jakarta Selatan, DKI Jakarta",
      notes: "Fintech unicorn, stack Go + React/Next.js",
    },
    {
      name: "Example Labs",
      industry: "Software & AI Solutions",
      website: "https://examplelabs.co",
      location: "Bandung, Jawa Barat",
      notes: "R&D lab fokus pada automasi & AI",
    },
    {
      name: "Digital Agency Nusantara",
      industry: "Digital Marketing & Tech",
      website: "https://danusantara.id",
      location: "Yogyakarta, DIY",
      notes: "Agency klien enterprise",
    },
    {
      name: "PT Mega Logistik Cipta",
      industry: "Logistics & Supply Chain",
      website: "https://megalogistik.example.id",
      location: "Jakarta Pusat, DKI Jakarta",
      notes: "Perusahaan logistik nasional modernisasi sistem",
    },
  ];

  const companyMap = new Map();
  for (const c of companies) {
    const id = globalThis.crypto.randomUUID();
    await db.query(
      `INSERT INTO companies (id, user_id, name, industry, website, location, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, userId, c.name, c.industry, c.website, c.location, c.notes],
    );
    companyMap.set(c.name, id);
  }

  // Helper date generators
  const now = new Date();
  const daysAgo = (n) => {
    const d = new Date(now.getTime() - n * 86_400_000);
    return d.toISOString().slice(0, 10);
  };
  const daysAhead = (n) => {
    const d = new Date(now.getTime() + n * 86_400_000);
    return d.toISOString().slice(0, 10);
  };

  // 3. Jobs across diverse statuses
  const demoJobs = [
    {
      company: "PT Example Technology",
      position: "Full Stack Developer",
      source: "LinkedIn",
      appliedAt: daysAgo(3),
      deadline: daysAhead(14),
      status: "Dilamar",
      priority: "Tinggi",
      location: "Hybrid — Jakarta Selatan",
      workType: "Full-time",
      salaryRange: "Rp 15.000.000 - Rp 22.000.000",
      notes: "Melamar via referral alumni. CV Full Stack v1.",
      techStack: ["Next.js", "TypeScript", "Node.js", "PostgreSQL"],
    },
    {
      company: "Example Labs",
      position: "Backend Developer",
      source: "JobStreet",
      appliedAt: daysAgo(12), // > 7 days ago, will qualify for follow-up
      deadline: daysAhead(5),
      status: "Perlu Follow-up",
      priority: "Tinggi",
      location: "Remote (Indonesia)",
      workType: "Full-time",
      salaryRange: "Rp 18.000.000 - Rp 25.000.000",
      notes: "Sudah 12 hari belum ada balasan HR. Siapkan email follow-up santun.",
      techStack: ["Go", "Gin", "PostgreSQL", "Docker", "Redis"],
    },
    {
      company: "Digital Agency Nusantara",
      position: "Senior Frontend Engineer",
      source: "Glints",
      appliedAt: daysAgo(20),
      deadline: null,
      status: "Wawancara",
      priority: "Sedang",
      location: "Yogyakarta (Onsite)",
      workType: "Full-time",
      salaryRange: "Rp 12.000.000 - Rp 17.000.000",
      notes: "Tahap 2 wawancara teknis arsitektur React.",
      techStack: ["React", "TypeScript", "Tailwind CSS", "GraphQL"],
    },
    {
      company: "PT Mega Logistik Cipta",
      position: "Software Engineer",
      source: "Career Page",
      appliedAt: daysAgo(1),
      deadline: daysAhead(21),
      status: "Draft",
      priority: "Sedang",
      location: "Jakarta Pusat",
      workType: "Full-time",
      salaryRange: "Rp 14.000.000 - Rp 18.000.000",
      notes: "Sedang menyempurnakan surat lamaran.",
      techStack: ["Node.js", "Express", "MySQL"],
    },
    {
      company: "PT Example Technology",
      position: "Lead Web Developer",
      source: "Headhunter",
      appliedAt: daysAgo(40),
      deadline: null,
      status: "Penawaran",
      priority: "Tinggi",
      location: "Jakarta Selatan",
      workType: "Full-time",
      salaryRange: "Rp 28.000.000 - Rp 35.000.000",
      notes: "Offering letter diterima. Negosiasi benefit asuransi.",
      techStack: ["Next.js", "PostgreSQL", "AWS"],
    },
  ];

  const jobMap = new Map();
  for (const j of demoJobs) {
    const jobId = globalThis.crypto.randomUUID();
    const companyId = companyMap.get(j.company) || null;
    const isPg = db.isPostgres();

    await db.query(
      isPg
        ? `INSERT INTO jobs (id, user_id, company_id, company, position, source, applied_at, deadline, status, priority, location, work_type, salary_range, notes, tech_stack)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::text[])`
        : `INSERT INTO jobs (id, user_id, company_id, company, position, source, applied_at, deadline, status, priority, location, work_type, salary_range, notes, tech_stack)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        jobId,
        userId,
        companyId,
        j.company,
        j.position,
        j.source,
        j.appliedAt,
        j.deadline,
        j.status,
        j.priority,
        j.location,
        j.workType,
        j.salaryRange,
        j.notes,
        isPg ? j.techStack : JSON.stringify(j.techStack),
      ],
    );

    // Initial status history
    await db.query(
      `INSERT INTO status_histories (id, job_id, from_status, to_status, source, changed_at)
       VALUES ($1, $2, NULL, $3, 'pengguna', $4)`,
      [globalThis.crypto.randomUUID(), jobId, j.status, `${j.appliedAt}T09:00:00Z`],
    );

    jobMap.set(`${j.company}_${j.position}`, jobId);
  }

  // 4. Communications for the interview job
  const danJobId = jobMap.get("Digital Agency Nusantara_Senior Frontend Engineer");
  if (danJobId) {
    await db.query(
      `INSERT INTO communications (id, job_id, user_id, communication_date, channel, direction, summary, recruiter_contact)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        globalThis.crypto.randomUUID(),
        danJobId,
        userId,
        daysAgo(15),
        "Email",
        "Masuk",
        "Undangan screening awal oleh Recruiter (Sarah)",
        "Sarah (sarah.recruiter@danusantara.id / 0812-3456-7890)",
      ],
    );

    await db.query(
      `INSERT INTO communications (id, job_id, user_id, communication_date, channel, direction, summary, recruiter_contact)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        globalThis.crypto.randomUUID(),
        danJobId,
        userId,
        daysAgo(14),
        "WhatsApp",
        "Keluar",
        "Konfirmasi ketersediaan jadwal wawancara teknis",
        "Sarah - HR Recruiter",
      ],
    );

    // Schedule interview
    await db.query(
      `INSERT INTO interviews (id, job_id, user_id, scheduled_date, scheduled_time, mode, location_or_link, interviewer, result, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        globalThis.crypto.randomUUID(),
        danJobId,
        userId,
        daysAhead(2),
        "10:00",
        "Online",
        "https://meet.google.com/abc-defg-hij",
        "Bpk. Rian (Lead Frontend) & Sarah",
        "Menunggu",
        "Persiapan: state management, SSR, Tailwind CSS best practice.",
      ],
    );
  }

  // 5. Reminders
  const elJobId = jobMap.get("Example Labs_Backend Developer");
  if (elJobId) {
    await db.query(
      `INSERT INTO reminders (id, job_id, user_id, type, due_date)
       VALUES ($1,$2,$3,'follow_up',$4)`,
      [globalThis.crypto.randomUUID(), elJobId, userId, daysAgo(5)],
    );
  }

  // 6. Templates
  await db.query(
    `INSERT INTO templates (id, user_id, name, type, content)
     VALUES ($1,$2,$3,$4,$5)`,
    [
      globalThis.crypto.randomUUID(),
      userId,
      "Follow-up Status Lamaran (Sopan)",
      "email",
      `Yth. Tim Rekrutmen {{company}},

Semoga Bapak/Ibu dalam keadaan sehat.

Melalui email ini, saya ingin menindaklanjuti lamaran saya untuk posisi {{position}} yang telah saya kirimkan pada tanggal {{applied_at}}.

Saya sangat tertarik untuk bergabung dan berkontribusi di {{company}}. Apabila ada dokumen atau informasi tambahan yang diperlukan, saya dengan senang hati menyediakannya.

Terima kasih atas waktu dan perhatian Bapak/Ibu.

Salam hangat,
{{my_name}}`,
    ],
  );

  await db.query(
    `INSERT INTO templates (id, user_id, name, type, content)
     VALUES ($1,$2,$3,$4,$5)`,
    [
      globalThis.crypto.randomUUID(),
      userId,
      "Surat Lamaran Singkat & Terarah",
      "surat",
      `Hal: Lamaran Pekerjaan — {{position}}

Yth. HR Manager {{company}},

Perkenalkan, nama saya {{my_name}}. Saya seorang Full-Stack Developer dengan pengalaman dalam membangun aplikasi web modern menggunakan Next.js, React, Node.js, dan database relasional.

Saya antusias melamar posisi {{position}} di {{company}} karena dedikasi perusahaan terhadap inovasi produk. Dengan pengalaman saya mengoptimalkan alur kerja digital dan menjaga standar kode yang bersih, saya yakin dapat memberi dampak positif langsung bagi tim.

Terlampir resume lengkap saya untuk bahan pertimbangan. Terima kasih atas kesempatan yang diberikan.

Hormat saya,
{{my_name}}`,
    ],
  );

  // 7. Opportunities
  await db.query(
    `INSERT INTO opportunities (id, user_id, position, company, source, location, salary_range, deadline, notes, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      globalThis.crypto.randomUUID(),
      userId,
      "Cloud & Platform Engineer",
      "Nusantara Cloud Tech",
      "Glints",
      "Jakarta (Remote)",
      "Rp 20.000.000+",
      daysAhead(20),
      "Butuh pengalaman Kubernetes & Terraform. Perlu ulas CV sebelum melamar.",
      "Interested",
    ],
  );

  // 8. Custom Workspace Page (Notion-style)
  const pageId = globalThis.crypto.randomUUID();
  await db.query(
    `INSERT INTO pages (id, user_id, title, icon, section)
     VALUES ($1,$2,$3,$4,$5)`,
    [pageId, userId, "Catatan Persiapan Wawancara", "Star", "Private"],
  );

  const sampleBlocks = [
    { type: "heading_1", content: { text: "Persiapan Wawancara Teknis" }, position: 0 },
    { type: "text", content: { text: "Rangkuman konsep inti yang sering ditanyakan saat interview developer:" }, position: 1 },
    { type: "todo", content: { text: "Review arsitektur React Server Components vs Client", checked: true }, position: 2 },
    { type: "todo", content: { text: "Latihan soal query SQL optimasi (index & explain analyze)", checked: true }, position: 3 },
    { type: "todo", content: { text: "Siapkan 3 cerita STAR method untuk pertanyaan behavioral", checked: false }, position: 4 },
    { type: "callout", content: { icon: "InfoCircle", text: "Selalu ajukan 2 pertanyaan mendalam tentang engineering culture di akhir sesi!" }, position: 5 },
  ];

  for (const b of sampleBlocks) {
    await db.query(
      `INSERT INTO blocks (id, page_id, type, content, position)
       VALUES ($1,$2,$3,$4,$5)`,
      [globalThis.crypto.randomUUID(), pageId, b.type, JSON.stringify(b.content), b.position],
    );
  }

  // 9. Tasks
  await db.query(
    `INSERT INTO tasks (id, user_id, title, status, priority, due_date, task_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      globalThis.crypto.randomUUID(),
      userId,
      "Kirim email follow-up ke Example Labs",
      "Todo",
      "Tinggi",
      daysAgo(1),
      "Follow-up",
    ],
  );
  await db.query(
    `INSERT INTO tasks (id, user_id, title, status, priority, due_date, task_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      globalThis.crypto.randomUUID(),
      userId,
      "Review materi GraphQL sebelum interview Digital Agency Nusantara",
      "Todo",
      "Sedang",
      daysAhead(1),
      "Interview Preparation",
    ],
  );

  console.log("Demo seed complete.");
  console.log(`  Login email : ${DEMO_EMAIL}`);
  console.log(`  Password    : ${DEMO_PASS}`);
} catch (err) {
  console.error("Seed failed:", err);
  process.exit(1);
} finally {
  await closeDb();
}

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
