import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/src/db/db";
import {
  paymentDecisions,
  paymentRequests,
  policies,
  vendorDestinations,
  vendors,
} from "@/src/db/schema";
import { evaluatePayment } from "@/src/policy/decision";

export type CanonicalPaymentRequest = {
  organizationId: string;
  vendorId: string;
  invoiceNumber: string;
  amountCents: number;
  currency: string;
  paymentDestination: string;
  source: "agent_api" | "demo_fixture";
};

export async function submitCanonicalPaymentRequest(input: CanonicalPaymentRequest) {
  return db.transaction(async (tx) => {
    const [vendor] = await tx
      .select()
      .from(vendors)
      .where(
        and(
          eq(vendors.id, input.vendorId),
          eq(vendors.organizationId, input.organizationId),
        ),
      )
      .limit(1);

    if (!vendor) throw new Error("VENDOR_NOT_FOUND");

    const [destination] = await tx
      .select()
      .from(vendorDestinations)
      .where(
        and(
          eq(vendorDestinations.vendorId, vendor.id),
          eq(vendorDestinations.trusted, true),
        ),
      )
      .limit(1);

    if (!destination) throw new Error("TRUSTED_DESTINATION_NOT_FOUND");

    const [policy] = await tx
      .select()
      .from(policies)
      .where(
        and(eq(policies.organizationId, input.organizationId), eq(policies.active, true)),
      )
      .limit(1);

    if (!policy) throw new Error("ACTIVE_POLICY_NOT_FOUND");

    const decision = evaluatePayment({
      amountCents: input.amountCents,
      currency: input.currency,
      requestedDestination: input.paymentDestination,
      trustedDestination: destination.destination,
      vendorNormalMaxAmountCents: vendor.normalMaxAmountCents,
      policyAutoPayMaxAmountCents: policy.autoPayMaxAmountCents,
    });

    const requestId = randomUUID();
    const logicalPaymentId = randomUUID();
    const status =
      decision.outcome === "ALLOW"
        ? "ALLOWED"
        : decision.outcome === "ESCALATE"
          ? "ESCALATED"
          : "DENIED";

    await tx.insert(paymentRequests).values({
      id: requestId,
      logicalPaymentId,
      organizationId: input.organizationId,
      vendorId: input.vendorId,
      invoiceNumber: input.invoiceNumber,
      amountCents: input.amountCents,
      currency: input.currency.toUpperCase(),
      requestedDestination: input.paymentDestination,
      status,
      source: input.source,
    });

    await tx.insert(paymentDecisions).values({
      id: randomUUID(),
      paymentRequestId: requestId,
      outcome: decision.outcome,
      reasonCodes: decision.reasonCodes,
      evidence: decision.evidence,
    });

    return {
      requestId,
      logicalPaymentId,
      status,
      decision,
      paymentExecuted: false,
    };
  });
}
