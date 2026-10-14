import Decimal from "decimal.js";
import type { AdvancedFederalProfile2025 } from "@/domain/advanced-federal-2025";
import { amount, nonnegative, sum, whole } from "./math";
import type { FilingStatus2025, PersonRole2025, WageInput2025 } from "./types";

type Block = (code: string, message: string, path?: string | null) => void;

export interface AdjustmentCalculation2025 {
  educatorExpenses: Decimal; iraDeduction: Decimal; studentLoanInterestDeduction: Decimal; hsaDeduction: Decimal;
  selfEmployedHealthInsuranceDeduction: Decimal; retirementPlanDeduction: Decimal; totalAdjustments: Decimal;
  hsaContributionLimit: Decimal; hsaTaxableDistribution: Decimal; additionalHsaTax: Decimal;
}

export function calculateAdjustments2025(args: {
  profile: AdvancedFederalProfile2025; filingStatus: FilingStatus2025; preliminaryAgi: Decimal;
  businessIncome: Decimal; farmIncome: Decimal; deductibleHalfSelfEmploymentTax: Decimal; hasSpouse: boolean; valid1098ERecordIds: string[]; validActivityIds: string[]; block: Block;
}): AdjustmentCalculation2025 {
  const { profile, filingStatus, preliminaryAgi, businessIncome, farmIncome, deductibleHalfSelfEmploymentTax, hasSpouse, valid1098ERecordIds, validActivityIds, block } = args;
  const values = profile.adjustments;
  let educatorExpenses = new Decimal(0); let iraDeduction = new Decimal(0); let studentLoanInterestDeduction = new Decimal(0);
  let hsaDeduction = new Decimal(0); let selfEmployedHealthInsuranceDeduction = new Decimal(0); let retirementPlanDeduction = new Decimal(0);
  let hsaContributionLimit = new Decimal(0); let hsaTaxableDistribution = new Decimal(0); let additionalHsaTax = new Decimal(0);

  if (values.educator.enabled) {
    const owner = (role: PersonRole2025) => {
      const net = nonnegative(read(values.educator.expenses[role], `advancedFederal.adjustments.educator.expenses.${role}`, block).minus(read(values.educator.reimbursements[role], `advancedFederal.adjustments.educator.reimbursements.${role}`, block)));
      if (net.gt(0) && !values.educator.eligible[role]) block("EDUCATOR_ELIGIBILITY_REQUIRED", `Confirm ${role} educator eligibility before claiming expenses.`, `advancedFederal.adjustments.educator.eligible.${role}`);
      return values.educator.eligible[role] ? Decimal.min(net, 300) : new Decimal(0);
    };
    educatorExpenses = whole(owner("taxpayer").plus(filingStatus === "married_filing_jointly" && hasSpouse ? owner("spouse") : 0));
  }

  if (values.hsa.enabled) {
    const annual = amount(values.hsa.coverageType === "family" ? 8550 : 4300).plus(values.hsa.age55OrOlder ? 1000 : 0);
    hsaContributionLimit = whole(values.hsa.lastMonthRuleUsed ? annual : annual.mul(values.hsa.eligibleMonths).div(12));
    if (values.hsa.lastMonthRuleUsed && !values.hsa.testingPeriodSatisfied) block("HSA_TESTING_PERIOD_REQUIRED", "The HSA last-month rule requires a satisfied testing period.", "advancedFederal.adjustments.hsa.testingPeriodSatisfied");
    const personal = read(values.hsa.personalContributions, "advancedFederal.adjustments.hsa.personalContributions", block);
    const employer = read(values.hsa.employerContributions, "advancedFederal.adjustments.hsa.employerContributions", block);
    const excess = read(values.hsa.excessContributions, "advancedFederal.adjustments.hsa.excessContributions", block);
    if (personal.plus(employer).gt(hsaContributionLimit) && excess.isZero()) block("HSA_EXCESS_CONTRIBUTION_REVIEW_REQUIRED", "HSA contributions exceed the calculated limit; identify the excess contribution.", "advancedFederal.adjustments.hsa");
    hsaDeduction = whole(Decimal.min(personal, Decimal.max(0, hsaContributionLimit.minus(employer))));
    hsaTaxableDistribution = whole(read(values.hsa.nonqualifiedDistributions, "advancedFederal.adjustments.hsa.nonqualifiedDistributions", block));
    if (values.hsa.additionalTaxException !== "none" && !values.hsa.additionalTaxExceptionReviewed) block("HSA_ADDITIONAL_TAX_EXCEPTION_REVIEW_REQUIRED", "Review the death, disability or age-65 exception before suppressing the additional HSA tax.", "advancedFederal.adjustments.hsa.additionalTaxExceptionReviewed");
    additionalHsaTax = values.hsa.additionalTaxException !== "none" && values.hsa.additionalTaxExceptionReviewed ? new Decimal(0) : whole(hsaTaxableDistribution.mul("0.20"));
  }

  const positiveBusinessIncome = nonnegative(businessIncome.plus(farmIncome));
  const netSelfEmploymentCompensation = nonnegative(positiveBusinessIncome.minus(deductibleHalfSelfEmploymentTax));
  if (values.selfEmployedHealthInsurance.enabled && values.retirementPlan.enabled) block("SE_DEDUCTION_INTERACTION_REVIEW_REQUIRED", "Simultaneous self-employed health-insurance and retirement-plan deductions require an owner-specific interaction worksheet outside this supported profile.", "advancedFederal.adjustments");
  if (values.selfEmployedHealthInsurance.enabled) {
    if (!values.selfEmployedHealthInsurance.eligibilityReviewed) block("SE_HEALTH_REVIEW_REQUIRED", "Complete the self-employed health-insurance eligibility review.", "advancedFederal.adjustments.selfEmployedHealthInsurance");
    if (!values.selfEmployedHealthInsurance.activityId || !validActivityIds.includes(values.selfEmployedHealthInsurance.activityId)) block("SE_HEALTH_ACTIVITY_REQUIRED", "Link self-employed health insurance to an effective Schedule C or F activity.", "advancedFederal.adjustments.selfEmployedHealthInsurance.activityId");
    const eligibleFraction = amount(12 - values.selfEmployedHealthInsurance.employerEligibleMonths).div(12);
    selfEmployedHealthInsuranceDeduction = whole(Decimal.min(read(values.selfEmployedHealthInsurance.premiums, "advancedFederal.adjustments.selfEmployedHealthInsurance.premiums", block).mul(eligibleFraction), netSelfEmploymentCompensation));
  }

  if (values.retirementPlan.enabled) {
    if (!values.retirementPlan.limitReviewed) block("SE_RETIREMENT_LIMIT_REVIEW_REQUIRED", "Confirm the self-employed retirement-plan contribution limit.", "advancedFederal.adjustments.retirementPlan.limitReviewed");
    if (!values.retirementPlan.activityId || !validActivityIds.includes(values.retirementPlan.activityId)) block("SE_RETIREMENT_ACTIVITY_REQUIRED", "Link the retirement plan to an effective Schedule C or F activity.", "advancedFederal.adjustments.retirementPlan.activityId");
    if (values.retirementPlan.planType !== "sep") block("SE_RETIREMENT_PLAN_TYPE_UNSUPPORTED", "SIMPLE and qualified self-employed plan computations require plan-specific contribution facts outside this supported profile.", "advancedFederal.adjustments.retirementPlan.planType");
    const entered = sum([read(values.retirementPlan.contributions.taxpayer, "advancedFederal.adjustments.retirementPlan.contributions.taxpayer", block), read(values.retirementPlan.contributions.spouse, "advancedFederal.adjustments.retirementPlan.contributions.spouse", block)]);
    retirementPlanDeduction = values.retirementPlan.planType === "sep" ? whole(Decimal.min(entered, netSelfEmploymentCompensation.mul("0.20"), 70000)) : new Decimal(0);
  }

  const agiBeforeIraAndStudentLoan = whole(preliminaryAgi.minus(educatorExpenses).minus(hsaDeduction).minus(selfEmployedHealthInsuranceDeduction).minus(retirementPlanDeduction));
  if (values.ira.enabled) {
    if (!values.ira.eligibilityReviewed) block("IRA_DEDUCTION_REVIEW_REQUIRED", "Complete the IRA deduction eligibility and workplace-plan review.", "advancedFederal.adjustments.ira");
    if (values.ira.nondeductibleBasisApplies) block("FORM_8606_REQUIRED", "Nondeductible IRA basis requires Form 8606 treatment outside this supported profile.", "advancedFederal.adjustments.ira.nondeductibleBasisApplies");
    const roles: PersonRole2025[] = filingStatus === "married_filing_jointly" && hasSpouse ? ["taxpayer", "spouse"] : ["taxpayer"];
    iraDeduction = whole(sum(roles.map((role) => {
      const contribution = Decimal.min(read(values.ira.contributions[role], `advancedFederal.adjustments.ira.contributions.${role}`, block), values.ira.age50OrOlder[role] ? 8000 : 7000);
      if (!values.ira.workplacePlanCovered[role]) {
        const otherRole: PersonRole2025 = role === "taxpayer" ? "spouse" : "taxpayer";
        if (filingStatus !== "married_filing_jointly" || !values.ira.workplacePlanCovered[otherRole]) return contribution;
        return whole(contribution.mul(phaseoutFactor(agiBeforeIraAndStudentLoan, 236000, 246000)));
      }
      const [lower, upper] = iraPhaseout(filingStatus);
      return whole(contribution.mul(phaseoutFactor(agiBeforeIraAndStudentLoan, lower, upper)));
    })));
  }

  if (values.studentLoan.enabled) {
    if (filingStatus === "married_filing_separately") block("STUDENT_LOAN_MFS_INELIGIBLE", "Student-loan interest is unavailable for Married Filing Separately.", "advancedFederal.adjustments.studentLoan");
    if (!values.studentLoan.eligibilityReviewed) block("STUDENT_LOAN_REVIEW_REQUIRED", "Complete the qualified student-loan and dependent-status review.", "advancedFederal.adjustments.studentLoan");
    if (!values.studentLoan.form1098ERecordId || !valid1098ERecordIds.includes(values.studentLoan.form1098ERecordId)) block("FORM_1098_E_REQUIRED", "Link an effective Form 1098-E before claiming student-loan interest.", "advancedFederal.adjustments.studentLoan.form1098ERecordId");
    const base = Decimal.min(read(values.studentLoan.interestPaid, "advancedFederal.adjustments.studentLoan.interestPaid", block), 2500);
    const studentLoanMagi = whole(agiBeforeIraAndStudentLoan.minus(iraDeduction));
    const factor = filingStatus === "married_filing_jointly" ? phaseoutFactor(studentLoanMagi, 170000, 200000) : phaseoutFactor(studentLoanMagi, 85000, 100000);
    studentLoanInterestDeduction = whole(base.mul(factor));
  }
  const totalAdjustments = whole(sum([educatorExpenses, iraDeduction, studentLoanInterestDeduction, hsaDeduction, selfEmployedHealthInsuranceDeduction, retirementPlanDeduction]));
  return { educatorExpenses, iraDeduction, studentLoanInterestDeduction, hsaDeduction, selfEmployedHealthInsuranceDeduction, retirementPlanDeduction, totalAdjustments, hsaContributionLimit, hsaTaxableDistribution, additionalHsaTax };
}

