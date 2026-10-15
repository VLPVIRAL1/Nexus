CREATE TABLE diagnostic_authorities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authority_key text NOT NULL UNIQUE,
  tax_year integer NOT NULL CHECK (tax_year BETWEEN 1900 AND 2200),
  jurisdiction text NOT NULL DEFAULT 'federal',
  document_title text NOT NULL,
  source_uri text,
  source_hash text,
  locator text,
  research_status text NOT NULL CHECK (research_status IN ('pending','verified','not_applicable','access_restricted')),
  researched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE diagnostic_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  definition_version integer NOT NULL CHECK (definition_version > 0),
  tax_year integer NOT NULL CHECK (tax_year BETWEEN 1900 AND 2200),
  jurisdiction text NOT NULL DEFAULT 'federal',
  return_type text NOT NULL DEFAULT 'individual',
  filing_channel text NOT NULL CHECK (filing_channel IN ('preparation','paper','mef')),
  diagnostic_class text NOT NULL,
  default_severity text NOT NULL CHECK (default_severity IN ('blocking','error','warning','information','planning')),
  evaluation_stage text NOT NULL,
  support_state text NOT NULL CHECK (support_state IN ('legacy_supported','supported','blocked','deferred','not_applicable')),
  affected_forms text[] NOT NULL DEFAULT '{}',
  canonical_paths text[] NOT NULL DEFAULT '{}',
  topic_id text,
  predicate_id text NOT NULL,
  message_template text NOT NULL,
  resolution_template text NOT NULL,
  suppressible boolean NOT NULL DEFAULT false,
  authority_review_status text NOT NULL CHECK (authority_review_status IN ('pending','verified','rejected','not_applicable')),
  owner text NOT NULL,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_metadata)='object'),
  definition_hash text NOT NULL UNIQUE,
  effective_from date,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(code,definition_version,tax_year,jurisdiction,filing_channel)
);

CREATE INDEX diagnostic_definitions_lookup_idx ON diagnostic_definitions(tax_year,jurisdiction,filing_channel,code);

CREATE TABLE diagnostic_definition_authorities (
  definition_id uuid NOT NULL REFERENCES diagnostic_definitions(id),
  authority_id uuid NOT NULL REFERENCES diagnostic_authorities(id),
  authority_excerpt_hash text,
  PRIMARY KEY(definition_id,authority_id)
);

CREATE TABLE diagnostic_definition_supersessions (
  prior_definition_id uuid PRIMARY KEY REFERENCES diagnostic_definitions(id),
  successor_definition_id uuid NOT NULL REFERENCES diagnostic_definitions(id),
  rationale text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (prior_definition_id <> successor_definition_id)
);

CREATE TABLE diagnostic_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_key text NOT NULL UNIQUE,
  definition_id uuid NOT NULL REFERENCES diagnostic_definitions(id),
  form_reference text,
  line_or_box text,
  applicable_facts text[] NOT NULL DEFAULT '{}',
  supported_state text NOT NULL CHECK (supported_state IN ('calculated','blocked','deferred','not_applicable')),
  positive_fixture_id text,
  negative_fixture_id text,
  boundary_fixture_ids text[] NOT NULL DEFAULT '{}',
  interaction_fixture_ids text[] NOT NULL DEFAULT '{}',
  output_effects text[] NOT NULL DEFAULT '{}',
  ui_destination text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE diagnostic_manifest_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year integer NOT NULL,
  jurisdiction text NOT NULL DEFAULT 'federal',
  filing_channel text NOT NULL,
  manifest_version text NOT NULL,
  manifest_hash text NOT NULL UNIQUE,
  rule_package_hash text,
  release_status text NOT NULL CHECK (release_status IN ('research_unapproved','technical_verified','tax_approved','retired')),
  definition_count integer NOT NULL CHECK (definition_count >= 0),
  released_by_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tax_year,jurisdiction,filing_channel,manifest_version)
);

CREATE TABLE diagnostic_external_gates (
  gate_key text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('disabled','pending','authorized','completed','rejected')),
  reason text NOT NULL,
  evidence_reference text,
  updated_by_id uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

INSERT INTO diagnostic_external_gates(gate_key,status,reason) VALUES
  ('irs_mef','disabled','IRS/software-provider authorization and licensed MeF rule artifacts have not been recorded.'),
  ('drake_comparison','pending','Licensed synthetic-return observation and legal review have not been recorded.'),
  ('proconnect_comparison','pending','Licensed synthetic-return observation and legal review have not been recorded.'),
  ('cch_comparison','pending','Licensed synthetic-return observation and legal review have not been recorded.'),
  ('independent_tax_review','pending','Independent qualified tax-professional approval has not been recorded.');

