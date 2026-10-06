CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE firms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), firm_id uuid NOT NULL REFERENCES firms(id), user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('admin','preparer','reviewer','read_only')), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(firm_id,user_id)
);
CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), firm_id uuid NOT NULL REFERENCES firms(id), client_code text NOT NULL,
  display_name text NOT NULL, archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(firm_id,client_code)
);
CREATE INDEX clients_firm_name_idx ON clients(firm_id,display_name);
CREATE TABLE client_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES clients(id), user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('preparer','reviewer','read_only')), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(client_id,user_id,kind)
);
CREATE TABLE tax_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES clients(id), tax_year integer NOT NULL CHECK (tax_year BETWEEN 1900 AND 2200),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0), preparation_status text NOT NULL DEFAULT 'not_started',
  validation_status text NOT NULL DEFAULT 'not_run', calculation_status text NOT NULL DEFAULT 'not_run', canonical_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(client_id,tax_year)
);
CREATE TABLE people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tax_year_id uuid NOT NULL REFERENCES tax_years(id), role text NOT NULL,
  legal_name text NOT NULL, tin_encrypted text, date_of_birth date, address jsonb NOT NULL DEFAULT '{}'::jsonb, facts jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tax_year_id,role)
);
CREATE TABLE dependents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tax_year_id uuid NOT NULL REFERENCES tax_years(id), legal_name text NOT NULL,
  tin_encrypted text, facts jsonb NOT NULL DEFAULT '{}'::jsonb, version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE intake_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tax_year_id uuid NOT NULL REFERENCES tax_years(id), question_id text NOT NULL,
  answer text NOT NULL CHECK (answer IN ('yes','no','unknown')), respondent_id uuid NOT NULL REFERENCES users(id), evidence text,
  answer_revision integer NOT NULL, answered_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tax_year_id,question_id,answer_revision)
);
CREATE TABLE source_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tax_year_id uuid NOT NULL REFERENCES tax_years(id), file_name text NOT NULL,
  document_type text NOT NULL, storage_id text, mime_type text, byte_length bigint, checksum text, page_count integer,
  duplicate_fingerprint text, disposition text NOT NULL DEFAULT 'original', supersedes_document_id uuid REFERENCES source_documents(id),
  scan_state text NOT NULL DEFAULT 'pending', storage_version integer NOT NULL DEFAULT 1,
  uploaded_by uuid REFERENCES users(id), uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX source_documents_tax_year_fingerprint_idx ON source_documents(tax_year_id,duplicate_fingerprint);
CREATE TABLE source_form_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tax_year_id uuid NOT NULL REFERENCES tax_years(id), source_document_id uuid REFERENCES source_documents(id),
  form_type text NOT NULL, form_year integer NOT NULL, external_source_id text, owner_role text NOT NULL, owner_person_id uuid REFERENCES people(id),
  normalized_data jsonb NOT NULL, raw_fields jsonb NOT NULL DEFAULT '[]'::jsonb, unmapped_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  corrected boolean NOT NULL DEFAULT false, void boolean NOT NULL DEFAULT false, effective boolean NOT NULL DEFAULT true,
  supersedes_record_id uuid REFERENCES source_form_records(id), version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tax_year_id,external_source_id)
);
CREATE INDEX source_forms_year_type_effective_idx ON source_form_records(tax_year_id,form_type,effective);
CREATE TABLE activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tax_year_id uuid NOT NULL REFERENCES tax_years(id), activity_type text NOT NULL,
  name text NOT NULL, owner_role text NOT NULL, implementation_status text NOT NULL, details jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE source_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tax_year_id uuid NOT NULL REFERENCES tax_years(id), source_record_id uuid NOT NULL REFERENCES source_form_records(id),
  source_field text NOT NULL, source_amount numeric(18,2) NOT NULL, target_type text NOT NULL, target_activity_id uuid REFERENCES activities(id),
  allocation_method text NOT NULL, allocated_amount numeric(18,2) NOT NULL, percentage numeric(7,4), reason text,
  mapping_status text NOT NULL, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (allocated_amount >= 0)
);
CREATE INDEX source_mappings_source_idx ON source_mappings(tax_year_id,source_record_id,source_field);
CREATE TABLE import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tax_year_id uuid NOT NULL REFERENCES tax_years(id), file_name text NOT NULL,
  schema_version text NOT NULL, batch_hash text NOT NULL, base_revision integer NOT NULL, import_status text NOT NULL,
  raw_storage_id text, result_revision integer, summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), committed_at timestamptz, UNIQUE(tax_year_id,batch_hash)
);
CREATE TABLE import_record_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), import_batch_id uuid NOT NULL REFERENCES import_batches(id), field_path text NOT NULL,
  change_kind text NOT NULL, existing_value jsonb, imported_value jsonb, decision text NOT NULL
);
CREATE TABLE validation_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tax_year_id uuid NOT NULL REFERENCES tax_years(id), code text NOT NULL,
  severity text NOT NULL, category text NOT NULL, record_id uuid, field_path text, message text NOT NULL, resolution_action text NOT NULL,
  creation_revision integer NOT NULL, resolved_revision integer, resolution text, created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE INDEX validation_issues_open_idx ON validation_issues(tax_year_id,severity,resolved_at);
CREATE TABLE review_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tax_year_id uuid NOT NULL REFERENCES tax_years(id), category text NOT NULL,
  subject text NOT NULL, description text NOT NULL, review_status text NOT NULL, source_record_id uuid, related_form text,
  related_activity_id uuid, assigned_user_id uuid REFERENCES users(id), created_by_id uuid NOT NULL REFERENCES users(id), due_date date,
  resolution text, resolved_by_id uuid REFERENCES users(id), creation_revision integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE TABLE manual_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tax_year_id uuid NOT NULL REFERENCES tax_years(id), override_point text NOT NULL,
  engine_value numeric(18,2) NOT NULL, override_value numeric(18,2) NOT NULL, unit text NOT NULL, reason text NOT NULL, evidence text NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id), approved_by_id uuid REFERENCES users(id), active boolean NOT NULL DEFAULT true,
  creation_revision integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE calculation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tax_year_id uuid NOT NULL REFERENCES tax_years(id), input_revision integer NOT NULL,
  input_hash text NOT NULL, engine_version text NOT NULL, rule_version text NOT NULL, form_registry_version text NOT NULL,
  calculation_status text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tax_year_id,input_hash,engine_version,rule_version)
);
CREATE TABLE generated_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tax_year_id uuid NOT NULL REFERENCES tax_years(id), calculation_run_id uuid REFERENCES calculation_runs(id),
  artifact_type text NOT NULL, artifact_key text NOT NULL, template_version text, artifact_status text NOT NULL, completeness text NOT NULL,
  storage_id text, content_hash text, manifest jsonb NOT NULL, stale_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX generated_artifacts_year_type_idx ON generated_artifacts(tax_year_id,artifact_type,created_at);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), firm_id uuid NOT NULL REFERENCES firms(id), tax_year_id uuid REFERENCES tax_years(id), actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL, record_type text NOT NULL, record_id text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_hash text, event_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_year_created_idx ON audit_events(tax_year_id,created_at);

CREATE OR REPLACE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_events are append-only'; END $$;
CREATE TRIGGER audit_events_no_update BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