export function calculatePremiumTaxCredit2025(args: { profile: AdvancedFederalProfile2025; modifiedAgi: Decimal; filingStatus: FilingStatus2025; valid1095ARecordIds: string[]; block: Block }) {
  const { profile, modifiedAgi, filingStatus, valid1095ARecordIds, block } = args;
  const value = profile.premiumTaxCredit;
  let premiumTaxCredit = new Decimal(0); let excessAdvancePtcRepayment = new Decimal(0); let totalPremium = new Decimal(0); let totalSlcsp = new Decimal(0); let totalAdvancePtc = new Decimal(0);
  if (!value.enabled) return { required: false, householdIncome: modifiedAgi.toFixed(0), householdIncomePercentFpl: "0.00", applicablePercentage: "0.0000", annualContribution: "0", totalPremium: "0", totalSlcsp: "0", totalAdvancePtc: "0", premiumTaxCredit, excessAdvancePtcRepayment };
  if (filingStatus === "married_filing_separately") block("FORM_8962_MFS_UNSUPPORTED", "Premium Tax Credit generally requires a filing status other than Married Filing Separately; reviewed exceptions are outside this profile.", "advancedFederal.premiumTaxCredit");
  if (!value.householdMembersReconciled) block("FORM_8962_HOUSEHOLD_REVIEW_REQUIRED", "Reconcile every member of the Form 8962 tax family.", "advancedFederal.premiumTaxCredit.householdMembersReconciled");
  if (!value.policies.length) block("FORM_1095_A_REQUIRED", "Add at least one Form 1095-A policy.", "advancedFederal.premiumTaxCredit.policies");
  const otherMagi = read(value.householdModifiedAgiOther, "advancedFederal.premiumTaxCredit.householdModifiedAgiOther", block);
  const householdIncome = whole(modifiedAgi.plus(otherMagi));
  const povertyLine = read(value.federalPovertyLine, "advancedFederal.premiumTaxCredit.federalPovertyLine", block);
  if (povertyLine.lte(0)) block("FORM_8962_FPL_REQUIRED", "Enter the reviewed federal poverty-line amount for the household size and state.", "advancedFederal.premiumTaxCredit.federalPovertyLine");
  const percentFpl = povertyLine.gt(0) ? householdIncome.div(povertyLine).mul(100) : new Decimal(0);
  if (povertyLine.gt(0) && percentFpl.lt(100)) block("FORM_8962_BELOW_FPL_EXCEPTION_UNSUPPORTED", "Household income below 100% of the federal poverty line requires reviewed eligibility exceptions outside this supported profile.", "advancedFederal.premiumTaxCredit");
  const applicablePercentage = ptcApplicablePercentage(percentFpl);
  const annualContribution = whole(householdIncome.mul(applicablePercentage));
  for (const [policyIndex, policy] of value.policies.entries()) {
    if (!policy.form1095ARecordId || !valid1095ARecordIds.includes(policy.form1095ARecordId)) block("FORM_1095_A_LINK_INVALID", "Each marketplace policy must link to an effective Form 1095-A.", `advancedFederal.premiumTaxCredit.policies.${policyIndex}.form1095ARecordId`);
    const allocation = readPercentage(policy.allocationPercentage, `advancedFederal.premiumTaxCredit.policies.${policyIndex}.allocationPercentage`, block);
    if (!allocation.eq(1) && (!policy.allocationReviewed || !value.sharedPoliciesReviewed)) block("FORM_8962_SHARED_POLICY_REVIEW_REQUIRED", "Shared-policy allocation percentages require reviewed reconciliation.", `advancedFederal.premiumTaxCredit.policies.${policyIndex}`);
    const monthNumbers = new Set(policy.months.map(({ month }) => month));
    if (monthNumbers.size !== policy.months.length) block("FORM_8962_DUPLICATE_MONTH", "A marketplace policy cannot contain duplicate coverage months.", `advancedFederal.premiumTaxCredit.policies.${policyIndex}.months`);
    for (const [monthIndex, month] of policy.months.entries()) {
      const premium = read(month.enrollmentPremium, `advancedFederal.premiumTaxCredit.policies.${policyIndex}.months.${monthIndex}.enrollmentPremium`, block).mul(allocation);
      const slcsp = read(month.slcspPremium, `advancedFederal.premiumTaxCredit.policies.${policyIndex}.months.${monthIndex}.slcspPremium`, block).mul(allocation);
      const advance = read(month.advancePtc, `advancedFederal.premiumTaxCredit.policies.${policyIndex}.months.${monthIndex}.advancePtc`, block).mul(allocation);
      if (premium.gt(0) && slcsp.lte(0)) block("FORM_8962_SLCSP_REQUIRED", "Every enrolled month requires a reviewed second-lowest-cost silver-plan premium.", `advancedFederal.premiumTaxCredit.policies.${policyIndex}.months.${monthIndex}.slcspPremium`);
      totalPremium = totalPremium.plus(premium); totalSlcsp = totalSlcsp.plus(slcsp); totalAdvancePtc = totalAdvancePtc.plus(advance);
      premiumTaxCredit = premiumTaxCredit.plus(Decimal.min(premium, Decimal.max(0, slcsp.minus(annualContribution.div(12)))));
    }
  }
  premiumTaxCredit = whole(premiumTaxCredit);
  const net = premiumTaxCredit.minus(whole(totalAdvancePtc));
  if (net.gte(0)) premiumTaxCredit = whole(net); else {
    const rawRepayment = whole(net.abs());
    excessAdvancePtcRepayment = Decimal.min(rawRepayment, ptcRepaymentLimit(percentFpl, filingStatus));
    premiumTaxCredit = new Decimal(0);
  }
  if (value.marriageAlternativeApplies && !value.marriageAlternativeReviewed) block("FORM_8962_MARRIAGE_ALTERNATIVE_REVIEW_REQUIRED", "Complete the alternative marriage-year Form 8962 allocation.", "advancedFederal.premiumTaxCredit.marriageAlternativeReviewed");
  return { required: true, householdIncome: householdIncome.toFixed(0), householdIncomePercentFpl: percentFpl.toFixed(2), applicablePercentage: applicablePercentage.toFixed(4), annualContribution: annualContribution.toFixed(0), totalPremium: whole(totalPremium).toFixed(0), totalSlcsp: whole(totalSlcsp).toFixed(0), totalAdvancePtc: whole(totalAdvancePtc).toFixed(0), premiumTaxCredit, excessAdvancePtcRepayment };
}

