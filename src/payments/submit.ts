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
    const pg = error as { code?: string; constraint?: string };
    if (pg.code === "23505" && pg.constraint === "payment_requests_org_idempotency_uq") {
      const replay = await findReplay(input);
      if (replay) return replay;
    }
    throw error;
  }
}
