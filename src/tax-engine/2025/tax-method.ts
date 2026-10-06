import Decimal from "decimal.js";
import taxTableData from "./data/tax-table.json";
import { constants2025 } from "./rule-package";
import { amount, whole } from "./math";
import type { FilingStatus2025 } from "./types";

type TaxTableRow = [number, number, number, number, number, number];

const taxTable = taxTableData as TaxTableRow[];
const columnByStatus: Record<FilingStatus2025, 2 | 3> = { single: 2, married_filing_jointly: 3 };

const computationRows: Record<FilingStatus2025, Array<{ over: number; through: number | null; rate: string; subtract: string }>> = {
  single: [
    { over: 100000, through: 103350, rate: "0.22", subtract: "5086.00" },
    { over: 103350, through: 197300, rate: "0.24", subtract: "7153.00" },
    { over: 197300, through: 250525, rate: "0.32", subtract: "22937.00" },
    { over: 250525, through: 626350, rate: "0.35", subtract: "30452.75" },
    { over: 626350, through: null, rate: "0.37", subtract: "42979.75" },
  ],
  married_filing_jointly: [
    { over: 100000, through: 206700, rate: "0.22", subtract: "10172.00" },
    { over: 206700, through: 394600, rate: "0.24", subtract: "14306.00" },
    { over: 394600, through: 501050, rate: "0.32", subtract: "45874.00" },
    { over: 501050, through: 751600, rate: "0.35", subtract: "60905.50" },
    { over: 751600, through: null, rate: "0.37", subtract: "75937.50" },
  ],
};

export function ordinaryIncomeTax2025(taxableIncome: Decimal.Value, filingStatus: FilingStatus2025): Decimal {
  const income = whole(taxableIncome);
  if (income.lte(0)) return new Decimal(0);
  if (income.lt(100000)) {
    const numericIncome = income.toNumber();
    const row = taxTable.find(([lower, upper]) => numericIncome >= lower && numericIncome < upper);
    if (!row) throw new Error(`Missing 2025 tax-table band for ${numericIncome}`);
    return new Decimal(row[columnByStatus[filingStatus]]);
  }

  const row = computationRows[filingStatus].find(({ over, through }) => income.gte(over) && (through == null || income.lte(through)));
  if (!row) throw new Error(`Missing 2025 computation-workbook row for ${income.toFixed(0)}`);
  return whole(income.mul(row.rate).minus(row.subtract));
}

export interface QualifiedDividendTaxResult {
  tax: Decimal;
  ordinaryIncomePortion: Decimal;
  zeroRateAmount: Decimal;
  fifteenRateAmount: Decimal;
  twentyRateAmount: Decimal;
}

export function qualifiedDividendTax2025(
  taxableIncome: Decimal.Value,
  qualifiedDividends: Decimal.Value,
  filingStatus: FilingStatus2025,
): QualifiedDividendTaxResult {
  const line1 = whole(taxableIncome);
  const line4 = Decimal.min(line1, whole(qualifiedDividends));
  const line5 = Decimal.max(0, line1.minus(line4));
  const line6 = amount(constants2025.qualifiedDividendZeroRateCeiling[filingStatus]);
  const line7 = Decimal.min(line1, line6);
  const line8 = Decimal.min(line5, line7);
  const line9 = line7.minus(line8);
  const line10 = Decimal.min(line1, line4);
  const line12 = line10.minus(line9);
  const line13 = amount(constants2025.qualifiedDividendFifteenRateCeiling[filingStatus]);
  const line14 = Decimal.min(line1, line13);
  const line15 = line5.plus(line9);
  const line16 = Decimal.max(0, line14.minus(line15));
  const line17 = Decimal.min(line12, line16);
  const line18 = whole(line17.mul("0.15"));
  const line19 = line9.plus(line17);
  const line20 = line10.minus(line19);
  const line21 = whole(line20.mul("0.20"));
  const line22 = ordinaryIncomeTax2025(line5, filingStatus);
  const line23 = line18.plus(line21).plus(line22);
  const line24 = ordinaryIncomeTax2025(line1, filingStatus);
  return {
    tax: Decimal.min(line23, line24),
    ordinaryIncomePortion: line5,
    zeroRateAmount: line9,
    fifteenRateAmount: line17,
    twentyRateAmount: line20,
  };
}
