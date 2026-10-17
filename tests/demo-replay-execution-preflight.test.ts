import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_CASES, DEMO_ORG_ID, DEMO_TRUSTED_DESTINATION, demoKeys } from "../src/demo/scenarios";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  submit: vi.fn(),
}));
vi.mock("../src/db/pool", () => ({ pool: { query: mocks.query } }));
vi.mock("../src/payments/submit", () => ({
  submitCanonicalPaymentRequest: mocks.submit,
}));
import { createDemoScenarios } from "../src/demo/scenarios-store";

const scenarios = DEMO_CASES.map((item, i) => ({
  id: `fixture-${i}`,
  idempotency_key: demoKeys[i],
  invoice_number: item.invoiceNumber,
  source: "demo_fixture",
  status: item.expectedOutcome === "ALLOW" ? "ALLOWED" :
    item.expectedOutcome === "DENY" ? "DENIED" : "ESCALATED",
  outcome: item.expectedOutcome,
  reason_codes: [item.expectedOutcome === "ALLOW" ? "WITHIN_TRUSTED_BASELINE" :
    item.expectedOutcome === "DENY" ? "DESTINATION_MISMATCH" :
      "AMOUNT_OUTSIDE_VENDOR_BASELINE"],
  has_execution: false,
}));

let executionRows: unknown;
let executionResultCount = 1;
let adminAuthorized: unknown;
beforeEach(() => {
  vi.stubEnv("MANDATEGATE_RUNTIME_MODE", "neon-preview");
  vi.stubEnv("MANDATEGATE_DISABLE_PAYMENTS", "1");
  vi.stubEnv(
    "DATABASE_URL",
    "postgresql://ci:ci@ep-silent-poetry-arjowm4d-pooler.c-4.us-west-2.aws.neon.tech/neondb",
  );
  executionRows = 0;
  executionResultCount = 1;
  adminAuthorized = true;
  mocks.query.mockReset();
  mocks.submit.mockReset();
  mocks.query.mockImplementation(async (sql: string, args: unknown[]) => {
    if (sql.includes("from payment_executions e")) {
      expect(sql).toContain("join payment_requests pr on pr.id=e.payment_request_id");
      expect(sql).toContain("where pr.organization_id=$1");
      expect(sql).toContain("role='ADMIN' and m.active=true");
      expect(args).toEqual([DEMO_ORG_ID, "fixture-admin"]);
      return { rows: Array.from({ length: executionResultCount },
        () => ({ n: executionRows, admin_authorized: adminAuthorized })) };
    }
    if (sql.includes("organization_admin_memberships")) return { rows: [{ exists: 1 }] };
    if (sql.includes("select idempotency_key,source from payment_requests")) {
      return { rows: scenarios.map(({ idempotency_key, source }) =>
        ({ idempotency_key, source })) };
    }
    if (sql.includes("from ap_imports")) return { rows: [{ n: 0 }] };
    if (sql.includes("select d.destination from vendor_destinations")) {
      return { rows: [{ destination: DEMO_TRUSTED_DESTINATION }] };
    }
    if (sql.includes("select v.normal_max_amount_cents,p.auto_pay_max_amount_cents")) {
      return { rows: [{ normal_max_amount_cents: 250000, auto_pay_max_amount_cents: 300000 }] };
    }
    if (sql.includes("select pr.id,pr.idempotency_key")) return { rows: scenarios };
    throw new Error("UNEXPECTED_QUERY: " + sql);
  });
  mocks.submit.mockImplementation(async (request: { invoiceNumber: string }) => {
    const item = DEMO_CASES.find(x => x.invoiceNumber === request.invoiceNumber);
    if (!item) throw new Error("UNEXPECTED_DEMO_FIXTURE");
    return { paymentExecuted: false, decision: { outcome: item.expectedOutcome } };
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("zero-payment preflight for synthetic judge replay", () => {
  it("rejects execution rows even when all three canonical fixtures already exist", async () => {
    executionRows = 1;
    await expect(createDemoScenarios("fixture-admin"))
      .rejects.toMatchObject({ code: "DEMO_REQUIRES_ZERO_EXECUTIONS" });
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("rejects malformed, missing and ambiguous payment-count results", async () => {
    for (const value of ["0", null, Number.NaN, -1, 1.2]) {
      executionRows = value;
      await expect(createDemoScenarios("fixture-admin"))
        .rejects.toMatchObject({ code: "DEMO_EXECUTION_COUNT_INVALID", httpStatus: 503 });
    }
    executionRows = 0;
    for (const count of [0, 2]) {
      executionResultCount = count;
      await expect(createDemoScenarios("fixture-admin"))
        .rejects.toMatchObject({ code: "DEMO_EXECUTION_COUNT_INVALID", httpStatus: 503 });
    }
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("denies a revoked or malformed ADMIN role at the final execution preflight", async () => {
    adminAuthorized = false;
    await expect(createDemoScenarios("fixture-admin"))
      .rejects.toMatchObject({ code: "DEMO_ADMIN_NOT_FOUND", httpStatus: 404 });
    adminAuthorized = null;
    await expect(createDemoScenarios("fixture-admin"))
      .rejects.toMatchObject({ code: "DEMO_EXECUTION_COUNT_INVALID", httpStatus: 503 });
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("preserves the idempotent three-case replay when the demo org has no executions", async () => {
    executionRows = 0;
    const result = await createDemoScenarios("fixture-admin");
    expect(result).toHaveLength(3);
    expect(result.map(x => x.outcome)).toEqual(["ALLOW", "ESCALATE", "DENY"]);
    expect(result.every(x => x.hasExecution === false)).toBe(true);
    expect(mocks.submit).toHaveBeenCalledTimes(3);
  });
});
