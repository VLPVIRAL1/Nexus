ALTER TABLE source_form_records
  DROP CONSTRAINT source_form_records_tax_year_id_external_source_id_key;

ALTER TABLE source_form_records
  ADD COLUMN import_batch_id uuid REFERENCES import_batches(id);

CREATE UNIQUE INDEX source_form_records_external_revision_key
  ON source_form_records(tax_year_id,external_source_id,version)
  WHERE external_source_id IS NOT NULL;

CREATE INDEX source_form_records_supersedes_idx
  ON source_form_records(supersedes_record_id);
