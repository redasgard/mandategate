import { randomUUID,createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/src/db/db";
import {
  paymentDecisions,
  paymentRequests,
  policies,
  vendorDestinations,
  vendors,
} from "@/src/db/schema";
import { evaluatePayment } from "@/src/policy/decision";
import { assessHistoricalPaymentRisk } from "@/src/history/anomaly";
import {digestAutopayTuple} from "@/src/autonomy/budget";
import {SANDBOX_ORG_ID,SANDBOX_VENDOR_ID,SANDBOX_INVOICE,SANDBOX_AMOUNT_CENTS,SANDBOX_KEY} from "@/src/demo/sandbox-payout-constants";

export type CanonicalPaymentRequest = {
  organizationId: string;
  vendorId: string;
  invoiceNumber: string;
  amountCents: number;
  currency: string;
  paymentDestination: string;
  idempotencyKey: string;
  source: "agent_api" | "demo_fixture" | "sandbox_fixture";
};

async function findReplay(input: CanonicalPaymentRequest) {
  const [row] = await db
    .select({
      requestId: paymentRequests.id,
      vendorId: paymentRequests.vendorId,
      invoiceNumber: paymentRequests.invoiceNumber,
      amountCents: paymentRequests.amountCents,
      currency: paymentRequests.currency,
      requestedDestination: paymentRequests.requestedDestination,
      logicalPaymentId: paymentRequests.logicalPaymentId,
      status: paymentRequests.status,
      outcome: paymentDecisions.outcome,
      reasonCodes: paymentDecisions.reasonCodes,
      evidence: paymentDecisions.evidence,
    })
    .from(paymentRequests)
    .innerJoin(paymentDecisions, eq(paymentRequests.id, paymentDecisions.paymentRequestId))
    .where(and(eq(paymentRequests.organizationId, input.organizationId), eq(paymentRequests.idempotencyKey, input.idempotencyKey)))
    .limit(1);

  if (!row) return null;
  const sameRequest =
    row.vendorId === input.vendorId &&
    row.invoiceNumber === input.invoiceNumber &&
    row.amountCents === input.amountCents &&
    row.currency === input.currency.toUpperCase() &&
    row.requestedDestination === input.paymentDestination;
  if (!sameRequest) throw new Error("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST");
  return {
    requestId: row.requestId,
    logicalPaymentId: row.logicalPaymentId,
    status: row.status,
    decision: { outcome: row.outcome, reasonCodes: row.reasonCodes, evidence: row.evidence },
    paymentExecuted: false,
    replayed: true,
  };
}

export async function submitCanonicalPaymentRequest(input: CanonicalPaymentRequest) {
  if(input.source==="sandbox_fixture" && (
    process.env.MANDATEGATE_RUNTIME_MODE!=="neon-sandbox" ||
    input.organizationId!==SANDBOX_ORG_ID ||
    input.vendorId!==SANDBOX_VENDOR_ID ||
    input.invoiceNumber!==SANDBOX_INVOICE ||
    input.amountCents!==SANDBOX_AMOUNT_CENTS ||
    input.currency!=="USD" ||
    input.idempotencyKey!==SANDBOX_KEY ||
    input.paymentDestination!==process.env.DEMO_PAYPAL_RECEIVER_EMAIL))
    throw new Error("SANDBOX_FIXTURE_REQUEST_INVALID");
  const existing = await findReplay(input);
  if (existing) return existing;

  try {
    return await db.transaction(async (tx) => {
      const [vendor] = await tx.select().from(vendors).where(and(eq(vendors.id, input.vendorId), eq(vendors.organizationId, input.organizationId))).limit(1);
      if (!vendor) throw new Error("VENDOR_NOT_FOUND");

      const [destination] = await tx.select().from(vendorDestinations).where(and(eq(vendorDestinations.vendorId, vendor.id), eq(vendorDestinations.trusted, true))).limit(1);
      if (!destination) throw new Error("TRUSTED_DESTINATION_NOT_FOUND");

      const [policy] = await tx.select().from(policies).where(and(eq(policies.organizationId, input.organizationId), eq(policies.active, true))).limit(1);
      if (!policy) throw new Error("ACTIVE_POLICY_NOT_FOUND");

      const baseDecision = evaluatePayment({
        amountCents: input.amountCents,
        currency: input.currency,
        requestedDestination: input.paymentDestination,
        trustedDestination: destination.destination,
        vendorNormalMaxAmountCents: vendor.normalMaxAmountCents,
        policyAutoPayMaxAmountCents: policy.autoPayMaxAmountCents,
      });
      // Imported AP history can only raise risk, never grant a destination,
      // increase a policy threshold or change a DENY into an ALLOW.
      let history: Awaited<ReturnType<typeof assessHistoricalPaymentRisk>>;
      if(input.source==="sandbox_fixture") {
        // The dedicated 101-cent payout is synthetic, explicitly authorized
        // through its fixed identity. There is deliberately no imported
        // historical AP record for this one-time fictional test recipient.
        // Never exempt ordinary agent_api or verified_invoice requests.
        history={reasonCodes:[],evidence:[]};
      } else {
        try {
          history = await assessHistoricalPaymentRisk({
            organizationId:input.organizationId,
            vendorId:input.vendorId,
            invoiceNumber:input.invoiceNumber,
            amountCents:input.amountCents,
            currency:input.currency,
          });
        } catch {
          history = {
            reasonCodes:["AP_HISTORY_UNAVAILABLE"],
            evidence:[{code:"AP_HISTORY_UNAVAILABLE",source:"ap_history.provenance",
              observed:"unavailable"}],
          };
        }
      }
      const historyReasons=history.reasonCodes;
      const decision = historyReasons.length===0 ? baseDecision : {
        outcome: baseDecision.outcome==="DENY" ? "DENY" as const : "ESCALATE" as const,
        reasonCodes: [...new Set([
          ...baseDecision.reasonCodes.filter(x=>x!=="WITHIN_TRUSTED_BASELINE"),
          ...historyReasons,
        ])],
        evidence: [...baseDecision.evidence,...history.evidence],
      };

      const requestId = randomUUID();
      const logicalPaymentId = randomUUID();
      const status = decision.outcome === "ALLOW" ? "ALLOWED" : decision.outcome === "ESCALATE" ? "ESCALATED" : "DENIED";

      await tx.insert(paymentRequests).values({
        id: requestId,
        logicalPaymentId,
        organizationId: input.organizationId,
        vendorId: input.vendorId,
        idempotencyKey: input.idempotencyKey,
        invoiceNumber: input.invoiceNumber,
        amountCents: input.amountCents,
        currency: input.currency.toUpperCase(),
        requestedDestination: input.paymentDestination,
        status,
        source: input.source,
      });
      await tx.insert(paymentDecisions).values({ id: randomUUID(), paymentRequestId: requestId, outcome: decision.outcome, reasonCodes: decision.reasonCodes, evidence: decision.evidence });
      // Bind the original request tuple to a previously ACTIVE human grant.
      // If absent, ALLOW is manual-only. This is the SAME request transaction.
      if(input.source==="agent_api"&&decision.outcome==="ALLOW"){
        const grant=await tx.execute(sql`
          select g.id as mandate_id,g.approval_digest,ge.id as grant_event_id,
                 g.destination_id,g.policy_id
          from payment_requests pr
          join autopay_mandates g on g.organization_id=pr.organization_id
            and g.vendor_id=pr.vendor_id and g.source='agent_api'
            and g.destination_id=${destination.id} and g.policy_id=${policy.id}
          join autopay_mandate_events ge on ge.mandate_id=g.id
            and ge.organization_id=g.organization_id
            and ge.event_type='GRANTED' and ge.mandate_digest=g.approval_digest
            and ge.actor_user_id=g.approved_by_user_id
          join organization_admin_memberships m on m.organization_id=g.organization_id
            and m.user_id=g.approved_by_user_id and m.role='ADMIN' and m.active=true
          where pr.id=${requestId} and pr.status='ALLOWED'
            and pr.source='agent_api' and pr.currency='USD'
            and pr.amount_cents<=g.max_amount_cents
            and g.max_total_amount_cents>=pr.amount_cents
            and g.max_payment_count>0
            and g.active=true and g.revoked_at is null and g.expires_at>now()
            and ge.created_at<pr.created_at
            and ${destination.trusted}=true
            and ${policy.active}=true
            and (select count(*) from policies p
                 where p.organization_id=pr.organization_id and p.active=true)=1
            and (select count(*) from vendor_destinations d
                 where d.vendor_id=pr.vendor_id and d.trusted=true)=1
            and not exists(select 1 from vendor_reverification_cases c
                 left join vendor_reverification_resolutions r on r.case_id=c.id
                 where c.organization_id=pr.organization_id and c.vendor_id=pr.vendor_id
                 and (r.id is null or r.resolution='SIMULATED_REVERIFIED'))
          limit 1
          for share of g
        `);
        const row=grant.rows[0] as undefined|{
          mandate_id:string;approval_digest:string;grant_event_id:string;
          destination_id:string;policy_id:string;
        };
        if(row){
          const tupleHash=digestAutopayTuple({
            requestId,logicalPaymentId,organizationId:input.organizationId,
            vendorId:input.vendorId,invoiceNumber:input.invoiceNumber,
            amountCents:input.amountCents,currency:input.currency.toUpperCase(),
            requestedDestination:input.paymentDestination,
            idempotencyKey:input.idempotencyKey,
            mandateId:row.mandate_id,grantDigest:row.approval_digest,
            destinationId:row.destination_id,policyId:row.policy_id,
          });
          await tx.execute(sql`
            insert into autopay_payment_bindings
              (payment_request_id,organization_id,mandate_id,grant_event_id,
               vendor_id,invoice_number,destination_id,policy_id,amount_cents,currency,
               request_tuple_sha256,grant_digest)
            values
              (${requestId},${input.organizationId},${row.mandate_id},
               ${row.grant_event_id},${input.vendorId},${input.invoiceNumber},${row.destination_id},
               ${row.policy_id},${input.amountCents},
               ${input.currency.toUpperCase()},${tupleHash},${row.approval_digest})
          `);
        }
      }

      if(decision.reasonCodes.includes("DESTINATION_MISMATCH")){
        // Destination mismatch is never a general approvable anomaly.
        // Create a separate vendor re-verification case in the SAME
        // database transaction as the immutable DENY decision.
        const observedSha=createHash("sha256").update(input.paymentDestination).digest("hex");
        await tx.execute(sql`
          insert into vendor_reverification_cases
            (organization_id,vendor_id,payment_request_id,observed_destination_sha256)
          values(${input.organizationId},${input.vendorId},${requestId},${observedSha})
        `);
      }

      return { requestId, logicalPaymentId, status, decision, paymentExecuted: false, replayed: false };
    });
  } catch (error) {
    // Drizzle's query wrapper carries PostgreSQL's SQLSTATE and constraint
    // on cause. Preserve the intended deterministic 409 boundary.
    const wrapped=error as {code?:string;constraint?:string;cause?:{
      code?:string;constraint?:string;
    }};
    const pg=wrapped.cause?.code ? wrapped.cause : wrapped;
    if (pg.code === "23505" && pg.constraint === "autopay_binding_vendor_invoice_uq") {
      throw new Error("AUTOPAY_INVOICE_DUPLICATE");
    }
    if (pg.code === "23505" && pg.constraint === "payment_requests_org_idempotency_uq") {
      const replay = await findReplay(input);
      if (replay) return replay;
    }
    throw error;
  }
}
