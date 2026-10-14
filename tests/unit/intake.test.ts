import { describe, expect, it } from "vitest";
import { evaluateIntakeSupport2025, type IntakeAnswerValue2025 } from "../../src/domain/intake";

const answers = (values: Record<string, IntakeAnswerValue2025>) => new Map(Object.entries(values));
const noLinkedTreatments = {
  premiumTaxCreditEnabled: false,
  currentFederalPaymentPresent: false,
  supportedScheduleEOrFActivityPresent: false,
  claimableTaxpayerTreatmentPresent: false,
  claimableTaxpayerTreatmentComplete: false,
  ageBlindnessTreatmentPresent: false,
  ageBlindnessTreatmentComplete: false,
  socialSecurityBenefitPresent: false,
  alternativeMinimumTaxEnabled: false,
  alternativeMinimumTaxComplete: false,
};

describe("2025 intake support boundaries", () => {
  it("accepts supported marketplace, payment, and Schedule E/F answers only when their persisted treatments exist", () => {
    const issues = evaluateIntakeSupport2025(answers({
      "deductions.marketplace": "yes",
      "payments.other": "yes",
      "income.rental_farm_k1": "yes",
      "income.pass_through_k1": "no",
    }), {
      premiumTaxCreditEnabled: true,
      currentFederalPaymentPresent: true,
      supportedScheduleEOrFActivityPresent: true,
      claimableTaxpayerTreatmentPresent: false,
      claimableTaxpayerTreatmentComplete: false,
      ageBlindnessTreatmentPresent: false,
      ageBlindnessTreatmentComplete: false,
      socialSecurityBenefitPresent: false,
      alternativeMinimumTaxEnabled: false,
      alternativeMinimumTaxComplete: false,
    });
    expect(issues).toEqual([]);
  });

  it("blocks affirmative conditional answers until the corresponding profile or activity is present", () => {
    const issues = evaluateIntakeSupport2025(answers({
      "deductions.marketplace": "yes",
      "payments.other": "yes",
      "income.rental_farm_k1": "yes",
    }), noLinkedTreatments);
    expect(issues.map(({ questionId }) => questionId)).toEqual([
      "deductions.marketplace",
      "payments.other",
      "income.rental_farm_k1",
    ]);
  });

  it("blocks contradictory negative answers and keeps pass-through K-1 treatment explicitly unsupported", () => {
    const issues = evaluateIntakeSupport2025(answers({
      "deductions.marketplace": "no",
      "payments.other": "no",
      "income.rental_farm_k1": "no",
      "income.pass_through_k1": "yes",
    }), {
      premiumTaxCreditEnabled: true,
      currentFederalPaymentPresent: true,
      supportedScheduleEOrFActivityPresent: true,
      claimableTaxpayerTreatmentPresent: false,
      claimableTaxpayerTreatmentComplete: false,
      ageBlindnessTreatmentPresent: false,
      ageBlindnessTreatmentComplete: false,
      socialSecurityBenefitPresent: false,
      alternativeMinimumTaxEnabled: false,
      alternativeMinimumTaxComplete: false,
    });
    expect(issues.map(({ questionId }) => questionId)).toEqual(expect.arrayContaining([
      "deductions.marketplace",
      "payments.other",
      "income.rental_farm_k1",
      "income.pass_through_k1",
    ]));
  });

  it("requires completed dependent-taxpayer and age/blindness treatments for affirmative answers", () => {
    const issues = evaluateIntakeSupport2025(answers({
      "identity.claimable_dependent": "yes",
      "identity.age_or_blindness": "yes",
    }), {
      ...noLinkedTreatments,
      claimableTaxpayerTreatmentPresent: true,
      ageBlindnessTreatmentPresent: true,
    });
    expect(issues.map(({ questionId }) => questionId)).toEqual([
      "identity.claimable_dependent",
      "identity.age_or_blindness",
    ]);
  });

  it("accepts completed standard-deduction treatments and rejects conflicting negative answers", () => {
    const facts = {
      ...noLinkedTreatments,
      claimableTaxpayerTreatmentPresent: true,
      claimableTaxpayerTreatmentComplete: true,
      ageBlindnessTreatmentPresent: true,
      ageBlindnessTreatmentComplete: true,
    };
    expect(evaluateIntakeSupport2025(answers({
      "identity.claimable_dependent": "yes",
      "identity.age_or_blindness": "yes",
    }), facts)).toEqual([]);
    expect(evaluateIntakeSupport2025(answers({
      "identity.claimable_dependent": "no",
      "identity.age_or_blindness": "no",
    }), facts).map(({ questionId }) => questionId)).toEqual([
      "identity.claimable_dependent",
      "identity.age_or_blindness",
    ]);
  });

  it("reconciles Social Security intake to an effective SSA-1099 or RRB-1099", () => {
    expect(evaluateIntakeSupport2025(answers({ "income.social_security": "yes" }), noLinkedTreatments)).toEqual([
      expect.objectContaining({ questionId: "income.social_security" }),
    ]);
    expect(evaluateIntakeSupport2025(answers({ "income.social_security": "yes" }), { ...noLinkedTreatments, socialSecurityBenefitPresent: true })).toEqual([]);
    expect(evaluateIntakeSupport2025(answers({ "income.social_security": "no" }), { ...noLinkedTreatments, socialSecurityBenefitPresent: true })).toEqual([
      expect.objectContaining({ questionId: "income.social_security" }),
    ]);
  });

  it("reconciles an affirmative AMT answer to a reviewed Form 6251 profile", () => {
    expect(evaluateIntakeSupport2025(answers({ "taxes.alternative_minimum": "yes" }), noLinkedTreatments)).toEqual([
      expect.objectContaining({ questionId: "taxes.alternative_minimum" }),
    ]);
    expect(evaluateIntakeSupport2025(answers({ "taxes.alternative_minimum": "yes" }), {
      ...noLinkedTreatments,
      alternativeMinimumTaxEnabled: true,
      alternativeMinimumTaxComplete: true,
    })).toEqual([]);
    expect(evaluateIntakeSupport2025(answers({ "taxes.alternative_minimum": "no" }), {
      ...noLinkedTreatments,
      alternativeMinimumTaxEnabled: true,
      alternativeMinimumTaxComplete: true,
    })).toEqual([expect.objectContaining({ questionId: "taxes.alternative_minimum" })]);
  });
});
