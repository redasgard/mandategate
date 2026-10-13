/**
 * Narrow hackathon exception for operator-approved, byte-identical synthetic
 * fixtures. Never infer "demo" from NODE_ENV: Next.js runs production builds
 * on the public Render development service.
 *
 * The Render service binding is intentional. A different service, including
 * a future production deployment, cannot inherit this override by copying
 * the environment flags.
 */
const DEMO_RENDER_SERVICE_ID = "srv-db39vmm7bikc73c55nh0";
const PAYPAL_SANDBOX_URL = "https://api-m.sandbox.paypal.com";

export function syntheticNonZdrTestEnvironmentEnabled(): boolean {
  const localUrl = process.env.BETTER_AUTH_URL ?? "";
  const localDev = process.env.NODE_ENV !== "production" &&
    (localUrl === "http://127.0.0.1:3000" || localUrl === "http://localhost:3000");
  const boundDemoService = process.env.RENDER_SERVICE_ID === DEMO_RENDER_SERVICE_ID;
  return process.env.MANDATEGATE_DEPLOYMENT_ROLE === "demo" &&
    process.env.MANDATEGATE_SYNTHETIC_NON_ZDR_TEST === "1" &&
    process.env.PAYPAL_BASE_URL === PAYPAL_SANDBOX_URL &&
    (localDev || boundDemoService);
}

export function isSyntheticNonZdrSourceAllowlisted(sha256: string): boolean {
  if (!syntheticNonZdrTestEnvironmentEnabled() || !/^[a-f0-9]{64}$/.test(sha256)) {
    return false;
  }
  return (process.env.MANDATEGATE_SYNTHETIC_NON_ZDR_SOURCE_SHA256_ALLOWLIST ?? "")
    .split(",")
    .some((value) => value.trim() === sha256);
}
