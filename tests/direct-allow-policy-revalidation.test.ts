import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/pool";
import { importApHistory } from "../src/history/store";
import { postgresExecutionStore } from "../src/payments/executor/postgres-store";
import { executeAuthorizedPayment } from "../src/payments/executor/service";
import type { PaymentGateway } from "../src/payments/executor/types";

const organizationId = "allow_revalidation_" + randomUUID();
const vendorId = "vendor_" + randomUUID();
const destinationId = "dest_" + randomUUID();
const policyId = "policy_" + randomUUID();
const requestId = randomUUID();
const logicalPaymentId = randomUUID();

let outboundPosts = 0;
let adminId = "";
const noPostGateway: PaymentGateway = {
  async createSinglePayout() {
    outboundPosts++;
    throw new Error("UNEXPECTED_PAYPAL_PAYOUT");
  },
  async getBatchItem() { throw new Error("UNEXPECTED_PAYPAL_LOOKUP"); },
  async getPayoutItem() { throw new Error("UNEXPECTED_PAYPAL_LOOKUP"); },
};

beforeAll(async () => {
  const admin = await pool.query('select id from "user" where email=$1', [process.env.DEMO_ADMIN_EMAIL]);
  if (!admin.rows[0]) throw new Error("CI_DEMO_ADMIN_MISSING");
  adminId=admin.rows[0].id;
  await pool.query("insert into organizations(id,name) values ($1,'Direct policy revalidation test')", [organizationId]);
  await pool.query(
    "insert into organization_admin_memberships(user_id,organization_id,role,active) values($1,$2,'ADMIN',true)",
    [adminId,organizationId],
  );
  await pool.query(
    "insert into vendors(id,organization_id,name,normal_max_amount_cents) values($1,$2,'Test vendor',1000)",
    [vendorId,organizationId],
  );
  await pool.query(
    "insert into vendor_destinations(id,vendor_id,destination,trusted) values($1,$2,'ap@revalidate.invalid',true)",
    [destinationId,vendorId],
  );
  await pool.query(
    "insert into policies(id,organization_id,name,auto_pay_max_amount_cents,active) values($1,$2,'Test policy',1000,true)",
    [policyId,organizationId],
  );
  await pool.query([
    "insert into payment_requests",
    "(id,logical_payment_id,organization_id,vendor_id,invoice_number,amount_cents,",
    "currency,requested_destination,status,source)",
    "values($1,$2,$3,$4,'INV-REVALIDATE-01',900,'USD','ap@revalidate.invalid','ALLOWED','agent_api')",
  ].join(" "), [requestId,logicalPaymentId,organizationId,vendorId]);
  await pool.query(
    "insert into payment_decisions(id,payment_request_id,outcome,reason_codes,evidence) values($1,$2,'ALLOW','[\"WITHIN_TRUSTED_BASELINE\"]'::jsonb,'[]'::jsonb)",
    [randomUUID(),requestId],
  );
});

// As in the AP import suites, the isolated CI database owns this unique
// fixture: imported paid-history evidence is append-only and not test-deleted.
afterAll(async () => { await pool.end(); });

async function mustBlockWithoutPosting() {
  expect(await postgresExecutionStore.getAuthoritativePayment(requestId)).toBeNull();
  await expect(executeAuthorizedPayment(requestId, {
    store:postgresExecutionStore,gateway:noPostGateway,
  })).rejects.toThrow("PAYMENT_REQUEST_NOT_FOUND");
  const executions = await pool.query(
    "select count(*)::int as n from payment_executions where logical_payment_id=$1",
    [logicalPaymentId],
  );
  expect(executions.rows[0].n).toBe(0);
  expect(outboundPosts).toBe(0);
}

describe("direct-agent ALLOW authority expires with current policy", () => {
  it("retains eligibility only while the current receiver, vendor limit and active policy allow it", async () => {
    const payment=await postgresExecutionStore.getAuthoritativePayment(requestId);
    expect(payment).toMatchObject({
      decisionOutcome:"ALLOW",amountCents:900,currency:"USD",
      requestedDestination:"ap@revalidate.invalid",
    });
  });

  it("refuses an already-allowed payment after the entire policy is disabled", async () => {
    await pool.query("update policies set active=false where id=$1", [policyId]);
    try { await mustBlockWithoutPosting(); }
    finally { await pool.query("update policies set active=true where id=$1", [policyId]); }
  });

  it("refuses an old ALLOW after the current organization auto-pay limit is tightened", async () => {
    await pool.query("update policies set auto_pay_max_amount_cents=800 where id=$1", [policyId]);
    try { await mustBlockWithoutPosting(); }
    finally { await pool.query("update policies set auto_pay_max_amount_cents=1000 where id=$1", [policyId]); }
  });

  it("refuses an old ALLOW after the vendor normal-amount baseline is tightened", async () => {
    await pool.query("update vendors set normal_max_amount_cents=800 where id=$1", [vendorId]);
    try { await mustBlockWithoutPosting(); }
    finally { await pool.query("update vendors set normal_max_amount_cents=1000 where id=$1", [vendorId]); }
  });

  it("rejects a direct ALLOW if its persisted request state is no longer ALLOWED", async () => {
    await pool.query("update payment_requests set status='DENIED' where id=$1", [requestId]);
    try { await mustBlockWithoutPosting(); }
    finally { await pool.query("update payment_requests set status='ALLOWED' where id=$1", [requestId]); }
  });

  it("restored policy still allows evaluation but has never posted to PayPal", async () => {
    expect((await postgresExecutionStore.getAuthoritativePayment(requestId))?.decisionOutcome).toBe("ALLOW");
    expect(outboundPosts).toBe(0);
  });

  it("refuses an earlier ALLOW after a newly imported PAID invoice reveals a duplicate", async () => {
    const csv=Buffer.from([
      "vendor_name,invoice_number,invoice_date,amount_decimal,currency,status,payment_destination",
      "Test vendor,INV-REVALIDATE-01,2026-10-01,9.00,USD,PAID,ap@revalidate.invalid",
    ].join("\\n") + "\\n");
    const importResult=await importApHistory({
      organizationId,actorUserId:adminId,content:csv,
    });
    expect(importResult.accepted).toBe(1);
    await mustBlockWithoutPosting();
  });
});
