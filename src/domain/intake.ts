export interface IntakeQuestion {
  id: string;
  group: "identity" | "income" | "deductions" | "business" | "payments" | "schedule_b" | "taxes";
  prompt: string;
  affirmativeTreatment: string;
  supportedWhenYes: boolean;
  supportedWhenNo?: boolean;
  required: boolean;
}

export type IntakeAnswerValue2025 = "yes" | "no" | "unknown";

export interface IntakeSupportFacts2025 {
  premiumTaxCreditEnabled: boolean;
  currentFederalPaymentPresent: boolean;
  supportedScheduleEOrFActivityPresent: boolean;
  claimableTaxpayerTreatmentPresent: boolean;
  claimableTaxpayerTreatmentComplete: boolean;
  ageBlindnessTreatmentPresent: boolean;
  ageBlindnessTreatmentComplete: boolean;
  socialSecurityBenefitPresent: boolean;
  alternativeMinimumTaxEnabled: boolean;
  alternativeMinimumTaxComplete: boolean;
}

export interface IntakeSupportIssue2025 {
  questionId: string;
  treatment: string;
  message: string;
}

export const phase1IntakeQuestions: IntakeQuestion[] = [
  { id: "identity.full_year_resident", group: "identity", prompt: "Was the taxpayer a full-year U.S. resident?", affirmativeTreatment: "Supported filing profile", supportedWhenYes: true, required: true },
  { id: "identity.claimable_dependent", group: "identity", prompt: "Can another person claim the taxpayer as a dependent?", affirmativeTreatment: "Dependent standard-deduction worksheet", supportedWhenYes: true, supportedWhenNo: true, required: true },
  { id: "identity.age_or_blindness", group: "identity", prompt: "Was the taxpayer or eligible spouse age 65 or older or blind at year end?", affirmativeTreatment: "Additional standard deduction", supportedWhenYes: true, supportedWhenNo: true, required: true },
  { id: "identity.special_election", group: "identity", prompt: "Does any special filing election or nonstandard filing-status treatment apply?", affirmativeTreatment: "Special filing election", supportedWhenYes: false, required: true },
  { id: "income.investment_sales", group: "income", prompt: "Were there capital transactions reported on Form 1099-B?", affirmativeTreatment: "Form 8949 / Schedule D", supportedWhenYes: true, supportedWhenNo: true, required: true },
  { id: "income.retirement", group: "income", prompt: "Was any retirement, pension, annuity, or IRA income received?", affirmativeTreatment: "Retirement income", supportedWhenYes: true, supportedWhenNo: true, required: true },
  { id: "income.social_security", group: "income", prompt: "Were Social Security or tier-1 railroad retirement benefits received?", affirmativeTreatment: "Social Security Benefits Worksheet", supportedWhenYes: true, supportedWhenNo: true, required: true },
  { id: "income.unemployment", group: "income", prompt: "Was unemployment compensation received?", affirmativeTreatment: "Schedule 1 income", supportedWhenYes: true, supportedWhenNo: true, required: true },
  { id: "income.rental_farm_k1", group: "income", prompt: "Was there rental, farm, or royalty income reported through a supported Schedule E or F activity?", affirmativeTreatment: "Schedule E/F rental, royalty, or farm activity", supportedWhenYes: true, supportedWhenNo: true, required: true },
  { id: "income.pass_through_k1", group: "income", prompt: "Was there partnership, S corporation, estate, trust, or REMIC income reported on a Schedule K-1 or Schedule Q?", affirmativeTreatment: "Schedule E Parts II through IV pass-through treatment", supportedWhenYes: false, required: true },
  { id: "income.foreign", group: "income", prompt: "Was foreign income received or were foreign financial accounts held?", affirmativeTreatment: "Foreign reporting assessment", supportedWhenYes: false, required: true },
  { id: "income.other", group: "income", prompt: "Was any other taxable receipt received that is not represented by attached source forms?", affirmativeTreatment: "Other income assessment", supportedWhenYes: false, required: true },
  { id: "deductions.itemize", group: "deductions", prompt: "Could itemized deductions exceed the standard deduction, or must this MFS return itemize?", affirmativeTreatment: "Schedule A", supportedWhenYes: true, supportedWhenNo: true, required: true },
  { id: "deductions.credits", group: "deductions", prompt: "Aside from dependent credits, EITC, child/dependent care, and education credits, could an energy, foreign tax, adoption, retirement-savings, or another credit apply?", affirmativeTreatment: "Other credit eligibility", supportedWhenYes: false, required: true },
  { id: "credits.eitc", group: "deductions", prompt: "Should the Earned Income Tax Credit eligibility interview be completed?", affirmativeTreatment: "EITC / Schedule EIC interview", supportedWhenYes: true, supportedWhenNo: true, required: true },
  { id: "credits.dependent_care", group: "deductions", prompt: "Were work-related child or dependent care expenses paid?", affirmativeTreatment: "Form 2441 child and dependent care credit", supportedWhenYes: true, supportedWhenNo: true, required: true },
  { id: "credits.education", group: "deductions", prompt: "Were qualified higher-education expenses paid for the taxpayer, spouse, or a dependent?", affirmativeTreatment: "Form 8863 education credits", supportedWhenYes: true, supportedWhenNo: true, required: true },
  { id: "deductions.marketplace", group: "deductions", prompt: "Was Marketplace health insurance coverage reported on Form 1095-A?", affirmativeTreatment: "Premium tax credit reconciliation", supportedWhenYes: true, supportedWhenNo: true, required: true },
  { id: "deductions.schedule1a", group: "deductions", prompt: "Could qualified tips, overtime, vehicle-loan interest, or the senior deduction apply?", affirmativeTreatment: "2025 Schedule 1-A", supportedWhenYes: false, required: true },
  { id: "business.inventory_assets", group: "business", prompt: "Did any business have inventory, assets, employees, vehicle, home office, loss, or carryover?", affirmativeTreatment: "Complex Schedule C", supportedWhenYes: false, required: true },
  { id: "business.all_receipts", group: "business", prompt: "Are all business receipts, including amounts without a 1099, included?", affirmativeTreatment: "Gross receipts completeness", supportedWhenYes: true, required: true },
  { id: "payments.other", group: "payments", prompt: "Were estimated, extension, or prior-year credit-elect payments made?", affirmativeTreatment: "Non-withholding payments", supportedWhenYes: true, supportedWhenNo: true, required: true },
  { id: "taxes.alternative_minimum", group: "taxes", prompt: "Could alternative minimum tax apply based on preference items or prior-year information?", affirmativeTreatment: "Form 6251", supportedWhenYes: true, supportedWhenNo: true, required: true },
  { id: "taxes.net_investment_income", group: "taxes", prompt: "Could net investment income tax apply?", affirmativeTreatment: "Form 8960", supportedWhenYes: false, required: true },
  { id: "taxes.additional_medicare", group: "taxes", prompt: "Could Additional Medicare Tax apply?", affirmativeTreatment: "Form 8959", supportedWhenYes: false, required: true },
  { id: "schedule_b.foreign_account", group: "schedule_b", prompt: "Did the taxpayer have a financial interest in or signature authority over a foreign financial account?", affirmativeTreatment: "Schedule B Part III", supportedWhenYes: false, required: true },
  { id: "schedule_b.foreign_trust", group: "schedule_b", prompt: "Did the taxpayer receive a distribution from, grant property to, or transfer property to a foreign trust?", affirmativeTreatment: "Schedule B / Form 3520 assessment", supportedWhenYes: false, required: true },
  { id: "schedule_b.other_trigger", group: "schedule_b", prompt: "Does another Schedule B Part III filing condition apply?", affirmativeTreatment: "Schedule B special condition", supportedWhenYes: false, required: true },
];

