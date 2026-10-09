import { createHash } from "node:crypto";
import { z } from "zod";
import { auth } from "@/src/auth/auth";
import { isTrustedMutationOrigin } from "@/src/auth/same-origin";
import { loadInvoiceArtifactForHumanReview } from "@/src/artifacts/postgres-store";
import { analyzeStoredInvoiceImage, InvoiceImageAnalysisError } from "@/src/invoices/image-analysis";

export const runtime = "nodejs";
const MAX_BYTES = 1024;
const inputSchema = z.object({
  expectedArtifactSha256:z.string().regex(/^[a-f0-9]{64}$/),
  syntheticFixtureOnly:z.literal(true),
}).strict();

function syntheticProofEnabled(){
  // Explicit operator opt-in, Sandbox only. The synthetic exact-SHA allowlist,
  // active admin session and same-origin checks remain mandatory below.
  return process.env.GATE_H_LIVE_GLM_PROOF_ENABLED==="1" &&
    process.env.PAYPAL_BASE_URL==="https://api-m.sandbox.paypal.com";
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  // Disabled by default, including on the existing development service.
  if(!syntheticProofEnabled())return Response.json({error:"GATE_H_SYNTHETIC_PROOF_DISABLED"},{status:404});
  if(!isTrustedMutationOrigin(request))
    return Response.json({error:"INVALID_ORIGIN"},{status:403});
  const session=await auth.api.getSession({headers:request.headers});
  if(!session)return Response.json({error:"UNAUTHORIZED"},{status:401});
  const {id}=await params;
  if(!/^[a-f0-9-]{36}$/i.test(id))return Response.json({error:"NOT_FOUND"},{status:404});
  const artifact=await loadInvoiceArtifactForHumanReview(session.user.id,id);
  if(!artifact)return Response.json({error:"NOT_FOUND"},{status:404});
  if(artifact.mimeType!=="image/png" && artifact.mimeType!=="image/jpeg")
    return Response.json({error:"LIVE_GLM_IMAGE_REQUIRED"},{status:422});

  // The allowlist is operator-controlled and exact-byte hashed. The client
  // cannot introduce novel documents merely by checking "synthetic".
  const allowed=(process.env.GATE_H_SYNTHETIC_IMAGE_SHA256_ALLOWLIST??"")
    .split(",").map(x=>x.trim()).filter(x=>/^[a-f0-9]{64}$/.test(x));
  if(!allowed.includes(artifact.sha256))
    return Response.json({error:"SYNTHETIC_ARTIFACT_NOT_ALLOWLISTED"},{status:403});
  if(request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")
    return Response.json({error:"UNSUPPORTED_REVIEW_CONTENT_TYPE"},{status:415});
  const reader=request.body?.getReader();
  if(!reader)return Response.json({error:"INVALID_BODY"},{status:400});
  const buffers:Buffer[]=[];
  let n=0;
  try {
    while(true) {
      const {done,value}=await reader.read();
      if(done)break;
      n+=value.byteLength;
      if(n>MAX_BYTES) {
        await reader.cancel().catch(()=>undefined);
        return Response.json({error:"PROOF_BODY_TOO_LARGE"},{status:413});
      }
      buffers.push(Buffer.from(value));
    }
  }finally{reader.releaseLock();}
  let payload:unknown;
  try{payload=JSON.parse(Buffer.concat(buffers,n).toString("utf8"));}
  catch{return Response.json({error:"INVALID_JSON"},{status:400});}
  const validated=inputSchema.safeParse(payload);
  if(!validated.success)return Response.json({error:"INVALID_PROOF_INPUT"},{status:400});
  if(validated.data.expectedArtifactSha256!==artifact.sha256)
    return Response.json({error:"PROOF_ARTIFACT_DIGEST_MISMATCH"},{status:409});

  // The analyzer independently checks the live provider account's privacy
  // controls, then the actual served model/ZDR headers. It writes only an
  // untrusted T1 observation; it cannot call the payment executor.
  try{
    const observed=await analyzeStoredInvoiceImage(artifact.organizationId,id);
    const observedDigest=createHash("sha256")
      .update(JSON.stringify(observed.observation)).digest("hex");
    return Response.json({
      artifactSha256:artifact.sha256,
      model:observed.evidence.model,
      provider:observed.evidence.provider,
      gatewayRequestId:observed.evidence.requestId,
      modelZdr:observed.evidence.zdr,
      promptVersion:observed.evidence.promptVersion,
      promptSha256:observed.evidence.promptSha256,
      observationSha256:observedDigest,
      disposition:observed.status,
      reasonCodes:observed.reasonCodes,
      trustTier:"MODEL_OBSERVED_UNTRUSTED",
      paymentAuthorized:false,paymentExecuted:false,
      servingRouteVerified:true,
    },{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    if(error instanceof InvoiceImageAnalysisError)
      return Response.json({error:error.code},{status:error.httpStatus});
    throw error;
  }
}
