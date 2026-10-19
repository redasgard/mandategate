import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { pool } from "../src/db/pool";
import { prepareSandboxPayout, SANDBOX_ORG_ID, SANDBOX_POLICY_ID } from "../src/demo/sandbox-payout";
import { postgresExecutionStore } from "../src/payments/executor/postgres-store";

const testEnv = {
  MANDATEGATE_RUNTIME_MODE: "neon-sandbox",
  MANDATEGATE_DISABLE_PAYMENTS: "0",
  MANDATEGATE_SANDBOX_PAYOUTS: "1",
  PAYPAL_BASE_URL: "https://api-m.sandbox.paypal.com",
  PAYPAL_CLIENT_ID: "ci-only-synthetic-client-id",
  PAYPAL_CLIENT_SECRET: "ci-only-synthetic-client-secret",
  DEMO_PAYPAL_RECEIVER_EMAIL: "sb-synthetic-ci-recipient@example.test",
};
let paymentId = "";
beforeAll(async () => {
  for (const [name, value] of Object.entries(testEnv)) vi.stubEnv(name, value);
  const admin = await pool.query('select id from "user" where email=$1', [process.env.DEMO_ADMIN_EMAIL]);
  if (admin.rows.length !== 1) throw Error("SYNTHETIC_DEMO_OWNER_REQUIRED");
  const prepared = await prepareSandboxPayout(admin.rows[0].id);
  expect(prepared).toMatchObject({amountCents:101,outcome:"ALLOW",paymentExecuted:false});
  paymentId = prepared.requestId;
});
afterAll(async () => { vi.unstubAllEnvs(); await pool.end(); });
async function assertNoExecution() {
  const res = await pool.query([
    "select count(*)::int as n from payment_executions pe",
    "join payment_requests pr on pr.id=pe.payment_request_id",
    "where pr.organization_id=$1",
  ].join(" "), [SANDBOX_ORG_ID]);
  expect(res.rows[0].n).toBe(0);
}
describe("fixed Sandbox authority after policy revalidation", () => {
  it("preserves a 101-cent test ALLOW without making a payout", async () => {
    const allowed = await postgresExecutionStore.getAuthoritativePayment(paymentId);
    expect(allowed).toMatchObject({
      requestId:paymentId,amountCents:101,currency:"USD",decisionOutcome:"ALLOW",
      requestedDestination:testEnv.DEMO_PAYPAL_RECEIVER_EMAIL,
    });
    await assertNoExecution();
  });
  it("rejects a revoked test policy without executing", async () => {
    await pool.query("update policies set active=false where id=$1", [SANDBOX_POLICY_ID]);
    try {
      expect(await postgresExecutionStore.getAuthoritativePayment(paymentId)).toBeNull();
      await assertNoExecution();
    } finally {
      await pool.query("update policies set active=true where id=$1", [SANDBOX_POLICY_ID]);
    }
  });
  it("rejects receiver substitution before any execution", async () => {
    vi.stubEnv("DEMO_PAYPAL_RECEIVER_EMAIL", "substituted@example.test");
    try {
      expect(await postgresExecutionStore.getAuthoritativePayment(paymentId)).toBeNull();
      await assertNoExecution();
    } finally {
      vi.stubEnv("DEMO_PAYPAL_RECEIVER_EMAIL", testEnv.DEMO_PAYPAL_RECEIVER_EMAIL);
    }
  });
});
