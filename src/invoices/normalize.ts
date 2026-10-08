// This module has no payment authority. It only normalizes untrusted observations.
export const MAX_INVOICE_PAYMENT_CENTS = 2_000_000_000;

export function invoiceDecimalToCents(decimal: string): number | null {
  if (!/^(0|[1-9]\d{0,8})\.\d{2}$/.test(decimal)) return null;
  const [major, fractional] = decimal.split(".");
  const cents = BigInt(major) * 100n + BigInt(fractional);
  if (cents <= 0n || cents > BigInt(MAX_INVOICE_PAYMENT_CENTS)) return null;
  return Number(cents);
}

export function isIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || year > 2100) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
