-- Harden legacy Neon data before enforcing per-user page ownership.
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at timestamptz;

-- Revoke the publicly documented seed account and its existing sessions,
-- while preserving its associated user data for the database owner.
UPDATE users
SET disabled_at = now()
WHERE lower(email) = 'demo@jobspace.local'
  AND disabled_at IS NULL;

DELETE FROM sessions
WHERE user_id IN (
  SELECT id FROM users WHERE lower(email) = 'demo@jobspace.local'
);

UPDATE jobs AS j
SET company_id = c.id
FROM companies AS c
WHERE j.company_id IS NULL
  AND j.user_id = c.user_id
  AND lower(j.company) = lower(c.name)
  AND j.deleted_at IS NULL
  AND c.deleted_at IS NULL;

UPDATE opportunities AS o
SET company_id = c.id
FROM companies AS c
WHERE o.company_id IS NULL
  AND o.user_id = c.user_id
  AND lower(o.company) = lower(c.name)
  AND o.deleted_at IS NULL
  AND c.deleted_at IS NULL;

UPDATE pages AS child
SET parent_id = NULL
FROM pages AS parent
WHERE child.parent_id = parent.id
  AND child.user_id <> parent.user_id;

CREATE UNIQUE INDEX IF NOT EXISTS pages_id_user_idx ON pages(id, user_id);

ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_parent_id_fkey;

ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_parent_user_fk;
ALTER TABLE pages
  ADD CONSTRAINT pages_parent_user_fk
  FOREIGN KEY (parent_id, user_id)
  REFERENCES pages(id, user_id)
  ON DELETE CASCADE;
