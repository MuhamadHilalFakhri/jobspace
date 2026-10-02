-- JobSpace SQLite schema — same shape as db/schema.sql (Postgres) with
-- SQLite schema for isolated integration tests only. Production uses Neon.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS users (
  id            text PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name          text,
  disabled_at   text,
  workspace_name text NOT NULL DEFAULT 'Job Space',
  timezone      text NOT NULL DEFAULT 'Asia/Jakarta',
  theme         text NOT NULL DEFAULT 'system',
  default_view  text NOT NULL DEFAULT 'table',
  created_at    text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at text NOT NULL,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  rate_key          text PRIMARY KEY,
  attempts          integer NOT NULL,
  window_started_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_rate_limits_window_idx ON auth_rate_limits(window_started_at);

CREATE TABLE IF NOT EXISTS companies (
  id           text PRIMARY KEY,
  user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  industry     text,
  website      text,
  linkedin     text,
  career_page  text,
  location     text,
  size         text,
  company_type text,
  interest     text,
  notes        text,
  products     text,
  business_model text,
  tech_stack   text,
  culture      text,
  recent_news  text,
  why_join     text,
  concerns     text,
  deleted_at   text,
  created_at   text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS companies_user_name_idx
  ON companies(user_id, lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS contacts (
  id            text PRIMARY KEY,
  user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id    text REFERENCES companies(id) ON DELETE SET NULL,
  name          text NOT NULL,
  role          text,
  email         text,
  phone         text,
  linkedin      text,
  contact_type  text NOT NULL DEFAULT 'Recruiter',
  last_contact  text,
  next_follow_up text,
  photo_url     text,
  notes         text,
  deleted_at    text,
  created_at    text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS contacts_user_idx ON contacts(user_id, deleted_at);

CREATE TABLE IF NOT EXISTS jobs (
  id               text PRIMARY KEY,
  user_id          text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id       text REFERENCES companies(id) ON DELETE SET NULL,
  company          text NOT NULL,
  position         text NOT NULL,
  source           text,
  applied_at       text NOT NULL,
  deadline         text,
  status           text NOT NULL DEFAULT 'Draft'
                     CHECK (status IN ('Draft','Dilamar','Perlu Follow-up','Wawancara','Penawaran','Diterima','Ditolak','Ditutup')),
  last_response_at text,
  notes            text,
  location         text,
  work_type        text,
  priority         text CHECK (priority IS NULL OR priority IN ('Rendah','Sedang','Tinggi')),
  job_url          text,
  salary_range     text,
  next_action      text,
  next_action_date text,
  match_score      integer CHECK (match_score IS NULL OR (match_score >= 0 AND match_score <= 100)),
  interest_level   text,
  tech_stack       text NOT NULL DEFAULT '[]',
  deleted_at       text,
  created_at       text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS jobs_user_status_idx ON jobs(user_id, status);
CREATE INDEX IF NOT EXISTS jobs_user_applied_idx ON jobs(user_id, applied_at);
CREATE INDEX IF NOT EXISTS jobs_user_deleted_idx ON jobs(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS jobs_user_updated_idx ON jobs(user_id, updated_at);
CREATE INDEX IF NOT EXISTS jobs_user_company_position_active_idx
  ON jobs(user_id, lower(trim(company)), lower(trim(position))) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS opportunities (
  id            text PRIMARY KEY,
  user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id    text REFERENCES companies(id) ON DELETE SET NULL,
  position      text NOT NULL,
  company       text NOT NULL,
  source        text,
  url           text,
  location      text,
  work_model    text,
  salary_range  text,
  deadline      text,
  interest_level text,
  tech_stack    text NOT NULL DEFAULT '[]',
  match_score   integer CHECK (match_score IS NULL OR (match_score >= 0 AND match_score <= 100)),
  date_found    text NOT NULL DEFAULT (strftime('%Y-%m-%d','now')),
  notes         text,
  status        text NOT NULL DEFAULT 'Inbox'
                  CHECK (status IN ('Inbox','Reviewing','Interested','Preparing','Applied','Skipped','Expired')),
  converted_job_id text REFERENCES jobs(id) ON DELETE SET NULL,
  deleted_at    text,
  created_at    text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS opportunities_user_status_idx ON opportunities(user_id, status);

CREATE TABLE IF NOT EXISTS communications (
  id                 text PRIMARY KEY,
  job_id             text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id            text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  communication_date text NOT NULL,
  channel            text NOT NULL CHECK (channel IN ('Email','Telepon','LinkedIn','WhatsApp','Lainnya')),
  direction          text NOT NULL CHECK (direction IN ('Keluar','Masuk','Balasan Perusahaan')),
  summary            text NOT NULL,
  recruiter_contact  text,
  created_at         text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS communications_job_date_idx ON communications(job_id, communication_date DESC);
CREATE INDEX IF NOT EXISTS communications_user_date_idx ON communications(user_id, communication_date DESC);

CREATE TABLE IF NOT EXISTS status_histories (
  id          text PRIMARY KEY,
  job_id      text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  from_status text,
  to_status   text NOT NULL CHECK (to_status IN ('Draft','Dilamar','Perlu Follow-up','Wawancara','Penawaran','Diterima','Ditolak','Ditutup')),
  source      text NOT NULL CHECK (source IN ('pengguna','sistem')),
  changed_at  text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS status_histories_job_idx ON status_histories(job_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS status_histories_job_status_changed_idx
  ON status_histories(job_id, to_status, changed_at DESC);

CREATE TABLE IF NOT EXISTS job_contacts (
  job_id     text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  contact_id text NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  linked_at  text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  linked_by  text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (job_id, contact_id)
);

CREATE TABLE IF NOT EXISTS documents (
  id            text PRIMARY KEY,
  user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  file_type     text NOT NULL CHECK (file_type IN ('pdf','doc','docx')),
  storage_path  text NOT NULL,
  size_bytes    integer NOT NULL CHECK (size_bytes > 0),
  category      text,
  version_label text,
  deleted_at    text,
  created_at    text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS documents_user_idx ON documents(user_id, deleted_at);

CREATE TABLE IF NOT EXISTS document_blobs (
  document_id text PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  content     blob NOT NULL,
  created_at  text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS job_documents (
  job_id      text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  linked_at   text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  linked_by   text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (job_id, document_id)
);
CREATE INDEX IF NOT EXISTS job_documents_doc_idx ON job_documents(document_id);

CREATE TABLE IF NOT EXISTS interviews (
  id              text PRIMARY KEY,
  job_id          text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id         text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_date  text NOT NULL,
  scheduled_time  text NOT NULL,
  mode            text NOT NULL CHECK (mode IN ('Online','Onsite','Telepon')),
  location_or_link text,
  interviewer     text,
  result          text NOT NULL DEFAULT 'Menunggu'
                    CHECK (result IN ('Menunggu','Lanjut','Tidak Lanjut','Diterima','Ditolak')),
  notes           text,
  prep_checklist  text NOT NULL DEFAULT '[]',
  created_at      text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS interviews_user_date_idx ON interviews(user_id, scheduled_date);
CREATE INDEX IF NOT EXISTS interviews_job_date_idx ON interviews(job_id, scheduled_date);
CREATE INDEX IF NOT EXISTS interviews_user_pending_date_idx
  ON interviews(user_id, scheduled_date, scheduled_time) WHERE result = 'Menunggu';

CREATE TABLE IF NOT EXISTS workspace_settings (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  weekly_application_goal integer NOT NULL DEFAULT 5 CHECK (weekly_application_goal BETWEEN 1 AND 100),
  weekly_follow_up_goal integer NOT NULL DEFAULT 5 CHECK (weekly_follow_up_goal BETWEEN 1 AND 100),
  quick_notes text NOT NULL DEFAULT '',
  updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id     text REFERENCES jobs(id) ON DELETE SET NULL,
  company_id text REFERENCES companies(id) ON DELETE SET NULL,
  title      text NOT NULL,
  status     text NOT NULL DEFAULT 'Todo' CHECK (status IN ('Todo','In Progress','Done','Cancelled')),
  priority   text NOT NULL DEFAULT 'Sedang' CHECK (priority IN ('Rendah','Sedang','Tinggi')),
  due_date   text,
  task_type  text,
  notes      text,
  completed_at text,
  deleted_at text,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS tasks_user_due_idx ON tasks(user_id, due_date);

CREATE TABLE IF NOT EXISTS reminders (
  id           text PRIMARY KEY,
  job_id       text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN ('follow_up','deadline')),
  due_date     text NOT NULL,
  completed_at text,
  created_at   text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS reminders_user_active_idx ON reminders(user_id, completed_at);
CREATE INDEX IF NOT EXISTS reminders_due_idx ON reminders(due_date);
CREATE INDEX IF NOT EXISTS reminders_user_active_due_idx
  ON reminders(user_id, due_date) WHERE completed_at IS NULL;

CREATE TABLE IF NOT EXISTS templates (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  type       text NOT NULL CHECK (type IN ('email','surat')),
  content    text NOT NULL,
  deleted_at text,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS templates_user_idx ON templates(user_id, deleted_at);

CREATE TABLE IF NOT EXISTS pages (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      text NOT NULL DEFAULT 'Untitled',
  icon       text,
  parent_id  text,
  section    text NOT NULL DEFAULT 'Private',
  deleted_at text,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (id, user_id),
  FOREIGN KEY (parent_id, user_id) REFERENCES pages(id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS pages_user_idx ON pages(user_id, deleted_at);

CREATE TABLE IF NOT EXISTS blocks (
  id         text PRIMARY KEY,
  page_id    text NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  job_id     text REFERENCES jobs(id) ON DELETE CASCADE,
  parent_id  text REFERENCES blocks(id) ON DELETE CASCADE,
  type       text NOT NULL,
  content    text NOT NULL DEFAULT '{}',
  position   integer NOT NULL DEFAULT 0,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS blocks_page_pos_idx ON blocks(page_id, position);
CREATE INDEX IF NOT EXISTS blocks_job_pos_idx ON blocks(job_id, position);

CREATE TABLE IF NOT EXISTS saved_views (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  entity     text NOT NULL,
  view_type  text NOT NULL DEFAULT 'table',
  filters    text NOT NULL DEFAULT '[]',
  sorts      text NOT NULL DEFAULT '[]',
  props      text NOT NULL DEFAULT '[]',
  grouping   text,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS favorites (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity     text NOT NULL,
  entity_id  text NOT NULL,
  title      text NOT NULL,
  href       text NOT NULL,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, entity, entity_id)
);

CREATE TABLE IF NOT EXISTS activities (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id     text REFERENCES jobs(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  message    text NOT NULL,
  metadata   text NOT NULL DEFAULT '{}',
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS activities_job_idx ON activities(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activities_user_idx ON activities(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  title      text NOT NULL,
  body       text,
  href       text,
  read_at    text,
  created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, read_at);

CREATE TABLE IF NOT EXISTS import_logs (
  id             text PRIMARY KEY,
  user_id        text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name      text NOT NULL,
  total_rows     integer NOT NULL,
  success_rows   integer NOT NULL,
  failed_rows    integer NOT NULL,
  failed_details text,
  created_at     text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
