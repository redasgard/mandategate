import { NextRequest } from "next/server";
import { auth } from "@/src/auth/auth";
import { isTrustedMutationOrigin } from "@/src/auth/same-origin";
import { pool } from "@/src/db/pool";
import { ReviewRejected, reviewInvoiceBinding } from "@/src/authority/admin-review";

export const runtime = "nodejs";

export async function GET(request: NextRequest,{params}:{params:Promise<{id:string}>}) {
  const session = await auth.api.getSession({headers:request.headers});
  if(!session) return Response.json({error:"UNAUTHORIZED"},{status:401});
  const {id}=await params;
  const view=await pool.query(
    ["select b.id,b.authorization_status,b.tuple_sha256,b.expires_at,b.invoice_number,",
     "b.amount_cents,b.currency,b.destination_id,b.artifact_sha256,b.proposed_reason_codes,",
     "b.verified_claim_set_id,b.origin_attestation_id,v.name as vendor_name,",
     "vd.destination as trusted_destination from payment_authority_bindings b",
     "join organization_admin_memberships m on m.organization_id=b.organization_id",
     "and m.user_id=$2 and m.active=true and m.role='ADMIN'",
     "join vendors v on v.id=b.vendor_id and v.organization_id=b.organization_id",
     "join vendor_destinations vd on vd.id=b.destination_id",
     "where b.id=$1"].join(" "),
    [id,session.user.id],
  );
  if(!view.rows[0]) return Response.json({error:"NOT_FOUND"},{status:404});
  return Response.json({binding:view.rows[0],paymentAuthorized:false},{headers:{"Cache-Control":"no-store"}});
}

export async function POST(request: NextRequest,{params}:{params:Promise<{id:string}>}) {
  if(!isTrustedMutationOrigin(request))return Response.json({error:"INVALID_ORIGIN"},{status:403});
  const session=await auth.api.getSession({headers:request.headers});
  if(!session)return Response.json({error:"UNAUTHORIZED"},{status:401});
  const {id}=await params;
  let body: unknown;
  try {body=await request.json();} catch {return Response.json({error:"INVALID_JSON"},{status:400});}
  if(!body || typeof body!=="object" || Array.isArray(body))
    return Response.json({error:"REVIEW_INPUT_INVALID"},{status:400});
  const v=body as Record<string,unknown>;
  if(Object.keys(v).sort().join(",")!=="action,expectedTupleSha256,reason" ||
    (v.action!=="APPROVE" && v.action!=="REJECT") ||
    typeof v.expectedTupleSha256!=="string" || typeof v.reason!=="string")
    return Response.json({error:"REVIEW_INPUT_INVALID"},{status:400});
  try {
    const result=await reviewInvoiceBinding({
      bindingId:id, reviewerId:session.user.id, action:v.action,
      expectedTupleSha256:v.expectedTupleSha256,reason:v.reason,
    });
    return Response.json({review:result},{headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    if(error instanceof ReviewRejected)return Response.json({error:error.code},{status:error.code==="REVIEWER_NOT_AUTHORIZED"?403:409});
    throw error;
  }
}
