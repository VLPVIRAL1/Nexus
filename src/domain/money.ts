import Decimal from "decimal.js";
import type { DecimalString } from "./canonical";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export function money(value: string | number | Decimal): Decimal {
  return new Decimal(value);
}

export function asDecimalString(value: Decimal.Value): DecimalString {
  return new Decimal(value).toDecimalPlaces(2).toFixed(2) as DecimalString;
}

export function addMoney(values: Array<string | null | undefined>): DecimalString {
  return asDecimalString(values.reduce<Decimal>((sum, value) => value == null ? sum : sum.plus(value), new Decimal(0)));
}

export function allocateByPercent(source: DecimalString, percentages: DecimalString[]): DecimalString[] {
  const total = money(source);
  let assigned = new Decimal(0);
  return percentages.map((percentage, index) => {
    if (index === percentages.length - 1) return asDecimalString(total.minus(assigned));
    const amount = total.mul(percentage).div(100).toDecimalPlaces(2);
    assigned = assigned.plus(amount);
    return asDecimalString(amount);
  });
}