/**
 * Evaluates both static scope exclusions and supported treatments that require
 * a linked persisted module. Keeping this policy in the domain prevents intake
 * attestation and calculation assembly from disagreeing about the same answer.
 */
export function evaluateIntakeSupport2025(
  answers: ReadonlyMap<string, IntakeAnswerValue2025>,
  facts: IntakeSupportFacts2025,
): IntakeSupportIssue2025[] {
  const issues = new Map<string, IntakeSupportIssue2025>();
  const add = (questionId: string, message: string) => {
    const question = phase1IntakeQuestions.find(({ id }) => id === questionId);
    issues.set(questionId, {
      questionId,
      treatment: question?.affirmativeTreatment ?? questionId,
      message,
    });
  };

  for (const question of phase1IntakeQuestions) {
    const answer = answers.get(question.id);
    const unsupported = answer === "yes"
      ? !question.supportedWhenYes
      : answer === "no"
        ? !(question.supportedWhenNo ?? !question.supportedWhenYes)
        : false;
    if (unsupported) add(question.id, `${question.affirmativeTreatment} is outside the supported calculation profile.`);
  }

  reconcileConditionalTreatment("deductions.marketplace", facts.premiumTaxCreditEnabled, "Enable and complete the persisted Form 1095-A/Form 8962 profile.");
  reconcileConditionalTreatment("payments.other", facts.currentFederalPaymentPresent, "Enter and substantiate at least one current estimated, extension, or prior-year credit-elect payment.");
  reconcileConditionalTreatment("income.rental_farm_k1", facts.supportedScheduleEOrFActivityPresent, "Create and complete at least one supported Schedule E or Schedule F activity.");
  reconcileConditionalTreatment("identity.claimable_dependent", facts.claimableTaxpayerTreatmentPresent, "Complete the dependent-taxpayer standard-deduction and Form 8615 applicability facts.", facts.claimableTaxpayerTreatmentComplete);
  reconcileConditionalTreatment("identity.age_or_blindness", facts.ageBlindnessTreatmentPresent, "Complete the person-specific age/blindness standard-deduction facts.", facts.ageBlindnessTreatmentComplete);
  reconcileConditionalTreatment("income.social_security", facts.socialSecurityBenefitPresent, "Enter at least one effective SSA-1099 or RRB-1099 benefit statement.");
  reconcileConditionalTreatment("taxes.alternative_minimum", facts.alternativeMinimumTaxEnabled, "Enable and complete the persisted Form 6251 profile.", facts.alternativeMinimumTaxComplete);

  return [...issues.values()];

  function reconcileConditionalTreatment(questionId: string, treatmentPresent: boolean, missingMessage: string, treatmentComplete = treatmentPresent) {
    const answer = answers.get(questionId);
    if (answer === "yes" && (!treatmentPresent || !treatmentComplete)) add(questionId, missingMessage);
    if (answer === "no" && treatmentPresent) add(questionId, "The intake answer conflicts with persisted tax data; reconcile the answer or remove the inapplicable treatment.");
  }
}