export function calculatePayments2025(args: { profile: AdvancedFederalProfile2025; wages: WageInput2025[]; filingStatus: FilingStatus2025; block: Block }) {
  const { profile, wages, filingStatus, block } = args;
  const current = profile.payments.payments.filter(({ status }) => status === "current");
  const keys = current.map(({ type, amount, paidOn, confirmationReference }) => `${type}|${amount}|${paidOn}|${confirmationReference.toLocaleLowerCase()}`);
  if (new Set(keys).size !== keys.length) block("DUPLICATE_FEDERAL_PAYMENT", "Potential duplicate federal payments must be resolved.", "advancedFederal.payments.payments");
  for (const [index, payment] of current.entries()) if (!payment.evidenceReviewed) block("FEDERAL_PAYMENT_EVIDENCE_REQUIRED", "Every federal payment requires reviewed evidence.", `advancedFederal.payments.payments.${index}.evidenceReviewed`);
  const estimatedPayments = whole(sum(current.filter(({ type }) => type === "estimated" || type === "prior_year_overpayment").map(({ amount: value }) => read(value, "advancedFederal.payments.payments.amount", block))));
  const extensionPayment = whole(sum(current.filter(({ type }) => type === "extension").map(({ amount: value }) => read(value, "advancedFederal.payments.payments.amount", block))));
  const otherPayments = whole(sum(current.filter(({ type }) => type === "other_supported").map(({ amount: value }) => read(value, "advancedFederal.payments.payments.amount", block))));
  let excessSocialSecurity = new Decimal(0);
  for (const role of ["taxpayer", "spouse"] as PersonRole2025[]) {
    const owner = wages.filter((wage) => wage.owner === role);
    const withheld = sum(owner.map(({ socialSecurityTaxWithheld }) => read(socialSecurityTaxWithheld ?? "0.00", `wages.${role}.socialSecurityTaxWithheld`, block)));
    if (withheld.gt("10918.20")) {
      if (owner.length < 2) block("EMPLOYER_SOCIAL_SECURITY_REFUND_REQUIRED", "Social Security tax over-withheld by one employer must be recovered from that employer, not claimed on Form 1040.", "advancedFederal.payments.excessSocialSecurityReviewed");
      else if (!profile.payments.excessSocialSecurityReviewed) block("EXCESS_SOCIAL_SECURITY_REVIEW_REQUIRED", "Review multi-employer Social Security withholding before claiming the excess.", "advancedFederal.payments.excessSocialSecurityReviewed");
      else excessSocialSecurity = excessSocialSecurity.plus(withheld.minus("10918.20"));
    }
  }
  if (filingStatus !== "married_filing_jointly" && current.some(({ owner }) => owner === "spouse")) block("SPOUSE_PAYMENT_INVALID_FOR_STATUS", "Spouse-owned payments require a joint return.", "advancedFederal.payments.payments");
  return { estimatedPayments, extensionPayment, otherPayments, excessSocialSecurity: whole(excessSocialSecurity), totalOtherPayments: whole(estimatedPayments.plus(extensionPayment).plus(otherPayments).plus(excessSocialSecurity)) };
}

