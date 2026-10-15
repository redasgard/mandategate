import { PayPalPayoutsClient } from "./client";

let singleton: PayPalPayoutsClient | null = null;
export function getPayPalClient() {
  if (process.env.MANDATEGATE_DISABLE_PAYMENTS === "1") {
    throw new Error("PAYMENT_INTEGRATIONS_DISABLED_FOR_PREVIEW");
  }
  singleton ??= PayPalPayoutsClient.fromEnv();
  return singleton;
}
