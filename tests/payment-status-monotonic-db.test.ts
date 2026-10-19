import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { pool } from "../src/db/pool";
import { PostgresExecutionStore } from "../src/payments/executor/postgres-store";
import type { AuthoritativePayment } from "../src/payments/executor/types";

// Real PostgreSQL regression for delayed executor-worker updates racing with a
// verified PayPal status. No provider client, actual external POST or payout.
const org = "executor_cas_" + randomUUID();
const vendor = "vendor_cas_" + randomUUID();
const store = new PostgresExecutionStore();
const requests:string[] = [];
const when = new Date("2026-10-19T12:00:00Z");

beforeAll(async () => {
  await pool.query("insert into organizations(id,name) values($1,'Executor CAS isolated test')", [org]);
  await pool.query(
    "insert into vendors(id,organization_id,name,normal_max_amount_cents) values($1,$2,'CAS test vendor',100000)",
    [vendor,org],
  );
});
afterAll(async () => {
  // The repository's per-file Vitest worker has an isolated test database.
  await pool.query("delete from payment_executions where payment_request_id=any($1::text[])", [requests]);
  await pool.query("delete from payment_requests where id=any($1::text[])", [requests]);
  await pool.query("delete from vendors where id=$1", [vendor]);
  await pool.query("delete from organizations where id=$1", [org]);
  await pool.end();
});

async function claimed(label:string) {
  const id=randomUUID(), logical=randomUUID();
  requests.push(id);
  const payment:AuthoritativePayment={
    requestId:id,logicalPaymentId:logical,amountCents:101,currency:"USD",
    requestedDestination:"synthetic@example.test",currentTrustedDestination:"synthetic@example.test",
    decisionOutcome:"ALLOW",invoiceNumber:"CAS-"+label,
  };
  await pool.query(
    ["insert into payment_requests(id,logical_payment_id,organization_id,vendor_id,",
      "invoice_number,amount_cents,currency,requested_destination,status,source)",
      "values($1,$2,$3,$4,$5,101,'USD',$6,'ALLOWED','agent_api')"].join(" "),
    [id,logical,org,vendor,payment.invoiceNumber,payment.requestedDestination],
  );
  await store.getOrCreateExecution(payment);
  const row=await store.tryClaim(logical,["READY"]);
  expect(row?.status).toBe("SUBMITTING");
  return logical;
}

describe("PostgreSQL payment status may never be downgraded by a stale worker", () => {
  it("keeps verified PAID and PayPal references after every delayed local callback",async()=>{
    const id=await claimed("PAID");
    await store.markSubmitted(id,"batch-paid",when);
    const confirmed=await store.applyRemoteStatus(
      id,{payoutItemId:"item-paid",payoutBatchId:"batch-paid",transactionStatus:"SUCCESS"},
      "PAID",when,
    );
    expect(confirmed.execution.status).toBe("PAID");
    for(const call of [
      ()=>store.markUnknown(id,when),
      ()=>store.markBlocked(id,"REVOKED_AFTER_CONFIRMATION",when),
      ()=>store.markFailed(id,"LATE_GATEWAY_FAILURE",when),
      ()=>store.markSubmitted(id,"wrong-batch-late",when),
      ()=>store.markManualReconciliation(id,when),
    ]) expect((await call()).status).toBe("PAID");
    const current=await store.getExecution(id);
    expect(current).toMatchObject({
      status:"PAID",paypalPayoutBatchId:"batch-paid",paypalPayoutItemId:"item-paid",
      rawPaypalStatus:"SUCCESS",
    });
  });

  it("never resurrects blocked authorization after a stale submit or status update",async()=>{
    const id=await claimed("BLOCKED");
    expect((await store.markBlocked(id,"ADMIN_REVOKED",when)).status).toBe("PAYMENT_BLOCKED");
    expect((await store.markSubmitted(id,"late-batch",when)).status).toBe("PAYMENT_BLOCKED");
    expect((await store.markUnknown(id,when)).status).toBe("PAYMENT_BLOCKED");
    expect((await store.markFailed(id,"late-definite-failure",when)).status).toBe("PAYMENT_BLOCKED");
    expect((await store.getExecution(id)).paypalPayoutBatchId).toBeNull();
  });

  it("does not downgrade failed payment from an obsolete worker",async()=>{
    const id=await claimed("FAILED");
    expect((await store.markFailed(id,"DECLINED",when)).status).toBe("PAYMENT_FAILED");
    expect((await store.markSubmitted(id,"late-batch",when)).status).toBe("PAYMENT_FAILED");
    expect((await store.markUnknown(id,when)).status).toBe("PAYMENT_FAILED");
    expect((await store.markBlocked(id,"late-authority",when)).status).toBe("PAYMENT_FAILED");
  });

  it("requires an actual unknown outcome before manual reconciliation",async()=>{
    const id=await claimed("MANUAL");
    expect((await store.markManualReconciliation(id,when)).status).toBe("SUBMITTING");
    expect((await store.markUnknown(id,when)).status).toBe("PAYMENT_UNKNOWN");
    expect((await store.markManualReconciliation(id,when)).status)
      .toBe("PAYMENT_UNKNOWN_MANUAL_RECONCILIATION");
    expect((await store.markSubmitted(id,"late-batch",when)).status)
      .toBe("PAYMENT_UNKNOWN_MANUAL_RECONCILIATION");
  });

  it("records a verified late SUCCESS after an unknown payout enters manual review",async()=>{
    const id=await claimed("LATE-SETTLEMENT");
    expect((await store.markSubmitted(id,"batch-late",when)).status).toBe("EXECUTING");
    expect((await store.markUnknown(id,when)).status).toBe("PAYMENT_UNKNOWN");
    expect((await store.markManualReconciliation(id,when)).status)
      .toBe("PAYMENT_UNKNOWN_MANUAL_RECONCILIATION");

    // This state is terminal for RETRIES, not a reason to ignore a later
    // authenticated PayPal status: confirmed money movement wins.
    const verified=await store.applyRemoteStatus(
      id,{payoutItemId:"item-late",payoutBatchId:"batch-late",transactionStatus:"SUCCESS"},
      "PAID",when,
    );
    expect(verified.applied).toBe(true);
    expect(verified.execution).toMatchObject({
      status:"PAID",paypalPayoutBatchId:"batch-late",paypalPayoutItemId:"item-late",
    });
    expect((await store.markUnknown(id,when)).status).toBe("PAID");
  });

  it("preserves valid claiming, submitting, unknown recovery sequence",async()=>{
    const id=await claimed("RECOVER");
    expect((await store.markSubmitted(id,"first-batch",when)).status).toBe("EXECUTING");
    expect((await store.markUnknown(id,when)).status).toBe("PAYMENT_UNKNOWN");
    expect((await store.tryClaim(id,["PAYMENT_UNKNOWN"]))?.status).toBe("SUBMITTING");
    expect((await store.markSubmitted(id,"same-batch",when)).status).toBe("EXECUTING");
  });
});
