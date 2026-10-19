import {z} from "zod";
import {auth} from "@/src/auth/auth";
import {isTrustedMutationOrigin} from "@/src/auth/same-origin";
import {readSmallJson} from "@/src/auth/json-small-body";
import {AutopayMandateError,prepareAutopayMandate} from "@/src/autonomy/mandates";

export const runtime="nodejs";
const schema=z.object({
  organizationId:z.string().min(1).max(128),
  vendorId:z.string().min(1).max(128),
  maxAmountCents:z.number().int().min(1).max(2_000_000_000),
  validityDays:z.number().int().min(1).max(30),
}).strict();

export async function POST(request:Request) {
  if(!isTrustedMutationOrigin(request))
    return Response.json({error:"INVALID_ORIGIN"},{status:403});
  const session=await auth.api.getSession({headers:request.headers});
  if(!session)return Response.json({error:"UNAUTHORIZED"},{status:401});
  const body=await readSmallJson(request);
  if(!body.ok)return Response.json({error:body.error},{status:body.status});
  const parsed=schema.safeParse(body.value);
  if(!parsed.success)return Response.json({error:"AUTOPAY_PREPARE_INVALID"},{status:422});
  try{
    const mandate=await prepareAutopayMandate({...parsed.data,actorId:session.user.id});
    return Response.json({mandate},{status:201,headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    if(error instanceof AutopayMandateError)
      return Response.json({error:error.code},{status:error.httpStatus});
    throw error;
  }
}
