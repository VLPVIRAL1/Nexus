ALTER TABLE manual_overrides ALTER COLUMN active SET DEFAULT false;
UPDATE manual_overrides SET active=false WHERE approved_by_id IS NULL;

ALTER TABLE manual_overrides
  ADD COLUMN calculation_run_id uuid REFERENCES calculation_runs(id),
  ADD COLUMN override_status text NOT NULL DEFAULT 'pending_review',
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN dependency_hash text NOT NULL DEFAULT '',
  ADD COLUMN downstream_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN rejected_by_id uuid REFERENCES users(id),
  ADD COLUMN rejected_at timestamptz,
  ADD COLUMN review_note text,
  ADD COLUMN reverted_by_id uuid REFERENCES users(id),
  ADD COLUMN reverted_at timestamptz,
  ADD COLUMN supersedes_override_id uuid REFERENCES manual_overrides(id),
  ADD CONSTRAINT manual_overrides_status_check CHECK (override_status IN ('pending_review','approved','rejected','reverted')),
  ADD CONSTRAINT manual_overrides_unit_check CHECK (unit IN ('USD')),
  ADD CONSTRAINT manual_overrides_actor_approval_check CHECK (approved_by_id IS NULL OR approved_by_id <> actor_id),
  ADD CONSTRAINT manual_overrides_state_check CHECK (
    (override_status='pending_review' AND NOT active AND approved_by_id IS NULL AND rejected_by_id IS NULL AND reverted_by_id IS NULL)
    OR (override_status='approved' AND active AND approved_by_id IS NOT NULL AND approved_at IS NOT NULL AND reverted_by_id IS NULL)
    OR (override_status='rejected' AND NOT active AND rejected_by_id IS NOT NULL AND rejected_at IS NOT NULL)
    OR (override_status='reverted' AND NOT active AND approved_by_id IS NOT NULL AND reverted_by_id IS NOT NULL AND reverted_at IS NOT NULL)
  );

CREATE UNIQUE INDEX manual_overrides_one_active_point_idx ON manual_overrides(tax_year_id,override_point) WHERE active;
CREATE INDEX manual_overrides_year_status_idx ON manual_overrides(tax_year_id,override_status,created_at DESC);
