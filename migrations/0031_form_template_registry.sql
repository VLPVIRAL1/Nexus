CREATE TABLE form_template_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tax_year integer NOT NULL, form_name text NOT NULL, source_url text NOT NULL,
  source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'), page_count integer NOT NULL CHECK(page_count > 0),
  coordinate_map_version text NOT NULL, approval_status text NOT NULL DEFAULT 'research_unapproved' CHECK(approval_status IN('research_unapproved','approved')),
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tax_year,form_name,coordinate_map_version)
);
CREATE TABLE output_package_preferences (
  tax_year_id uuid PRIMARY KEY REFERENCES tax_years(id) ON DELETE CASCADE, preferences jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK(version > 0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK(jsonb_typeof(preferences)='object')
);
CREATE TABLE output_package_preference_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tax_year_id uuid NOT NULL REFERENCES tax_years(id) ON DELETE CASCADE,
  preferences jsonb NOT NULL CHECK(jsonb_typeof(preferences)='object'), version integer NOT NULL CHECK(version > 0), changed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  change_source text NOT NULL CHECK(change_source IN('manual','import','rollback')), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tax_year_id,version)
);
INSERT INTO output_package_preferences(tax_year_id,preferences) SELECT id,'{}'::jsonb FROM tax_years ON CONFLICT DO NOTHING;
CREATE TRIGGER output_package_preferences_touch_updated_at BEFORE UPDATE ON output_package_preferences FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE INDEX output_package_preferences_revisions_year_idx ON output_package_preference_revisions(tax_year_id,version DESC);

INSERT INTO form_template_registry(tax_year,form_name,source_url,source_sha256,page_count,coordinate_map_version,approval_status) VALUES
(2025,'Form 1040','https://www.irs.gov/pub/irs-pdf/f1040.pdf','3d31c226df0d189ced80e039d01cf0f8820c1019681a0f0ca6264de277b7e982',2,'official-layout-review-v1','research_unapproved'),
(2025,'Schedule 1','https://www.irs.gov/pub/irs-pdf/f1040s1.pdf','8dafec719f6a4716c259a2bdaca546d9bb9e262d1eabef885fe116a7327458fa',2,'official-layout-review-v1','research_unapproved'),
(2025,'Schedule 2','https://www.irs.gov/pub/irs-pdf/f1040s2.pdf','64d867b683334cfc533993e37ccb0d143449ec29428a78206be2e4de333941e8',2,'official-layout-review-v1','research_unapproved'),
(2025,'Schedule B','https://www.irs.gov/pub/irs-pdf/f1040sb.pdf','dd1ec3719954532bd219343d81385a2ada3c8e9573fc755a3893f1fbbecc63e2',2,'official-layout-review-v1','research_unapproved'),
(2025,'Schedule C','https://www.irs.gov/pub/irs-pdf/f1040sc.pdf','ddf401dbe060467d39f90ad2abf645df1de31512821a150dc68a3882bbf19716',2,'official-layout-review-v1','research_unapproved'),
(2025,'Schedule SE','https://www.irs.gov/pub/irs-pdf/f1040sse.pdf','05bc2b3e1dfca65d8c6fc6d652af4fa3736e953c6575d6e9f82590484677d347',2,'official-layout-review-v1','research_unapproved'),
(2025,'Form 8995','https://www.irs.gov/pub/irs-pdf/f8995.pdf','55380ad230303e1586ce97f0f224265b8337ad18c9204f0fb7325e95a76b5cde',1,'official-layout-review-v1','research_unapproved');
