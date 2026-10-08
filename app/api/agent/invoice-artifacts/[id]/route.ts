import { authenticateAgent } from "@/src/auth/machine";
import { findInvoiceArtifactMetadata } from "@/src/artifacts/postgres-store";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const principal = await authenticateAgent(
    request.headers.get("authorization"),
    "invoice:read",
  );
  if (!principal) {
    return Response.json({ error: "UNAUTHORIZED_AGENT" }, { status: 401 });
  }

  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) {
    return Response.json({ error: "INVALID_ARTIFACT_ID" }, { status: 400 });
  }
  const artifact = await findInvoiceArtifactMetadata(principal.organizationId, id);
  if (!artifact) {
    return Response.json({ error: "ARTIFACT_NOT_FOUND" }, { status: 404 });
  }
  return Response.json({ artifact });
}
