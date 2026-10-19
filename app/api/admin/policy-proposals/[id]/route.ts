import { z } from "zod";
import { auth } from "@/src/auth/auth";
import { isTrustedMutationOrigin } from "@/src/auth/same-origin";
import { readSmallJson } from "@/src/auth/json-small-body";
import { decidePolicyProposal, PolicyProposalError } from "@/src/policy/proposals";
export const runtime="nodejs";
const hex=z.string().regex(/^[a-f0-9]{64}$/);
const explanation=z.string().trim().min(16).max(2000);
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("EDIT"),expectedDigest:hex,explanation,
    proposedLimitCents:z.number().int().min(1).max(2_000_000_000)}).strict(),
  z.object({action:z.literal("ACTIVATE"),expectedDigest:hex,explanation}).strict(),
  z.object({action:z.literal("REJECT"),expectedDigest:hex,explanation}).strict(),
]);
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!isTrustedMutationOrigin(request))return Response.json({error:"INVALID_ORIGIN"},{status:403});
  const session=await auth.api.getSession({headers:request.headers});
  if(!session)return Response.json({error:"UNAUTHORIZED"},{status:401});
  const {id}=await params;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    return Response.json({error:"POLICY_PROPOSAL_NOT_FOUND"},{status:404});
  const body=await readSmallJson(request);
  if(!body.ok)return Response.json({error:body.error},{status:body.status});
  const parsed=schema.safeParse(body.value);
  if(!parsed.success)return Response.json({error:"POLICY_CONFIRMATION_INVALID"},{status:422});
  try{
    const result=await decidePolicyProposal({...parsed.data,id,actorId:session.user.id});
    return Response.json({result},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    if(error instanceof PolicyProposalError)return Response.json({error:error.code},{status:error.httpStatus});
    throw error;
  }
}
