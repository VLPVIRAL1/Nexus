ALTER TABLE generated_artifacts
  ADD COLUMN artifact_bytes bytea,
  ADD COLUMN mime_type text,
  ADD COLUMN file_name text,
  ADD COLUMN created_by_id uuid REFERENCES users(id),
  ADD COLUMN idempotency_key text,
  ADD COLUMN error_message text,
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT generated_artifacts_type_check CHECK (artifact_type IN ('return_package_pdf','workpaper_xlsx','complete_json','source_only_json','blank_template_json')),
  ADD CONSTRAINT generated_artifacts_status_check CHECK (artifact_status IN ('queued','generating','succeeded','failed')),
  ADD CONSTRAINT generated_artifacts_completeness_check CHECK (completeness IN ('partial','complete_supported_draft')),
  ADD CONSTRAINT generated_artifacts_success_check CHECK (artifact_status <> 'succeeded' OR (artifact_bytes IS NOT NULL AND storage_id IS NOT NULL AND content_hash IS NOT NULL AND mime_type IS NOT NULL AND file_name IS NOT NULL));

CREATE UNIQUE INDEX generated_artifacts_idempotency_key_idx ON generated_artifacts(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION stale_generated_artifacts_on_revision_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.revision <> OLD.revision THEN
    UPDATE generated_artifacts SET stale_at=COALESCE(stale_at,now()) WHERE tax_year_id=NEW.id AND stale_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tax_years_stale_generated_artifacts AFTER UPDATE OF revision ON tax_years FOR EACH ROW EXECUTE FUNCTION stale_generated_artifacts_on_revision_change();
