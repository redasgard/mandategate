import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticateAgent } from "@/src/auth/machine";
import { submitCanonicalPaymentRequest } from "@/src/payments/submit";

const requestSchema = z.object({
  vendorId: z.string().min(1).max(120),
  invoiceNumber: z.string().min(1).max(120),
  amountCents: z.number().int().positive().max(2_000_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  paymentDestination: z.string().min(3).max(320),
}).strict();

const idempotencySchema = z.string().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/);

export async function POST(request: NextRequest) {
  const principal = await authenticateAgent(request.headers.get("authorization"), "payment:submit");
  if (!principal) return Response.json({ error: "UNAUTHORIZED_AGENT" }, { status: 401 });

  const idempotency = idempotencySchema.safeParse(request.headers.get("idempotency-key"));
  if (!idempotency.success) {
    return Response.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, { status: 400 });

  try {
    const result = await submitCanonicalPaymentRequest({
      organizationId: principal.organizationId,
      idempotencyKey: idempotency.data,
      ...parsed.data,
      source: "agent_api",
    });
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    if (["IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST","AUTOPAY_INVOICE_DUPLICATE"].includes(message)) return Response.json({ error: message }, { status: 409 });
    if (["VENDOR_NOT_FOUND", "TRUSTED_DESTINATION_NOT_FOUND", "ACTIVE_POLICY_NOT_FOUND"].includes(message)) {
      return Response.json({ error: message }, { status: 422 });
    }
    throw error;
  }
}
