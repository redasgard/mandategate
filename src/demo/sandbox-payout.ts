import { pool } from "@/src/db/pool";
import { submitCanonicalPaymentRequest } from "@/src/payments/submit";
import { DEMO_ORG_ID } from "./scenarios";

import {
  SANDBOX_ORG_ID, SANDBOX_VENDOR_ID, SANDBOX_DEST_ID, SANDBOX_POLICY_ID,
  SANDBOX_INVOICE, SANDBOX_AMOUNT_CENTS, SANDBOX_KEY,
} from "./sandbox-payout-constants";
export { SANDBOX_ORG_ID, SANDBOX_VENDOR_ID, SANDBOX_DEST_ID,
  SANDBOX_POLICY_ID, SANDBOX_INVOICE, SANDBOX_AMOUNT_CENTS, SANDBOX_KEY } from "./sandbox-payout-constants";

export class SandboxPayoutError extends Error {
  constructor(public readonly code: string, public readonly httpStatus = 409) {
    super(code);
    this.name = "SandboxPayoutError";
  }
}

export function sandboxPayoutEnabled(env: Record<string, string | undefined> = process.env) {
  return env.MANDATEGATE_RUNTIME_MODE === "neon-sandbox" &&
    env.MANDATEGATE_DISABLE_PAYMENTS === "0" &&
    env.PAYPAL_BASE_URL === "https://api-m.sandbox.paypal.com" &&
    typeof env.PAYPAL_CLIENT_ID === "string" && env.PAYPAL_CLIENT_ID.length >= 8 &&
    typeof env.PAYPAL_CLIENT_SECRET === "string" && env.PAYPAL_CLIENT_SECRET.length >= 8 &&
    typeof env.DEMO_PAYPAL_RECEIVER_EMAIL === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.DEMO_PAYPAL_RECEIVER_EMAIL);
}

async function requireOwner(userId: string) {
  const rows = await pool.query(
    "select 1 from organization_admin_memberships where user_id=$1 and organization_id=$2 and role='ADMIN' and active=true limit 1",
    [userId, DEMO_ORG_ID],
  );
  if (rows.rows.length !== 1) throw new SandboxPayoutError("SANDBOX_OWNER_NOT_AUTHORIZED", 404);
}

export async function readSandboxPayout(userId: string) {
  if (!sandboxPayoutEnabled()) throw new SandboxPayoutError("SANDBOX_PAYOUT_NOT_CONFIGURED", 503);
  await requireOwner(userId);
  const result = await pool.query([
    "select pr.id,pr.invoice_number,pr.amount_cents,pr.currency,pr.status,pr.source,",
    "pd.outcome,pd.reason_codes,pe.status as execution_status,",
    "pe.paypal_payout_batch_id,pe.paypal_payout_item_id",
    "from payment_requests pr",
    "join payment_decisions pd on pd.payment_request_id=pr.id",
    "left join payment_executions pe on pe.payment_request_id=pr.id",
    "where pr.organization_id=$1 and pr.idempotency_key=$2",
    "limit 2",
  ].join(" "), [SANDBOX_ORG_ID, SANDBOX_KEY]);
  if (result.rows.length > 1) throw new SandboxPayoutError("SANDBOX_DUPLICATE_REQUESTS", 503);
  const row = result.rows[0];
  if (!row) return null;
  if (row.invoice_number !== SANDBOX_INVOICE ||
      Number(row.amount_cents) !== SANDBOX_AMOUNT_CENTS ||
      row.currency !== "USD" || row.source !== "sandbox_fixture" ||
      row.outcome !== "ALLOW") throw new SandboxPayoutError("SANDBOX_REQUEST_CHANGED", 503);
  return {
    requestId: String(row.id),
    invoiceNumber: SANDBOX_INVOICE,
    amountCents: SANDBOX_AMOUNT_CENTS,
    currency: "USD",
    decision: row.outcome as "ALLOW",
    reasonCodes: row.reason_codes as string[],
    requestStatus: String(row.status),
    executionStatus: row.execution_status === null ? null : String(row.execution_status),
    payoutBatchId: row.paypal_payout_batch_id === null ? null : String(row.paypal_payout_batch_id),
    payoutItemId: row.paypal_payout_item_id === null ? null : String(row.paypal_payout_item_id),
  };
}

/**
 * One explicit admin action prepares a single canonical, non-AI $1.01
 * request. It never invokes PayPal. The later payment-detail action executes.
 * The separate org preserves the judge demo's zero-execution invariant.
 */
