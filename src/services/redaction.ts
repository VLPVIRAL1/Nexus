const sensitiveKeys = /ssn|tin|ein|account|routing|wage|income|amount|tax|address|name/i;

export function redactForLog(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactForLog);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sensitiveKeys.test(key) ? "[REDACTED]" : redactForLog(item)]));
}

export function maskTin(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? `***-**-${digits.slice(-4)}` : "***-**-****";
}

export function neutralizeSpreadsheetText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}
