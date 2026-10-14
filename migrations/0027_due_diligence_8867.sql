CREATE TABLE due_diligence_profiles (
  tax_year_id uuid PRIMARY KEY REFERENCES tax_years(id) ON DELETE CASCADE,
  profile jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(jsonb_typeof(profile)='object')
);
CREATE TABLE due_diligence_profile_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tax_year_id uuid NOT NULL REFERENCES tax_years(id) ON DELETE CASCADE,
  profile jsonb NOT NULL CHECK(jsonb_typeof(profile)='object'), version integer NOT NULL CHECK(version > 0),
  changed_by_id uuid REFERENCES users(id) ON DELETE SET NULL, change_source text NOT NULL CHECK(change_source IN('manual','import','rollback')),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tax_year_id,version)
);
CREATE TABLE due_diligence_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tax_year_id uuid NOT NULL REFERENCES tax_years(id) ON DELETE CASCADE,
  tax_year_revision integer NOT NULL CHECK(tax_year_revision > 0), profile_version integer NOT NULL CHECK(profile_version > 0),
  signed_by_id uuid NOT NULL REFERENCES users(id), signature_hash text NOT NULL CHECK(signature_hash ~ '^[a-f0-9]{64}$'),
  certification text NOT NULL, invalidated_at timestamptz, invalidation_reason text, signed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tax_year_id,tax_year_revision,profile_version)
);
INSERT INTO due_diligence_profiles(tax_year_id,profile) SELECT id,'{}'::jsonb FROM tax_years ON CONFLICT DO NOTHING;
CREATE TRIGGER due_diligence_profiles_touch_updated_at BEFORE UPDATE ON due_diligence_profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE INDEX due_diligence_revisions_year_idx ON due_diligence_profile_revisions(tax_year_id,version DESC);
CREATE INDEX due_diligence_signatures_year_idx ON due_diligence_signatures(tax_year_id,signed_at DESC);
