import { z } from "zod";
import { auth } from "@/src/auth/auth";
import { isTrustedMutationOrigin } from "@/src/auth/same-origin";
import {
  OriginChannelEnrollmentError,enrollTrustedVendorOriginChannel,
} from "@/src/authority/origin-channel-enrollment";

export const runtime="nodejs";
const MAX_BODY_BYTES=2048;
const requestSchema=z.object({
  organizationId:z.string().min(1).max(120),
  vendorId:z.string().min(1).max(120),
  kind:z.enum(["KNOWN_CALLBACK","TRUSTED_PORTAL","ERP_INTEGRATION"]),
  independentEvidenceReference:z.string().min(16).max(128),
  confirmedOutsideInvoice:z.literal(true),
}).strict();

export async function POST(request:Request) {
  if(!isTrustedMutationOrigin(request))
    return Response.json({error:"INVALID_ORIGIN"},{status:403});
  const session=await auth.api.getSession({headers:request.headers});
  if(!session)return Response.json({error:"UNAUTHORIZED"},{status:401});
  if(request.headers.get("content-type")?.split(";",1)[0].trim().toLowerCase()!=="application/json")
    return Response.json({error:"JSON_BODY_REQUIRED"},{status:415});
  const reader=request.body?.getReader();
  if(!reader)return Response.json({error:"ENROLLMENT_BODY_REQUIRED"},{status:400});
  const chunks:Buffer[]=[];
  let size=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>MAX_BODY_BYTES){
        await reader.cancel().catch(()=>undefined);
        return Response.json({error:"ENROLLMENT_BODY_TOO_LARGE"},{status:413});
      }
      chunks.push(Buffer.from(value));
    }
  }finally{reader.releaseLock();}
  let body:unknown;
  try{body=JSON.parse(Buffer.concat(chunks,size).toString("utf8"));}
  catch{return Response.json({error:"INVALID_JSON"},{status:400});}
  const parsed=requestSchema.safeParse(body);
  if(!parsed.success)return Response.json({error:"INVALID_CHANNEL_ENROLLMENT"},{status:422});
  try{
    const channel=await enrollTrustedVendorOriginChannel({
      actorUserId:session.user.id,...parsed.data,
    });
    return Response.json({channel},{
      status:channel.replayed?200:201,
      headers:{"Cache-Control":"private, no-store"},
    });
  }catch(error){
    if(error instanceof OriginChannelEnrollmentError)
      return Response.json({error:error.code},{status:error.httpStatus});
    throw error;
  }
}
