export interface ExpectedDocumentDefinition {
  id: string;
  category: "prior_year" | "income" | "business" | "deductions" | "payments";
  label: string;
  description: string;
  allowsMultiple: boolean;
  allowedSourceDocumentTypes: readonly string[];
  triggerQuestionIds: readonly string[];
  defaultSuggested?: boolean;
}

export const expectedDocumentRegistry2025: readonly ExpectedDocumentDefinition[] = [
  { id: "prior_year_return", category: "prior_year", label: "Prior-year federal return", description: "Prior-year return used for identity, carryover and comparison review.", allowsMultiple: false, allowedSourceDocumentTypes: ["OTHER"], triggerQuestionIds: [], defaultSuggested: true },
  { id: "w2", category: "income", label: "Form W-2", description: "Wage and Tax Statement for each employer and owner.", allowsMultiple: true, allowedSourceDocumentTypes: ["W2"], triggerQuestionIds: [] },
  { id: "1099_nec", category: "income", label: "Form 1099-NEC", description: "Nonemployee compensation statement for each payer.", allowsMultiple: true, allowedSourceDocumentTypes: ["1099-NEC"], triggerQuestionIds: [] },
  { id: "1099_misc", category: "income", label: "Form 1099-MISC", description: "Miscellaneous information statement for each payer.", allowsMultiple: true, allowedSourceDocumentTypes: ["1099-MISC"], triggerQuestionIds: [] },
  { id: "1099_int", category: "income", label: "Form 1099-INT", description: "Interest income statement for each payer or consolidated account.", allowsMultiple: true, allowedSourceDocumentTypes: ["1099-INT"], triggerQuestionIds: [] },
  { id: "1099_div", category: "income", label: "Form 1099-DIV", description: "Dividend and distribution statement for each payer or consolidated account.", allowsMultiple: true, allowedSourceDocumentTypes: ["1099-DIV"], triggerQuestionIds: [] },
  { id: "brokerage_statement", category: "income", label: "Brokerage consolidated statement", description: "Complete brokerage package supporting sales, interest, dividends and supplemental detail.", allowsMultiple: true, allowedSourceDocumentTypes: ["1099-INT", "1099-DIV", "OTHER"], triggerQuestionIds: ["income.investment_sales"] },
  { id: "retirement_statement", category: "income", label: "Retirement distribution statement", description: "Form 1099-R or equivalent retirement, pension, annuity or IRA evidence.", allowsMultiple: true, allowedSourceDocumentTypes: ["OTHER"], triggerQuestionIds: ["income.retirement"] },
  { id: "social_security_statement", category: "income", label: "Social Security benefit statement", description: "SSA-1099 or equivalent benefit evidence.", allowsMultiple: true, allowedSourceDocumentTypes: ["OTHER"], triggerQuestionIds: ["income.social_security"] },
  { id: "unemployment_statement", category: "income", label: "Unemployment compensation statement", description: "Form 1099-G or equivalent unemployment evidence.", allowsMultiple: true, allowedSourceDocumentTypes: ["OTHER"], triggerQuestionIds: ["income.unemployment"] },
  { id: "rental_farm_k1_support", category: "income", label: "Rental, farm, royalty or K-1 support", description: "Statements and schedules for the disclosed activity or pass-through interest.", allowsMultiple: true, allowedSourceDocumentTypes: ["1099-MISC", "OTHER"], triggerQuestionIds: ["income.rental_farm_k1"] },
  { id: "foreign_income_support", category: "income", label: "Foreign income reporting support", description: "Statements needed to assess disclosed foreign income or accounts.", allowsMultiple: true, allowedSourceDocumentTypes: ["OTHER"], triggerQuestionIds: ["income.foreign"] },
  { id: "other_income_support", category: "income", label: "Other income support", description: "Evidence for taxable receipts not represented by another source form.", allowsMultiple: true, allowedSourceDocumentTypes: ["OTHER"], triggerQuestionIds: ["income.other"] },
  { id: "business_receipts_support", category: "business", label: "Business receipts support", description: "Books or receipts evidence reconciled without duplicating reported source forms.", allowsMultiple: true, allowedSourceDocumentTypes: ["1099-NEC", "1099-MISC", "OTHER"], triggerQuestionIds: ["business.all_receipts"] },
  { id: "business_expense_support", category: "business", label: "Business expense and asset support", description: "Records for disclosed expenses, inventory, assets, employees, vehicle or home-office facts.", allowsMultiple: true, allowedSourceDocumentTypes: ["OTHER"], triggerQuestionIds: ["business.inventory_assets"] },
  { id: "itemized_deduction_support", category: "deductions", label: "Itemized deduction support", description: "Statements and receipts needed to assess itemized deductions.", allowsMultiple: true, allowedSourceDocumentTypes: ["OTHER"], triggerQuestionIds: ["deductions.itemize"] },
  { id: "credit_support", category: "deductions", label: "Credit eligibility support", description: "Evidence needed to assess a disclosed education, care, energy, foreign-tax or other credit.", allowsMultiple: true, allowedSourceDocumentTypes: ["OTHER"], triggerQuestionIds: ["deductions.credits"] },
  { id: "marketplace_1095a", category: "deductions", label: "Form 1095-A", description: "Health Insurance Marketplace Statement for premium-tax-credit reconciliation.", allowsMultiple: true, allowedSourceDocumentTypes: ["OTHER"], triggerQuestionIds: ["deductions.marketplace"] },
  { id: "schedule1a_support", category: "deductions", label: "Schedule 1-A deduction support", description: "Evidence for disclosed tips, overtime, vehicle-loan interest or senior deduction facts.", allowsMultiple: true, allowedSourceDocumentTypes: ["OTHER"], triggerQuestionIds: ["deductions.schedule1a"] },
  { id: "estimated_payment_support", category: "payments", label: "Estimated or extension payment support", description: "Confirmation of estimated, extension or prior-year credit-elect payments.", allowsMultiple: true, allowedSourceDocumentTypes: ["OTHER"], triggerQuestionIds: ["payments.other"] },
] as const;

export function expectedDocumentRegistryForAnswers(answers: ReadonlyMap<string, string>) {
  return expectedDocumentRegistry2025.map((definition) => ({
    ...definition,
    suggested: Boolean(definition.defaultSuggested || definition.triggerQuestionIds.some((questionId) => answers.get(questionId) === "yes")),
  }));
}
