CREATE TABLE release_gate_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id),
  gate_code text NOT NULL CHECK (gate_code IN ('scope','data','calculation','ui_review','output','production_data','production_auth')),
  gate_status text NOT NULL CHECK (gate_status IN ('pending','blocked','evidence_ready','approved','rejected')),
  owner_user_id uuid REFERENCES users(id),
  due_date date,
  evidence_reference text,
  notes text,
  submitted_by_id uuid NOT NULL REFERENCES users(id),
  decided_by_id uuid REFERENCES users(id),
  decided_at timestamptz,
  decision_note text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(firm_id,gate_code),
  CHECK (evidence_reference IS NULL OR length(btrim(evidence_reference)) BETWEEN 1 AND 500),
  CHECK (notes IS NULL OR length(notes) <= 4000),
  CHECK (
    (gate_status IN ('approved','rejected') AND decided_by_id IS NOT NULL AND decided_at IS NOT NULL AND decision_note IS NOT NULL AND decided_by_id<>submitted_by_id)
    OR
    (gate_status NOT IN ('approved','rejected') AND decided_by_id IS NULL AND decided_at IS NULL AND decision_note IS NULL)
  )
);

CREATE INDEX release_gate_evidence_firm_status_idx ON release_gate_evidence(firm_id,gate_status);

CREATE TABLE tax_review_fixtures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id),
  fixture_code text NOT NULL CHECK (fixture_code ~ '^[A-Z0-9][A-Z0-9_-]{2,63}$'),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  source_reference text NOT NULL CHECK (length(btrim(source_reference)) BETWEEN 1 AND 500),
  rule_package_version text NOT NULL CHECK (length(btrim(rule_package_version)) BETWEEN 1 AND 100),
  expected_values jsonb NOT NULL,
  actual_values jsonb NOT NULL,
  mismatch_count integer NOT NULL CHECK (mismatch_count >= 0),
  evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$'),
  review_status text NOT NULL DEFAULT 'ready' CHECK (review_status IN ('ready','approved','rejected')),
  prepared_by_id uuid NOT NULL REFERENCES users(id),
  reviewed_by_id uuid REFERENCES users(id),
  reviewed_at timestamptz,
  review_note text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(firm_id,fixture_code),
  CHECK (jsonb_typeof(expected_values)='object' AND jsonb_typeof(actual_values)='object'),
  CHECK (
    (review_status='ready' AND reviewed_by_id IS NULL AND reviewed_at IS NULL AND review_note IS NULL)
    OR
    (review_status IN ('approved','rejected') AND reviewed_by_id IS NOT NULL AND reviewed_at IS NOT NULL AND review_note IS NOT NULL AND reviewed_by_id<>prepared_by_id)
  ),
  CHECK (review_status<>'approved' OR mismatch_count=0)
);

CREATE INDEX tax_review_fixtures_firm_status_idx ON tax_review_fixtures(firm_id,review_status);

CREATE TABLE infrastructure_control_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id),
  control_code text NOT NULL CHECK (control_code IN ('supabase_auth','trusted_ingress','malware_scanner','source_encryption','monitoring_incident','backup_restore','retention','production_authorization')),
  provider_name text NOT NULL CHECK (length(btrim(provider_name)) BETWEEN 1 AND 200),
  control_status text NOT NULL CHECK (control_status IN ('pending','pass','fail')),
  evidence_reference text NOT NULL CHECK (length(btrim(evidence_reference)) BETWEEN 1 AND 500),
  details text NOT NULL CHECK (length(btrim(details)) BETWEEN 1 AND 4000),
  observed_at timestamptz NOT NULL,
  expires_at timestamptz,
  recorded_by_id uuid NOT NULL REFERENCES users(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(firm_id,control_code),
  CHECK (expires_at IS NULL OR expires_at>observed_at)
);

