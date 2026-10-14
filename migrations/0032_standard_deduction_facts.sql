ALTER TABLE return_profiles
  ADD COLUMN standard_deduction_facts jsonb NOT NULL DEFAULT '{"schemaVersion":"2025.1","taxpayerClaimableAsDependent":false,"form8615ApplicabilityReviewed":false,"form8615Required":false,"taxpayerAge65OrOlder":false,"taxpayerBlind":false,"spouseAge65OrOlder":false,"spouseBlind":false,"ageBlindnessFactsReviewed":false,"mfsSpouseAdditionalDeductionEligible":false}'::jsonb,
  ADD CONSTRAINT return_profiles_standard_deduction_facts_object CHECK (jsonb_typeof(standard_deduction_facts) = 'object');
