ALTER TABLE source_form_records
  ADD COLUMN correction_evidence_mode text,
  ADD COLUMN correction_evidence_note text;

UPDATE source_form_records
SET correction_evidence_mode='manual_attestation',
    correction_evidence_note=COALESCE(change_reason,'Migrated corrected record; review the historical evidence.')
WHERE record_disposition='corrected';

ALTER TABLE source_form_records
  ADD CONSTRAINT source_form_records_correction_evidence_mode_check
    CHECK (correction_evidence_mode IS NULL OR correction_evidence_mode IN ('attached_document','manual_attestation')),
  ADD CONSTRAINT source_form_records_correction_evidence_check
    CHECK (
      record_disposition<>'corrected'
      OR (correction_evidence_mode='attached_document' AND source_document_id IS NOT NULL)
      OR (correction_evidence_mode='manual_attestation' AND correction_evidence_note IS NOT NULL AND length(btrim(correction_evidence_note))>0)
    );