export function validateDueDiligence2025(args: { profile: AdvancedFederalProfile2025; signatureCurrent: boolean; claims: { eitc: boolean; childTaxCredits: boolean; aotc: boolean; headOfHousehold: boolean }; block: Block }) {
  const { profile, signatureCurrent, claims, block } = args;
  let required = false;
  if (!profile.dueDiligence.paidPreparer) return { required: false, signedForCurrentRevision: false };
  for (const [key, claim] of Object.entries(claims) as Array<[keyof typeof claims, boolean]>) {
    const section = profile.dueDiligence.sections[key];
    if (!claim) continue;
    required = true;
    if (!section.applies || !section.interviewComplete || !section.knowledgeDocumented || !section.documentsReviewed || !section.consistencyResolved) block("FORM_8867_SECTION_INCOMPLETE", `Complete the ${key} paid-preparer due-diligence section.`, `advancedFederal.dueDiligence.sections.${key}`);
  }
  if (required) {
    if (!profile.dueDiligence.clientInterviewDate || !profile.dueDiligence.preparerNotes.trim()) block("FORM_8867_INTERVIEW_RECORD_REQUIRED", "Form 8867 requires the client interview date and preparer notes.", "advancedFederal.dueDiligence");
    if (!profile.dueDiligence.evidence.some(({ verified }) => verified)) block("FORM_8867_EVIDENCE_REQUIRED", "Form 8867 due diligence requires at least one verified evidence reference.", "advancedFederal.dueDiligence.evidence");
    if (!signatureCurrent) block("FORM_8867_SIGNATURE_REQUIRED", "The paid preparer must certify Form 8867 for the current return revision.", "advancedFederal.dueDiligence");
  }
  return { required, signedForCurrentRevision: required && signatureCurrent };
}

