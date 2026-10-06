CREATE TABLE expected_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year_id uuid NOT NULL REFERENCES tax_years(id),
  document_key text NOT NULL,
  label text NOT NULL,
  status text NOT NULL CHECK (status IN ('expected','received','unavailable','not_applicable')),
  evidence text,
  source_document_id uuid REFERENCES source_documents(id),
  version integer NOT NULL DEFAULT 1,
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tax_year_id,document_key)
);
CREATE TRIGGER expected_documents_touch_updated_at BEFORE UPDATE ON expected_documents FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE completeness_attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year_id uuid NOT NULL REFERENCES tax_years(id),
  tax_year_revision integer NOT NULL,
  attested_by uuid NOT NULL REFERENCES users(id),
  evidence text NOT NULL,
  missing_document_explanation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tax_year_id,tax_year_revision)
);
CREATE INDEX completeness_attestations_year_revision_idx ON completeness_attestations(tax_year_id,tax_year_revision DESC);
