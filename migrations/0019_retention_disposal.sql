CREATE TABLE retention_disposal_runs (
  id uuid PRIMARY KEY,
  firm_id uuid NOT NULL REFERENCES firms(id),
  policy_id uuid NOT NULL REFERENCES firm_retention_policies(id),
  data_category text NOT NULL,
  cutoff_at timestamptz NOT NULL,
  policy_version integer NOT NULL,
  authorization_reference text NOT NULL CHECK (length(btrim(authorization_reference)) > 0),
  candidate_count integer NOT NULL CHECK (candidate_count >= 0),
  disposed_count integer NOT NULL CHECK (disposed_count >= 0),
  held_count integer NOT NULL CHECK (held_count >= 0),
  skipped_count integer NOT NULL CHECK (skipped_count >= 0),
  evidence_hash text NOT NULL,
  executed_by_id uuid NOT NULL REFERENCES users(id),
  executed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (data_category IN ('source_originals','import_payloads','calculation_snapshots','generated_artifacts')),
  CHECK (candidate_count = disposed_count + held_count + skipped_count)
);

CREATE TABLE retention_disposal_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES retention_disposal_runs(id),
  client_id uuid NOT NULL REFERENCES clients(id),
  tax_year_id uuid NOT NULL REFERENCES tax_years(id),
  record_type text NOT NULL,
  record_id text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('disposed','held','skipped')),
  integrity_hash text,
  reason_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id,record_type,record_id)
);

ALTER TABLE source_documents
  ADD COLUMN disposed_at timestamptz,
  ADD COLUMN disposed_by_id uuid REFERENCES users(id),
  ADD COLUMN disposal_run_id uuid REFERENCES retention_disposal_runs(id),
  DROP CONSTRAINT source_documents_scan_state_check,
  ADD CONSTRAINT source_documents_scan_state_check CHECK (scan_state IN ('pending','clean','quarantined','failed','external_only','disposed'));

ALTER TABLE import_batches
  ADD COLUMN disposed_at timestamptz,
  ADD COLUMN disposed_by_id uuid REFERENCES users(id),
  ADD COLUMN disposal_run_id uuid REFERENCES retention_disposal_runs(id);

ALTER TABLE generated_artifacts
  ADD COLUMN disposed_at timestamptz,
  ADD COLUMN disposed_by_id uuid REFERENCES users(id),
  ADD COLUMN disposal_run_id uuid REFERENCES retention_disposal_runs(id),
  DROP CONSTRAINT generated_artifacts_status_check,
  ADD CONSTRAINT generated_artifacts_status_check CHECK (artifact_status IN ('queued','generating','succeeded','failed','disposed'));

CREATE INDEX retention_disposal_runs_firm_created_idx ON retention_disposal_runs(firm_id,executed_at DESC);
CREATE INDEX retention_disposal_items_run_outcome_idx ON retention_disposal_items(run_id,outcome);
CREATE INDEX source_documents_retention_idx ON source_documents(uploaded_at) WHERE disposed_at IS NULL;
CREATE INDEX import_batches_retention_idx ON import_batches(created_at) WHERE disposed_at IS NULL;
CREATE INDEX generated_artifacts_retention_idx ON generated_artifacts(created_at) WHERE disposed_at IS NULL;

CREATE TRIGGER retention_disposal_runs_immutable BEFORE UPDATE OR DELETE ON retention_disposal_runs
FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
CREATE TRIGGER retention_disposal_items_immutable BEFORE UPDATE OR DELETE ON retention_disposal_items
FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
