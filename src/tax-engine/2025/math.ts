import Decimal from "decimal.js";

export function amount(value: Decimal.Value): Decimal {
  const result = new Decimal(value);
  if (!result.isFinite()) throw new Error(`Invalid amount: ${value}`);
  return result;
}

export function whole(value: Decimal.Value): Decimal {
  return amount(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

export function dollars(value: Decimal.Value): string {
  return amount(value).toFixed(0);
}

export function sum(values: Decimal.Value[]): Decimal {
  return values.reduce<Decimal>((total, value) => total.plus(value), new Decimal(0));
}

export function nonnegative(value: Decimal.Value): Decimal {
  return Decimal.max(0, value);
}
