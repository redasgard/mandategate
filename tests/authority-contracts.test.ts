import { describe, expect, it } from "vitest";
import {
  hashPaymentAuthorityTuple,
  hashUnverifiedClaimSnapshot,
  unverifiedClaimInputSchema,
} from "../src/authority/contracts";

const digest = "a".repeat(64);
const claim = {
  organizationId: "org_demo",
  artifactId: "11111111-1111-4111-8111-111111111111",
  artifactSha256: digest,
  observationSha256: "b".repeat(64),
  sourceKind: "GLM_IMAGE" as const,
  fields: [
    { fieldName: "total_amount_decimal" as const, observedValue: "1.01", sourcePage: 1, sourceQuoteSha256: "c".repeat(64) },
    { fieldName: "invoice_number" as const, observedValue: "INV-100", sourcePage: 1, sourceQuoteSha256: "d".repeat(64) },
  ],
};

const tuple = {
  organizationId: "org_demo",
  artifactId: claim.artifactId,
  artifactSha256: digest,
  claimSetId: "22222222-2222-4222-8222-222222222222",
  originAttestationId: "33333333-3333-4333-8333-333333333333",
  vendorId: "vendor_demo",
  destinationId: "destination_primary",
  trustedDestination: "trusted@example.com",
  policyId: "policy_v1",
  policySnapshotSha256: "e".repeat(64),
  invoiceNumber: "INV-100",
  amountCents: 101,
  currency: "USD",
};

describe("Gate B: authority provenance contracts (non-authorizing)", () => {
  it("does not depend on model field ordering", () => {
    expect(hashUnverifiedClaimSnapshot(claim)).toBe(hashUnverifiedClaimSnapshot({
      ...claim, fields: [...claim.fields].reverse(),
    }));
  });

  it("changes hash when any purported model fact, quote, source, or tenant changes", () => {
    const baseline = hashUnverifiedClaimSnapshot(claim);
    for (const variant of [
      { ...claim, organizationId: "org_other" },
      { ...claim, artifactSha256: "0".repeat(64) },
      { ...claim, fields: [{...claim.fields[0], observedValue: "999.00"}, claim.fields[1]] },
      { ...claim, fields: [{...claim.fields[0], sourceQuoteSha256: "0".repeat(64)}, claim.fields[1]] },
    ]) {
      expect(hashUnverifiedClaimSnapshot(variant)).not.toBe(baseline);
    }
  });

  it("does not accept duplicates, forged authority keys or invalid hash shapes", () => {
    expect(unverifiedClaimInputSchema.safeParse({...claim, authorized: true}).success).toBe(false);
    expect(unverifiedClaimInputSchema.safeParse({
      ...claim,
      fields: [claim.fields[0], claim.fields[0]],
    }).success).toBe(false);
    expect(unverifiedClaimInputSchema.safeParse({...claim, artifactSha256: "sha256:fake"}).success).toBe(false);
  });

  it("binds every payment-critical selector in a deterministic tuple digest", () => {
    const baseline = hashPaymentAuthorityTuple(tuple);
    expect(baseline).toMatch(/^[a-f0-9]{64}$/);
    for (const variant of [
      {...tuple, organizationId: "org_other"},
      {...tuple, artifactSha256: "1".repeat(64)},
      {...tuple, claimSetId: "44444444-4444-4444-8444-444444444444"},
      {...tuple, originAttestationId: "44444444-4444-4444-8444-444444444444"},
      {...tuple, vendorId: "vendor_other"},
      {...tuple, destinationId: "destination_other"},
      {...tuple, trustedDestination: "evil@example.com"},
      {...tuple, policySnapshotSha256: "9".repeat(64)},
      {...tuple, amountCents: 99900},
      {...tuple, currency: "EUR"},
      {...tuple, invoiceNumber: "OTHER-INV"},
    ]) {
      expect(hashPaymentAuthorityTuple(variant)).not.toBe(baseline);
    }
  });

  it("never treats a digest as an authorization token", () => {
    expect(() => hashPaymentAuthorityTuple({...tuple, paymentAuthorized: true})).toThrow();
    expect(() => hashPaymentAuthorityTuple({...tuple, amountCents: 101.5})).toThrow();
  });
});
