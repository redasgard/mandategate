import { auth } from "@/src/auth/auth";
import { isTrustedMutationOrigin } from "@/src/auth/same-origin";
import { loadInvoiceArtifactForHumanReview } from "@/src/artifacts/postgres-store";
import {
  loadStoredPdfSourcePages, prepareStoredPdfSourcePages,
} from "@/src/invoices/pdf-source-store";
import { PdfSourceError } from "@/src/invoices/pdf-text";

export const runtime = "nodejs";
const VALID_ID = /^[0-9a-f-]{36}$/i;

async function authorize(request: Request, artifactId: string) {
  const session = await auth.api.getSession({headers:request.headers});
  if (!session) return {error: Response.json({error:"UNAUTHORIZED"},{status:401})};
  if (!VALID_ID.test(artifactId)) {
    return {error: Response.json({error:"NOT_FOUND"},{status:404})};
  }
  const artifact=await loadInvoiceArtifactForHumanReview(session.user.id,artifactId);
  if (!artifact) return {error:Response.json({error:"NOT_FOUND"},{status:404})};
  if (artifact.mimeType!=="application/pdf") {
    return {error:Response.json({error:"PDF_ARTIFACT_REQUIRED"},{status:422})};
  }
  return {artifact};
}
function output(source: NonNullable<Awaited<ReturnType<typeof prepareStoredPdfSourcePages>>>) {
  return {
    artifactSha256:source.artifactSha256,
    parserVersion:source.parserVersion,
    pageCount:source.pages.length,
    pages:source.pages,
    trustState:"INDEPENDENT_PDF_TEXT_ONLY",
    issuerAuthenticated:false,
    paymentAuthorized:false,
  };
}
export async function GET(request: Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const authz=await authorize(request,id);
  if (authz.error) return authz.error;
  try {
    const source=await loadStoredPdfSourcePages(authz.artifact!.organizationId,id);
    if (!source) return Response.json({error:"PDF_SOURCE_NOT_PREPARED"},{status:404});
    return Response.json(output({...source,replayed:true}),{headers:{"Cache-Control":"private, no-store"}});
  } catch(error) {
    if(error instanceof PdfSourceError)return Response.json({error:error.code},{status:error.httpStatus});
    throw error;
  }
}
export async function POST(request: Request,{params}:{params:Promise<{id:string}>}) {
  if(!isTrustedMutationOrigin(request))return Response.json({error:"INVALID_ORIGIN"},{status:403});
  const {id}=await params;
  const authz=await authorize(request,id);
  if(authz.error)return authz.error;
  // Framework fetch adapters may represent an empty POST as a readable
  // but zero-byte stream. Reject data, not mere stream existence.
  if(request.headers.get("content-length") &&
     request.headers.get("content-length")!=="0")
    return Response.json({error:"PDF_PREPARE_BODY_NOT_ALLOWED"},{status:400});
  if(request.body){
    const reader=request.body.getReader();
    try{
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        if(value.byteLength>0)
          return Response.json({error:"PDF_PREPARE_BODY_NOT_ALLOWED"},{status:400});
      }
    }finally{
      await reader.cancel().catch(()=>undefined);
      reader.releaseLock();
    }
  }
  try {
    const source=await prepareStoredPdfSourcePages(authz.artifact!.organizationId,id);
    if(!source)return Response.json({error:"NOT_FOUND"},{status:404});
    return Response.json({...output(source),replayed:source.replayed},{
      status:source.replayed?200:201,
      headers:{"Cache-Control":"private, no-store"},
    });
  } catch(error) {
    if(error instanceof PdfSourceError)return Response.json({error:error.code},{status:error.httpStatus});
    throw error;
  }
}
