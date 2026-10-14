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
  if (values.selfEmployedHealthInsurance.enabled) {
    if (!values.selfEmployedHealthInsurance.eligibilityReviewed) block("SE_HEALTH_REVIEW_REQUIRED", "Complete the self-employed health-insurance eligibility review.", "advancedFederal.adjustments.selfEmployedHealthInsurance");
    if (!values.selfEmployedHealthInsurance.activityId || !validActivityIds.includes(values.selfEmployedHealthInsurance.activityId)) block("SE_HEALTH_ACTIVITY_REQUIRED", "Link self-employed health insurance to an effective Schedule C or F activity.", "advancedFederal.adjustments.selfEmployedHealthInsurance.activityId");
    const eligibleFraction = amount(12 - values.selfEmployedHealthInsurance.employerEligibleMonths).div(12);
    selfEmployedHealthInsuranceDeduction = whole(Decimal.min(read(values.selfEmployedHealthInsurance.premiums, "advancedFederal.adjustments.selfEmployedHealthInsurance.premiums", block).mul(eligibleFraction), netSelfEmploymentCompensation));
  }

  if (values.retirementPlan.enabled) {
    if (!values.retirementPlan.limitReviewed) block("SE_RETIREMENT_LIMIT_REVIEW_REQUIRED", "Confirm the self-employed retirement-plan contribution limit.", "advancedFederal.adjustments.retirementPlan.limitReviewed");
    if (!values.retirementPlan.activityId || !validActivityIds.includes(values.retirementPlan.activityId)) block("SE_RETIREMENT_ACTIVITY_REQUIRED", "Link the retirement plan to an effective Schedule C or F activity.", "advancedFederal.adjustments.retirementPlan.activityId");
    const entered = sum([read(values.retirementPlan.contributions.taxpayer, "advancedFederal.adjustments.retirementPlan.contributions.taxpayer", block), read(values.retirementPlan.contributions.spouse, "advancedFederal.adjustments.retirementPlan.contributions.spouse", block)]);
    const deferrals = sum([read(values.retirementPlan.employeeDeferrals.taxpayer, "advancedFederal.adjustments.retirementPlan.employeeDeferrals.taxpayer", block), read(values.retirementPlan.employeeDeferrals.spouse, "advancedFederal.adjustments.retirementPlan.employeeDeferrals.spouse", block)]);
    const employer = sum([read(values.retirementPlan.employerContributions.taxpayer, "advancedFederal.adjustments.retirementPlan.employerContributions.taxpayer", block), read(values.retirementPlan.employerContributions.spouse, "advancedFederal.adjustments.retirementPlan.employerContributions.spouse", block)]);
    if (deferrals.plus(employer).gt(0) && !entered.eq(deferrals.plus(employer))) block("SE_RETIREMENT_CONTRIBUTION_RECONCILIATION_REQUIRED", "Total retirement-plan contributions must equal employee deferrals plus employer contributions.", "advancedFederal.adjustments.retirementPlan.contributions");
    const ownerCount = filingStatus === "married_filing_jointly" && hasSpouse ? 2 : 1;
    const catchUpCount = Number(values.retirementPlan.catchUpEligible.taxpayer) + Number(ownerCount === 2 && values.retirementPlan.catchUpEligible.spouse);
    if (values.retirementPlan.planType === "sep") {
      if (deferrals.gt(0)) block("SEP_ELECTIVE_DEFERRAL_INVALID", "A SEP deduction cannot include elective employee deferrals.", "advancedFederal.adjustments.retirementPlan.employeeDeferrals");
      retirementPlanDeduction = whole(Decimal.min(entered, netSelfEmploymentCompensation.mul("0.20"), amount(70000).mul(ownerCount)));
    } else if (values.retirementPlan.planType === "simple") {
      const deferralLimit = amount(16500 * ownerCount + 3500 * catchUpCount);
      const employerRate = values.retirementPlan.simpleEmployerContributionType === "nonelective_2_percent" ? "0.02" : "0.03";
      const employerLimit = whole(netSelfEmploymentCompensation.mul(employerRate));
      if (deferrals.gt(deferralLimit)) block("SIMPLE_DEFERRAL_LIMIT_EXCEEDED", "SIMPLE elective deferrals exceed the 2025 owner/catch-up limit.", "advancedFederal.adjustments.retirementPlan.employeeDeferrals");
      if (employer.gt(employerLimit) && values.retirementPlan.simpleEmployerContributionType !== "manual_reviewed") block("SIMPLE_EMPLOYER_LIMIT_EXCEEDED", "SIMPLE employer contributions exceed the selected 2% or 3% calculation.", "advancedFederal.adjustments.retirementPlan.employerContributions");
      retirementPlanDeduction = whole(Decimal.min(entered, deferralLimit.plus(values.retirementPlan.simpleEmployerContributionType === "manual_reviewed" ? employer : employerLimit), netSelfEmploymentCompensation));
    } else {
      const deferralLimit = amount(23500 * ownerCount + 7500 * catchUpCount);
      const employerLimit = whole(netSelfEmploymentCompensation.mul("0.20"));
      const combinedLimit = amount(70000 * ownerCount + 7500 * catchUpCount);
      if (deferrals.gt(deferralLimit)) block("QUALIFIED_PLAN_DEFERRAL_LIMIT_EXCEEDED", "Qualified-plan elective deferrals exceed the 2025 owner/catch-up limit.", "advancedFederal.adjustments.retirementPlan.employeeDeferrals");
      if (employer.gt(employerLimit)) block("QUALIFIED_PLAN_EMPLOYER_LIMIT_EXCEEDED", "Qualified-plan employer contributions exceed the self-employed compensation limit.", "advancedFederal.adjustments.retirementPlan.employerContributions");
      retirementPlanDeduction = whole(Decimal.min(entered, combinedLimit, netSelfEmploymentCompensation));
    }
  }

  const agiBeforeIraAndStudentLoan = whole(preliminaryAgi.minus(educatorExpenses).minus(hsaDeduction).minus(selfEmployedHealthInsuranceDeduction).minus(retirementPlanDeduction));
  if (values.ira.enabled) {
    if (!values.ira.eligibilityReviewed) block("IRA_DEDUCTION_REVIEW_REQUIRED", "Complete the IRA deduction eligibility and workplace-plan review.", "advancedFederal.adjustments.ira");
    if (values.ira.nondeductibleBasisApplies && !values.iraBasis.taxpayer.enabled && !values.iraBasis.spouse.enabled) block("FORM_8606_PROFILE_REQUIRED", "Enable the applicable owner Form 8606 basis ledger for nondeductible IRA contributions.", "advancedFederal.adjustments.iraBasis");
    const roles: PersonRole2025[] = filingStatus === "married_filing_jointly" && hasSpouse ? ["taxpayer", "spouse"] : ["taxpayer"];
    iraDeduction = whole(sum(roles.map((role) => {
      const enteredContribution = Decimal.min(read(values.ira.contributions[role], `advancedFederal.adjustments.ira.contributions.${role}`, block), values.ira.age50OrOlder[role] ? 8000 : 7000);
      const nondeductibleContribution = values.iraBasis[role].enabled ? read(values.iraBasis[role].currentYearNondeductibleContributions, `advancedFederal.adjustments.iraBasis.${role}.currentYearNondeductibleContributions`, block) : new Decimal(0);
      if (nondeductibleContribution.gt(enteredContribution)) block("FORM_8606_CONTRIBUTION_EXCEEDS_IRA_CONTRIBUTION", "Nondeductible IRA contributions cannot exceed total traditional IRA contributions for the owner.", `advancedFederal.adjustments.iraBasis.${role}.currentYearNondeductibleContributions`);
      const contribution = nonnegative(enteredContribution.minus(nondeductibleContribution));
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
  const empty = { required: false, householdIncome: modifiedAgi.toFixed(0), householdIncomePercentFpl: "0.00", applicablePercentage: "0.0000", annualContribution: "0", belowPovertyExceptionApplied: false, mfsExceptionApplied: false, alternativeMarriageYearApplied: false, months: [] as Array<{ month: number; premium: string; slcsp: string; advancePtc: string; contribution: string; allowedPtc: string }>, totalPremium: "0", totalSlcsp: "0", totalAdvancePtc: "0", premiumTaxCredit, excessAdvancePtcRepayment };
  if (!value.enabled) return empty;
  const mfsExceptionApplied = filingStatus === "married_filing_separately" && value.mfsException !== "none" && value.mfsExceptionReviewed;
  if (filingStatus === "married_filing_separately" && !mfsExceptionApplied) block("FORM_8962_MFS_EXCEPTION_REQUIRED", "Married Filing Separately requires a reviewed domestic-abuse or spousal-abandonment Premium Tax Credit exception.", "advancedFederal.premiumTaxCredit.mfsException");
  if (!value.householdMembersReconciled) block("FORM_8962_HOUSEHOLD_REVIEW_REQUIRED", "Reconcile every member of the Form 8962 tax family.", "advancedFederal.premiumTaxCredit.householdMembersReconciled");
  if (!value.policies.length) block("FORM_1095_A_REQUIRED", "Add at least one Form 1095-A policy.", "advancedFederal.premiumTaxCredit.policies");
  const otherMagi = read(value.householdModifiedAgiOther, "advancedFederal.premiumTaxCredit.householdModifiedAgiOther", block);
  if (value.householdMembers.length) {
    if (value.householdMembers.some(({ reviewed }) => !reviewed)) block("FORM_8962_HOUSEHOLD_MEMBER_REVIEW_REQUIRED", "Review every household member MAGI entry.", "advancedFederal.premiumTaxCredit.householdMembers");
    const memberMagi = whole(sum(value.householdMembers.filter(({ includedInTaxFamily }) => includedInTaxFamily).map((member) => read(member.modifiedAgi, "advancedFederal.premiumTaxCredit.householdMembers.modifiedAgi", block))));
    if (!memberMagi.eq(whole(otherMagi))) block("FORM_8962_HOUSEHOLD_MAGI_MISMATCH", "Included household-member MAGI must reconcile to other household modified AGI.", "advancedFederal.premiumTaxCredit.householdModifiedAgiOther");
  }
  const householdIncome = whole(modifiedAgi.plus(otherMagi));
  const povertyLine = read(value.federalPovertyLine, "advancedFederal.premiumTaxCredit.federalPovertyLine", block);
  if (povertyLine.lte(0)) block("FORM_8962_FPL_REQUIRED", "Enter the reviewed federal poverty-line amount for the household size and state.", "advancedFederal.premiumTaxCredit.federalPovertyLine");
  const percentFpl = povertyLine.gt(0) ? householdIncome.div(povertyLine).mul(100) : new Decimal(0);
  const belowPovertyExceptionApplied = povertyLine.gt(0) && percentFpl.lt(100) && value.belowPovertyException === "marketplace_estimated_100_percent" && value.belowPovertyExceptionReviewed;
  if (povertyLine.gt(0) && percentFpl.lt(100) && !belowPovertyExceptionApplied) block("FORM_8962_BELOW_FPL_EXCEPTION_REQUIRED", "Income below 100% FPL requires the reviewed marketplace-estimate eligibility exception.", "advancedFederal.premiumTaxCredit.belowPovertyException");
  const contributionPercentFpl = belowPovertyExceptionApplied ? new Decimal(100) : percentFpl;
  const applicablePercentage = ptcApplicablePercentage(contributionPercentFpl);
  const annualContribution = whole(householdIncome.mul(applicablePercentage));
  const alternativeMarriageYearApplied = value.marriageAlternativeApplies && value.marriageAlternativeReviewed;
  if (value.marriageAlternativeApplies && (!value.marriageAlternativeReviewed || filingStatus !== "married_filing_jointly" || value.marriageMonth == null)) block("FORM_8962_MARRIAGE_ALTERNATIVE_FACTS_REQUIRED", "The alternative marriage-year calculation requires joint filing, the marriage month, and reviewed alternative households.", "advancedFederal.premiumTaxCredit.marriageAlternativeApplies");
  let alternativeMonthlyContribution = new Decimal(0);
  if (alternativeMarriageYearApplied) {
    for (const role of ["taxpayer", "spouse"] as const) {
      const household = value.alternativeMarriageHouseholds[role];
      const income = read(household.modifiedAgi, `advancedFederal.premiumTaxCredit.alternativeMarriageHouseholds.${role}.modifiedAgi`, block);
      const fpl = read(household.federalPovertyLine, `advancedFederal.premiumTaxCredit.alternativeMarriageHouseholds.${role}.federalPovertyLine`, block);
      if (fpl.lte(0)) block("FORM_8962_ALTERNATIVE_FPL_REQUIRED", "Each alternative pre-marriage household requires its reviewed federal poverty line.", `advancedFederal.premiumTaxCredit.alternativeMarriageHouseholds.${role}.federalPovertyLine`);
      const percentage = fpl.gt(0) ? income.div(fpl).mul(100) : new Decimal(0);
      alternativeMonthlyContribution = alternativeMonthlyContribution.plus(income.mul(ptcApplicablePercentage(percentage)).div(12));
    }
  }
  const monthTotals = new Map<number, { premium: Decimal; slcsp: Decimal; advance: Decimal }>();
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
      const existing = monthTotals.get(month.month) ?? { premium: new Decimal(0), slcsp: new Decimal(0), advance: new Decimal(0) };
      monthTotals.set(month.month, { premium: existing.premium.plus(premium), slcsp: existing.slcsp.plus(slcsp), advance: existing.advance.plus(advance) });
    }
  }
  const months = [...monthTotals.entries()].sort(([a], [b]) => a - b).map(([month, values]) => {
    const contribution = alternativeMarriageYearApplied && value.marriageMonth != null && month < value.marriageMonth ? whole(alternativeMonthlyContribution) : whole(annualContribution.div(12));
    const allowedPtc = whole(Decimal.min(values.premium, Decimal.max(0, values.slcsp.minus(contribution))));
    totalPremium = totalPremium.plus(values.premium); totalSlcsp = totalSlcsp.plus(values.slcsp); totalAdvancePtc = totalAdvancePtc.plus(values.advance); premiumTaxCredit = premiumTaxCredit.plus(allowedPtc);
    return { month, premium: whole(values.premium).toFixed(0), slcsp: whole(values.slcsp).toFixed(0), advancePtc: whole(values.advance).toFixed(0), contribution: contribution.toFixed(0), allowedPtc: allowedPtc.toFixed(0) };
  });
  premiumTaxCredit = whole(premiumTaxCredit);
  const net = premiumTaxCredit.minus(whole(totalAdvancePtc));
  if (net.gte(0)) premiumTaxCredit = whole(net); else {
    const rawRepayment = whole(net.abs());
    excessAdvancePtcRepayment = Decimal.min(rawRepayment, ptcRepaymentLimit(contributionPercentFpl, filingStatus));
    premiumTaxCredit = new Decimal(0);
  }
  return { required: true, householdIncome: householdIncome.toFixed(0), householdIncomePercentFpl: percentFpl.toFixed(2), applicablePercentage: applicablePercentage.toFixed(4), annualContribution: annualContribution.toFixed(0), belowPovertyExceptionApplied, mfsExceptionApplied, alternativeMarriageYearApplied, months, totalPremium: whole(totalPremium).toFixed(0), totalSlcsp: whole(totalSlcsp).toFixed(0), totalAdvancePtc: whole(totalAdvancePtc).toFixed(0), premiumTaxCredit, excessAdvancePtcRepayment };
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
