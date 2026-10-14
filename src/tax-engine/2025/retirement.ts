import Decimal from "decimal.js";
import type { AdvancedFederalProfile2025 } from "@/domain/advanced-federal-2025";
import { amount, nonnegative, sum, whole } from "./math";
import type { PersonRole2025, RetirementDistributionInput2025 } from "./types";

type Block = (code: string, message: string, path: string) => void;

export interface ParsedRetirementDistribution2025 extends RetirementDistributionInput2025 {
  gross: Decimal;
  reportedTaxable: Decimal;
  withholdingAmount: Decimal;
  employeeContributionAmount: Decimal;
  totalEmployeeContributionAmount: Decimal;
}

export function calculateRetirementDistributions2025(args: {
  profile: AdvancedFederalProfile2025;
  distributions: ParsedRetirementDistribution2025[];
  block: Block;
}) {
  const { profile, distributions, block } = args;
  const facts = profile.adjustments.retirementDistributions;
  const treatments = new Map(facts.treatments.map((treatment) => [treatment.sourceRecordId, treatment]));
  if (facts.enabled && distributions.length && !facts.allSourceRecordsReviewed) block("RETIREMENT_SOURCE_REVIEW_REQUIRED", "Review every effective Form 1099-R before calculating retirement treatments.", "advancedFederal.adjustments.retirementDistributions.allSourceRecordsReviewed");
  for (const [index, treatment] of facts.treatments.entries()) {
    if (!distributions.some(({ id }) => id === treatment.sourceRecordId)) block("RETIREMENT_TREATMENT_SOURCE_INVALID", "Each retirement treatment must link to an effective Form 1099-R on this return.", `advancedFederal.adjustments.retirementDistributions.treatments.${index}.sourceRecordId`);
  }

  let earlyDistributions = new Decimal(0);
  let totalExceptionAmount = new Decimal(0);
  let totalAdditionalTax = new Decimal(0);
  const worksheets = distributions.map((distribution, index) => {
    const code = distribution.distributionCode.trim().toUpperCase();
    const treatment = treatments.get(distribution.id);
    const defaultNormal = code === "7" && !distribution.taxableAmountNotDetermined;
    if (!treatment && !defaultNormal) block("RETIREMENT_TREATMENT_REQUIRED", `Form 1099-R code ${code || "blank"} requires a reviewed retirement treatment.`, `retirementDistributions.${index}`);
    if (treatment && !treatment.reviewed) block("RETIREMENT_TREATMENT_REVIEW_REQUIRED", "The selected Form 1099-R treatment must be reviewed.", `advancedFederal.adjustments.retirementDistributions.treatments.${index}.reviewed`);
    if (distribution.reportedTaxable.gt(distribution.gross)) block("RETIREMENT_TAXABLE_EXCEEDS_GROSS", "Taxable retirement distributions cannot exceed the gross distribution.", `retirementDistributions.${index}.taxableAmount`);

    const selected = treatment?.treatment ?? "normal";
    validateCodeTreatment(code, selected, index, block);
    const rolloverAmount = treatment ? read(treatment.rolloverAmount, `advancedFederal.adjustments.retirementDistributions.treatments.${index}.rolloverAmount`, block) : new Decimal(0);
    const qcdAmount = treatment ? read(treatment.qcdAmount, `advancedFederal.adjustments.retirementDistributions.treatments.${index}.qcdAmount`, block) : new Decimal(0);
    const exceptionAmount = treatment ? read(treatment.exceptionAmount, `advancedFederal.adjustments.retirementDistributions.treatments.${index}.exceptionAmount`, block) : new Decimal(0);
    if (rolloverAmount.gt(distribution.gross) || qcdAmount.gt(distribution.gross) || exceptionAmount.gt(distribution.gross)) block("RETIREMENT_TREATMENT_AMOUNT_EXCEEDS_GROSS", "A rollover, QCD or exception amount cannot exceed the gross distribution.", `advancedFederal.adjustments.retirementDistributions.treatments.${index}`);

    let taxableAmount = distribution.reportedTaxable;
    let annuityExclusion = new Decimal(0);
    let additionalTax = new Decimal(0);
    if (selected === "direct_rollover" || selected === "indirect_rollover") taxableAmount = nonnegative(distribution.gross.minus(rolloverAmount));
    if (selected === "qcd") taxableAmount = nonnegative(distribution.reportedTaxable.minus(qcdAmount));
    if (selected === "roth_qualified") taxableAmount = new Decimal(0);
    if (selected === "annuity_simplified" && treatment) {
      const investment = read(treatment.investmentInContract, `advancedFederal.adjustments.retirementDistributions.treatments.${index}.investmentInContract`, block);
      if (treatment.expectedMonthlyPayments <= 0 || treatment.paymentsReceivedThisYear <= 0) block("ANNUITY_SIMPLIFIED_METHOD_FACTS_REQUIRED", "The simplified-method annuity worksheet requires expected monthly payments and payments received this year.", `advancedFederal.adjustments.retirementDistributions.treatments.${index}`);
      annuityExclusion = treatment.expectedMonthlyPayments > 0 ? whole(investment.div(treatment.expectedMonthlyPayments).mul(treatment.paymentsReceivedThisYear)) : new Decimal(0);
      annuityExclusion = Decimal.min(annuityExclusion, distribution.gross);
      taxableAmount = nonnegative(distribution.gross.minus(annuityExclusion));
    }
    if (selected === "early_distribution") {
      const allowedException = Decimal.min(exceptionAmount, taxableAmount);
      const subject = nonnegative(taxableAmount.minus(allowedException));
      additionalTax = whole(subject.mul("0.10"));
      earlyDistributions = earlyDistributions.plus(taxableAmount);
      totalExceptionAmount = totalExceptionAmount.plus(allowedException);
      totalAdditionalTax = totalAdditionalTax.plus(additionalTax);
      if (allowedException.gt(0) && !treatment?.exceptionCode.trim()) block("FORM_5329_EXCEPTION_CODE_REQUIRED", "A Form 5329 exception amount requires an exception code.", `advancedFederal.adjustments.retirementDistributions.treatments.${index}.exceptionCode`);
    }

    return {
      distributionId: distribution.id,
      owner: distribution.owner,
      iraSepSimple: distribution.iraSepSimple,
      treatment: selected,
      grossDistribution: whole(distribution.gross),
      taxableAmount: whole(taxableAmount),
      rolloverAmount: whole(rolloverAmount),
      qcdAmount: whole(qcdAmount),
      annuityExclusion: whole(annuityExclusion),
      exceptionAmount: whole(Decimal.min(exceptionAmount, taxableAmount)),
      additionalTax: whole(additionalTax),
      withholdingAmount: distribution.withholdingAmount,
    };
  });

  const amountSubjectToAdditionalTax = nonnegative(whole(earlyDistributions.minus(totalExceptionAmount)));
  return {
    worksheets,
    form5329: {
      required: totalAdditionalTax.gt(0) || totalExceptionAmount.gt(0),
      earlyDistributions: whole(earlyDistributions),
      exceptionAmount: whole(totalExceptionAmount),
      amountSubjectToAdditionalTax,
      additionalTax: whole(totalAdditionalTax),
    },
  };
}

