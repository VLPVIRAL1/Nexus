CREATE TABLE source_object_blobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_key text NOT NULL UNIQUE,
  storage_version integer NOT NULL DEFAULT 1,
  object_state text NOT NULL CHECK (object_state IN ('quarantined','promoted')),
  cipher_algorithm text NOT NULL DEFAULT 'aes-256-gcm' CHECK (cipher_algorithm = 'aes-256-gcm'),
  cipher_iv bytea NOT NULL,
  cipher_auth_tag bytea NOT NULL,
  cipher_bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  promoted_at timestamptz
);

ALTER TABLE source_documents
  ADD COLUMN scanner_version text,
  ADD COLUMN scan_completed_at timestamptz,
  ADD CONSTRAINT source_documents_scan_state_check CHECK (scan_state IN ('pending','clean','quarantined','failed','external_only')),
  ADD CONSTRAINT source_documents_clean_storage_check CHECK (scan_state <> 'clean' OR (storage_id IS NOT NULL AND mime_type IS NOT NULL AND byte_length IS NOT NULL AND checksum IS NOT NULL AND scanner_version IS NOT NULL AND scan_completed_at IS NOT NULL));

CREATE INDEX source_object_blobs_state_created_idx ON source_object_blobs(object_state,created_at);
