import { z } from "zod";
import { auth } from "@/src/auth/auth";
import { isTrustedMutationOrigin } from "@/src/auth/same-origin";
import { loadInvoiceArtifactForHumanReview } from "@/src/artifacts/postgres-store";
import { prepareInvoicePaymentProposal } from "@/src/authority/payment-proposal";

export const runtime="nodejs";
const idPattern=/^[a-f0-9-]{36}$/i;
const schema=z.object({
  claimSetId:z.string().uuid(),
  attestationId:z.string().uuid(),
  expectedArtifactSha256:z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
const MAX_BYTES=2048;

// Frozen proposal only: never authorizes a payment or calls PayPal.
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  if(!isTrustedMutationOrigin(request))
    return Response.json({error:"INVALID_ORIGIN"},{status:403});
  const session=await auth.api.getSession({headers:request.headers});
  if(!session)return Response.json({error:"UNAUTHORIZED"},{status:401});
  const {id}=await params;
  if(!idPattern.test(id))return Response.json({error:"NOT_FOUND"},{status:404});
  const artifact=await loadInvoiceArtifactForHumanReview(session.user.id,id);
  if(!artifact)return Response.json({error:"NOT_FOUND"},{status:404});
  if(request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")
    return Response.json({error:"UNSUPPORTED_CONTENT_TYPE"},{status:415});
  const reader=request.body?.getReader();
  if(!reader)return Response.json({error:"INVALID_REVIEW_BODY"},{status:400});
  const chunks:Buffer[]=[];
  let count=0;
  try {
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      count+=value.byteLength;
      if(count>MAX_BYTES) {
        await reader.cancel().catch(()=>undefined);
        return Response.json({error:"REVIEW_BODY_TOO_LARGE"},{status:413});
      }
      chunks.push(Buffer.from(value));
    }
  } finally {reader.releaseLock();}
  let body:unknown;
  try {body=JSON.parse(Buffer.concat(chunks,count).toString("utf8"));}
  catch{return Response.json({error:"INVALID_JSON"},{status:400});}
  const parsed=schema.safeParse(body);
  if(!parsed.success)return Response.json({error:"INVALID_PROPOSAL_SCHEMA"},{status:400});
  if(parsed.data.expectedArtifactSha256!==artifact.sha256)
    return Response.json({error:"PROPOSAL_ARTIFACT_DIGEST_MISMATCH"},{status:409});
  const proposal=await prepareInvoicePaymentProposal({
    organizationId:artifact.organizationId,artifactId:id,
    claimSetId:parsed.data.claimSetId,attestationId:parsed.data.attestationId,
  });
  return Response.json({
    proposal,paymentAuthorized:false,paymentExecuted:false,
  },{headers:{"Cache-Control":"private, no-store"}});
}
