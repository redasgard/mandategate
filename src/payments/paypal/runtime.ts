import { PayPalPayoutsClient } from "./client";

let singleton: PayPalPayoutsClient | null = null;
export function getPayPalClient() {
  singleton ??= PayPalPayoutsClient.fromEnv();
  return singleton;
}
