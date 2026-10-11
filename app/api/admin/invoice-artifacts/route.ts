import { auth } from "@/src/auth/auth";
import { isTrustedMutationOrigin } from "@/src/auth/same-origin";
import { pool } from "@/src/db/pool";
import {
  ArtifactAdmissionError, readBoundedInvoiceBody,
} from "@/src/artifacts/admission";
import {
  ArtifactAdminAccessError, ArtifactQuotaError, storeUntrustedInvoiceArtifact,
} from "@/src/artifacts/postgres-store";

export const runtime = "nodejs";
const organizationIdPattern = /^[A-Za-z0-9_-]{1,120}$/;

/**
 * Admin-assisted hackathon upload. Agent ingress remains a separate
 * least-privilege endpoint. Neither route creates payment requests.
 */
export async function POST(request: Request) {
  if (!isTrustedMutationOrigin(request))
    return Response.json({error:"INVALID_ORIGIN"},{status:403});

  const session = await auth.api.getSession({headers:request.headers});
  if (!session)
    return Response.json({error:"UNAUTHORIZED"},{status:401});

  const organizationId = request.headers.get("x-mandategate-organization-id") ?? "";
  if (!organizationIdPattern.test(organizationId))
    return Response.json({error:"ORGANIZATION_REQUIRED"},{status:400});

  // Reject cross-org upload BEFORE consuming user-provided file bytes.
  const membership = await pool.query(
    "select 1 from organization_admin_memberships where user_id=$1 and organization_id=$2 and role='ADMIN' and active=true",
    [session.user.id,organizationId],
  );
  if (membership.rows.length!==1)
    return Response.json({error:"ORGANIZATION_NOT_FOUND"},{status:404});

  try {
    const content=await readBoundedInvoiceBody(
      request.body,request.headers.get("content-length"),
    );
    // The transaction rechecks the admin membership while holding a shared
    // row lock, so revocation cannot race a successful upload.
    const artifact=await storeUntrustedInvoiceArtifact({
      organizationId,adminUserId:session.user.id,
      contentType:request.headers.get("content-type")??"",
      content,
    });
    return Response.json({
      artifact,
      reviewPath:"/invoice-artifacts/"+encodeURIComponent(artifact.artifactId),
      trustState:"STORED_UNTRUSTED",
      issuerAuthenticated:false,
      paymentAuthorized:false,
      paymentExecuted:false,
    },{
      status:artifact.replayed?200:201,
      headers:{"Cache-Control":"private, no-store"},
    });
  }catch(error){
    if(error instanceof ArtifactAdmissionError ||
       error instanceof ArtifactQuotaError ||
       error instanceof ArtifactAdminAccessError) {
      return Response.json({error:error.code},{status:error.httpStatus});
    }
    throw error;
  }
}
