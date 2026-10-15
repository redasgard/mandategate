import { z } from "zod";
import { auth } from "@/src/auth/auth";
import { pool } from "@/src/db/pool";
import { isTrustedMutationOrigin } from "@/src/auth/same-origin";
import { loadInvoiceArtifactForHumanReview } from "@/src/artifacts/postgres-store";
import { syntheticNonZdrTestEnvironmentEnabled, isSyntheticNonZdrSourceAllowlisted } from "@/src/ai/gateway/non-zdr-test-policy";
import { analyzeStoredInvoiceImage, InvoiceImageAnalysisError } from "@/src/invoices/image-analysis";
import { InvoiceVisionGatewayError } from "@/src/ai/gateway/experiential-vision";

export const runtime = "nodejs";
export const maxDuration = 150;

const MAX_BODY_BYTES = 1024;
const consentSchema = z.object({
  expectedArtifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
  syntheticFixtureOnly: z.literal(true),
  acknowledgeProviderRetentionRisk: z.literal(true),
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Unlike normal /observe, this route exists only on the bound demo service
  // or localhost with an explicit operator flag and PayPal Sandbox.
  if (!syntheticNonZdrTestEnvironmentEnabled()) {
    return Response.json({ error: "SYNTHETIC_NON_ZDR_TEST_DISABLED" }, { status: 404 });
  }
  if (!isTrustedMutationOrigin(request)) {
    return Response.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  }
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  // This query checks the live active ADMIN membership of the document's org.
  const artifact = await loadInvoiceArtifactForHumanReview(session.user.id, id);
  if (!artifact) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!isSyntheticNonZdrSourceAllowlisted(artifact.sha256)) {
    return Response.json({ error: "SYNTHETIC_NON_ZDR_TEST_NOT_ALLOWED" }, { status: 403 });
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return Response.json({ error: "UNSUPPORTED_REVIEW_CONTENT_TYPE" }, { status: 415 });
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_BODY_BYTES) {
    return Response.json({ error: "SYNTHETIC_TEST_BODY_TOO_LARGE" }, { status: 413 });
  }
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "SYNTHETIC_TEST_ACK_REQUIRED" }, { status: 400 });
  const buffers: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return Response.json({ error: "SYNTHETIC_TEST_BODY_TOO_LARGE" }, { status: 413 });
      }
      buffers.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  let data: unknown;
  try {
    data = JSON.parse(Buffer.concat(buffers, size).toString("utf8"));
  } catch {
    return Response.json({ error: "SYNTHETIC_TEST_ACK_REQUIRED" }, { status: 400 });
  }
  const parsed = consentSchema.safeParse(data);
  if (!parsed.success) {
    return Response.json({ error: "SYNTHETIC_TEST_ACK_REQUIRED" }, { status: 400 });
  }
  if (parsed.data.expectedArtifactSha256 !== artifact.sha256) {
    return Response.json({ error: "SYNTHETIC_TEST_SOURCE_MISMATCH" }, { status: 409 });
  }
  // A consent event must be durable before sending a single byte to the
  // external provider. Recheck the active ADMIN membership inside the insert.
  const consent = await pool.query(
    [
      "insert into invoice_synthetic_non_zdr_test_consents",
      "(organization_id,artifact_id,actor_user_id,source_sha256)",
      "select a.organization_id,a.id,$2,a.sha256 from invoice_artifacts a",
      "join organization_admin_memberships m",
      "on m.organization_id=a.organization_id and m.user_id=$2",
      "and m.role='ADMIN' and m.active=true",
      "where a.id=$1 and a.sha256=$3 returning id",
    ].join(" "),
    [id, session.user.id, artifact.sha256],
  );
  if (!consent.rows[0]) {
    return Response.json({ error: "SYNTHETIC_TEST_ADMIN_ACCESS_REVOKED" }, {
      status: 403, headers: { "Cache-Control": "private, no-store" },
    });
  }
  try {
    const observation = await analyzeStoredInvoiceImage(
      artifact.organizationId, id, undefined, { syntheticNonZdrTest: true },
    );
    return Response.json({
      observation,
      consentId: consent.rows[0].id,
      privacyMode: "SYNTHETIC_NON_ZDR_TEST",
      sourceTrust: "MODEL_OBSERVATION_UNTRUSTED",
      issuerAuthenticated: false,
      paymentAuthorized: false,
      paymentExecuted: false,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof InvoiceImageAnalysisError) {
      return Response.json({ error: error.code }, {
        status: error.httpStatus, headers: { "Cache-Control": "private, no-store" },
      });
    }
    if (error instanceof InvoiceVisionGatewayError) {
      return Response.json({ error: error.code }, {
        status: 503, headers: { "Cache-Control": "private, no-store" },
      });
    }
    throw error;
  }
}