ALTER TABLE validation_issues
  ADD COLUMN definition_id uuid REFERENCES diagnostic_definitions(id),
  ADD COLUMN definition_version integer,
  ADD COLUMN fingerprint text,
  ADD COLUMN origin text NOT NULL DEFAULT 'legacy_writer',
  ADD COLUMN evaluation_stage text,
  ADD COLUMN occurrence_operands jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(occurrence_operands)='object'),
  ADD COLUMN suppressed_at timestamptz,
  ADD COLUMN suppressed_by_id uuid REFERENCES users(id),
  ADD COLUMN suppression_reason text,
  ADD COLUMN suppression_expires_at timestamptz;

CREATE TABLE diagnostic_occurrence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  validation_issue_id uuid NOT NULL REFERENCES validation_issues(id),
  event_type text NOT NULL CHECK (event_type IN ('created','resolved','reopened','suppressed')),
  revision integer NOT NULL,
  actor_id uuid REFERENCES users(id),
  reason text,
  event_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION reject_diagnostic_governance_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is append-only; create a new version instead', TG_TABLE_NAME; END $$;

CREATE TRIGGER diagnostic_definitions_no_mutation BEFORE UPDATE OR DELETE ON diagnostic_definitions FOR EACH ROW EXECUTE FUNCTION reject_diagnostic_governance_mutation();
CREATE TRIGGER diagnostic_authorities_no_mutation BEFORE UPDATE OR DELETE ON diagnostic_authorities FOR EACH ROW EXECUTE FUNCTION reject_diagnostic_governance_mutation();
CREATE TRIGGER diagnostic_conditions_no_mutation BEFORE UPDATE OR DELETE ON diagnostic_conditions FOR EACH ROW EXECUTE FUNCTION reject_diagnostic_governance_mutation();
CREATE TRIGGER diagnostic_manifest_releases_no_mutation BEFORE UPDATE OR DELETE ON diagnostic_manifest_releases FOR EACH ROW EXECUTE FUNCTION reject_diagnostic_governance_mutation();
CREATE TRIGGER diagnostic_occurrence_events_no_mutation BEFORE UPDATE OR DELETE ON diagnostic_occurrence_events FOR EACH ROW EXECUTE FUNCTION reject_diagnostic_governance_mutation();

CREATE OR REPLACE FUNCTION link_diagnostic_occurrence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  selected_definition diagnostic_definitions%ROWTYPE;
  occurrence_year integer;
BEGIN
  SELECT tax_year INTO occurrence_year FROM tax_years WHERE id=NEW.tax_year_id;
  IF NEW.definition_id IS NULL THEN
    SELECT * INTO selected_definition
      FROM diagnostic_definitions
      WHERE code=NEW.code AND tax_year=occurrence_year AND jurisdiction='federal' AND filing_channel='preparation'
      ORDER BY definition_version DESC LIMIT 1;
    IF selected_definition.id IS NULL THEN
      INSERT INTO diagnostic_definitions(
        code,definition_version,tax_year,jurisdiction,filing_channel,diagnostic_class,default_severity,
        evaluation_stage,support_state,predicate_id,message_template,resolution_template,
        authority_review_status,owner,source_metadata,definition_hash
      ) VALUES (
        NEW.code,1,occurrence_year,'federal','preparation',COALESCE(NEW.category,'legacy'),
        CASE WHEN NEW.severity='info' THEN 'information' ELSE NEW.severity END,
        COALESCE(NEW.evaluation_stage,NEW.category,'save'),'legacy_supported','legacy:'||NEW.code,
        NEW.message,NEW.resolution_action,'pending','federal-diagnostics',
        jsonb_build_object('discoveredBy','database-trigger'),
        encode(digest(NEW.code||':'||occurrence_year||':1','sha256'),'hex')
      ) ON CONFLICT (code,definition_version,tax_year,jurisdiction,filing_channel) DO NOTHING;
      SELECT * INTO selected_definition
        FROM diagnostic_definitions
        WHERE code=NEW.code AND tax_year=occurrence_year AND jurisdiction='federal' AND filing_channel='preparation'
        ORDER BY definition_version DESC LIMIT 1;
    END IF;
    NEW.definition_id=selected_definition.id;
    NEW.definition_version=selected_definition.definition_version;
  END IF;
  NEW.evaluation_stage=COALESCE(NEW.evaluation_stage,NEW.category,'save');
  NEW.fingerprint=COALESCE(NEW.fingerprint,encode(digest(
    NEW.code||':'||COALESCE(NEW.record_id::text,'')||':'||COALESCE(NEW.field_path,'')||':'||COALESCE(NEW.occurrence_operands::text,'{}'),
    'sha256'),'hex'));
  RETURN NEW;