CREATE TABLE production_readiness_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id),
  ready boolean NOT NULL,
  passed_count integer NOT NULL CHECK (passed_count >= 0),
  total_count integer NOT NULL CHECK (total_count > 0 AND passed_count <= total_count),
  checks jsonb NOT NULL CHECK (jsonb_typeof(checks)='array'),
  evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$'),
  assessed_at timestamptz NOT NULL,
  imported_by_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX production_readiness_assessments_firm_created_idx ON production_readiness_assessments(firm_id,created_at DESC);

CREATE TABLE manual_acceptance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id),
  protocol_code text NOT NULL CHECK (protocol_code IN ('accessibility','preparer')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  test_environment text NOT NULL CHECK (length(btrim(test_environment)) BETWEEN 1 AND 500),
  participant_role text NOT NULL CHECK (length(btrim(participant_role)) BETWEEN 1 AND 200),
  assistive_technology text,
  scenarios_total integer NOT NULL CHECK (scenarios_total BETWEEN 1 AND 1000),
  scenarios_passed integer NOT NULL CHECK (scenarios_passed BETWEEN 0 AND scenarios_total),
  session_result text NOT NULL CHECK (session_result IN ('pass','partial','fail')),
  findings text NOT NULL CHECK (length(btrim(findings)) BETWEEN 1 AND 4000),
  evidence_reference text NOT NULL CHECK (length(btrim(evidence_reference)) BETWEEN 1 AND 500),
  conducted_at timestamptz NOT NULL,
  acceptance_status text NOT NULL DEFAULT 'recorded' CHECK (acceptance_status IN ('recorded','signed','rejected')),
  recorded_by_id uuid NOT NULL REFERENCES users(id),
  reviewed_by_id uuid REFERENCES users(id),
  reviewed_at timestamptz,
  review_note text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (assistive_technology IS NULL OR length(assistive_technology)<=500),
  CHECK (
    (acceptance_status='recorded' AND reviewed_by_id IS NULL AND reviewed_at IS NULL AND review_note IS NULL)
    OR
    (acceptance_status IN ('signed','rejected') AND reviewed_by_id IS NOT NULL AND reviewed_at IS NOT NULL AND review_note IS NOT NULL AND reviewed_by_id<>recorded_by_id)
  ),
  CHECK (acceptance_status<>'signed' OR (session_result='pass' AND scenarios_passed=scenarios_total))
);

CREATE INDEX manual_acceptance_sessions_firm_protocol_idx ON manual_acceptance_sessions(firm_id,protocol_code,created_at DESC);

CREATE TABLE output_tie_outs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id),
  tax_year_id uuid NOT NULL REFERENCES tax_years(id),
  calculation_run_id uuid REFERENCES calculation_runs(id),
  artifact_id uuid REFERENCES generated_artifacts(id),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  expected_values jsonb NOT NULL,
  actual_values jsonb NOT NULL,
  mismatch_count integer NOT NULL CHECK (mismatch_count >= 0),
  evidence_reference text NOT NULL CHECK (length(btrim(evidence_reference)) BETWEEN 1 AND 500),
  evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$'),
  tie_out_status text NOT NULL DEFAULT 'ready' CHECK (tie_out_status IN ('ready','approved','rejected')),
  prepared_by_id uuid NOT NULL REFERENCES users(id),
  reviewed_by_id uuid REFERENCES users(id),
  reviewed_at timestamptz,
  review_note text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(expected_values)='object' AND jsonb_typeof(actual_values)='object'),
  CHECK (
    (tie_out_status='ready' AND reviewed_by_id IS NULL AND reviewed_at IS NULL AND review_note IS NULL)
    OR
    (tie_out_status IN ('approved','rejected') AND reviewed_by_id IS NOT NULL AND reviewed_at IS NOT NULL AND review_note IS NOT NULL AND reviewed_by_id<>prepared_by_id)
  ),
  CHECK (tie_out_status<>'approved' OR mismatch_count=0)
);

CREATE INDEX output_tie_outs_firm_created_idx ON output_tie_outs(firm_id,created_at DESC);
