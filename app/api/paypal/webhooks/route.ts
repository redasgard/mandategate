import { after } from "next/server";
import { getPayPalClient } from "@/src/payments/paypal/runtime";
import { processVerifiedPayoutWebhook } from "@/src/payments/paypal/webhook-processor";
import { persistVerifiedWebhookReceipt } from "@/src/payments/paypal/webhook-receipts";

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

function isPayoutEvent(eventType: string) {
  return eventType.startsWith("PAYMENT.PAYOUTS-ITEM.") || eventType.startsWith("PAYMENT.PAYOUTSBATCH.");
}

export async function POST(request: Request) {
  const event = await request.json().catch(() => null);
  if (!event || typeof event?.id !== "string" || typeof event?.event_type !== "string") {
    return Response.json({ error: "INVALID_WEBHOOK" }, { status: 400 });
  }

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
  if (!(await paypal.verifyWebhook(headers, event))) {
    return Response.json({ error: "INVALID_WEBHOOK_SIGNATURE" }, { status: 401 });
  }

  if (isPayoutEvent(event.event_type)) {
    const persisted = await persistVerifiedWebhookReceipt(
      event.id,
      event.event_type,
      refs(event),
    );

    if (persisted.receipt.status !== "PROCESSED") {
      after(async () => {
        await processVerifiedPayoutWebhook(event.id);
      });
    }
  }

  return Response.json({ received: true });
}
