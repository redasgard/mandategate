import { loadLocalEnv } from "../src/env/load";

loadLocalEnv();

const receiver = process.env.DEMO_PAYPAL_RECEIVER_EMAIL;
if (!receiver) {
  throw new Error("DEMO_PAYPAL_RECEIVER_EMAIL is required for the live Slice 2 Sandbox proof");
}
if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
  throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required for the live Slice 2 Sandbox proof");
}

const requireWebhookProof = process.env.REQUIRE_PAYPAL_WEBHOOK_PROOF === "1";

const [
  { submitCanonicalPaymentRequest },
  { executeAuthorizedPayment },
  { postgresExecutionStore },
  { getPayPalClient },
  { pool },
] = await Promise.all([
  import("../src/payments/submit"),
  import("../src/payments/executor/service"),
  import("../src/payments/executor/postgres-store"),
  import("../src/payments/paypal/runtime"),
  import("../src/db/pool"),
]);

const request = await submitCanonicalPaymentRequest({
  organizationId: "org_demo",
  vendorId: "vendor_northstar",
  invoiceNumber: "SLICE2-SANDBOX-PROOF",
  amountCents: 101,
  currency: "USD",
  paymentDestination: receiver,
  idempotencyKey: "slice2-sandbox-proof-v1",
  source: "demo_fixture",
});

if (request.decision.outcome !== "ALLOW") {
  throw new Error(`sandbox proof request was not ALLOW: ${request.decision.outcome}`);
}

let execution = await executeAuthorizedPayment(request.requestId, {
  store: postgresExecutionStore,
  gateway: getPayPalClient(),
});

for (let attempt = 0; attempt < 10 && !execution.paypalPayoutItemId; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  execution = await executeAuthorizedPayment(request.requestId, {
    store: postgresExecutionStore,
    gateway: getPayPalClient(),
  });
}

if (!execution.paypalPayoutBatchId) {
  throw new Error(`PayPal did not return a payout batch ID; state=${execution.status}`);
}
if (!execution.paypalPayoutItemId) {
  throw new Error(`PayPal payout item did not become reconcilable; state=${execution.status}`);
}

const executionCount = await pool.query(
  "select count(*)::int as n from payment_executions where logical_payment_id = $1",
  [request.logicalPaymentId],
);
if (executionCount.rows[0]?.n !== 1) {
  throw new Error(`expected exactly one execution row, got ${executionCount.rows[0]?.n}`);
}

const submitCount = await pool.query(
  "select count(*)::int as n from payment_execution_events where logical_payment_id = $1 and event_type = 'PAYPAL_SUBMITTED'",
  [request.logicalPaymentId],
);
if (submitCount.rows[0]?.n !== 1) {
  throw new Error(`expected exactly one PAYPAL_SUBMITTED event, got ${submitCount.rows[0]?.n}`);
}

const webhookVerifiedCount = await pool.query(
  "select count(*)::int as n from payment_execution_events where logical_payment_id = $1 and event_type = 'PAYPAL_WEBHOOK_VERIFIED'",
  [request.logicalPaymentId],
);
const webhookReconcileFailureCount = await pool.query(
  "select count(*)::int as n from payment_execution_events where logical_payment_id = $1 and event_type = 'PAYPAL_WEBHOOK_RECONCILE_FAILED'",
  [request.logicalPaymentId],
);
const reconciledCount = await pool.query(
  "select count(*)::int as n from payment_execution_events where logical_payment_id = $1 and event_type = 'PAYPAL_RECONCILED'",
  [request.logicalPaymentId],
);

if (requireWebhookProof) {
  if ((webhookVerifiedCount.rows[0]?.n ?? 0) < 1) {
    throw new Error("expected at least one PAYPAL_WEBHOOK_VERIFIED event");
  }
  if ((reconciledCount.rows[0]?.n ?? 0) < 1) {
    throw new Error("expected at least one PAYPAL_RECONCILED event");
  }
  if ((webhookReconcileFailureCount.rows[0]?.n ?? 0) !== 0) {
    throw new Error(`expected zero PAYPAL_WEBHOOK_RECONCILE_FAILED events, got ${webhookReconcileFailureCount.rows[0]?.n}`);
  }
}

console.log(JSON.stringify({
  requestId: request.requestId,
  logicalPaymentId: request.logicalPaymentId,
  executionStatus: execution.status,
  paypalPayoutBatchId: execution.paypalPayoutBatchId,
  paypalPayoutItemId: execution.paypalPayoutItemId,
  rawPaypalStatus: execution.rawPaypalStatus,
  executionRows: executionCount.rows[0].n,
  submittedEvents: submitCount.rows[0].n,
  webhookVerifiedEvents: webhookVerifiedCount.rows[0].n,
  reconciledEvents: reconciledCount.rows[0].n,
  webhookReconcileFailures: webhookReconcileFailureCount.rows[0].n,
}, null, 2));

await pool.end();
