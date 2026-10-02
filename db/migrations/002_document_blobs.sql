-- Keep size-limited document content in Neon so Workers need no object-storage
-- subscription or ephemeral local filesystem for uploads.
CREATE TABLE IF NOT EXISTS document_blobs (
  document_id uuid PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  content     bytea NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE document_blobs TO jobspace_runtime;
