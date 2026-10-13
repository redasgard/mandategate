import { afterEach, describe, expect, it, vi } from "vitest";
import {
  syntheticNonZdrTestEnvironmentEnabled,
  isSyntheticNonZdrSourceAllowlisted,
} from "../src/ai/gateway/non-zdr-test-policy";

const syntheticSha = "892d7889152b6d6e6d20310f3b7a59cf25e7c3b73ea5882d9c30de781c3ce181";
function enableDemo() {
  vi.stubEnv("MANDATEGATE_DEPLOYMENT_ROLE", "demo");
  vi.stubEnv("MANDATEGATE_SYNTHETIC_NON_ZDR_TEST", "1");
  vi.stubEnv("PAYPAL_BASE_URL", "https://api-m.sandbox.paypal.com");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3000");
  vi.stubEnv("RENDER_SERVICE_ID", "");
  vi.stubEnv("MANDATEGATE_SYNTHETIC_NON_ZDR_SOURCE_SHA256_ALLOWLIST", syntheticSha);
}
afterEach(() => vi.unstubAllEnvs());

describe("explicit synthetic non-ZDR environment fence", () => {
  it("defaults to disabled and cannot be enabled by a source hash alone", () => {
    vi.stubEnv("MANDATEGATE_DEPLOYMENT_ROLE", "");
    vi.stubEnv("MANDATEGATE_SYNTHETIC_NON_ZDR_TEST", "");
    vi.stubEnv("MANDATEGATE_SYNTHETIC_NON_ZDR_SOURCE_SHA256_ALLOWLIST", syntheticSha);
    expect(syntheticNonZdrTestEnvironmentEnabled()).toBe(false);
    expect(isSyntheticNonZdrSourceAllowlisted(syntheticSha)).toBe(false);
  });
  it("requires all demo opt-in flags and the exact PayPal Sandbox host", () => {
    enableDemo();
    expect(syntheticNonZdrTestEnvironmentEnabled()).toBe(true);
    vi.stubEnv("PAYPAL_BASE_URL", "https://api-m.paypal.com");
    expect(syntheticNonZdrTestEnvironmentEnabled()).toBe(false);
    vi.stubEnv("PAYPAL_BASE_URL", "https://api-m.sandbox.paypal.com");
    vi.stubEnv("MANDATEGATE_DEPLOYMENT_ROLE", "production");
    expect(syntheticNonZdrTestEnvironmentEnabled()).toBe(false);
    vi.stubEnv("MANDATEGATE_DEPLOYMENT_ROLE", "demo");
    vi.stubEnv("MANDATEGATE_SYNTHETIC_NON_ZDR_TEST", "0");
    expect(syntheticNonZdrTestEnvironmentEnabled()).toBe(false);
  });
  it("rejects an unrelated production Render service even if all flags were copied", () => {
    enableDemo();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RENDER_SERVICE_ID", "srv-production-not-demo");
    expect(syntheticNonZdrTestEnvironmentEnabled()).toBe(false);
    expect(isSyntheticNonZdrSourceAllowlisted(syntheticSha)).toBe(false);
    vi.stubEnv("RENDER_SERVICE_ID", "srv-db39vmm7bikc73c55nh0");
    expect(syntheticNonZdrTestEnvironmentEnabled()).toBe(true);
  });
  it("requires exact original-byte SHA-256, not a prefix, uppercase or wildcard", () => {
    enableDemo();
    expect(isSyntheticNonZdrSourceAllowlisted(syntheticSha)).toBe(true);
    expect(isSyntheticNonZdrSourceAllowlisted(syntheticSha.slice(0, 63))).toBe(false);
    expect(isSyntheticNonZdrSourceAllowlisted(syntheticSha.toUpperCase())).toBe(false);
    expect(isSyntheticNonZdrSourceAllowlisted("0".repeat(64))).toBe(false);
    vi.stubEnv("MANDATEGATE_SYNTHETIC_NON_ZDR_SOURCE_SHA256_ALLOWLIST", "*");
    expect(isSyntheticNonZdrSourceAllowlisted(syntheticSha)).toBe(false);
  });
});
