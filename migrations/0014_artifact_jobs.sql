CREATE TABLE artifact_jobs (
  id uuid PRIMARY KEY,
  firm_id uuid NOT NULL REFERENCES firms(id),
  client_id uuid NOT NULL REFERENCES clients(id),
  tax_year_id uuid NOT NULL REFERENCES tax_years(id),
  calculation_run_id uuid NOT NULL REFERENCES calculation_runs(id),
  artifact_id uuid REFERENCES generated_artifacts(id),
  artifact_type text NOT NULL CHECK (artifact_type IN ('return_package_pdf','workpaper_xlsx','complete_json','source_only_json','blank_template_json')),
  input_revision integer NOT NULL,
  template_version text NOT NULL,
  job_status text NOT NULL DEFAULT 'queued' CHECK (job_status IN ('queued','running','succeeded','failed','stale')),
  idempotency_key text NOT NULL UNIQUE,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  started_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_by_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX artifact_jobs_claim_idx ON artifact_jobs(available_at,created_at) WHERE job_status='queued';
CREATE INDEX artifact_jobs_tax_year_idx ON artifact_jobs(tax_year_id,created_at DESC);

CREATE OR REPLACE FUNCTION stale_artifact_jobs_on_revision_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.revision <> OLD.revision THEN
    UPDATE artifact_jobs
      SET job_status='stale', completed_at=COALESCE(completed_at,now()), updated_at=now(),
          last_error_code='input_revision_changed',
          last_error_message='The return changed after this job was queued.'
      WHERE tax_year_id=NEW.id AND job_status IN ('queued','running','succeeded');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tax_years_stale_artifact_jobs AFTER UPDATE OF revision ON tax_years
FOR EACH ROW EXECUTE FUNCTION stale_artifact_jobs_on_revision_change();
