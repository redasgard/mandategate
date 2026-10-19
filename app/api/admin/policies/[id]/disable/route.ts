import {z} from "zod";
import {auth} from "@/src/auth/auth";
import {isTrustedMutationOrigin} from "@/src/auth/same-origin";
import {readSmallJson} from "@/src/auth/json-small-body";
import {disableActivePolicy} from "@/src/policy/shutdown";
import {PolicyProposalError} from "@/src/policy/proposals";
export const runtime="nodejs";
const schema=z.object({
  expectedDigest:z.string().regex(/^[a-f0-9]{64}$/),
  explanation:z.string().trim().min(16).max(2000),
  confirmation:z.literal("DISABLE"),
}).strict();
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!isTrustedMutationOrigin(request))
    return Response.json({error:"INVALID_ORIGIN"},{status:403});
  const session=await auth.api.getSession({headers:request.headers});
  if(!session)return Response.json({error:"UNAUTHORIZED"},{status:401});
  const {id}=await params;
  const body=await readSmallJson(request);
  if(!body.ok)return Response.json({error:body.error},{status:body.status});
  const parsed=schema.safeParse(body.value);
  if(!parsed.success)return Response.json({error:"POLICY_SHUTDOWN_INVALID"},{status:422});
  try{
    const result=await disableActivePolicy({...parsed.data,id,actorId:session.user.id});
    return Response.json({result},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    if(error instanceof PolicyProposalError)return Response.json({error:error.code},{status:error.httpStatus});
    throw error;
  }
}
