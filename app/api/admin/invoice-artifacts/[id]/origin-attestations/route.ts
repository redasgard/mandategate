import { auth } from "@/src/auth/auth";
import { isTrustedMutationOrigin } from "@/src/auth/same-origin";
import { loadInvoiceArtifactForHumanReview } from "@/src/artifacts/postgres-store";
import { pool } from "@/src/db/pool";
import {
  OriginAttestationError, attestInvoiceIssuerFromTrustedChannel,
} from "@/src/authority/origin-attestation";
import { z } from "zod";
import {sandboxFictionalIssuerChannelAllowed} from "@/src/demo/sandbox-fictional-origin";

export const runtime="nodejs";
const MAX_BODY_BYTES=4096;
const idPattern=/^[a-f0-9-]{36}$/i;

const inputSchema=z.object({
  vendorId:z.string().min(1).max(120),
  channelId:z.string().min(1).max(120),
  independentEvidenceReference:z.string().min(16).max(140),
  expectedArtifactSha256:z.string().regex(/^[a-f0-9]{64}$/),
  confirmedSyntheticSimulation:z.boolean().optional(),
}).strict();

async function authorizedArtifact(request: Request, id:string) {
  const session=await auth.api.getSession({headers:request.headers});
  if(!session)return {error:Response.json({error:"UNAUTHORIZED"},{status:401})};
  if(!idPattern.test(id))return {error:Response.json({error:"NOT_FOUND"},{status:404})};
  const artifact=await loadInvoiceArtifactForHumanReview(session.user.id,id);
  if(!artifact)return {error:Response.json({error:"NOT_FOUND"},{status:404})};
  return {artifact,actorId:session.user.id};
}

/** Display pre-existing channels, never channels proposed by an uploaded invoice. */
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const authz=await authorizedArtifact(request,id);
  if(authz.error)return authz.error;
  const org=authz.artifact!.organizationId;
  const result=await pool.query([
    "select ch.id,ch.vendor_id,v.name as vendor_name,ch.kind,ch.created_at,",
    "ch.enrolled_evidence_sha256 from vendor_origin_channels ch",
    "join vendors v on v.id=ch.vendor_id and v.organization_id=ch.organization_id",
    "join invoice_artifacts art on art.id=$2 and art.organization_id=ch.organization_id",
    "where ch.organization_id=$1 and ch.active=true",
    "and (ch.kind <> 'SYNTHETIC_FIXTURE' or ($3::boolean and ch.enrolled_by_user_id is not null",
    "and ch.organization_id='org_demo' and ch.vendor_id='vendor_northstar'))",
    "and ch.created_at < art.created_at",
    "order by v.name,ch.created_at",
  ].join(" "),[org,id,sandboxFictionalIssuerChannelAllowed(org,"vendor_northstar")]);
  return Response.json({
    artifactId:id,artifactSha256:authz.artifact!.sha256,
    eligibleChannels:result.rows,
    independentIssuerContactCheckRequired:true,
    paymentAuthorized:false,
  },{headers:{"Cache-Control":"private, no-store"}});
}

/** An admin asserts a real out-of-band check; it is not automatic issuer proof. */
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  if(!isTrustedMutationOrigin(request))
    return Response.json({error:"INVALID_ORIGIN"},{status:403});
  const {id}=await params;
  const authz=await authorizedArtifact(request,id);
  if(authz.error)return authz.error;
  if(request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")
    return Response.json({error:"UNSUPPORTED_REVIEW_CONTENT_TYPE"},{status:415});
  const reader=request.body?.getReader();
  if(!reader)return Response.json({error:"INVALID_REVIEW_BODY"},{status:400});
  const parts:Buffer[]=[];
  let count=0;
  try {
    while(true) {
      const {done,value}=await reader.read();
      if(done)break;
      count+=value.byteLength;
      if(count>MAX_BODY_BYTES){
        await reader.cancel().catch(()=>undefined);
        return Response.json({error:"REVIEW_BODY_TOO_LARGE"},{status:413});
      }
      parts.push(Buffer.from(value));
    }
  } finally {reader.releaseLock();}
  let body:unknown;
  try {body=JSON.parse(Buffer.concat(parts,count).toString("utf8"));}
  catch {return Response.json({error:"INVALID_JSON"},{status:400});}
  const input=inputSchema.safeParse(body);
  if(!input.success)return Response.json({error:"INVALID_ORIGIN_REVIEW_SCHEMA"},{status:400});
  if(input.data.expectedArtifactSha256!==authz.artifact!.sha256)
    return Response.json({error:"ATTESTATION_ARTIFACT_DIGEST_MISMATCH"},{status:409});
  try {
    const attestation=await attestInvoiceIssuerFromTrustedChannel({
      actorUserId:authz.actorId!,
      organizationId:authz.artifact!.organizationId,
      artifactId:id,
      vendorId:input.data.vendorId,
      channelId:input.data.channelId,
      independentEvidenceReference:input.data.independentEvidenceReference,
    },{allowSyntheticFixture:input.data.confirmedSyntheticSimulation===true});
    return Response.json({
      attestation,
      externallyVerifiedBySoftware:false,
      humanOutOfBandAttestation:attestation.method!=="SYNTHETIC_FIXTURE",
      fictionalSandboxOrigin:attestation.method==="SYNTHETIC_FIXTURE",
      paymentAuthorized:false,
    },{status:201,headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    if(error instanceof OriginAttestationError)
      return Response.json({error:error.code},{status:error.status});
    throw error;
  }
}
