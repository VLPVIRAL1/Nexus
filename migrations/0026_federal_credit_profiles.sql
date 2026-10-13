CREATE TABLE federal_credit_profiles (
  tax_year_id uuid PRIMARY KEY REFERENCES tax_years(id) ON DELETE CASCADE,
  profile jsonb NOT NULL DEFAULT '{"schemaVersion":"2025.1","eitc":{"enabled":false,"eligibilityReviewed":false,"taxpayerAgeAtYearEnd":null,"spouseAgeAtYearEnd":null,"taxpayerWorkEligibleIdentifier":false,"spouseWorkEligibleIdentifier":false,"notQualifyingChildOfAnother":false,"investmentIncome":"0.00","noForm2555":false,"noPriorDisallowance":false,"noCombatPayElection":false,"separatedSpouseEligible":null,"qualifyingChildren":[]},"dependentCare":{"enabled":false,"workRelatedExpensesConfirmed":false,"providers":[],"qualifyingPersons":[],"taxpayerStudentOrDisabledMonths":0,"spouseStudentOrDisabledMonths":0,"additionalEmployerBenefits":"0.00"},"education":{"enabled":false,"students":[]}}'::jsonb,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(profile) = 'object')
);

CREATE TABLE federal_credit_profile_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_year_id uuid NOT NULL REFERENCES tax_years(id) ON DELETE CASCADE,
  profile jsonb NOT NULL CHECK (jsonb_typeof(profile) = 'object'),
  version integer NOT NULL CHECK (version > 0),
  changed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  change_source text NOT NULL CHECK (change_source IN ('manual','import','rollback')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tax_year_id,version)
);

INSERT INTO federal_credit_profiles(tax_year_id)
SELECT id FROM tax_years
ON CONFLICT DO NOTHING;

CREATE TRIGGER federal_credit_profiles_touch_updated_at BEFORE UPDATE ON federal_credit_profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE INDEX federal_credit_profile_revisions_tax_year_idx ON federal_credit_profile_revisions(tax_year_id,version DESC);