END $$;

CREATE TRIGGER validation_issues_link_definition BEFORE INSERT ON validation_issues FOR EACH ROW EXECUTE FUNCTION link_diagnostic_occurrence();

INSERT INTO diagnostic_definitions(
  code,definition_version,tax_year,jurisdiction,filing_channel,diagnostic_class,default_severity,
  evaluation_stage,support_state,predicate_id,message_template,resolution_template,
  authority_review_status,owner,source_metadata,definition_hash
)
SELECT DISTINCT vi.code,1,ty.tax_year,'federal','preparation',vi.category,
  CASE WHEN vi.severity='info' THEN 'information' ELSE vi.severity END,
  vi.category,'legacy_supported','legacy:'||vi.code,vi.message,vi.resolution_action,
  'pending','federal-diagnostics',jsonb_build_object('discoveredBy','historical-backfill'),
  encode(digest(vi.code||':'||ty.tax_year||':1','sha256'),'hex')
FROM validation_issues vi JOIN tax_years ty ON ty.id=vi.tax_year_id
ON CONFLICT (code,definition_version,tax_year,jurisdiction,filing_channel) DO NOTHING;

UPDATE validation_issues vi SET
  definition_id=dd.id,
  definition_version=dd.definition_version,
  evaluation_stage=COALESCE(vi.evaluation_stage,vi.category),
  fingerprint=encode(digest(vi.code||':'||COALESCE(vi.record_id::text,'')||':'||COALESCE(vi.field_path,''),'sha256'),'hex')
FROM tax_years ty, diagnostic_definitions dd
WHERE ty.id=vi.tax_year_id AND dd.code=vi.code AND dd.tax_year=ty.tax_year
  AND dd.jurisdiction='federal' AND dd.filing_channel='preparation' AND vi.definition_id IS NULL;

ALTER TABLE validation_issues
  ALTER COLUMN definition_id SET NOT NULL,
  ALTER COLUMN definition_version SET NOT NULL,
  ALTER COLUMN fingerprint SET NOT NULL;

CREATE INDEX validation_issues_definition_idx ON validation_issues(definition_id,created_at);
CREATE INDEX validation_issues_fingerprint_idx ON validation_issues(tax_year_id,fingerprint,resolved_at);

CREATE OR REPLACE FUNCTION record_diagnostic_occurrence_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  kind text;
  event_revision integer;
  event_reason text;
BEGIN
  IF TG_OP='INSERT' THEN
    kind='created'; event_revision=NEW.creation_revision; event_reason=NULL;
  ELSIF OLD.resolved_at IS NULL AND NEW.resolved_at IS NOT NULL THEN
    kind='resolved'; event_revision=COALESCE(NEW.resolved_revision,NEW.creation_revision); event_reason=NEW.resolution;
  ELSIF OLD.resolved_at IS NOT NULL AND NEW.resolved_at IS NULL THEN
    kind='reopened'; event_revision=NEW.creation_revision; event_reason=NEW.resolution;
  ELSIF OLD.suppressed_at IS NULL AND NEW.suppressed_at IS NOT NULL THEN
    kind='suppressed'; event_revision=NEW.creation_revision; event_reason=NEW.suppression_reason;
  ELSE
    RETURN NEW;
  END IF;
  INSERT INTO diagnostic_occurrence_events(validation_issue_id,event_type,revision,actor_id,reason,event_hash)
  VALUES(NEW.id,kind,event_revision,NEW.suppressed_by_id,event_reason,
    encode(digest(NEW.id::text||':'||kind||':'||event_revision||':'||clock_timestamp()::text,'sha256'),'hex'));
  RETURN NEW;
END $$;

CREATE TRIGGER validation_issues_lifecycle_event AFTER INSERT OR UPDATE ON validation_issues FOR EACH ROW EXECUTE FUNCTION record_diagnostic_occurrence_event();
