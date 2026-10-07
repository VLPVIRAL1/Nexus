import type { CalculationOutput2025 } from "@/tax-engine/2025";
import type { TaxFormData, TaxFormLine } from "./tax-form-renderer";

export interface FormRenderingPlan2025 {
  requiredForms: string[];
  pages: TaxFormData[];
  renderedForms: string[];
  missingForms: string[];
}

export function buildFormRenderingPlan2025(result: CalculationOutput2025 | Record<string, unknown>): FormRenderingPlan2025 {
  const output = result as CalculationOutput2025;
  const requiredForms = requiredFormsForCalculation2025(output);
  if (output.status !== "calculated_draft" || !output.forms) {
    return { requiredForms, pages: [], renderedForms: [], missingForms: requiredForms };
  }

  const forms = output.forms;
  const pages: TaxFormData[] = [
    page("Form 1040", "U.S. Individual Income Tax Return — calculated line preview", [
      money("1a", "Wages, salaries, tips", forms.form1040.wages, "form-1040.wages"),
      money("2a", "Tax-exempt interest", forms.form1040.taxExemptInterest, "form-1040.tax-exempt-interest"),
      money("2b", "Taxable interest", forms.form1040.taxableInterest, "form-1040.taxable-interest"),
      money("3a", "Qualified dividends", forms.form1040.qualifiedDividends, "form-1040.qualified-dividends"),
      money("3b", "Ordinary dividends", forms.form1040.ordinaryDividends, "form-1040.ordinary-dividends"),
      money("9", "Total income", forms.form1040.totalIncome, "form-1040.total-income"),
      money("11", "Adjusted gross income", forms.form1040.adjustedGrossIncome, "form-1040.adjusted-gross-income"),
      money("12", "Standard deduction", forms.form1040.standardDeduction, "form-1040.standard-deduction"),
      money("13", "Qualified business income deduction", forms.form1040.qbiDeduction, "form-8995.deduction"),
      money("15", "Taxable income", forms.form1040.taxableIncome, "form-1040.taxable-income"),
      money("16", "Income tax", forms.form1040.incomeTax, "form-1040.income-tax"),
      money("23", "Other taxes — self-employment tax", forms.form1040.selfEmploymentTax, "schedule-se.tax"),
      money("24", "Total tax", forms.form1040.totalTax, "form-1040.total-tax"),
      money("25d", "Federal income tax withheld", forms.form1040.federalWithholding, "form-1040.payments"),
      money("35a", "Refund", forms.form1040.refund, "form-1040.refund"),
      money("37", "Amount owed", forms.form1040.amountOwed, "form-1040.amount-owed"),
    ]),
  ];

  if (forms.scheduleB.required) pages.push(page("Schedule B", "Interest and Ordinary Dividends — supported totals", [
    money("Part I", "Taxable interest total", forms.scheduleB.taxableInterest, "schedule-b.interest"),
    money("Part II", "Ordinary dividends total", forms.scheduleB.ordinaryDividends, "schedule-b.dividends"),
  ]));

  forms.scheduleC.forEach((activity, index) => pages.push(page("Schedule C", "Profit or Loss From Business — supported lines", [
    money("1", "Gross receipts or sales", activity.grossReceipts, "schedule-c.gross-receipts"),
    money("28", "Total expenses", activity.expenses, "schedule-c.expenses"),
    money("31", "Net profit or loss", activity.netProfit, "schedule-c.net-profit"),
  ], `Activity ${index + 1}: ${activity.activityId}`)));

  forms.scheduleSE.forEach((owner, index) => pages.push(page("Schedule SE", "Self-Employment Tax — supported regular method", [
    money("2", "Net profit from Schedule C", owner.netProfit, "schedule-se.net-profit"),
    money("4a", "Net earnings from self-employment", owner.netEarnings, "schedule-se.net-earnings"),
    money("6", "Social Security wages", owner.socialSecurityWages, "schedule-se.social-security-wages"),
    money("10", "Social Security portion", owner.socialSecurityTax, "schedule-se.social-security-tax"),
    money("11", "Medicare portion", owner.medicareTax, "schedule-se.medicare-tax"),
    money("12", "Self-employment tax", owner.selfEmploymentTax, "schedule-se.tax"),
    money("13", "Deductible one-half of self-employment tax", owner.deductibleHalf, "schedule-1.se-deduction"),
  ], `Owner ${index + 1}: ${owner.owner}`)));

  if (forms.scheduleC.length || forms.scheduleSE.length) {
    pages.push(page("Schedule 1", "Additional Income and Adjustments to Income — supported lines", [
      money("3", "Business income or loss", forms.schedule1.businessIncome, "schedule-c.net-profit"),
      money("15", "Deductible part of self-employment tax", forms.schedule1.deductiblePartOfSelfEmploymentTax, "schedule-1.se-deduction"),
    ]));
    pages.push(page("Schedule 2", "Additional Taxes — supported lines", [
      money("4", "Self-employment tax", forms.schedule2.selfEmploymentTax, "schedule-se.tax"),
    ]));
  }

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
  return { requiredForms, pages, renderedForms, missingForms: requiredForms.filter((name) => !renderedForms.includes(name)) };
}

export function requiredFormsForCalculation2025(result: CalculationOutput2025 | Record<string, unknown>): string[] {
  const output = result as CalculationOutput2025;
  const forms = output.forms;
  const required = ["Form 1040"];
  if (!forms) return required;
  if (forms.scheduleB.required) required.push("Schedule B");
  if (forms.scheduleC.length) required.push("Schedule C");
  if (forms.scheduleSE.length) required.push("Schedule SE", "Schedule 1", "Schedule 2");
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

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
