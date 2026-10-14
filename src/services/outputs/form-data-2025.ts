import type { CalculationOutput2025 } from "@/tax-engine/2025";
import type { TaxFormData, TaxFormLine } from "./tax-form-renderer";

export interface FormRenderingPlan2025 {
  requiredForms: string[];
  pages: TaxFormData[];
  renderedForms: string[];
  missingForms: string[];
  validationErrors: string[];
}

export function buildFormRenderingPlan2025(result: CalculationOutput2025 | Record<string, unknown>, identity?: { taxpayerName?: string | null; spouseName?: string | null; addressComplete?: boolean; taxpayerTinPresent?: boolean }): FormRenderingPlan2025 {
  const output = result as CalculationOutput2025;
  const requiredForms = requiredFormsForCalculation2025(output);
  if (output.status !== "calculated_draft" || !output.forms) {
    return { requiredForms, pages: [], renderedForms: [], missingForms: requiredForms, validationErrors: ["A calculated draft is required before form pages can be validated."] };
  }

  const forms = output.forms;
  const pages: TaxFormData[] = [
    page("Form 1040", "U.S. Individual Income Tax Return — calculated line preview", [
      text("Status", "Filing status", forms.filingStatus.replaceAll("_", " "), "filing-status"),
      money("1a", "Wages, salaries, tips", forms.form1040.wages, "form-1040.wages"),
      money("2a", "Tax-exempt interest", forms.form1040.taxExemptInterest, "form-1040.tax-exempt-interest"),
      money("2b", "Taxable interest", forms.form1040.taxableInterest, "form-1040.taxable-interest"),
      money("3a", "Qualified dividends", forms.form1040.qualifiedDividends, "form-1040.qualified-dividends"),
      money("3b", "Ordinary dividends", forms.form1040.ordinaryDividends, "form-1040.ordinary-dividends"),
      money("4a", "IRA distributions", forms.form1040.iraDistributions, "form-1040.ira-distributions"),
      money("4b", "Taxable IRA distributions", forms.form1040.taxableIraDistributions, "form-1040.taxable-ira-distributions"),
      money("5a", "Pensions and annuities", forms.form1040.pensionsAndAnnuities, "form-1040.pensions"),
      money("5b", "Taxable pensions and annuities", forms.form1040.taxablePensionsAndAnnuities, "form-1040.taxable-pensions"),
      money("6a", "Social Security and tier-1 railroad benefits", forms.form1040.socialSecurityBenefits, "form-1040.social-security-benefits"),
      money("6b", "Taxable Social Security and tier-1 railroad benefits", forms.form1040.taxableSocialSecurityBenefits, "form-1040.social-security-benefits"),
      money("7", "Capital gain or loss", forms.form1040.capitalGainOrLoss, "schedule-d.net-gain-loss"),
      money("8", "Additional income from Schedule 1", forms.form1040.schedule1AdditionalIncome, "schedule-1.additional-income"),
      money("9", "Total income", forms.form1040.totalIncome, "form-1040.total-income"),
      money("11", "Adjusted gross income", forms.form1040.adjustedGrossIncome, "form-1040.adjusted-gross-income"),
      money("Std. worksheet", "Basic standard deduction before age/blindness addition", forms.form1040.basicStandardDeduction, "form-1040.standard-deduction"),
      money("Std. addition", "Additional standard deduction for age 65 or blindness", forms.form1040.additionalStandardDeduction, "form-1040.standard-deduction"),
      money("12", forms.scheduleA.required ? "Itemized deductions from Schedule A" : "Standard deduction", forms.form1040.deductionUsed, forms.scheduleA.required ? "schedule-a.total-itemized-deductions" : "form-1040.standard-deduction"),
      money("13", "Qualified business income deduction", forms.form1040.qbiDeduction, "form-8995.deduction"),
      money("15", "Taxable income", forms.form1040.taxableIncome, "form-1040.taxable-income"),
      money("16", "Income tax", forms.form1040.incomeTax, "form-1040.income-tax"),
      money("17", "Additional tax from Schedule 2, Part I", forms.schedule2.part1AdditionalTax, "schedule-2.total-additional-taxes"),
      money("19", "Child tax credit / credit for other dependents", forms.form1040.childTaxCreditAndOtherDependentCredit, "schedule-8812.credit"),
      money("20", "Amount from Schedule 3", forms.form1040.schedule3NonrefundableCredits, "schedule-3.total-nonrefundable-credits"),
      money("23", "Other taxes from Schedule 2", forms.schedule2.part2OtherTaxes, "schedule-2.total-additional-taxes"),
      money("24", "Total tax", forms.form1040.totalTax, "form-1040.total-tax"),
      money("25d", "Federal income tax withheld", forms.form1040.federalWithholding, "form-1040.payments"),
      money("28", "Additional child tax credit", forms.form1040.additionalChildTaxCredit, "schedule-8812.additional-child-tax-credit"),
      money("27a", "Earned income credit", forms.form1040.earnedIncomeCredit, "schedule-eic.credit"),
      money("29", "Refundable American Opportunity Credit", forms.form1040.refundableAmericanOpportunityCredit, "form-8863.credit"),
      money("26", "Estimated tax payments", forms.form1040.estimatedTaxPayments, "form-1040.payments"),
      money("31", "Amount from Schedule 3", forms.schedule3.totalOtherPayments, "schedule-3.total-other-payments"),
      money("33", "Total payments", forms.form1040.totalPayments, "form-1040.payments"),
      money("35a", "Refund", forms.form1040.refund, "form-1040.refund"),
      money("37", "Amount owed", forms.form1040.amountOwed, "form-1040.amount-owed"),
    ]),
  ];

  if (forms.dependents.length) pages.push(page("Form 1040 Dependents", "Dependents and credit classification — reviewed profile", forms.dependents.flatMap((dependent, index) => [
    text(`${index + 1}`, "Dependent", dependent.legalName, "dependents"),
    text(`${index + 1} rel.`, "Relationship", dependent.relationship, "dependents"),
    text(`${index + 1} credit`, "Credit classification", dependent.childTaxCredit ? "Child tax credit" : dependent.otherDependentCredit ? "Other dependent credit" : "Dependent only", "schedule-8812.credit"),
  ])));

  if (forms.scheduleA.required) pages.push(page("Schedule A", "Itemized Deductions — supported reviewed amounts", [
    money("1", "Medical and dental expenses", forms.scheduleA.medicalAndDentalExpenses, "schedule-a.total-itemized-deductions"),
    money("3", "7.5% of adjusted gross income", forms.scheduleA.medicalFloor, "schedule-a.total-itemized-deductions"),
    money("4", "Deductible medical and dental expenses", forms.scheduleA.deductibleMedical, "schedule-a.total-itemized-deductions"),
    money("5d", "State and local taxes before limitation", forms.scheduleA.stateAndLocalTaxesBeforeLimit, "schedule-a.total-itemized-deductions"),
    money("5e", "Deductible state and local taxes", forms.scheduleA.deductibleStateAndLocalTaxes, "schedule-a.total-itemized-deductions"),
    money("6", "Other taxes", forms.scheduleA.otherTaxes, "schedule-a.total-itemized-deductions"),
    money("8", "Home mortgage interest and points", forms.scheduleA.homeMortgageInterestAndPoints, "schedule-a.total-itemized-deductions"),
    money("9", "Investment interest", forms.scheduleA.investmentInterest, "schedule-a.total-itemized-deductions"),
    money("14", "Charitable contributions", forms.scheduleA.charitableContributions, "schedule-a.total-itemized-deductions"),
    money("15", "Casualty and theft losses", forms.scheduleA.casualtyAndTheftLosses, "schedule-a.total-itemized-deductions"),
    money("16", "Other itemized deductions", forms.scheduleA.otherItemizedDeductions, "schedule-a.total-itemized-deductions"),
    money("17", "Total itemized deductions", forms.scheduleA.totalItemizedDeductions, "schedule-a.total-itemized-deductions"),
  ]));

  if (forms.schedule8812.qualifyingChildren || forms.schedule8812.otherDependents) pages.push(page("Schedule 8812", "Credits for Qualifying Children and Other Dependents", [
    text("4", "Qualifying children", String(forms.schedule8812.qualifyingChildren), "schedule-8812.credit"),
    money("5", "Potential child tax credit", forms.schedule8812.potentialChildTaxCredit, "schedule-8812.credit"),
    text("6", "Other dependents", String(forms.schedule8812.otherDependents), "schedule-8812.credit"),
    money("7", "Potential credit for other dependents", forms.schedule8812.potentialOtherDependentCredit, "schedule-8812.credit"),
    money("11", "Modified AGI phaseout reduction", forms.schedule8812.phaseoutReduction, "schedule-8812.credit"),
    money("14", "Nonrefundable credit", forms.schedule8812.nonrefundableCredit, "schedule-8812.credit"),
    money("27", "Additional child tax credit", forms.schedule8812.additionalChildTaxCredit, "schedule-8812.additional-child-tax-credit"),
  ]));

  if (forms.scheduleEic.required) pages.push(page("Schedule EIC", "Earned Income Credit — qualifying children and calculation summary", [
    ...forms.scheduleEic.qualifyingChildren.flatMap((child, index) => [text(`${index + 1}`, "Qualifying child dependent ID", child.dependentId, "schedule-eic.credit")]),
    money("Earned income", "Earned income used", forms.scheduleEic.earnedIncome, "schedule-eic.credit"),
    money("AGI", "Adjusted gross income", forms.scheduleEic.adjustedGrossIncome, "schedule-eic.credit"),
    money("Investment", "Reviewed investment income", forms.scheduleEic.investmentIncome, "schedule-eic.credit"),
    money("27a", "Earned income credit", forms.scheduleEic.credit, "schedule-eic.credit"),
  ]));

  if (forms.form2441.required) pages.push(page("Form 2441", "Child and Dependent Care Expenses — calculation summary", [
    text("Providers", "Eligible care providers", String(forms.form2441.providerCount), "form-2441.credit"),
    text("Persons", "Qualifying persons", String(forms.form2441.qualifyingPersonCount), "form-2441.credit"),
    money("Expenses", "Qualified expenses after limits", forms.form2441.qualifiedExpenses, "form-2441.credit"),
    money("Earned limit", "Earned-income limitation", forms.form2441.earnedIncomeLimit, "form-2441.credit"),
    text("Rate", "Applicable percentage", forms.form2441.applicablePercentage, "form-2441.credit"),
    money("Credit", "Child and dependent care credit", forms.form2441.credit, "form-2441.credit"),
    money("Benefits", "Employer dependent-care benefits", forms.form2441.employerBenefits, "form-2441.credit"),
  ]));

  if (forms.form8863.required) pages.push(page("Form 8863", "Education Credits — AOTC and Lifetime Learning Credit summary", [
    ...forms.form8863.students.flatMap((student, index) => [text(`${index + 1}`, "Student / credit type", `${student.studentId} · ${student.creditType.toUpperCase()}`, "form-8863.credit"), money(`${index + 1} exp.`, "Adjusted qualified expenses", student.adjustedExpenses, "form-8863.credit")]),
    money("AOTC", "Tentative American Opportunity Credit", forms.form8863.tentativeAmericanOpportunityCredit, "form-8863.credit"),
    money("LLC", "Tentative Lifetime Learning Credit", forms.form8863.tentativeLifetimeLearningCredit, "form-8863.credit"),
    text("Phaseout", "MAGI phaseout factor", forms.form8863.phaseoutFactor, "form-8863.credit"),
    money("Part I", "Refundable American Opportunity Credit", forms.form8863.refundableAmericanOpportunityCredit, "form-8863.credit"),
    money("Part II", "Nonrefundable education credit", forms.form8863.nonrefundableCredit, "form-8863.credit"),
  ]));

  if (forms.form8867.required) pages.push(page("Form 8867", "Paid Preparer's Due Diligence Checklist — immutable completion record", [
    text("Status", "Required for claimed benefits", "Yes", "form-8867.due-diligence"),
    text("Certification", "Signed for current revision", forms.form8867.signedForCurrentRevision ? "Yes" : "No", "form-8867.due-diligence"),
  ]));

  if (forms.form8962.required) pages.push(page("Form 8962", "Premium Tax Credit — annual marketplace reconciliation", [
    money("2a", "Household income", forms.form8962.householdIncome, "form-8962.credit"),
    text("5", "Household income as percentage of FPL", forms.form8962.householdIncomePercentFpl, "form-8962.credit"),
    text("7", "Applicable percentage", forms.form8962.applicablePercentage, "form-8962.credit"),
    money("8a", "Annual contribution amount", forms.form8962.annualContribution, "form-8962.credit"),
    money("11a", "Annual enrollment premiums", forms.form8962.totalPremium, "form-8962.credit"),
    money("11b", "Annual SLCSP premium", forms.form8962.totalSlcsp, "form-8962.credit"),
    money("11f", "Advance premium tax credit", forms.form8962.totalAdvancePtc, "form-8962.credit"),
    money("26", "Net premium tax credit", forms.form8962.premiumTaxCredit, "form-8962.credit"),
    money("29", "Excess advance PTC repayment", forms.form8962.excessAdvancePtcRepayment, "form-8962.credit"),
  ]));

  if (Number(forms.schedule3.totalNonrefundableCredits) !== 0 || Number(forms.schedule3.premiumTaxCredit) !== 0 || Number(forms.schedule3.totalOtherPayments) !== 0) pages.push(page("Schedule 3", "Additional Credits and Payments — supported lines", [
    money("2", "Child and dependent care credit", forms.schedule3.dependentCareCredit, "form-2441.credit"),
    money("3", "Education credit", forms.schedule3.educationCredit, "form-8863.credit"),
    money("8", "Total nonrefundable credits", forms.schedule3.totalNonrefundableCredits, "schedule-3.total-nonrefundable-credits"),
    money("9", "Net premium tax credit", forms.schedule3.premiumTaxCredit, "form-8962.credit"),
    money("10", "Amount paid with request for extension", forms.schedule3.extensionPayment, "form-1040.payments"),
    money("11", "Excess Social Security withholding", forms.schedule3.excessSocialSecurity, "form-1040.payments"),
    money("13", "Other supported payments", forms.form1040.priorYearAndOtherPayments, "form-1040.payments"),
    money("14", "Total other payments and refundable credits", forms.schedule3.totalOtherPayments, "schedule-3.total-other-payments"),
  ]));

  if (forms.scheduleB.required) pages.push(page("Schedule B", "Interest and Ordinary Dividends — supported totals", [
    money("Part I", "Taxable interest total", forms.scheduleB.taxableInterest, "schedule-b.interest"),
    money("Part II", "Ordinary dividends total", forms.scheduleB.ordinaryDividends, "schedule-b.dividends"),
  ]));

  forms.scheduleC.forEach((activity, index) => pages.push(page("Schedule C", "Profit or Loss From Business — supported lines", [
    money("1", "Gross receipts or sales", activity.grossReceipts, "schedule-c.gross-receipts"),
    money("2", "Returns and allowances", activity.returnsAndAllowances, "schedule-c.net-profit"),
    money("4", "Cost of goods sold", activity.costOfGoodsSold, "schedule-c.net-profit"),
    money("7", "Gross income", activity.grossIncome, "schedule-c.net-profit"),
    money("28", "Total expenses", activity.expenses, "schedule-c.expenses"),
    money("31", "Net profit or loss", activity.netProfit, "schedule-c.net-profit"),
  ], `Activity ${index + 1}: ${activity.activityId}`)));

  forms.scheduleE.forEach((activity, index) => pages.push(page("Schedule E", "Supplemental Income and Loss — supported Part I", [
    money("3", "Rents received", activity.rents, "schedule-e.net-income-loss"),
    money("4", "Royalties received", activity.royalties, "schedule-e.net-income-loss"),
    money("20", "Total expenses", activity.expenses, "schedule-e.net-income-loss"),
    money("26", "Total rental real estate and royalty income or loss", activity.netIncomeOrLoss, "schedule-e.net-income-loss"),
  ], `Activity ${index + 1}: ${activity.activityId}`)));

  forms.scheduleF.forEach((activity, index) => pages.push(page("Schedule F", "Profit or Loss From Farming — supported cash method", [
    money("9", "Gross farm income", activity.grossIncome, "schedule-f.net-profit"),
    money("33", "Total expenses", activity.expenses, "schedule-f.net-profit"),
    money("34", "Net farm profit or loss", activity.netProfit, "schedule-f.net-profit"),
  ], `Activity ${index + 1}: ${activity.activityId}`)));

  forms.form8949.forEach((transaction, index) => pages.push(page("Form 8949", "Sales and Other Dispositions of Capital Assets — simple review profile", [
      money("1d", "Proceeds", transaction.proceeds, "form-8949.proceeds"),
      money("1e", "Cost or other basis", transaction.costBasis, "form-8949.cost-basis"),
      money("1g", "Adjustment", transaction.adjustment, "form-8949.adjustment"),
      money("1h", "Gain or loss", transaction.gainOrLoss, "schedule-d.net-gain-loss"),
    ], `${transaction.term === "short" ? "Short" : "Long"}-term ${index + 1}: ${transaction.description}`)));
  if (forms.form8949.length || Number(forms.scheduleD.netGainOrLoss) !== 0) {
    pages.push(page("Schedule D", "Capital Gains and Losses — supported transaction summary", [
      money("7", "Net short-term gain or loss", forms.scheduleD.shortTermGainOrLoss, "schedule-d.net-gain-loss"),
      money("15", "Net long-term gain or loss", forms.scheduleD.longTermGainOrLoss, "schedule-d.net-gain-loss"),
      money("16", "Combined net gain or loss", forms.scheduleD.netGainOrLoss, "schedule-d.net-gain-loss"),
      money("21", "Deductible loss", forms.scheduleD.deductibleLoss, "schedule-d.net-gain-loss"),
    ]));
  }

  forms.form8889.forEach((distribution, index) => pages.push(page("Form 8889", "Health Savings Accounts — distribution review", [
    money("14a", "Total distributions", distribution.grossDistribution, "form-8889.distributions"),
    money("15", "Qualified medical expenses", distribution.qualifiedMedicalExpenses, "form-8889.distributions"),
    money("16", "Taxable HSA distributions", distribution.taxableDistribution, "form-8889.distributions"),
  ], `Owner ${index + 1}: ${distribution.owner}`)));
  if (forms.form8889Summary.required) pages.push(page("Form 8889", "Health Savings Accounts — contribution and distribution summary", [
    money("3", "Contribution limit", forms.form8889Summary.contributionLimit, "schedule-1.adjustments"),
    money("13", "HSA deduction", forms.form8889Summary.deductibleContribution, "schedule-1.adjustments"),
    money("16", "Taxable HSA distribution", forms.form8889Summary.taxableDistribution, "form-8889.distributions"),
    money("17b", "Additional HSA tax", forms.form8889Summary.additionalTax, "form-8889.distributions"),
  ]));

  forms.scheduleSE.forEach((owner, index) => pages.push(page("Schedule SE", "Self-Employment Tax — supported regular method", [
    money("2", "Net profit from Schedule C and Schedule F", owner.netProfit, "schedule-se.net-profit"),
    money("4a", "Net earnings from self-employment", owner.netEarnings, "schedule-se.net-earnings"),
    money("6", "Social Security wages", owner.socialSecurityWages, "schedule-se.social-security-wages"),
    money("10", "Social Security portion", owner.socialSecurityTax, "schedule-se.social-security-tax"),
    money("11", "Medicare portion", owner.medicareTax, "schedule-se.medicare-tax"),
    money("12", "Self-employment tax", owner.selfEmploymentTax, "schedule-se.tax"),
    money("13", "Deductible one-half of self-employment tax", owner.deductibleHalf, "schedule-1.se-deduction"),
  ], `Owner ${index + 1}: ${owner.owner}`)));

  if (forms.scheduleC.length || forms.scheduleE.length || forms.scheduleF.length || forms.scheduleSE.length || Object.entries(forms.schedule1).some(([key,value]) => key !== "totalAdjustments" && Number(value) !== 0)) {
    pages.push(page("Schedule 1", "Additional Income and Adjustments to Income — supported lines", [
      money("3", "Business income or loss", forms.schedule1.businessIncome, "schedule-c.net-profit"),
      money("5", "Rental real estate, royalties, partnerships, S corporations, trusts", forms.schedule1.rentalRealEstateRoyalties, "schedule-e.net-income-loss"),
      money("6", "Farm income or loss", forms.schedule1.farmIncome, "schedule-f.net-profit"),
      money("7", "Unemployment compensation", forms.schedule1.unemploymentCompensation, "schedule-1.unemployment"),
      money("15", "Deductible part of self-employment tax", forms.schedule1.deductiblePartOfSelfEmploymentTax, "schedule-1.se-deduction"),
      money("11", "Educator expenses", forms.schedule1.educatorExpenses, "schedule-1.adjustments"),
      money("13", "Health savings account deduction", forms.schedule1.hsaDeduction, "schedule-1.adjustments"),
      money("16", "Self-employed retirement plan deduction", forms.schedule1.retirementPlanDeduction, "schedule-1.adjustments"),
      money("17", "Self-employed health-insurance deduction", forms.schedule1.selfEmployedHealthInsuranceDeduction, "schedule-1.adjustments"),
      money("20", "IRA deduction", forms.schedule1.iraDeduction, "schedule-1.adjustments"),
      money("21", "Student-loan interest deduction", forms.schedule1.studentLoanInterestDeduction, "schedule-1.adjustments"),
      money("26", "Total adjustments", forms.schedule1.totalAdjustments, "schedule-1.adjustments"),
    ]));
  }

  if (forms.scheduleSE.length || Number(forms.schedule2.alternativeMinimumTax) !== 0 || Number(forms.schedule2.additionalHsaTax) !== 0 || Number(forms.schedule2.excessAdvancePtcRepayment) !== 0) pages.push(page("Schedule 2", "Additional Taxes — supported lines", [
    money("1", "Alternative minimum tax", forms.schedule2.alternativeMinimumTax, "form-6251.alternative-minimum-tax"),
    money("2", "Excess advance premium tax credit repayment", forms.schedule2.excessAdvancePtcRepayment, "form-8962.credit"),
    money("4", "Self-employment tax", forms.schedule2.selfEmploymentTax, "schedule-se.tax"),
    money("17c", "Additional tax on HSAs", forms.schedule2.additionalHsaTax, "form-8889.distributions"),
    money("21", "Total additional taxes", forms.schedule2.totalAdditionalTaxes, "schedule-2.total-additional-taxes"),
  ]));

  if (forms.form6251.required) pages.push(page("Form 6251", "Alternative Minimum Tax — Individuals", [
    money("1", "Taxable income before qualified business income deduction", forms.form6251.taxableIncomeBeforeQbi, "form-6251.alternative-minimum-tax"),
    money("2a/2b", "Standard deduction or itemized tax addback", forms.form6251.standardOrItemizedTaxAddback, "form-6251.alternative-minimum-tax"),
    money("2c–3", "Other supported adjustments and preferences", forms.form6251.preferenceAdjustments, "form-6251.alternative-minimum-tax"),
    money("4", "Alternative minimum taxable income", forms.form6251.alternativeMinimumTaxableIncome, "form-6251.alternative-minimum-tax"),
    money("5", "Exemption", forms.form6251.exemption, "form-6251.alternative-minimum-tax"),
    money("6", "Taxable excess", forms.form6251.taxableExcess, "form-6251.alternative-minimum-tax"),
    money("9", "Tentative minimum tax", forms.form6251.tentativeMinimumTax, "form-6251.alternative-minimum-tax"),
    money("10", "Regular tax", forms.form6251.regularTax, "form-6251.alternative-minimum-tax"),
    money("11", "Alternative minimum tax", forms.form6251.alternativeMinimumTax, "form-6251.alternative-minimum-tax"),
  ]));

  if (Number(forms.form8995.deduction) > 0) pages.push(page("Form 8995", "Qualified Business Income Deduction — simplified supported lines", [
    money("QBI", "Qualified business income", forms.form8995.qbi, "form-8995.qbi"),
    money("199A", "Section 199A dividends", forms.form8995.section199ADividends, "form-8995.section-199a-dividends"),
    money("Limit", "Income limitation base", forms.form8995.incomeLimitationBase, "form-8995.income-limitation"),
    money("15", "Qualified business income deduction", forms.form8995.deduction, "form-8995.deduction"),
  ]));

  const incomeTaxTrace = output.trace.find(({ nodeId }) => nodeId === "form-1040.income-tax");
  if (incomeTaxTrace?.ruleId === "QD-CAPITAL-GAIN-WORKSHEET") {
    pages.push(page("Qualified Dividends Tax Worksheet", "Controlled computation worksheet summary", [
      money("1", "Taxable income", incomeTaxTrace.operands.taxableIncome ?? forms.form1040.taxableIncome, "form-1040.taxable-income"),
      money("2", "Qualified dividends", incomeTaxTrace.operands.qualifiedDividends ?? forms.form1040.qualifiedDividends, "form-1040.qualified-dividends"),
      money("Result", "Calculated income tax", incomeTaxTrace.operands.calculatedIncomeTax ?? forms.form1040.incomeTax, "form-1040.income-tax"),
    ]));
  }

  const renderedForms = unique(pages.map(({ formName }) => formName));
  const validationErrors = identity ? [
    ...(!identity.taxpayerName ? ["Form 1040: taxpayer legal name is missing."] : []),
    ...(!identity.addressComplete ? ["Form 1040: taxpayer address is incomplete."] : []),
    ...(!identity.taxpayerTinPresent ? ["Form 1040: taxpayer identifying number is unavailable to the renderer."] : []),
    ...(forms.filingStatus === "married_filing_jointly" && !identity.spouseName ? ["Form 1040: spouse legal name is missing for a joint return."] : []),
  ] : [];
  return { requiredForms, pages, renderedForms, missingForms: requiredForms.filter((name) => !renderedForms.includes(name)), validationErrors };
}

