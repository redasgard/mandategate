import { auth } from "@/src/auth/auth";
import { isTrustedMutationOrigin } from "@/src/auth/same-origin";
import { loadInvoiceArtifactForHumanReview } from "@/src/artifacts/postgres-store";
import {
  analyzeStoredInvoiceImage, InvoiceImageAnalysisError,
} from "@/src/invoices/image-analysis";
import { InvoiceVisionGatewayError } from "@/src/ai/gateway/experiential-vision";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  if(!isTrustedMutationOrigin(request))
    return Response.json({error:"INVALID_ORIGIN"},{status:403});
  const session=await auth.api.getSession({headers:request.headers});
  if(!session)return Response.json({error:"UNAUTHORIZED"},{status:401});
  const {id}=await params;
  if(!/^[a-f0-9-]{36}$/i.test(id))
    return Response.json({error:"NOT_FOUND"},{status:404});
  const artifact=await loadInvoiceArtifactForHumanReview(session.user.id,id);
  if(!artifact)return Response.json({error:"NOT_FOUND"},{status:404});
  if(!["application/pdf","image/png","image/jpeg"].includes(artifact.mimeType))
    return Response.json({error:"INVOICE_DOCUMENT_REQUIRED"},{status:422});
  // Even one-time authenticated requests must carry no hidden instructions
  // or model-supplied selectors. The backend reads exact stored bytes.
  if(request.headers.get("content-length") &&
     request.headers.get("content-length")!=="0")
    return Response.json({error:"OBSERVATION_BODY_NOT_ALLOWED"},{status:400});
  if(request.body){
    const reader=request.body.getReader();
    try{
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        if(value.byteLength>0)return Response.json({error:"OBSERVATION_BODY_NOT_ALLOWED"},{status:400});
      }
    }finally{
      await reader.cancel().catch(()=>undefined);
      reader.releaseLock();
    }
  }
  try{
    // Performs provider policy preflight before any model request; derived
    // extraction stays T1 even when the route and GLM respond successfully.
    const observation=await analyzeStoredInvoiceImage(artifact.organizationId,id);
    return Response.json({
      observation,
      sourceTrust:"MODEL_OBSERVATION_UNTRUSTED",
      issuerAuthenticated:false,paymentAuthorized:false,paymentExecuted:false,
    },{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    if(error instanceof InvoiceImageAnalysisError)
      return Response.json({error:error.code},{status:error.httpStatus,
        headers:{"Cache-Control":"private, no-store"}});
    if(error instanceof InvoiceVisionGatewayError)
      return Response.json({error:error.code},{status:503,
        headers:{"Cache-Control":"private, no-store"}});
    throw error;
  }
}
