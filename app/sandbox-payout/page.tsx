import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/src/auth/auth";
import { OperationsHeader } from "@/app/components/operations-header";
import { pool } from "@/src/db/pool";
import { DEMO_ORG_ID } from "@/src/demo/scenarios";
import {
  readSandboxPayout, sandboxPayoutEnabled,
  SandboxPayoutError,
} from "@/src/demo/sandbox-payout";
import { PrepareSandboxPayoutButton } from "./prepare-button";

export const dynamic = "force-dynamic";

export default async function SandboxPayoutPage() {
  const session = await auth.api.getSession({headers:await headers()});
  if (!session) redirect("/sign-in");
  const membership = await pool.query(
    "select 1 from organization_admin_memberships where user_id=$1 and organization_id=$2 and role='ADMIN' and active=true limit 1",
    [session.user.id, DEMO_ORG_ID],
  );
  if (membership.rows.length !== 1) notFound();
  const enabled = sandboxPayoutEnabled();
  const invoiceMode=process.env.MANDATEGATE_SANDBOX_VERIFIED_INVOICE_DEMO==="1";
  let request: Awaited<ReturnType<typeof readSandboxPayout>> = null;
  if (enabled && !invoiceMode) {
    try {request = await readSandboxPayout(session.user.id);}
    catch(error) {
      if (error instanceof SandboxPayoutError) throw error;
      throw error;
    }
  }
  const configuredReceiver = enabled ? process.env.DEMO_PAYPAL_RECEIVER_EMAIL : null;
  return <main className="shell mg-shell">
    <OperationsHeader active="none" title={invoiceMode?"PayPal invoice execution":"PayPal Sandbox payout"}
      context="SANDBOX PAYOUT"
      description="Each payout requires independent payment authority. PayPal Sandbox uses test balances only, never production funds."
      email={session.user.email}/>
    <section className="panel detail">
      {invoiceMode ? <section className="review-stage">
        <h2>Invoice to PayPal execution</h2>
        <p>Begin with the original PDF, source evidence and an exact administrator
          approval. Preparing a payment request does not submit a payout.
          Execute is a separate PayPal Sandbox action after approval.</p>
        <p><Link href="/invoice-artifacts">Start invoice processing →</Link></p>
        <p className="muted">Payment execution is confirmed only after PayPal returns batch and item
          identifiers and webhook reconciliation validates the final state.</p>
        {!enabled ? <p role="alert">Sandbox execution credentials and the test
          recipient are not configured on this deployment.</p>:null}
      </section> : enabled ? <>
        <dl>
          <div><dt>Payment environment</dt><dd>PayPal Sandbox only</dd></div>
          <div><dt>Exact amount</dt><dd>USD 1.01</dd></div>
          <div><dt>Sandbox recipient</dt><dd>{configuredReceiver}</dd></div>
          <div><dt>Preparation</dt><dd>Admin-only, stable idempotency key</dd></div>
          <div><dt>Execution</dt><dd>Separate explicit admin action</dd></div>
        </dl>
        {request ? <section className="review-stage">
          <h2>Prepared payment</h2>
          <p><strong>Decision:</strong> {request.decision} / {request.requestStatus}</p>
          <p><strong>PayPal execution:</strong> {request.executionStatus ?? "Not executed"}</p>
          <p className="mono">Request {request.requestId}</p>
          {request.payoutBatchId?<p className="mono">Sandbox batch {request.payoutBatchId}</p>:null}
          {request.payoutItemId?<p className="mono">Sandbox item {request.payoutItemId}</p>:null}
          <p><Link href={"/payments/"+encodeURIComponent(request.requestId)}>
            Open payment detail and explicit Sandbox execute action →
          </Link></p>
        </section> : <section className="review-stage">
          <h2>Step 1: Prepare, without spending</h2>
          <p>Server selects the configured sandbox receiver and exactly 101 cents.
            No uploaded document, model suggestion or browser field can alter them.</p>
          <PrepareSandboxPayoutButton/>
          <p className="muted">Step 2 appears on the payment-detail page. Preparing never calls PayPal.</p>
        </section>}
      </> : <p role="alert">
        Sandbox payment execution is not configured on this deployment.
        The server refuses to prepare or submit payouts until the exact
        Neon Sandbox runtime, PayPal Sandbox credentials and recipient are configured.
      </p>}
    </section>
  </main>;
}