CREATE TABLE firm_retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id),
  data_category text NOT NULL,
  retention_months integer NOT NULL CHECK (retention_months BETWEEN 1 AND 1200),
  disposition_action text NOT NULL CHECK (disposition_action IN ('review','archive','delete')),
  policy_basis text NOT NULL CHECK (length(btrim(policy_basis))>0),
  version integer NOT NULL DEFAULT 1,
  updated_by_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(firm_id,data_category),
  CHECK (data_category IN ('source_originals','import_payloads','calculation_snapshots','generated_artifacts','audit_history','backups'))
);

CREATE TABLE legal_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id),
  client_id uuid REFERENCES clients(id),
  tax_year_id uuid REFERENCES tax_years(id),
  hold_reference text NOT NULL CHECK (length(btrim(hold_reference))>0),
  reason text NOT NULL CHECK (length(btrim(reason))>0),
  placed_by_id uuid NOT NULL REFERENCES users(id),
  placed_at timestamptz NOT NULL DEFAULT now(),
  released_by_id uuid REFERENCES users(id),
  released_at timestamptz,
  release_reason text,
  version integer NOT NULL DEFAULT 1,
  CHECK (client_id IS NOT NULL OR tax_year_id IS NOT NULL),
  CHECK ((released_at IS NULL AND released_by_id IS NULL AND release_reason IS NULL) OR (released_at IS NOT NULL AND released_by_id IS NOT NULL AND release_reason IS NOT NULL AND length(btrim(release_reason))>0))
);

CREATE INDEX legal_holds_active_scope_idx ON legal_holds(firm_id,client_id,tax_year_id) WHERE released_at IS NULL;
