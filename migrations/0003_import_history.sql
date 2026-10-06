ALTER TABLE import_batches
  ADD COLUMN preview_id uuid,
  ADD COLUMN raw_payload bytea,
  ADD COLUMN parsed_payload jsonb,
  ADD COLUMN previous_snapshot jsonb,
  ADD COLUMN committed_snapshot jsonb,
  ADD COLUMN committed_by uuid REFERENCES users(id),
  ADD COLUMN rolled_back_at timestamptz,
  ADD COLUMN rolled_back_by uuid REFERENCES users(id),
  ADD CONSTRAINT import_batches_preview_id_unique UNIQUE(preview_id);

ALTER TABLE import_record_changes
  ADD COLUMN change_id uuid,
  ADD COLUMN path_segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT import_record_changes_change_id_unique UNIQUE(change_id);

CREATE TABLE import_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year_id uuid NOT NULL REFERENCES tax_years(id),
  import_batch_id uuid REFERENCES import_batches(id),
  batch_hash text NOT NULL,
  attempted_by uuid NOT NULL REFERENCES users(id),
  outcome text NOT NULL CHECK (outcome IN ('preview_created','preview_replayed','commit_replayed','committed','stale_rejected','rolled_back')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX import_attempts_year_hash_idx ON import_attempts(tax_year_id,batch_hash,created_at);