export function requiredFormsForCalculation2025(result: CalculationOutput2025 | Record<string, unknown>): string[] {
  const output = result as CalculationOutput2025;
  const forms = output.forms;
  const required = ["Form 1040"];
  if (!forms) return required;
  if (forms.dependents.length) required.push("Form 1040 Dependents");
  if (forms.scheduleA.required) required.push("Schedule A");
  if (forms.schedule8812.qualifyingChildren || forms.schedule8812.otherDependents) required.push("Schedule 8812");
  if (forms.scheduleEic.required) required.push("Schedule EIC");
  if (forms.form2441.required) required.push("Form 2441");
  if (forms.form8863.required) required.push("Form 8863");
  if (forms.form8867.required) required.push("Form 8867");
  if (forms.form8962.required) required.push("Form 8962");
  if (forms.form6251.required) required.push("Form 6251", "Schedule 2");
  if (Number(forms.schedule3.totalNonrefundableCredits) !== 0 || Number(forms.schedule3.premiumTaxCredit) !== 0 || Number(forms.schedule3.totalOtherPayments) !== 0) required.push("Schedule 3");
  if (forms.scheduleB.required) required.push("Schedule B");
  if (forms.scheduleC.length) required.push("Schedule C");
  if (forms.scheduleE.length) required.push("Schedule E");
  if (forms.scheduleF.length) required.push("Schedule F");
  if (forms.form8949.length) required.push("Form 8949");
  if (forms.form8949.length || Number(forms.scheduleD.netGainOrLoss) !== 0) required.push("Schedule D");
  if (forms.form8889.length || forms.form8889Summary.required) required.push("Form 8889");
  if (forms.scheduleSE.length) required.push("Schedule SE", "Schedule 1", "Schedule 2");
  else if (forms.scheduleE.length || forms.scheduleF.length || Object.entries(forms.schedule1).some(([key,value]) => key !== "totalAdjustments" && Number(value) !== 0)) required.push("Schedule 1");
  if (!forms.scheduleSE.length && (Number(forms.schedule2.alternativeMinimumTax) !== 0 || Number(forms.schedule2.additionalHsaTax) !== 0 || Number(forms.schedule2.excessAdvancePtcRepayment) !== 0)) required.push("Schedule 2");
  if (Number(forms.form8995.deduction) > 0) required.push("Form 8995");
  const incomeTaxTrace = output.trace.find(({ nodeId }) => nodeId === "form-1040.income-tax");
  if (incomeTaxTrace?.ruleId === "QD-CAPITAL-GAIN-WORKSHEET") required.push("Qualified Dividends Tax Worksheet");
  return unique(required);
}

function page(formName: string, title: string, lines: TaxFormLine[], instanceLabel?: string): TaxFormData {
  return { formName, title, lines, ...(instanceLabel ? { instanceLabel } : {}) };
}

function money(line: string, label: string, value: string, traceNodeId: string): TaxFormLine {
  const amount = Number(value);
  return { line, label, value: Number.isFinite(amount) ? amount.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }) : value, traceNodeId };
}

function text(line: string, label: string, value: string, traceNodeId: string): TaxFormLine {
  return { line, label, value, traceNodeId };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
