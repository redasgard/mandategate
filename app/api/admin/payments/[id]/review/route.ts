import {z} from "zod";
import {auth} from "@/src/auth/auth";
import {isTrustedMutationOrigin} from "@/src/auth/same-origin";
import {recordPaymentEscalationReview,getEscalationSnapshot,EscalationReviewError} from "@/src/history/escalation-review";
export const runtime="nodejs";
const MAX_BYTES=1_700_000;
const payloadSchema=z.object({
  action:z.enum(["ACCEPT","DECLINE"]),
  explanation:z.string().min(16).max(2000),
  expectedSnapshotSha256:z.string().regex(/^[a-f0-9]{64}$/),
  evidenceMimeType:z.enum(["application/pdf","image/png","image/jpeg"]).optional(),
  evidenceBase64:z.string().max(1_400_000).optional(),
}).strict().superRefine((value,ctx)=>{
  if(Boolean(value.evidenceBase64)!==Boolean(value.evidenceMimeType))
    ctx.addIssue({code:"custom",message:"EVIDENCE_FIELDS_MUST_BE_PAIRED"});
});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const session=await auth.api.getSession({headers:request.headers});
  if(!session)return Response.json({error:"UNAUTHORIZED"},{status:401});
  const {id}=await params;
  if(!uuid.test(id))return Response.json({error:"NOT_FOUND"},{status:404});
  const snapshot=await getEscalationSnapshot(id,session.user.id);
  if(!snapshot)return Response.json({error:"NOT_FOUND"},{status:404});
  return Response.json({snapshot},{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!isTrustedMutationOrigin(request))
    return Response.json({error:"INVALID_ORIGIN"},{status:403});
  const session=await auth.api.getSession({headers:request.headers});
  if(!session)return Response.json({error:"UNAUTHORIZED"},{status:401});
  const {id}=await params;
  if(!uuid.test(id))return Response.json({error:"NOT_FOUND"},{status:404});
  if(request.headers.get("content-type")?.split(";",1)[0].trim().toLowerCase()!=="application/json")
    return Response.json({error:"JSON_REQUIRED"},{status:415});
  const len=Number(request.headers.get("content-length")??"");
  if(request.headers.has("content-length")&&(!Number.isSafeInteger(len)||len>MAX_BYTES||len<0))
    return Response.json({error:"REVIEW_PAYLOAD_TOO_LARGE"},{status:413});
  if(!request.body)return Response.json({error:"EMPTY_REVIEW_BODY"},{status:400});
  const reader=request.body.getReader(),chunks:Buffer[]=[];
  let size=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>MAX_BYTES){
        await reader.cancel().catch(()=>undefined);
        return Response.json({error:"REVIEW_PAYLOAD_TOO_LARGE"},{status:413});
      }
      chunks.push(Buffer.from(value));
    }
  }finally{reader.releaseLock();}
  if(request.headers.has("content-length")&&size!==len)
    return Response.json({error:"REVIEW_LENGTH_MISMATCH"},{status:400});
  let json:unknown;
  try{json=JSON.parse(Buffer.concat(chunks,size).toString("utf8"));}
  catch{return Response.json({error:"INVALID_JSON"},{status:400});}
  const parsed=payloadSchema.safeParse(json);
  if(!parsed.success)return Response.json({error:"INVALID_REVIEW_ACTION"},{status:422});
  let evidence:undefined|{mimeType:string;bytes:Buffer};
  if(parsed.data.evidenceBase64){
    if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(parsed.data.evidenceBase64))
      return Response.json({error:"INVALID_EVIDENCE_ENCODING"},{status:422});
    const bytes=Buffer.from(parsed.data.evidenceBase64,"base64");
    if(bytes.length>1048576||bytes.toString("base64")!==parsed.data.evidenceBase64)
      return Response.json({error:"INVALID_EVIDENCE_LENGTH"},{status:422});
    evidence={mimeType:parsed.data.evidenceMimeType!,bytes};
  }
  try{
    const review=await recordPaymentEscalationReview({
      requestId:id,reviewerId:session.user.id,
      action:parsed.data.action,
      expectedSnapshotSha256:parsed.data.expectedSnapshotSha256,
      explanation:parsed.data.explanation,evidence,
    });
    return Response.json({review},{status:201,
      headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    if(error instanceof EscalationReviewError)
      return Response.json({error:error.code},{status:error.httpStatus});
    throw error;
  }
}
