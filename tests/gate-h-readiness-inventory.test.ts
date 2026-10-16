import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../src/db/pool", () => ({ pool: { query: mocks.query } }));

import {
  classifyGateHInventory, GATE_H_INVENTORY_SQL, readGateHInventory,
} from "../src/gate-h/readiness-inventory";

const emptyRow = {
  invoice_artifacts: 4,
  independent_pdf_pages: 0,
  pdf_artifacts_with_pages: 0,
  verified_pdf_claims: 0,
  active_enrolled_channels: 0,
  eligible_preexisting_channel_invoice_pairs: 0,
  current_human_origin_attestations: 0,
  authorized_bindings: 0,
  consented_synthetic_glm_observations: 3,
  invoice_payment_requests: 0,
  all_payment_executions: 0,
};

beforeEach(() => {
  mocks.query.mockReset();
  mocks.query.mockResolvedValue({ rows: [{ ...emptyRow }] });
});

describe("read-only Gate H inventory does not grant payment authority", () => {
  it("reports current incomplete T2/T3/T4 proof without falsely passing the gate", async () => {
    const report = await readGateHInventory("org_demo");
    expect(report).toMatchObject({
      contract: "mandategate/gate-h-readonly-inventory/v1",
      organizationId: "org_demo",
      status: "BLOCKED",
      payoutAuthorized: false,
      externalRequestsMade: false,
      counts: {
        invoiceArtifacts: 4,
        independentPdfPages: 0,
        verifiedPdfClaims: 0,
        activeEnrolledChannels: 0,
        eligiblePreexistingChannelInvoicePairs: 0,
        currentHumanOriginAttestations: 0,
        authorizedBindings: 0,
        consentedSyntheticGlmObservations: 3,
        invoicePaymentRequests: 0,
        allPaymentExecutions: 0,
      },
      tiers: {
        t1Model: "SYNTHETIC_ADVISORY_ONLY",
        t2VerifiedSource: "MISSING",
        t3IssuerOrigin: "MISSING",
        t4ExactBinding: "MISSING",
        strictPrivacy: "NOT_EVALUATED",
        paypalSandbox: "NO_CURRENT_EXECUTIONS",
      },
    });
    expect(report.blockers).toContain("T2_NO_VERIFIED_PDF_FACTS");
    expect(report.blockers).toContain("T3_NO_ELIGIBLE_PREEXISTING_CHANNEL_INVOICE_PAIR");
    expect(report.blockers).toContain("T3_NO_CURRENT_NON_SYNTHETIC_ORIGIN_ATTESTATION");
    expect(report.blockers).toContain("T4_NO_AUTHORIZED_BINDING");
    expect(report.blockers).toContain("STRICT_PROVIDER_PRIVACY_REQUIRES_SEPARATE_EXTERNAL_PROOF");
    expect(mocks.query).toHaveBeenCalledOnce();
    expect(mocks.query).toHaveBeenCalledWith(GATE_H_INVENTORY_SQL, ["org_demo"]);
  });

  it("does not report full approval even when record existence counts are nonzero", () => {
    const report = classifyGateHInventory("org_demo", {
      ...emptyRow,
      independent_pdf_pages: "3",
      pdf_artifacts_with_pages: 2,
      verified_pdf_claims: 1,
      current_human_origin_attestations: 1,
      active_enrolled_channels: 1,
      eligible_preexisting_channel_invoice_pairs: 1,
      authorized_bindings: 1,
      invoice_payment_requests: 1,
      all_payment_executions: 1,
    });
    expect(report.status).toBe("BLOCKED");
    expect(report.payoutAuthorized).toBe(false);
    expect(report.tiers).toMatchObject({
      t2VerifiedSource: "RECORDED_REQUIRES_REVIEW",
      t3IssuerOrigin: "HUMAN_ATTESTATION_REQUIRES_REVIEW",
      t4ExactBinding: "RECORDED_REQUIRES_REVIEW",
      strictPrivacy: "NOT_EVALUATED",
      paypalSandbox: "LOCAL_EXECUTIONS_REQUIRE_EXTERNAL_RECONCILIATION",
    });
    expect(report.blockers).toContain("PAYPAL_PAYOUT_REQUIRES_EXACT_AUTHORIZATION_AND_EXTERNAL_RECONCILIATION");
  });

  it("scopes every source to the supplied organization and requires original-SHA consent", async () => {
    await readGateHInventory("org_other");
    expect(mocks.query).toHaveBeenCalledWith(GATE_H_INVENTORY_SQL, ["org_other"]);
    expect(GATE_H_INVENTORY_SQL.match(/organization_id=\$1/g)?.length).toBeGreaterThan(6);
    expect(GATE_H_INVENTORY_SQL).toContain("invoice_synthetic_non_zdr_test_consents");
    expect(GATE_H_INVENTORY_SQL).toContain("c.source_sha256=art.sha256");
    expect(GATE_H_INVENTORY_SQL).toContain("a.method='ADMIN_OUT_OF_BAND'");
    expect(GATE_H_INVENTORY_SQL).toContain("ch.created_at < art.created_at");
    expect(GATE_H_INVENTORY_SQL).toContain("eligible_preexisting_channel_invoice_pairs");
    expect(GATE_H_INVENTORY_SQL).toContain("verification_status='VERIFIED'");
    expect(GATE_H_INVENTORY_SQL).not.toMatch(/\b(?:insert|update|delete|truncate|drop|alter|grant|execute)\b/i);
  });

  it("rejects untrusted organization IDs before accessing storage", async () => {
    for (const bad of [
      "", " ", "foreign' or 1=1 --", "org-demo; select 1", "0".repeat(121),
      "org/demo", "org\nsecond", "*",
    ]) {
      await expect(readGateHInventory(bad)).rejects.toThrow("GATE_H_INVENTORY_INVALID_ORGANIZATION");
    }
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("fails closed on missing, fractional, negative, overflow and malformed counts", () => {
    for (const value of [undefined, null, -1, 0.5, Infinity, NaN, "1abc", "2.0",
      Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => classifyGateHInventory("org_demo", {
        ...emptyRow,
        verified_pdf_claims: value,
      })).toThrow("GATE_H_INVENTORY_INVALID_COUNT:verified_pdf_claims");
    }
  });

  it("fails closed on a missing source row without inferring success", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });
    await expect(readGateHInventory("org_demo")).rejects.toThrow("GATE_H_INVENTORY_UNAVAILABLE");
  });

  it("never turns a synthetic-only model receipt into strict privacy proof", () => {
    const report = classifyGateHInventory("org_demo", {
      ...emptyRow,
      consented_synthetic_glm_observations: 42,
      verified_pdf_claims: 3,
    });
    expect(report.tiers.t1Model).toBe("SYNTHETIC_ADVISORY_ONLY");
    expect(report.tiers.strictPrivacy).toBe("NOT_EVALUATED");
    expect(report.status).toBe("BLOCKED");
    expect(report.payoutAuthorized).toBe(false);
  });
});
