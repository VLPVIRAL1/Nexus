CREATE TABLE return_profiles (
  tax_year_id uuid PRIMARY KEY REFERENCES tax_years(id) ON DELETE CASCADE,
  filing_status text NOT NULL DEFAULT 'single' CHECK (filing_status IN ('single','married_filing_jointly','married_filing_separately','head_of_household','qualifying_surviving_spouse')),
  filing_status_eligibility_confirmed boolean NOT NULL DEFAULT false,
  schedule_a jsonb NOT NULL DEFAULT '{"enabled":false,"marriedFilingSeparatelySpouseItemizes":null,"medicalAndDentalExpenses":"0.00","stateLocalIncomeOrSalesTaxes":"0.00","realEstateTaxes":"0.00","personalPropertyTaxes":"0.00","otherTaxes":"0.00","homeMortgageInterestAndPoints":"0.00","investmentInterest":"0.00","cashCharitableContributions":"0.00","noncashCharitableContributions":"0.00","casualtyAndTheftLosses":"0.00","otherItemizedDeductions":"0.00","saltEligibilityConfirmed":false,"mortgageLimitsApplied":false,"charityLimitsApplied":false,"casualtyLimitsApplied":false}'::jsonb,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(schedule_a) = 'object')
);

INSERT INTO return_profiles(tax_year_id)
SELECT id FROM tax_years
ON CONFLICT DO NOTHING;

CREATE TRIGGER return_profiles_touch_updated_at BEFORE UPDATE ON return_profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE INDEX dependents_tax_year_name_idx ON dependents(tax_year_id,legal_name);
