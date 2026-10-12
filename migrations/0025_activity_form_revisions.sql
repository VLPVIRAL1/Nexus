CREATE TABLE activity_form_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES activities(id),
  tax_year_id uuid NOT NULL REFERENCES tax_years(id),
  activity_version integer NOT NULL,
  form_data jsonb NOT NULL,
  change_reason text NOT NULL,
  changed_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(activity_id, activity_version)
);

ALTER TABLE activities DROP CONSTRAINT activities_supported_basis_check;
ALTER TABLE activities ADD CONSTRAINT activities_supported_basis_check
  CHECK (implementation_status <> 'supported' OR (
    activity_type IN ('schedule_c','schedule_e','schedule_f')
    AND receipt_basis = 'source_plus_additional_receipts'
  ));

ALTER TABLE activities ADD COLUMN last_import_batch_id uuid REFERENCES import_batches(id);
CREATE INDEX activities_last_import_batch_idx ON activities(last_import_batch_id) WHERE last_import_batch_id IS NOT NULL;
ALTER TABLE source_mappings ADD COLUMN import_batch_id uuid REFERENCES import_batches(id);
CREATE INDEX source_mappings_import_batch_idx ON source_mappings(import_batch_id) WHERE import_batch_id IS NOT NULL;

CREATE INDEX activity_form_revisions_activity_idx
  ON activity_form_revisions(activity_id, activity_version DESC);

INSERT INTO activity_form_revisions(activity_id,tax_year_id,activity_version,form_data,change_reason,changed_by)
SELECT id,tax_year_id,version,details,'Existing activity state before Schedule C/E/F form workspace migration.',NULL
FROM activities
ON CONFLICT(activity_id,activity_version) DO NOTHING;
