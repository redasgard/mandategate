import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../db/pool";

export class PolicyProposalError extends Error {
  constructor(public readonly code: string, public readonly httpStatus=409) {
    super(code);
    this.name="PolicyProposalError";
  }
}
const fail=(code:string,status=409):never=>{throw new PolicyProposalError(code,status);};
const LIMIT_MAX=2_000_000_000;
const sha=(value:string)=>createHash("sha256").update(value).digest("hex");
const TTL_MS=7*24*60*60*1000;
const HASH=/^[a-f0-9]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROPOSAL_SOURCE=["ADMIN_MANUAL","PAID_HISTORY"] as const;
type Source=(typeof PROPOSAL_SOURCE)[number];

type ProposalSnapshot={
  id:string;organizationId:string;basePolicyId:string;baseLimitCents:number;
  proposedLimitCents:number;origin:Source;evidenceSha256:string;version:number;
  expiresAt:string;
};
export function digestPolicyProposal(snapshot:ProposalSnapshot) {
  return sha("mandategate/policy-proposal/v1\0"+JSON.stringify([
    snapshot.id,snapshot.organizationId,snapshot.basePolicyId,
    snapshot.baseLimitCents,snapshot.proposedLimitCents,snapshot.origin,
    snapshot.evidenceSha256,snapshot.version,snapshot.expiresAt,
  ]));
}
function validLimit(v:unknown):v is number {
  return typeof v==="number" && Number.isSafeInteger(v) && v>0 && v<=LIMIT_MAX;
}
async function admin(client:PoolClient,orgId:string,actorId:string) {
  const r=await client.query([
    "select 1 from organization_admin_memberships",
    "where organization_id=$1 and user_id=$2 and role='ADMIN' and active=true",
    "for share",
  ].join(" "),[orgId,actorId]);
  if(r.rowCount!==1)fail("POLICY_ORGANIZATION_NOT_FOUND",404);
}
async function lockOrganization(client:PoolClient,orgId:string) {
  // Serializes policy proposal/activation transactions for the same tenant.
  await client.query("select pg_advisory_xact_lock(hashtext($1))",["mandategate/policy/"+orgId]);
}
async function activePolicy(client:PoolClient,orgId:string) {
  const r=await client.query([
    "select id,name,auto_pay_max_amount_cents from policies",
    "where organization_id=$1 and active=true",
    "order by created_at desc,id desc for update",
  ].join(" "),[orgId]);
  if(r.rows.length!==1)fail("POLICY_ACTIVE_BASE_AMBIGUOUS");
  return {id:String(r.rows[0].id),name:String(r.rows[0].name),
    limitCents:Number(r.rows[0].auto_pay_max_amount_cents)};
}
async function paidEvidence(client:PoolClient,orgId:string) {
  // Imported PAID rows are untrusted historical observations. Dedup by the
  // normalized immutable row SHA and exclude inaccessible organizations.
  const r=await client.query([
    "select h.amount_cents,h.normalized_row_sha256,i.source_sha256",
    "from (select distinct on (h.normalized_row_sha256)",
    "h.amount_cents,h.normalized_row_sha256,h.import_id",
    "from ap_history_rows h join ap_imports i",
    "on i.id=h.import_id and i.organization_id=h.organization_id",
    "where h.organization_id=$1 and h.currency='USD' and h.status='PAID'",
    "order by h.normalized_row_sha256,i.created_at desc,i.id desc",
    "limit 201) h",
    "join ap_imports i on i.id=h.import_id",
    "order by h.normalized_row_sha256",
  ].join(" "),[orgId]);
  if(r.rows.length>200)fail("POLICY_HISTORY_TOO_LARGE");
  if(r.rows.length<3)fail("POLICY_HISTORY_INSUFFICIENT");
  const sorted=r.rows.map(x=>Number(x.amount_cents)).sort((a,b)=>a-b);
  if(sorted.some(x=>!validLimit(x)))fail("POLICY_HISTORY_INVALID");
  const median=sorted[Math.floor((sorted.length-1)/2)];
  const evidenceSha256=sha("mandategate/imported-paid-history/v1\0"+
    JSON.stringify(r.rows.map(x=>[
      String(x.normalized_row_sha256),Number(x.amount_cents),String(x.source_sha256),
    ])));
  return {median,sampleCount:r.rows.length,evidenceSha256};
}
export async function preparePolicyProposal(input:{
  organizationId:string;actorId:string;origin:Source;proposedLimitCents?:number;
}) {
  if(typeof input.organizationId!=="string"||!input.organizationId.trim()||
     !PROPOSAL_SOURCE.includes(input.origin))fail("POLICY_PROPOSAL_INVALID",422);
  const client=await pool.connect();
  try {
    await client.query("begin");
    await lockOrganization(client,input.organizationId);
    await admin(client,input.organizationId,input.actorId);
    const base=await activePolicy(client,input.organizationId);
    const pending=await client.query(
      "select id from policy_proposals where organization_id=$1 and status='PROPOSED' for update",
      [input.organizationId]);
    if(pending.rows.length)fail("POLICY_PROPOSAL_ALREADY_PENDING");
    const evidence=input.origin==="PAID_HISTORY"
      ? await paidEvidence(client,input.organizationId)
      : {sampleCount:0,median:null,evidenceSha256:sha("mandategate/manual-policy/v1\0"+base.id)};
    const proposed=input.origin==="PAID_HISTORY"?evidence.median:input.proposedLimitCents;
    if(!validLimit(proposed))throw new PolicyProposalError("POLICY_PROPOSAL_MUST_TIGHTEN",422);
    if(proposed>=base.limitCents)throw new PolicyProposalError("POLICY_PROPOSAL_MUST_TIGHTEN",422);
    const id=randomUUID(),expiresAt=new Date(Date.now()+TTL_MS);
    const version=1;
    const digest=digestPolicyProposal({
      id,organizationId:input.organizationId,basePolicyId:base.id,
      baseLimitCents:base.limitCents,proposedLimitCents:proposed,
      origin:input.origin,evidenceSha256:evidence.evidenceSha256,
      version,expiresAt:expiresAt.toISOString(),
    });
    await client.query([
      "insert into policy_proposals",
      "(id,organization_id,base_policy_id,base_limit_cents,proposed_limit_cents,",
      "origin,evidence_sha256,sample_count,sample_median_cents,proposal_digest,version,created_by_user_id,expires_at)",
      "values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
    ].join(" "),[
      id,input.organizationId,base.id,base.limitCents,proposed,input.origin,
      evidence.evidenceSha256,evidence.sampleCount,evidence.median,digest,
      version,input.actorId,expiresAt,
    ]);
    await client.query([
      "insert into policy_proposal_events",
      "(proposal_id,organization_id,actor_user_id,event_type,result_digest,explanation)",
      "values($1,$2,$3,'PREPARED',$4,$5)",
    ].join(" "),[id,input.organizationId,input.actorId,digest,
      input.origin==="PAID_HISTORY"
        ? "Prepared from untrusted imported PAID-history observations, no authority granted."
        : "Prepared manually by authorized admin, no policy authority granted."]);
    await client.query("commit");
    return {id,digest,proposedLimitCents:proposed,origin:input.origin,
      sampleCount:evidence.sampleCount,activePolicyChanged:false};
  } catch(error) {
    await client.query("rollback").catch(()=>undefined);
    throw error;
  } finally {client.release();}
}
export async function decidePolicyProposal(input:{
  id:string;actorId:string;action:"EDIT"|"ACTIVATE"|"REJECT";
  expectedDigest:string;explanation:string;proposedLimitCents?:number;
}) {
  if(!UUID.test(input.id)||!HASH.test(input.expectedDigest)||
     !["EDIT","ACTIVATE","REJECT"].includes(input.action)||
     typeof input.explanation!=="string"||input.explanation.trim().length<16||
     input.explanation.length>2000)fail("POLICY_CONFIRMATION_INVALID",422);
  const client=await pool.connect();
  try {
    await client.query("begin");
    const identity=await client.query(
      "select organization_id from policy_proposals where id=$1",[input.id]);
    if(!identity.rows[0])fail("POLICY_PROPOSAL_NOT_FOUND",404);
    const orgId=String(identity.rows[0].organization_id);
    await lockOrganization(client,orgId);
    await admin(client,orgId,input.actorId);
    const found=await client.query(
      "select * from policy_proposals where id=$1 and organization_id=$2 for update",
      [input.id,orgId]);
    const p=found.rows[0];
    if(!p || p.status!=="PROPOSED")fail("POLICY_PROPOSAL_NOT_PENDING");
    if(p.proposal_digest!==input.expectedDigest)
      fail("POLICY_PROPOSAL_SNAPSHOT_CHANGED");
    if(input.action!=="REJECT" && new Date(p.expires_at).getTime()<=Date.now())
      fail("POLICY_PROPOSAL_EXPIRED");
    const prevDigest=String(p.proposal_digest);
    let nextDigest=prevDigest;
    let activatedPolicyId:string|null=null;
    if(input.action!=="REJECT") {
      const current=await activePolicy(client,orgId);
      if(current.id!==p.base_policy_id ||
         current.limitCents!==Number(p.base_limit_cents))
        fail("POLICY_PROPOSAL_STALE");
      if(input.action==="EDIT") {
        const revised=input.proposedLimitCents;
        if(!validLimit(revised))throw new PolicyProposalError("POLICY_EDIT_MUST_CHANGE_TIGHTER_LIMIT",422);
        if(revised>=current.limitCents||revised===Number(p.proposed_limit_cents))
          throw new PolicyProposalError("POLICY_EDIT_MUST_CHANGE_TIGHTER_LIMIT",422);
        const version=Number(p.version)+1;
        nextDigest=digestPolicyProposal({
          id:input.id,organizationId:orgId,basePolicyId:current.id,
          baseLimitCents:current.limitCents,proposedLimitCents:revised,
          origin:p.origin,evidenceSha256:p.evidence_sha256,version,
          expiresAt:new Date(p.expires_at).toISOString(),
        });
        await client.query([
          "update policy_proposals set proposed_limit_cents=$2,version=$3,",
          "proposal_digest=$4,updated_at=now()",
          "where id=$1 and status='PROPOSED'",
        ].join(" "),[input.id,revised,version,nextDigest]);
      } else {
        const nextLimit=Number(p.proposed_limit_cents);
        if(!validLimit(nextLimit)||nextLimit>=current.limitCents)
          fail("POLICY_PROPOSAL_MUST_TIGHTEN");
        const retired=await client.query(
          "update policies set active=false where id=$1 and organization_id=$2 and active=true returning id",
          [current.id,orgId]);
        if(retired.rowCount!==1)fail("POLICY_PROPOSAL_STALE");
        activatedPolicyId=randomUUID();
        await client.query([
          "insert into policies(id,organization_id,name,auto_pay_max_amount_cents,active)",
          "values($1,$2,$3,$4,true)",
        ].join(" "),[activatedPolicyId,orgId,current.name,nextLimit]);
      }
    }
    if(input.action!=="EDIT") {
      await client.query([
        "update policy_proposals set status=$2,decided_by_user_id=$3,",
        "decision_explanation=$4,decided_at=now(),activated_policy_id=$5,updated_at=now()",
        "where id=$1 and status='PROPOSED'",
      ].join(" "),[input.id,input.action==="ACTIVATE"?"ACTIVATED":"REJECTED",
        input.actorId,input.explanation.trim(),activatedPolicyId]);
    }
    const eventType=input.action==="EDIT"?"EDITED":
      input.action==="ACTIVATE"?"ACTIVATED":"REJECTED";
    await client.query([
      "insert into policy_proposal_events",
      "(proposal_id,organization_id,actor_user_id,event_type,prior_digest,result_digest,explanation)",
      "values($1,$2,$3,$4,$5,$6,$7)",
    ].join(" "),[input.id,orgId,input.actorId,eventType,prevDigest,nextDigest,input.explanation.trim()]);
    await client.query("commit");
    return {id:input.id,action:input.action,digest:nextDigest,
      activatedPolicyId,activePolicyChanged:input.action==="ACTIVATE"};
  } catch(error) {
    await client.query("rollback").catch(()=>undefined);
    throw error;
  } finally {client.release();}
}
export async function readPolicyConsole(actorId:string) {
  const [active,proposals,samples]=await Promise.all([
    pool.query([
      "select p.id,p.organization_id,o.name as organization_name,p.name as policy_name,",
      "p.auto_pay_max_amount_cents,p.created_at",
      "from policies p join organizations o on o.id=p.organization_id",
      "where p.active=true and exists (select 1 from organization_admin_memberships m",
      "where m.organization_id=p.organization_id and m.user_id=$1",
      "and m.role='ADMIN' and m.active=true)",
      "order by o.name,p.created_at desc",
    ].join(" "),[actorId]),
    pool.query([
      "select pp.id,pp.organization_id,pp.base_policy_id,pp.base_limit_cents,",
      "pp.proposed_limit_cents,pp.origin,pp.sample_count,pp.sample_median_cents,",
      "pp.evidence_sha256,pp.proposal_digest,pp.version,pp.status,pp.created_at,pp.expires_at,",
      "pp.decided_at,pp.decision_explanation",
      "from policy_proposals pp",
      "where exists (select 1 from organization_admin_memberships m",
      "where m.organization_id=pp.organization_id and m.user_id=$1",
      "and m.role='ADMIN' and m.active=true)",
      "order by case when pp.status='PROPOSED' then 0 else 1 end,pp.created_at desc limit 100",
    ].join(" "),[actorId]),
    pool.query([
      "with dedup as (select distinct on (h.organization_id,h.normalized_row_sha256)",
      "h.organization_id,h.amount_cents",
      "from ap_history_rows h join ap_imports i on i.id=h.import_id and i.organization_id=h.organization_id",
      "join organization_admin_memberships m on m.organization_id=h.organization_id",
      "and m.user_id=$1 and m.role='ADMIN' and m.active=true",
      "where h.status='PAID' and h.currency='USD'",
      "order by h.organization_id,h.normalized_row_sha256,i.created_at desc,i.id desc)",
      "select organization_id,count(*)::int as n,",
      "percentile_disc(0.5) within group (order by amount_cents)::int as median_cents",
      "from dedup group by organization_id",
    ].join(" "),[actorId]),
  ]);
  const stats=new Map(samples.rows.map(r=>[
    String(r.organization_id),{count:Number(r.n),medianCents:Number(r.median_cents)},
  ]));
  return {
    policies:active.rows.map(p=>({
      id:String(p.id),organizationId:String(p.organization_id),
      organizationName:String(p.organization_name),name:String(p.policy_name),
      limitCents:Number(p.auto_pay_max_amount_cents),
      paidHistory:stats.get(String(p.organization_id))??{count:0,medianCents:0},
    })),
    proposals:proposals.rows.map(p=>({
      id:String(p.id),organizationId:String(p.organization_id),
      basePolicyId:String(p.base_policy_id),
      baseLimitCents:Number(p.base_limit_cents),proposedLimitCents:Number(p.proposed_limit_cents),
      origin:String(p.origin),sampleCount:Number(p.sample_count),
      sampleMedianCents:p.sample_median_cents===null?null:Number(p.sample_median_cents),
      evidenceSha256:String(p.evidence_sha256),digest:String(p.proposal_digest),
      status:String(p.status),version:Number(p.version),
      expiresAt:new Date(p.expires_at).toISOString(),
      decisionExplanation:p.decision_explanation===null?null:String(p.decision_explanation),
    })),
  };
}