export async function prepareSandboxPayout(userId: string) {
  if (!sandboxPayoutEnabled()) throw new SandboxPayoutError("SANDBOX_PAYOUT_NOT_CONFIGURED", 503);
  await requireOwner(userId);
  const receiver = process.env.DEMO_PAYPAL_RECEIVER_EMAIL!;
  const client = await pool.connect();
  try {
    await client.query("begin");
    // Only one bootstrap may write this precise synthetic sandbox fixture.
    await client.query("select pg_advisory_xact_lock(hashtext($1))", ["mandategate/sandbox-payout/bootstrap/v1"]);
    const member = await client.query(
      "select 1 from organization_admin_memberships where user_id=$1 and organization_id=$2 and role='ADMIN' and active=true for share",
      [userId, DEMO_ORG_ID],
    );
    if (member.rows.length !== 1) throw new SandboxPayoutError("SANDBOX_OWNER_NOT_AUTHORIZED", 404);
    await client.query("insert into organizations(id,name) values($1,'MandateGate PayPal Sandbox Lab') on conflict(id) do nothing", [SANDBOX_ORG_ID]);
    await client.query(
      "insert into vendors(id,organization_id,name,normal_max_amount_cents) values($1,$2,'Sandbox Test Recipient',101) on conflict(id) do nothing",
      [SANDBOX_VENDOR_ID, SANDBOX_ORG_ID],
    );
    await client.query(
      "insert into vendor_destinations(id,vendor_id,destination,trusted) values($1,$2,$3,true) on conflict(id) do nothing",
      [SANDBOX_DEST_ID, SANDBOX_VENDOR_ID, receiver],
    );
    await client.query(
      "insert into policies(id,organization_id,name,auto_pay_max_amount_cents,active) values($1,$2,'Single 101-cent Sandbox test',101,true) on conflict(id) do nothing",
      [SANDBOX_POLICY_ID, SANDBOX_ORG_ID],
    );
    // Do not overwrite an existing role/revocation during repeated requests.
    await client.query(
      "insert into organization_admin_memberships(user_id,organization_id,role,active) values($1,$2,'ADMIN',true) on conflict(user_id,organization_id) do nothing",
      [userId, SANDBOX_ORG_ID],
    );
    const state = await client.query([
      "select v.name,v.normal_max_amount_cents,d.destination,d.trusted,",
      "p.auto_pay_max_amount_cents,p.active as policy_active,",
      "m.role,m.active as member_active",
      "from vendors v join vendor_destinations d on d.vendor_id=v.id and d.id=$3",
      "join policies p on p.organization_id=v.organization_id and p.id=$4",
      "join organization_admin_memberships m on m.organization_id=v.organization_id and m.user_id=$5",
      "where v.id=$1 and v.organization_id=$2",
    ].join(" "), [SANDBOX_VENDOR_ID,SANDBOX_ORG_ID,SANDBOX_DEST_ID,SANDBOX_POLICY_ID,userId]);
    const row = state.rows.length === 1 ? state.rows[0] : null;
    if (!row || row.name !== "Sandbox Test Recipient" ||
        Number(row.normal_max_amount_cents) !== 101 ||
        row.destination !== receiver || row.trusted !== true ||
        Number(row.auto_pay_max_amount_cents) !== 101 ||
        row.policy_active !== true || row.role !== "ADMIN" || row.member_active !== true)
      throw new SandboxPayoutError("SANDBOX_FIXTURE_MISMATCH", 409);
    await client.query("commit");
  } catch(error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally { client.release(); }

  const submission = await submitCanonicalPaymentRequest({
    organizationId: SANDBOX_ORG_ID,
    vendorId: SANDBOX_VENDOR_ID,
    invoiceNumber: SANDBOX_INVOICE,
    amountCents: SANDBOX_AMOUNT_CENTS,
    currency: "USD",
    paymentDestination: receiver,
    idempotencyKey: SANDBOX_KEY,
    source: "sandbox_fixture",
  });
  if (submission.decision.outcome !== "ALLOW" || submission.paymentExecuted !== false)
    throw new SandboxPayoutError("SANDBOX_REQUEST_NOT_ALLOWED", 409);
  return { requestId: submission.requestId, replayed: submission.replayed,
    outcome: submission.decision.outcome, amountCents: 101,
    paymentExecuted: false as const };
}
