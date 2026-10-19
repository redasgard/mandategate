import { demoPreviewEnabled } from "./scenarios";

/** Reviewer creation must run from an explicit payments-disabled Neon preview.
 * The hosted neon-sandbox service may display reviewers, but cannot mint one
 * while its separate PayPal payout rail is enabled. */
export function judgeProvisioningAllowed(env: Record<string,string|undefined>): boolean {
  return env.MANDATEGATE_RUNTIME_MODE === "neon-preview" &&
    env.MANDATEGATE_DISABLE_PAYMENTS === "1" &&
    demoPreviewEnabled(env);
}
