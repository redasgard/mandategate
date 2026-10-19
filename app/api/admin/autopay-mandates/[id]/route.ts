import {z} from "zod";
import {auth} from "@/src/auth/auth";
import {isTrustedMutationOrigin} from "@/src/auth/same-origin";
import {readSmallJson} from "@/src/auth/json-small-body";
import {AutopayMandateError,decideAutopayMandate} from "@/src/autonomy/mandates";

export const runtime="nodejs";
const schema=z.discriminatedUnion("action",[
  z.object({
    action:z.literal("ACTIVATE"),
    expectedDigest:z.string().regex(/^[a-f0-9]{64}$/),
    confirmation:z.literal("ENABLE AUTOPAY"),
    explanation:z.string().trim().min(16).max(2000),
  }).strict(),
  z.object({
    action:z.literal("REVOKE"),
    expectedDigest:z.string().regex(/^[a-f0-9]{64}$/),
    confirmation:z.literal("REVOKE"),
    explanation:z.string().trim().min(16).max(2000),
  }).strict(),
]);
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  if(!isTrustedMutationOrigin(request))
    return Response.json({error:"INVALID_ORIGIN"},{status:403});
  const session=await auth.api.getSession({headers:request.headers});
  if(!session)return Response.json({error:"UNAUTHORIZED"},{status:401});
  const body=await readSmallJson(request);
  if(!body.ok)return Response.json({error:body.error},{status:body.status});
  const parsed=schema.safeParse(body.value);
  if(!parsed.success)return Response.json({error:"AUTOPAY_DECISION_INVALID"},{status:422});
  try {
    const {id}=await params;
    const result=await decideAutopayMandate({...parsed.data,id,actorId:session.user.id});
    return Response.json({result},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    if(error instanceof AutopayMandateError)
      return Response.json({error:error.code},{status:error.httpStatus});
    throw error;
  }
}
