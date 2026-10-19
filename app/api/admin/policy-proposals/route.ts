import { z } from "zod";
import { auth } from "@/src/auth/auth";
import { isTrustedMutationOrigin } from "@/src/auth/same-origin";
import { readSmallJson } from "@/src/auth/json-small-body";
import { PolicyProposalError, preparePolicyProposal } from "@/src/policy/proposals";
export const runtime="nodejs";
const schema=z.discriminatedUnion("origin",[
  z.object({
    origin:z.literal("ADMIN_MANUAL"),
    organizationId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    proposedLimitCents:z.number().int().min(1).max(2_000_000_000),
  }).strict(),
  z.object({
    origin:z.literal("PAID_HISTORY"),
    organizationId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  }).strict(),
]);
export async function POST(request:Request){
  if(!isTrustedMutationOrigin(request))return Response.json({error:"INVALID_ORIGIN"},{status:403});
  const session=await auth.api.getSession({headers:request.headers});
  if(!session)return Response.json({error:"UNAUTHORIZED"},{status:401});
  const body=await readSmallJson(request);
  if(!body.ok)return Response.json({error:body.error},{status:body.status});
  const parsed=schema.safeParse(body.value);
  if(!parsed.success)return Response.json({error:"POLICY_PROPOSAL_INVALID"},{status:422});
  try{
    const prepared=await preparePolicyProposal({...parsed.data,actorId:session.user.id});
    return Response.json({proposal:prepared},{status:201,headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    if(error instanceof PolicyProposalError)return Response.json({error:error.code},{status:error.httpStatus});
    throw error;
  }
}
