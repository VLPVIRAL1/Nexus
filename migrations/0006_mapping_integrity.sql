ALTER TABLE activities
  ADD COLUMN receipt_basis text,
  ADD COLUMN additional_receipts numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN receipt_note text,
  ADD CONSTRAINT activities_type_check CHECK (activity_type IN ('schedule_c','schedule_e','schedule_f','schedule_1_other')),
  ADD CONSTRAINT activities_owner_check CHECK (owner_role IN ('taxpayer','spouse')),
  ADD CONSTRAINT activities_implementation_check CHECK (implementation_status IN ('supported','mapping_only')),
  ADD CONSTRAINT activities_receipt_basis_check CHECK (receipt_basis IS NULL OR receipt_basis IN ('source_plus_additional_receipts','total_books_receipts')),
  ADD CONSTRAINT activities_additional_receipts_check CHECK (additional_receipts >= 0),
  ADD CONSTRAINT activities_supported_basis_check CHECK (implementation_status <> 'supported' OR (activity_type = 'schedule_c' AND receipt_basis = 'source_plus_additional_receipts'));

ALTER TABLE source_mappings
  ADD COLUMN effective boolean NOT NULL DEFAULT true,
  ADD COLUMN supersedes_mapping_id uuid REFERENCES source_mappings(id),
  ADD COLUMN note text,
  ADD COLUMN created_by uuid REFERENCES users(id),
  ADD CONSTRAINT source_mappings_method_check CHECK (allocation_method IN ('amount','percentage')),
  ADD CONSTRAINT source_mappings_status_check CHECK (mapping_status IN ('suggested','accepted','reviewed')),
  ADD CONSTRAINT source_mappings_target_check CHECK (
    (target_type = 'excluded' AND target_activity_id IS NULL AND length(trim(COALESCE(reason,''))) > 0)
    OR
    (target_type IN ('schedule_c','schedule_e','schedule_f','schedule_1_other') AND target_activity_id IS NOT NULL)
  ),
  ADD CONSTRAINT source_mappings_percentage_check CHECK (
    (allocation_method = 'amount' AND percentage IS NULL)
    OR
    (allocation_method = 'percentage' AND percentage > 0 AND percentage <= 100)
  ),
  ADD CONSTRAINT source_mappings_source_amount_check CHECK (source_amount >= 0);

CREATE INDEX source_mappings_effective_source_idx
  ON source_mappings(tax_year_id,source_record_id,source_field)
  WHERE effective;
CREATE INDEX source_mappings_supersedes_idx ON source_mappings(supersedes_mapping_id);
CREATE TRIGGER activities_touch_updated_at BEFORE UPDATE ON activities FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER source_mappings_touch_updated_at BEFORE UPDATE ON source_mappings FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
