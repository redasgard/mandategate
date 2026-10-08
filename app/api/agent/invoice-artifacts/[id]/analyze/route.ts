import { authenticateAgent } from "@/src/auth/machine";
import {
  analyzeStoredInvoiceImage,
  InvoiceImageAnalysisError,
} from "@/src/invoices/image-analysis";
import { InvoiceVisionGatewayError } from "@/src/ai/gateway/experiential-vision";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const principal = await authenticateAgent(
    request.headers.get("authorization"),
    "invoice:analyze",
  );
  if (!principal) return Response.json({ error: "UNAUTHORIZED_AGENT" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: "INVALID_ARTIFACT_ID" }, { status: 400 });
  }
  try {
    const analysis = await analyzeStoredInvoiceImage(principal.organizationId, id);
    return Response.json({ analysis }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof InvoiceImageAnalysisError) {
      return Response.json({ error: error.code }, {
        status: error.httpStatus,
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (error instanceof InvoiceVisionGatewayError) {
      return Response.json({ error: error.code }, {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return Response.json({ error: "INVOICE_IMAGE_ANALYSIS_FAILED" }, { status: 503 });
  }
}
