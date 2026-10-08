import { NextRequest } from "next/server";
import { auth } from "@/src/auth/auth";
import { isTrustedMutationOrigin } from "@/src/auth/same-origin";
import { executeAuthorizedPayment, ExecutionRejectedError } from "@/src/payments/executor/service";
import { postgresExecutionStore } from "@/src/payments/executor/postgres-store";
import { getPayPalClient } from "@/src/payments/paypal/runtime";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationOrigin(request)) return Response.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  try {
    const execution = await executeAuthorizedPayment(id, { store: postgresExecutionStore, gateway: getPayPalClient() });
    return Response.json({ execution });
  } catch (error) {
    if (error instanceof ExecutionRejectedError) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
