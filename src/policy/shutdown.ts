import {createHash} from "node:crypto";
import {pool} from "../db/pool";
import {PolicyProposalError} from "./proposals";

const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
export function policyShutdownDigest(policy:{
  id:string;organizationId:string;limitCents:number;createdAt:Date|string;
}) {
  return hash("mandategate/policy-shutdown/v1\0"+JSON.stringify([
    policy.id,policy.organizationId,policy.limitCents,
    new Date(policy.createdAt).toISOString(),
  ]));
}
export async function disableActivePolicy(input:{
  id:string;actorId:string;expectedDigest:string;explanation:string;confirmation:"DISABLE";
}) {
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(input.id)||
     !/^[a-f0-9]{64}$/.test(input.expectedDigest)||
     input.explanation.trim().length<16||input.explanation.length>2000||
     input.confirmation!=="DISABLE")
    throw new PolicyProposalError("POLICY_SHUTDOWN_INVALID",422);
  const client=await pool.connect();
  try{
    await client.query("begin");
    const identity=await client.query("select organization_id from policies where id=$1",[input.id]);
    if(identity.rows.length!==1)throw new PolicyProposalError("POLICY_NOT_FOUND",404);
    const orgId=String(identity.rows[0].organization_id);
    await client.query("select pg_advisory_xact_lock(hashtext($1))",["mandategate/policy/"+orgId]);
    const membership=await client.query([
      "select 1 from organization_admin_memberships",
      "where organization_id=$1 and user_id=$2 and role='ADMIN' and active=true for share",
    ].join(" "),[orgId,input.actorId]);
    if(membership.rows.length!==1)throw new PolicyProposalError("POLICY_NOT_FOUND",404);
    const rows=await client.query([
      "select id,organization_id,auto_pay_max_amount_cents,created_at,active",
      "from policies where id=$1 and organization_id=$2 for update",
    ].join(" "),[input.id,orgId]);
    const row=rows.rows[0];
    if(!row || row.active!==true)throw new PolicyProposalError("POLICY_NOT_ACTIVE");
    const limitCents=Number(row.auto_pay_max_amount_cents);
    const digest=policyShutdownDigest({
      id:row.id,organizationId:orgId,limitCents,createdAt:row.created_at,
    });
    if(digest!==input.expectedDigest)throw new PolicyProposalError("POLICY_SHUTDOWN_SNAPSHOT_CHANGED");
    const other=await client.query(
      "select id from policies where organization_id=$1 and active=true for update",[orgId]);
    if(other.rows.length!==1||other.rows[0].id!==input.id)
      throw new PolicyProposalError("POLICY_ACTIVE_BASE_AMBIGUOUS");
    await client.query("update policies set active=false where id=$1 and active=true",[input.id]);
    await client.query([
      "insert into policy_shutdown_events",
      "(organization_id,policy_id,actor_user_id,policy_snapshot_sha256,old_limit_cents,explanation)",
      "values($1,$2,$3,$4,$5,$6)",
    ].join(" "),[orgId,input.id,input.actorId,digest,limitCents,input.explanation.trim()]);
    await client.query("commit");
    return {policyId:input.id,organizationId:orgId,disabled:true,autoPayEnabled:false};
  }catch(error){
    await client.query("rollback").catch(()=>undefined);throw error;
  }finally{client.release();}
}
