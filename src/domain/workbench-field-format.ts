export function sanitizeCurrencyInput(value: string, allowNegative = false) {
  const negative = allowNegative && value.trim().startsWith("-");
  const cleaned = value.replace(/[^0-9.]/g, "");
  const [whole = "", ...fractionParts] = cleaned.split(".");
  const decimal = fractionParts.length ? `${whole}.${fractionParts.join("").slice(0, 2)}` : whole;
  return `${negative ? "-" : ""}${decimal}`;
}

export function formatCurrencyInput(value: string, allowNegative = false) {
  const sanitized = sanitizeCurrencyInput(value, allowNegative);
  const number = Number(sanitized);
  if (!Number.isFinite(number)) return "0.00";
  if (!allowNegative && number < 0) return "0.00";
  return number.toFixed(2);
}

export function maskProtectedIdentifier(value: string, visibleCharacters = 4) {
  if (!value) return "";
  const visible = Math.max(0, Math.min(visibleCharacters, value.length));
  return `${"•".repeat(value.length - visible)}${value.slice(-visible)}`;
}

export function boundedNumberInput(value: string, minimum: number, maximum: number) {
  if (value.trim() === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(minimum, Math.min(maximum, number));
}

export function safeDraftStorageKey(scope: string, field: string) {
  if (!/^[a-z0-9:_-]{1,120}$/i.test(scope) || !/^[a-z0-9:_-]{1,120}$/i.test(field)) throw new Error("Draft keys may contain only letters, numbers, colons, underscores, and hyphens.");
  return `nexus:safe-draft:v1:${scope}:${field}`;
}
