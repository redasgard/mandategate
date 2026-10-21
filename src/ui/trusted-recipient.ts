/**
 * Read-only recipient comparison for administrators. This result never
 * authenticates a vendor, creates an approval, or grants payment authority.
 */
export function compareTrustedRecipient(
  current: readonly string[],
  requested: string,
): { label: string; destination: string; isMismatch: boolean } {
  if (current.length === 0) return {
    label: "Trust record unavailable", destination: "Not established in current view", isMismatch: true,
  };
  if (current.length !== 1) return {
    label: "Conflicting trusted destinations", destination: "Multiple active records", isMismatch: true,
  };
  if (current[0] !== requested) return {
    label: "Destination mismatch · investigate", destination: current[0], isMismatch: true,
  };
  return { label: "Matches current trusted destination", destination: current[0], isMismatch: false };
}