export function calculateIraBasis2025(args: {
  profile: AdvancedFederalProfile2025;
  retirementWorksheets: ReturnType<typeof calculateRetirementDistributions2025>["worksheets"];
  block: Block;
}) {
  const { profile, retirementWorksheets, block } = args;
  const rows = (["taxpayer", "spouse"] as PersonRole2025[]).flatMap((owner) => {
    const facts = profile.adjustments.iraBasis[owner];
    if (!facts.enabled) return [];
    if (!facts.basisReviewed) block("FORM_8606_BASIS_REVIEW_REQUIRED", `Review ${owner} traditional IRA basis before calculating Form 8606.`, `advancedFederal.adjustments.iraBasis.${owner}.basisReviewed`);
    if (!facts.sourceAmountsReconciled) block("FORM_8606_SOURCE_RECONCILIATION_REQUIRED", `Reconcile ${owner} Form 8606 distributions and conversions to effective Forms 1099-R.`, `advancedFederal.adjustments.iraBasis.${owner}.sourceAmountsReconciled`);
    const priorYearBasis = read(facts.priorYearBasis, `advancedFederal.adjustments.iraBasis.${owner}.priorYearBasis`, block);
    const currentYearNondeductibleContributions = read(facts.currentYearNondeductibleContributions, `advancedFederal.adjustments.iraBasis.${owner}.currentYearNondeductibleContributions`, block);
    const distributions = read(facts.traditionalIraDistributions, `advancedFederal.adjustments.iraBasis.${owner}.traditionalIraDistributions`, block);
    const conversions = read(facts.rothConversions, `advancedFederal.adjustments.iraBasis.${owner}.rothConversions`, block);
    const yearEndValue = read(facts.yearEndTraditionalIraValue, `advancedFederal.adjustments.iraBasis.${owner}.yearEndTraditionalIraValue`, block);
    const outstandingRollovers = read(facts.outstandingRollovers, `advancedFederal.adjustments.iraBasis.${owner}.outstandingRollovers`, block);
    const recharacterized = read(facts.recharacterizedContributions, `advancedFederal.adjustments.iraBasis.${owner}.recharacterizedContributions`, block);
    const sourceGross = whole(sum(retirementWorksheets.filter((item) => item.owner === owner && item.iraSepSimple).map((item) => item.grossDistribution.minus(item.rolloverAmount))));
    if (!sourceGross.eq(distributions.plus(conversions))) block("FORM_8606_SOURCE_AMOUNTS_MISMATCH", `${owner} Form 8606 distributions and conversions must equal the non-rollover gross amount from effective IRA Forms 1099-R.`, `advancedFederal.adjustments.iraBasis.${owner}`);
    const totalBasis = nonnegative(whole(priorYearBasis.plus(currentYearNondeductibleContributions).minus(recharacterized)));
    const totalDistributionsAndConversions = whole(distributions.plus(conversions));
    const denominator = whole(totalDistributionsAndConversions.plus(yearEndValue).plus(outstandingRollovers));
    const ratio = denominator.gt(0) ? Decimal.min(1, totalBasis.div(denominator)) : new Decimal(0);
    const nontaxableAmount = Decimal.min(totalBasis, whole(totalDistributionsAndConversions.mul(ratio)));
    const taxableAmount = nonnegative(whole(totalDistributionsAndConversions.minus(nontaxableAmount)));
    const basisCarryforward = nonnegative(whole(totalBasis.minus(nontaxableAmount)));
    return [{ owner, priorYearBasis, currentYearNondeductibleContributions, totalBasis, traditionalIraDistributions: distributions, rothConversions: conversions, yearEndTraditionalIraValue: yearEndValue, nontaxableAmount, taxableAmount, basisCarryforward }];
  });
  return rows;
}

function validateCodeTreatment(code: string, treatment: string, index: number, block: Block): void {
  const allowed: Record<string, string[]> = {
    "1": ["early_distribution", "indirect_rollover"],
    "2": ["early_distribution", "indirect_rollover"],
    "3": ["disability"],
    "4": ["death", "inherited"],
    "7": ["normal", "qcd", "annuity_simplified", "indirect_rollover"],
    "G": ["direct_rollover"],
    "H": ["direct_rollover"],
    "Q": ["roth_qualified"],
  };
  if (!(allowed[code] ?? []).includes(treatment)) block("RETIREMENT_CODE_TREATMENT_MISMATCH", `Form 1099-R code ${code || "blank"} is not compatible with treatment ${treatment}.`, `retirementDistributions.${index}.distributionCode`);
}

function read(value: string, path: string, block: Block): Decimal {
  try {
    const parsed = amount(value);
    if (parsed.isNegative()) throw new Error("negative");
    return parsed;
  } catch {
    block("INVALID_RETIREMENT_AMOUNT", "Enter a valid nonnegative retirement amount.", path);
    return new Decimal(0);
  }
}
