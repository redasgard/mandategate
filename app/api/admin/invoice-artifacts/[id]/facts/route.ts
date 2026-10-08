import { auth } from "@/src/auth/auth";
import { isTrustedMutationOrigin } from "@/src/auth/same-origin";
import { loadInvoiceArtifactForHumanReview } from "@/src/artifacts/postgres-store";
import { ManualInvoiceReviewError, recordExplicitHumanInvoiceFacts } from "@/src/authority/manual-invoice-review";

export const runtime = "nodejs";
const MAX_REVIEW_BODY = 16 * 1024;

// Admin-only source transcription. There is deliberately no machine-principal
// access and no payment execution path from this endpoint.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationOrigin(request)) return Response.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return Response.json({ error: "UNSUPPORTED_REVIEW_CONTENT_TYPE" }, { status: 415 });
  }

  // Bound the *actual* stream, not just a user-controlled Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "INVALID_REVIEW_BODY" }, { status: 400 });
  const chunks: Buffer[] = [];
  let count = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > MAX_REVIEW_BODY) {
        await reader.cancel().catch(() => undefined);
        return Response.json({ error: "REVIEW_BODY_TOO_LARGE" }, { status: 413 });
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks, count).toString("utf8")); }
  catch { return Response.json({ error: "INVALID_JSON" }, { status: 400 }); }
  if (body === null || typeof body !== "object" || Array.isArray(body) ||
      (body as { artifactId?: unknown }).artifactId !== id) {
    return Response.json({ error: "REVIEW_ARTIFACT_ID_MISMATCH" }, { status: 409 });
  }

  const artifact = await loadInvoiceArtifactForHumanReview(session.user.id, id);
  if (!artifact) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  try {
    const result = await recordExplicitHumanInvoiceFacts({
      actorUserId: session.user.id,
      organizationId: artifact.organizationId,
      review: body,
    });
    return Response.json({ review: result }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ManualInvoiceReviewError) {
      return Response.json({ error: error.code }, { status: error.httpStatus });
    }
    throw error;
  }
}
