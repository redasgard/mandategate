import { authenticateAgent } from "@/src/auth/machine";
import { getInvoiceImageObservation } from "@/src/invoices/image-analysis";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const principal = await authenticateAgent(
    request.headers.get("authorization"),
    "payment:read",
  );
  if (!principal) return Response.json({ error: "UNAUTHORIZED_AGENT" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: "INVALID_ARTIFACT_ID" }, { status: 400 });
  }
  const observation = await getInvoiceImageObservation(principal.organizationId, id);
  if (!observation) return Response.json({ error: "OBSERVATION_NOT_FOUND" }, { status: 404 });
  return Response.json({ observation, paymentAuthorized: false }, {
    headers: { "Cache-Control": "no-store" },
  });
}
