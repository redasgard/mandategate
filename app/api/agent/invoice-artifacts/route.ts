import { authenticateAgent } from "@/src/auth/machine";
import {
  ArtifactAdmissionError,
  readBoundedInvoiceBody,
} from "@/src/artifacts/admission";
import { storeUntrustedInvoiceArtifact } from "@/src/artifacts/postgres-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const principal = await authenticateAgent(
    request.headers.get("authorization"),
    "invoice:submit",
  );
  if (!principal) {
    return Response.json({ error: "UNAUTHORIZED_AGENT" }, { status: 401 });
  }

  try {
    // Intentionally accepts raw PDF/JPEG/PNG streams, not buffered multipart.
    const body = await readBoundedInvoiceBody(
      request.body,
      request.headers.get("content-length"),
    );
    const artifact = await storeUntrustedInvoiceArtifact({
      organizationId: principal.organizationId,
      contentType: request.headers.get("content-type") ?? "",
      content: body,
    });
    return Response.json({ artifact }, { status: artifact.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof ArtifactAdmissionError) {
      return Response.json({ error: error.code }, { status: error.httpStatus });
    }
    throw error;
  }
}
