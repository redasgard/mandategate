export const INVOICE_AGENT_SCOPES = [
  "invoice:upload",
  "invoice:analyze",
  "invoice:read",
] as const;

export const TRUSTED_PAYMENT_AGENT_SCOPES = [
  "payment:submit",
  "payment:read",
] as const;

const invoiceScopeSet = new Set<string>(INVOICE_AGENT_SCOPES);
const paymentScopeSet = new Set<string>(TRUSTED_PAYMENT_AGENT_SCOPES);
const validScopeSet = new Set<string>([...INVOICE_AGENT_SCOPES, ...TRUSTED_PAYMENT_AGENT_SCOPES]);

/** Legacy invoice:submit is retired. No machine identity spans both domains. */
export function isValidSeparatedMachineScopes(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length === 0 ||
      value.some((item) => typeof item !== "string" || !validScopeSet.has(item)) ||
      new Set(value).size !== value.length) return false;
  const invoice = value.some((item) => invoiceScopeSet.has(item));
  const payment = value.some((item) => paymentScopeSet.has(item));
  return invoice !== payment;
}
