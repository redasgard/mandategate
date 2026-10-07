import { after } from "next/server";
import { getPayPalClient } from "@/src/payments/paypal/runtime";
import { postgresExecutionStore } from "@/src/payments/executor/postgres-store";
import { reconcileExecution } from "@/src/payments/executor/service";

function requiredHeader(request: Request, name: string) {
  const value = request.headers.get(name);
  if (!value) throw new Error(`MISSING_${name.toUpperCase().replaceAll("-", "_")}`);
  return value;
}

function refs(event: any) {
  return {
    payoutItemId: typeof event?.resource?.payout_item_id === "string" ? event.resource.payout_item_id : undefined,
    payoutBatchId: typeof event?.resource?.payout_batch_id === "string" ? event.resource.payout_batch_id : undefined,
  };
}

export async function POST(request: Request) {
  const event = await request.json().catch(() => null);
  if (!event || typeof event?.event_type !== "string") return Response.json({ error: "INVALID_WEBHOOK" }, { status: 400 });

  let headers;
  try {
    headers = {
      authAlgo: requiredHeader(request, "paypal-auth-algo"),
      certUrl: requiredHeader(request, "paypal-cert-url"),
      transmissionId: requiredHeader(request, "paypal-transmission-id"),
      transmissionSig: requiredHeader(request, "paypal-transmission-sig"),
      transmissionTime: requiredHeader(request, "paypal-transmission-time"),
    };
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "MISSING_HEADERS" }, { status: 400 });
  }

  const paypal = getPayPalClient();
  if (!(await paypal.verifyWebhook(headers, event))) return Response.json({ error: "INVALID_WEBHOOK_SIGNATURE" }, { status: 401 });

  if (event.event_type.startsWith("PAYMENT.PAYOUTS-ITEM.") || event.event_type.startsWith("PAYMENT.PAYOUTSBATCH.")) {
    const paypalRefs = refs(event);
    after(async () => {
      const logicalPaymentId = await postgresExecutionStore.findLogicalPaymentIdByPayPalRef(paypalRefs);
      if (!logicalPaymentId) return;
      await postgresExecutionStore.appendEvent(logicalPaymentId, "PAYPAL_WEBHOOK_VERIFIED", { eventId: event.id, eventType: event.event_type });
      try {
        await reconcileExecution(logicalPaymentId, { store: postgresExecutionStore, gateway: paypal });
      } catch (error) {
        await postgresExecutionStore.appendEvent(logicalPaymentId, "PAYPAL_WEBHOOK_RECONCILE_FAILED", { errorClass: error instanceof Error ? error.name : "UnknownError" });
      }
    });
  }

  return Response.json({ received: true });
}
