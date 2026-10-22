import {z} from "zod";
import {auth} from "@/src/auth/auth";
import {isTrustedMutationOrigin} from "@/src/auth/same-origin";
import {
  resolveVendorReverificationCase,VendorTrustCaseError,
} from "@/src/vendor-trust/reverification";

export const runtime="nodejs";
const caseId=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const schema=z.object({
  action:z.enum(["REJECT","VERIFY"]),
  reason:z.string().min(16).max(2000),
  evidenceReference:z.string().min(8).max(128)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{7,127}$/),
  verificationMethod:z.enum([
    "KNOWN_CONTACT_CALLBACK","TRUSTED_VENDOR_PORTAL",
    "SIGNED_VENDOR_INSTRUCTION",
  ]).nullable(),
  confirmedIndependentVerification:z.boolean(),
}).strict();

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!isTrustedMutationOrigin(request))
    return Response.json({error:"INVALID_ORIGIN"},{status:403});
  const session=await auth.api.getSession({headers:request.headers});
  if(!session)return Response.json({error:"UNAUTHORIZED"},{status:401});
  const {id}=await params;
  if(!caseId.test(id))return Response.json({error:"NOT_FOUND"},{status:404});
  if(request.headers.get("content-type")?.split(";",1)[0].trim().toLowerCase()!=="application/json")
    return Response.json({error:"JSON_REQUIRED"},{status:415});
  const len=Number(request.headers.get("content-length")??"");
  if(request.headers.has("content-length")&&(!Number.isSafeInteger(len)||len<0||len>3000))
    return Response.json({error:"REQUEST_TOO_LARGE"},{status:413});
  if(!request.body)return Response.json({error:"EMPTY_BODY"},{status:400});
  let total=0;const chunks:Buffer[]=[];
  const reader=request.body.getReader();
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>3000){
        await reader.cancel().catch(()=>undefined);
        return Response.json({error:"REQUEST_TOO_LARGE"},{status:413});
      }
      chunks.push(Buffer.from(value));
    }
  }finally{reader.releaseLock();}
  let parsed:unknown;
  try{parsed=JSON.parse(Buffer.concat(chunks,total).toString("utf8"));}
  catch{return Response.json({error:"INVALID_JSON"},{status:400});}
  const result=schema.safeParse(parsed);
  if(!result.success)return Response.json({error:"INVALID_VENDOR_REVERIFICATION"},{status:422});
  try{
    const resolution=await resolveVendorReverificationCase({
      caseId:id,actorUserId:session.user.id,...result.data,
    });
    return Response.json({resolution},{status:201,
      headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    if(error instanceof VendorTrustCaseError)
      return Response.json({error:error.code},{status:error.httpStatus});
    throw error;
  }
}
