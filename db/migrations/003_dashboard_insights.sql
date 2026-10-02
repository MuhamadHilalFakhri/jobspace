ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS prep_checklist jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS workspace_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  weekly_application_goal integer NOT NULL DEFAULT 5 CHECK (weekly_application_goal BETWEEN 1 AND 100),
  weekly_follow_up_goal integer NOT NULL DEFAULT 5 CHECK (weekly_follow_up_goal BETWEEN 1 AND 100),
  quick_notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS interviews_user_date_idx
  ON interviews(user_id, scheduled_date);

CREATE INDEX IF NOT EXISTS jobs_user_company_position_active_idx
  ON jobs(user_id, lower(btrim(company)), lower(btrim(position))) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS status_histories_job_status_changed_idx
  ON status_histories(job_id, to_status, changed_at DESC);
CREATE INDEX IF NOT EXISTS interviews_user_pending_date_idx
  ON interviews(user_id, scheduled_date, scheduled_time) WHERE result = 'Menunggu';
CREATE INDEX IF NOT EXISTS reminders_user_active_due_idx
  ON reminders(user_id, due_date) WHERE completed_at IS NULL;
