export interface IntakeQuestion {
  id: string;
  group: "identity" | "income" | "deductions" | "business" | "payments" | "schedule_b" | "taxes";
  prompt: string;
  affirmativeTreatment: string;
  supportedWhenYes: boolean;
  required: boolean;
}

export const phase1IntakeQuestions: IntakeQuestion[] = [
  { id: "identity.full_year_resident", group: "identity", prompt: "Was the taxpayer a full-year U.S. resident?", affirmativeTreatment: "Supported filing profile", supportedWhenYes: true, required: true },
  { id: "identity.claimable_dependent", group: "identity", prompt: "Can another person claim the taxpayer or spouse as a dependent?", affirmativeTreatment: "Dependent filing profile", supportedWhenYes: false, required: true },
  { id: "identity.age_or_blindness", group: "identity", prompt: "Was either spouse age 65 or older or blind at year end?", affirmativeTreatment: "Additional standard deduction", supportedWhenYes: false, required: true },
  { id: "identity.special_election", group: "identity", prompt: "Does any special filing election or nonstandard filing-status treatment apply?", affirmativeTreatment: "Special filing election", supportedWhenYes: false, required: true },
  { id: "income.investment_sales", group: "income", prompt: "Were there sales of stocks, digital assets, or other capital property?", affirmativeTreatment: "Form 8949 / Schedule D", supportedWhenYes: false, required: true },
  { id: "income.retirement", group: "income", prompt: "Was any retirement, pension, annuity, or IRA income received?", affirmativeTreatment: "Retirement income", supportedWhenYes: false, required: true },
  { id: "income.social_security", group: "income", prompt: "Were Social Security benefits received?", affirmativeTreatment: "Taxable benefit worksheet", supportedWhenYes: false, required: true },
  { id: "income.unemployment", group: "income", prompt: "Was unemployment compensation received?", affirmativeTreatment: "Schedule 1 income", supportedWhenYes: false, required: true },
  { id: "income.rental_farm_k1", group: "income", prompt: "Was there rental, farm, royalty, partnership, S corporation, estate, or trust income?", affirmativeTreatment: "Schedule E/F or K-1", supportedWhenYes: false, required: true },
  { id: "income.foreign", group: "income", prompt: "Was foreign income received or were foreign financial accounts held?", affirmativeTreatment: "Foreign reporting assessment", supportedWhenYes: false, required: true },
  { id: "income.other", group: "income", prompt: "Was any other taxable receipt received that is not represented by attached source forms?", affirmativeTreatment: "Other income assessment", supportedWhenYes: false, required: true },
  { id: "deductions.itemize", group: "deductions", prompt: "Could itemized deductions exceed the standard deduction?", affirmativeTreatment: "Schedule A", supportedWhenYes: false, required: true },
  { id: "deductions.credits", group: "deductions", prompt: "Could education, child care, EITC, energy, foreign tax, or another credit apply?", affirmativeTreatment: "Credit eligibility", supportedWhenYes: false, required: true },
  { id: "deductions.marketplace", group: "deductions", prompt: "Was Marketplace health insurance coverage reported on Form 1095-A?", affirmativeTreatment: "Premium tax credit reconciliation", supportedWhenYes: false, required: true },
  { id: "deductions.schedule1a", group: "deductions", prompt: "Could qualified tips, overtime, vehicle-loan interest, or the senior deduction apply?", affirmativeTreatment: "2025 Schedule 1-A", supportedWhenYes: false, required: true },
  { id: "business.inventory_assets", group: "business", prompt: "Did any business have inventory, assets, employees, vehicle, home office, loss, or carryover?", affirmativeTreatment: "Complex Schedule C", supportedWhenYes: false, required: true },
  { id: "business.all_receipts", group: "business", prompt: "Are all business receipts, including amounts without a 1099, included?", affirmativeTreatment: "Gross receipts completeness", supportedWhenYes: true, required: true },
  { id: "payments.other", group: "payments", prompt: "Were estimated, extension, or prior-year credit-elect payments made?", affirmativeTreatment: "Non-withholding payments", supportedWhenYes: false, required: true },
  { id: "taxes.alternative_minimum", group: "taxes", prompt: "Could alternative minimum tax apply based on preference items or prior-year information?", affirmativeTreatment: "Form 6251", supportedWhenYes: false, required: true },
  { id: "taxes.net_investment_income", group: "taxes", prompt: "Could net investment income tax apply?", affirmativeTreatment: "Form 8960", supportedWhenYes: false, required: true },
  { id: "taxes.additional_medicare", group: "taxes", prompt: "Could Additional Medicare Tax apply?", affirmativeTreatment: "Form 8959", supportedWhenYes: false, required: true },
  { id: "schedule_b.foreign_account", group: "schedule_b", prompt: "Did the taxpayer have a financial interest in or signature authority over a foreign financial account?", affirmativeTreatment: "Schedule B Part III", supportedWhenYes: false, required: true },
  { id: "schedule_b.foreign_trust", group: "schedule_b", prompt: "Did the taxpayer receive a distribution from, grant property to, or transfer property to a foreign trust?", affirmativeTreatment: "Schedule B / Form 3520 assessment", supportedWhenYes: false, required: true },
  { id: "schedule_b.other_trigger", group: "schedule_b", prompt: "Does another Schedule B Part III filing condition apply?", affirmativeTreatment: "Schedule B special condition", supportedWhenYes: false, required: true },
];
