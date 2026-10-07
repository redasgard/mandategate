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

export async function POST(request: NextRequest) {
  const principal = await authenticateAgent(request.headers.get("authorization"), "invoice:submit");
  if (!principal) {
    return Response.json({ error: "UNAUTHORIZED_AGENT" }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "INVALID_REQUEST", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await submitCanonicalPaymentRequest({
      organizationId: principal.organizationId,
      ...parsed.data,
      source: "agent_api",
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    if (["VENDOR_NOT_FOUND", "TRUSTED_DESTINATION_NOT_FOUND", "ACTIVE_POLICY_NOT_FOUND"].includes(message)) {
      return Response.json({ error: message }, { status: 422 });
    }
    throw error;
  }
}
