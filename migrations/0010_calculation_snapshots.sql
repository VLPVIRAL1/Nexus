ALTER TABLE calculation_runs
  ADD COLUMN input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN requested_by_id uuid REFERENCES users(id),
  ADD COLUMN result_hash text,
  ADD COLUMN completed_at timestamptz,
  ADD CONSTRAINT calculation_runs_status_check CHECK (calculation_status IN ('partial','complete','failed'));

CREATE INDEX calculation_runs_year_revision_idx ON calculation_runs(tax_year_id,input_revision,created_at DESC);
