import { auth } from "@/src/auth/auth";
import { loadInvoiceArtifactForHumanReview } from "@/src/artifacts/postgres-store";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) {
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  const artifact = await loadInvoiceArtifactForHumanReview(session.user.id, id);
  if (!artifact) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  // The source is original, potentially hostile content. Never render a PDF
  // inline under the privileged app origin. Images remain sandboxed and
  // read-only, while all other formats are forced downloads.
  const image = artifact.mimeType === "image/png" || artifact.mimeType === "image/jpeg";
  const ext = artifact.mimeType === "image/png" ? "png" : artifact.mimeType === "image/jpeg" ? "jpg" : "pdf";
  const headers = new Headers({
    "Content-Type": image ? artifact.mimeType : "application/octet-stream",
    "Content-Disposition": `${image ? "inline" : "attachment"}; filename="invoice-${id}.${ext}"`,
    "Content-Length": String(artifact.content.byteLength),
    "X-Artifact-SHA256": artifact.sha256,
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Security-Policy": "sandbox",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
  });
  return new Response(new Uint8Array(artifact.content), { headers });
}
