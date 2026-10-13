import Decimal from "decimal.js";
import { amount, nonnegative, sum, whole } from "./math";
import type { CalculationInput2025, PersonRole2025 } from "./types";

type Block = (code: string, message: string, path?: string | null) => void;

export interface FederalCreditCalculation2025 {
  earnedIncomeCredit: Decimal;
  dependentCareCredit: Decimal;
  educationNonrefundableCredit: Decimal;
  refundableAmericanOpportunityCredit: Decimal;
  scheduleEic: { required: boolean; qualifyingChildren: Array<{ dependentId: string }>; earnedIncome: string; adjustedGrossIncome: string; investmentIncome: string; credit: string };
  form2441: { required: boolean; providerCount: number; qualifyingPersonCount: number; qualifiedExpenses: string; earnedIncomeLimit: string; applicablePercentage: string; credit: string; employerBenefits: string };
  form8863: { required: boolean; students: Array<{ studentId: string; creditType: "aotc" | "llc"; adjustedExpenses: string; tentativeCredit: string }>; tentativeAmericanOpportunityCredit: string; tentativeLifetimeLearningCredit: string; phaseoutFactor: string; nonrefundableCredit: string; refundableAmericanOpportunityCredit: string };
}

export function calculateFederalCredits2025(args: {
  input: CalculationInput2025;
  adjustedGrossIncome: Decimal;
  earnedIncome: Decimal;
  taxAfterDependentCredits: Decimal;
  ownerEarnedIncome: Record<PersonRole2025, Decimal>;
  block: Block;
}): FederalCreditCalculation2025 {
  const { input, adjustedGrossIncome, earnedIncome, taxAfterDependentCredits, ownerEarnedIncome, block } = args;
  const profile = input.federalCredits;
  let earnedIncomeCredit = new Decimal(0);
  let dependentCareCredit = new Decimal(0);
  let educationNonrefundableCredit = new Decimal(0);
  let refundableAmericanOpportunityCredit = new Decimal(0);
  const scheduleEic = { required: false, qualifyingChildren: [] as Array<{ dependentId: string }>, earnedIncome: earnedIncome.toFixed(0), adjustedGrossIncome: adjustedGrossIncome.toFixed(0), investmentIncome: "0", credit: "0" };
  const form2441 = { required: false, providerCount: 0, qualifyingPersonCount: 0, qualifiedExpenses: "0", earnedIncomeLimit: "0", applicablePercentage: "0.00", credit: "0", employerBenefits: "0" };
  const form8863 = { required: false, students: [] as Array<{ studentId: string; creditType: "aotc" | "llc"; adjustedExpenses: string; tentativeCredit: string }>, tentativeAmericanOpportunityCredit: "0", tentativeLifetimeLearningCredit: "0", phaseoutFactor: "0.0000", nonrefundableCredit: "0", refundableAmericanOpportunityCredit: "0" };
  if (!profile) return { earnedIncomeCredit, dependentCareCredit, educationNonrefundableCredit, refundableAmericanOpportunityCredit, scheduleEic, form2441, form8863 };

  if (profile.eitc.enabled) {
    const path = "federalCredits.eitc";
    const children = profile.eitc.qualifyingChildren;
    scheduleEic.required = children.length > 0;
    scheduleEic.qualifyingChildren = children.map(({ dependentId }) => ({ dependentId }));
    const investmentIncome = read(profile.eitc.investmentIncome, `${path}.investmentIncome`, block);
    scheduleEic.investmentIncome = whole(investmentIncome).toFixed(0);
    if (!profile.eitc.eligibilityReviewed) block("EITC_INTERVIEW_INCOMPLETE", "Complete and confirm the EITC eligibility interview.", path);
    if (!profile.eitc.taxpayerWorkEligibleIdentifier || (input.filingStatus === "married_filing_jointly" && !profile.eitc.spouseWorkEligibleIdentifier)) block("EITC_VALID_SSN_REQUIRED", "The taxpayer and joint-filing spouse need valid EITC Social Security numbers.", path);
    if (!profile.eitc.notQualifyingChildOfAnother || !profile.eitc.noForm2555 || !profile.eitc.noPriorDisallowance || !profile.eitc.noCombatPayElection) block("EITC_UNSUPPORTED_ELIGIBILITY_FACT", "The supported EITC profile requires no Form 2555, combat-pay election, unresolved prior disallowance, or taxpayer qualifying-child conflict.", path);
    if (input.filingStatus === "married_filing_separately" && profile.eitc.separatedSpouseEligible !== true) block("EITC_MFS_SEPARATION_REQUIRED", "Married Filing Separately requires the reviewed separated-spouse EITC exception.", `${path}.separatedSpouseEligible`);
    if (investmentIncome.gt(11950)) block("EITC_INVESTMENT_INCOME_LIMIT", "Investment income exceeds the 2025 EITC limit of $11,950.", `${path}.investmentIncome`);
    const dependentIds = new Set((input.dependents ?? []).map(({ id }) => id));
    for (const [index, child] of children.entries()) {
      if (!dependentIds.has(child.dependentId)) block("EITC_CHILD_NOT_DEPENDENT", "Every Schedule EIC child must reference a dependent on this return.", `${path}.qualifyingChildren.${index}.dependentId`);
      if (![child.relationshipTest, child.ageTest, child.residencyTest, child.jointReturnTest, child.validWorkEligibleIdentifier, child.notClaimedByOther].every(Boolean)) block("EITC_CHILD_TEST_INCOMPLETE", "Every qualifying child must pass the relationship, age, residency, joint-return, SSN, and competing-claim tests.", `${path}.qualifyingChildren.${index}`);
    }
    if (!children.length) {
      const age = profile.eitc.taxpayerAgeAtYearEnd;
      if (age == null || age < 25 || age > 64) block("EITC_CHILDLESS_AGE_UNSUPPORTED", "A taxpayer without a qualifying child must be age 25 through 64 at year end.", `${path}.taxpayerAgeAtYearEnd`);
      if (input.filingStatus === "married_filing_jointly") { const spouseAge = profile.eitc.spouseAgeAtYearEnd; if (spouseAge == null) block("EITC_SPOUSE_AGE_REQUIRED", "Enter the joint-filing spouse's age for the no-child EITC.", `${path}.spouseAgeAtYearEnd`); }
    }
    const childCount = Math.min(children.length, 3);
    const maxCredit = [649, 4328, 7152, 8046][childCount] ?? 8046;
    const phaseInRate = ["0.0765", "0.34", "0.40", "0.45"][childCount] ?? "0.45";
    const phaseoutRate = ["0.0765", "0.1598", "0.2106", "0.2106"][childCount] ?? "0.2106";
    const joint = input.filingStatus === "married_filing_jointly";
    const phaseoutStart = childCount === 0 ? (joint ? 17730 : 10620) : (joint ? 30470 : 23350);
    const incomeLimit = ([joint ? 26214 : 19104, joint ? 57554 : 50434, joint ? 64430 : 57310, joint ? 68675 : 61555][childCount] ?? (joint ? 68675 : 61555));
    if (earnedIncome.gt(0) && adjustedGrossIncome.lt(incomeLimit) && earnedIncome.lt(incomeLimit) && investmentIncome.lte(11950)) {
      const beforePhaseout = Decimal.min(maxCredit, whole(earnedIncome.mul(phaseInRate)));
      const phaseoutIncome = Decimal.max(earnedIncome, adjustedGrossIncome);
      earnedIncomeCredit = nonnegative(whole(beforePhaseout.minus(Decimal.max(0, phaseoutIncome.minus(phaseoutStart)).mul(phaseoutRate))));
    }
    scheduleEic.credit = earnedIncomeCredit.toFixed(0);
  }

  let remainingTax = taxAfterDependentCredits;
  if (profile.dependentCare.enabled) {
    const path = "federalCredits.dependentCare";
    form2441.required = true; form2441.providerCount = profile.dependentCare.providers.length; form2441.qualifyingPersonCount = profile.dependentCare.qualifyingPersons.length;
    if (input.filingStatus === "married_filing_separately") block("FORM_2441_MFS_UNSUPPORTED", "The supported dependent-care profile does not cover Married Filing Separately exceptions.", path);
    if (!profile.dependentCare.workRelatedExpensesConfirmed) block("FORM_2441_WORK_RELATED_REVIEW_REQUIRED", "Confirm that the care expenses were necessary for work or looking for work.", `${path}.workRelatedExpensesConfirmed`);
    if (!profile.dependentCare.providers.length || !profile.dependentCare.qualifyingPersons.length) block("FORM_2441_DETAILS_REQUIRED", "At least one eligible provider and qualifying person are required.", path);
    if (profile.dependentCare.providers.some(({ eligibleConfirmed }) => !eligibleConfirmed)) block("FORM_2441_PROVIDER_REVIEW_REQUIRED", "Every care provider requires reviewed eligibility and identifying information.", `${path}.providers`);
    if (profile.dependentCare.qualifyingPersons.some(({ qualifiesConfirmed }) => !qualifiesConfirmed)) block("FORM_2441_PERSON_REVIEW_REQUIRED", "Every Form 2441 person requires a reviewed qualifying-person determination.", `${path}.qualifyingPersons`);
    const providerPaid = sum(profile.dependentCare.providers.map((row, i) => read(row.amountPaid, `${path}.providers.${i}.amountPaid`, block)));
    const personExpenses = sum(profile.dependentCare.qualifyingPersons.map((row, i) => read(row.expenses, `${path}.qualifyingPersons.${i}.expenses`, block)));
    if (!whole(providerPaid).eq(whole(personExpenses))) block("FORM_2441_PROVIDER_RECONCILIATION", "Provider payments must equal qualifying-person expenses.", path);
    const employerBenefits = whole(read(profile.employerDependentCareBenefits, `${path}.employerDependentCareBenefits`, block).plus(read(profile.dependentCare.additionalEmployerBenefits, `${path}.additionalEmployerBenefits`, block)));
    form2441.employerBenefits = employerBenefits.toFixed(0);
    if (employerBenefits.gt(5000)) block("FORM_2441_EMPLOYER_BENEFITS_UNSUPPORTED", "Dependent-care benefits over the supported $5,000 exclusion require additional Form 2441 treatment.", path);
    const personCount = profile.dependentCare.qualifyingPersons.length;
    const expenseLimit = Decimal.max(0, amount(personCount > 1 ? 6000 : 3000).minus(employerBenefits));
    const taxpayerDeemed = amount(profile.dependentCare.taxpayerStudentOrDisabledMonths * (personCount > 1 ? 500 : 250));
    const spouseDeemed = amount(profile.dependentCare.spouseStudentOrDisabledMonths * (personCount > 1 ? 500 : 250));
    const taxpayerIncome = Decimal.max(ownerEarnedIncome.taxpayer, taxpayerDeemed);
    const spouseIncome = input.filingStatus === "married_filing_jointly" ? Decimal.max(ownerEarnedIncome.spouse, spouseDeemed) : taxpayerIncome;
    const earnedLimit = Decimal.min(taxpayerIncome, spouseIncome);
    const qualifiedExpenses = whole(Decimal.min(personExpenses, providerPaid, expenseLimit, earnedLimit));
    const applicablePercentage = Decimal.max("0.20", amount("0.35").minus(Decimal.max(0, adjustedGrossIncome.minus(15000)).div(2000).ceil().mul("0.01")));
    dependentCareCredit = Decimal.min(remainingTax, whole(qualifiedExpenses.mul(applicablePercentage)));
    remainingTax = nonnegative(remainingTax.minus(dependentCareCredit));
    Object.assign(form2441, { qualifiedExpenses: qualifiedExpenses.toFixed(0), earnedIncomeLimit: whole(earnedLimit).toFixed(0), applicablePercentage: applicablePercentage.toFixed(2), credit: dependentCareCredit.toFixed(0) });
  }

  if (profile.education.enabled) {
    const path = "federalCredits.education";
    form8863.required = true;
    if (input.filingStatus === "married_filing_separately") block("FORM_8863_MFS_INELIGIBLE", "Education credits are unavailable for Married Filing Separately.", path);
    if (!profile.education.students.length) block("FORM_8863_STUDENT_REQUIRED", "Add at least one eligible student for an education credit.", `${path}.students`);
    let tentativeAotc = new Decimal(0); let tentativeLlcExpenses = new Decimal(0);
    for (const [index, student] of profile.education.students.entries()) {
      const qualified = read(student.qualifiedExpenses, `${path}.students.${index}.qualifiedExpenses`, block);
      const assistance = read(student.taxFreeAssistance, `${path}.students.${index}.taxFreeAssistance`, block);
      const adjusted = nonnegative(qualified.minus(assistance));
      if (!student.eligibleInstitution) block("FORM_8863_INSTITUTION_REVIEW_REQUIRED", "Confirm that each school is an eligible educational institution.", `${path}.students.${index}.eligibleInstitution`);
      if (!student.form1098TRecordId) block("FORM_1098_T_REQUIRED", "The supported education-credit profile requires a linked effective Form 1098-T for every student.", `${path}.students.${index}.form1098TRecordId`);
      else if (!profile.valid1098TRecordIds.includes(student.form1098TRecordId)) block("FORM_1098_T_LINK_INVALID", "The linked Form 1098-T is not an effective source record on this return.", `${path}.students.${index}.form1098TRecordId`);
      let tentative = new Decimal(0);
      if (student.creditType === "aotc") {
        if (!student.firstFourYears || !student.atLeastHalfTime || !student.degreeCandidate || !student.noFelonyDrugConviction || student.priorAotcYears >= 4) block("AOTC_ELIGIBILITY_UNSUPPORTED", "AOTC requires the first-four-years, half-time, degree, felony, and prior-use tests to pass.", `${path}.students.${index}`);
        tentative = Decimal.min(adjusted, 2000).plus(Decimal.min(Decimal.max(0, adjusted.minus(2000)), 2000).mul("0.25"));
        tentativeAotc = tentativeAotc.plus(tentative);
        if (!student.refundabilityConfirmed) block("AOTC_REFUNDABILITY_REVIEW_REQUIRED", "Confirm the student's refundable AOTC eligibility, including the under-age-24 support rules.", `${path}.students.${index}.refundabilityConfirmed`);
      } else {
        tentativeLlcExpenses = tentativeLlcExpenses.plus(adjusted);
        tentative = adjusted.mul("0.20");
      }
      form8863.students.push({ studentId: student.id, creditType: student.creditType, adjustedExpenses: whole(adjusted).toFixed(0), tentativeCredit: whole(tentative).toFixed(0) });
    }
    const tentativeLlc = Decimal.min(tentativeLlcExpenses, 10000).mul("0.20");
    const joint = input.filingStatus === "married_filing_jointly";
    const lower = joint ? 160000 : 80000; const upper = joint ? 180000 : 90000;
    const factor = adjustedGrossIncome.lte(lower) ? new Decimal(1) : adjustedGrossIncome.gte(upper) ? new Decimal(0) : amount(upper).minus(adjustedGrossIncome).div(upper - lower);
    const phasedAotc = whole(tentativeAotc.mul(factor));
    const refundableTentative = whole(phasedAotc.mul("0.40"));
    const nonrefundableTentative = whole(phasedAotc.minus(refundableTentative).plus(tentativeLlc.mul(factor)));
    refundableAmericanOpportunityCredit = refundableTentative;
    educationNonrefundableCredit = Decimal.min(remainingTax, nonrefundableTentative);
    Object.assign(form8863, { tentativeAmericanOpportunityCredit: whole(tentativeAotc).toFixed(0), tentativeLifetimeLearningCredit: whole(tentativeLlc).toFixed(0), phaseoutFactor: factor.toFixed(4), nonrefundableCredit: educationNonrefundableCredit.toFixed(0), refundableAmericanOpportunityCredit: refundableAmericanOpportunityCredit.toFixed(0) });
  }
  return { earnedIncomeCredit, dependentCareCredit, educationNonrefundableCredit, refundableAmericanOpportunityCredit, scheduleEic, form2441, form8863 };
}

function read(value: string, path: string, block: Block) {
  try { const result = amount(value); if (result.isNegative()) throw new Error(); return result; }
  catch { block("INVALID_CREDIT_AMOUNT", "Enter a nonnegative decimal amount.", path); return new Decimal(0); }
}
