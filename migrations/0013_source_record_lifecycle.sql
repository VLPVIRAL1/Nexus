ALTER TABLE source_form_records
  ADD COLUMN record_disposition text,
  ADD COLUMN change_reason text,
  ADD COLUMN created_by_id uuid REFERENCES users(id);

UPDATE source_form_records
SET record_disposition=CASE WHEN void THEN 'void' WHEN corrected THEN 'corrected' ELSE 'original' END;

ALTER TABLE source_form_records
  ALTER COLUMN record_disposition SET NOT NULL,
  ALTER COLUMN record_disposition SET DEFAULT 'original',
  ADD CONSTRAINT source_form_records_disposition_check CHECK (record_disposition IN ('original','corrected','duplicate_excluded','void')),
  ADD CONSTRAINT source_form_records_reason_check CHECK (record_disposition='original' OR change_reason IS NOT NULL);

CREATE INDEX source_form_records_lifecycle_idx ON source_form_records(tax_year_id,external_source_id,version DESC);