function read(value: string, path: string, block: Block) { try { const result = amount(value); if (result.isNegative()) throw new Error(); return result; } catch { block("INVALID_ADVANCED_AMOUNT", "Enter a nonnegative decimal amount.", path); return new Decimal(0); } }
function readPercentage(value: string, path: string, block: Block) { const result = read(value, path, block).div(100); if (result.gt(1)) block("INVALID_ALLOCATION_PERCENTAGE", "Allocation percentage cannot exceed 100%.", path); return Decimal.min(result, 1); }
function phaseoutFactor(income: Decimal, lower: number, upper: number) { return income.lte(lower) ? new Decimal(1) : income.gte(upper) ? new Decimal(0) : amount(upper).minus(income).div(upper - lower); }
function iraPhaseout(status: FilingStatus2025): [number, number] { if (status === "married_filing_jointly" || status === "qualifying_surviving_spouse") return [126000, 146000]; if (status === "married_filing_separately") return [0, 10000]; return [79000, 89000]; }
function ptcApplicablePercentage(percentFpl: Decimal) { const percentage = percentFpl.toNumber(); if (percentage <= 150) return new Decimal(0); if (percentage <= 200) return amount(percentage - 150).div(50).mul("0.02"); if (percentage <= 250) return amount("0.02").plus(amount(percentage - 200).div(50).mul("0.02")); if (percentage <= 300) return amount("0.04").plus(amount(percentage - 250).div(50).mul("0.02")); if (percentage <= 400) return amount("0.06").plus(amount(percentage - 300).div(100).mul("0.025")); return amount("0.085"); }
function ptcRepaymentLimit(percentFpl: Decimal, status: FilingStatus2025) { const family = status !== "single"; if (percentFpl.lt(200)) return amount(family ? 750 : 375); if (percentFpl.lt(300)) return amount(family ? 1950 : 975); if (percentFpl.lt(400)) return amount(family ? 3250 : 1625); return amount("999999999"); }
