CREATE TABLE premium_tax_credit_profiles (
  tax_year_id uuid PRIMARY KEY REFERENCES tax_years(id) ON DELETE CASCADE, profile jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK(version > 0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK(jsonb_typeof(profile)='object')
);
CREATE TABLE premium_tax_credit_profile_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tax_year_id uuid NOT NULL REFERENCES tax_years(id) ON DELETE CASCADE,
  profile jsonb NOT NULL CHECK(jsonb_typeof(profile)='object'), version integer NOT NULL CHECK(version > 0), changed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  change_source text NOT NULL CHECK(change_source IN('manual','import','rollback')), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tax_year_id,version)
);
INSERT INTO premium_tax_credit_profiles(tax_year_id,profile) SELECT id,'{}'::jsonb FROM tax_years ON CONFLICT DO NOTHING;
CREATE TRIGGER premium_tax_credit_profiles_touch_updated_at BEFORE UPDATE ON premium_tax_credit_profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE INDEX premium_tax_credit_revisions_year_idx ON premium_tax_credit_profile_revisions(tax_year_id,version DESC);
