import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/pool";
import {disableActivePolicy,policyShutdownDigest} from "../src/policy/shutdown";
import {
  decidePolicyProposal, preparePolicyProposal, readPolicyConsole,
} from "../src/policy/proposals";

const org="policy_ci_"+randomUUID();
const vendor="policy_vendor_"+randomUUID();
const oldPolicy="policy_"+randomUUID();
const explanation="Reviewed historical evidence and chose a strictly lower cap.";
let actor="";
const createdImports:string[]=[];
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");

async function cap() {
  const r=await pool.query(
    "select id,auto_pay_max_amount_cents from policies where organization_id=$1 and active=true",
    [org]);
  expect(r.rows.length).toBe(1);
  return {id:String(r.rows[0].id),limit:Number(r.rows[0].auto_pay_max_amount_cents)};
}
beforeAll(async()=>{
  // These tests intentionally mutate only an isolated local PostgreSQL instance.
  // Never run against Neon, shared databases or a payout-capable service.
  const db = new URL(process.env.DATABASE_URL ?? "postgresql://invalid:invalid@invalid/invalid");
  if(!["localhost","127.0.0.1"].includes(db.hostname) ||
     process.env.MANDATEGATE_DISABLE_PAYMENTS!=="1" || process.env.CI!=="true")
    throw Error("POLICY_DB_TEST_REQUIRES_DISPOSABLE_CI");
  const owners=await pool.query('select id from "user" where email=$1',[process.env.DEMO_ADMIN_EMAIL]);
  if(owners.rows.length!==1)throw Error("POLICY_TEST_NEEDS_SYNTHETIC_ADMIN");
  actor=String(owners.rows[0].id);
  await pool.query("insert into organizations(id,name) values($1,'Policy test organization')",[org]);
  await pool.query("insert into vendors(id,organization_id,name,normal_max_amount_cents) values($1,$2,'Policy test vendor',100000)",[vendor,org]);
  await pool.query("insert into policies(id,organization_id,name,auto_pay_max_amount_cents,active) values($1,$2,'Test auto-pay',50000,true)",[oldPolicy,org]);
  await pool.query("insert into organization_admin_memberships(user_id,organization_id,role,active) values($1,$2,'ADMIN',true)",[actor,org]);
});
afterAll(async()=>{await pool.end();});
// PostgreSQL test container is disposable. Immutable proposal events must
// NOT be deleted as test cleanup or application maintenance.
describe("S8 consequential policy proposal lifecycle on PostgreSQL 18",()=>{
  it("keeps proposal inert, forces exact digest on edits, activates strictly narrower cap once",async()=>{
    const first=await preparePolicyProposal({
      actorId:actor,organizationId:org,origin:"ADMIN_MANUAL",proposedLimitCents:30000,
    });
    expect(first).toMatchObject({proposedLimitCents:30000,activePolicyChanged:false,origin:"ADMIN_MANUAL"});
    expect((await cap()).limit).toBe(50000);
    await expect(preparePolicyProposal({
      actorId:actor,organizationId:org,origin:"ADMIN_MANUAL",proposedLimitCents:29000,
    })).rejects.toThrow("POLICY_PROPOSAL_ALREADY_PENDING");
    await expect(decidePolicyProposal({
      id:first.id,actorId:actor,action:"ACTIVATE",expectedDigest:"0".repeat(64),
      explanation,
    })).rejects.toThrow("POLICY_PROPOSAL_SNAPSHOT_CHANGED");
    const edited=await decidePolicyProposal({
      id:first.id,actorId:actor,action:"EDIT",expectedDigest:first.digest,
      proposedLimitCents:25000,explanation,
    });
    expect(edited.digest).not.toEqual(first.digest);
    expect((await cap()).limit).toBe(50000);
    await expect(decidePolicyProposal({
      id:first.id,actorId:actor,action:"ACTIVATE",expectedDigest:first.digest,explanation,
    })).rejects.toThrow("POLICY_PROPOSAL_SNAPSHOT_CHANGED");
    const activated=await decidePolicyProposal({
      id:first.id,actorId:actor,action:"ACTIVATE",expectedDigest:edited.digest,explanation,
    });
    expect(activated.activePolicyChanged).toBe(true);
    expect((await cap()).limit).toBe(25000);
    expect((await cap()).id).not.toBe(oldPolicy);
    await expect(decidePolicyProposal({
      id:first.id,actorId:actor,action:"ACTIVATE",expectedDigest:edited.digest,explanation,
    })).rejects.toThrow("POLICY_PROPOSAL_NOT_PENDING");
    const rows=await pool.query(
      "select event_type from policy_proposal_events where proposal_id=$1 order by occurred_at,id",
      [first.id]);
    expect(rows.rows.map(r=>r.event_type).sort()).toEqual(["ACTIVATED","EDITED","PREPARED"]);
    const original=await pool.query("select active from policies where id=$1",[oldPolicy]);
    expect(original.rows[0].active).toBe(false);
  });
  it("blocks unauthorized or revoked admins, rejects stale/expired proposals without changing policy",async()=>{
    const pending=await preparePolicyProposal({
      actorId:actor,organizationId:org,origin:"ADMIN_MANUAL",proposedLimitCents:20000,
    });
    await expect(decidePolicyProposal({
      id:pending.id,actorId:randomUUID(),action:"ACTIVATE",
      expectedDigest:pending.digest,explanation,
    })).rejects.toThrow("POLICY_ORGANIZATION_NOT_FOUND");
    await pool.query(
      "update organization_admin_memberships set active=false where user_id=$1 and organization_id=$2",
      [actor,org]);
    try{
      await expect(decidePolicyProposal({
        id:pending.id,actorId:actor,action:"ACTIVATE",
        expectedDigest:pending.digest,explanation,
      })).rejects.toThrow("POLICY_ORGANIZATION_NOT_FOUND");
      expect((await readPolicyConsole(actor)).policies.some(p=>p.organizationId===org)).toBe(false);
    }finally{
      await pool.query(
        "update organization_admin_memberships set active=true where user_id=$1 and organization_id=$2",
        [actor,org]);
    }
    await pool.query(
      "update policy_proposals set expires_at=now()-interval '1 minute' where id=$1",
      [pending.id]);
    await expect(decidePolicyProposal({
      id:pending.id,actorId:actor,action:"ACTIVATE",
      expectedDigest:pending.digest,explanation,
    })).rejects.toThrow("POLICY_PROPOSAL_EXPIRED");
    const rejected=await decidePolicyProposal({
      id:pending.id,actorId:actor,action:"REJECT",
      expectedDigest:pending.digest,explanation,
    });
    expect(rejected.activePolicyChanged).toBe(false);
    expect((await cap()).limit).toBe(25000);
  });
  it("infers only a narrower suggested limit from distinct imported PAID observations",async()=>{
    const importId=randomUUID();
    createdImports.push(importId);
    const source=Buffer.from("synthetic CI-only paid historical rows");
    const sourceSha=digest(source.toString());
    await pool.query([
      "insert into ap_imports",
      "(id,organization_id,imported_by_user_id,source_sha256,source_bytes,",
      "source_record_count,accepted_row_count,quarantine_count,duplicate_count,ignored_columns)",
      "values($1,$2,$3,$4,$5,3,3,0,0,'[]'::jsonb)",
    ].join(" "),[importId,org,actor,sourceSha,source]);
    for(const [i,cents] of [10000,12000,14000].entries()){
      await pool.query([
        "insert into ap_history_rows",
        "(organization_id,import_id,source_row_number,normalized_row_sha256,",
        "vendor_id,vendor_name,invoice_number,invoice_date,amount_cents,currency,status)",
        "values($1,$2,$3,$4,$5,'Policy test vendor',$6,'2026-10-01',$7,'USD','PAID')",
      ].join(" "),[org,importId,i+2,digest("row"+i),vendor,"PAID-TEST-"+i,cents]);
    }
    const listing=await readPolicyConsole(actor);
    expect(listing.policies.find(p=>p.organizationId===org)?.paidHistory)
      .toEqual({count:3,medianCents:12000});
    const proposed=await preparePolicyProposal({
      actorId:actor,organizationId:org,origin:"PAID_HISTORY",
    });
    expect(proposed).toMatchObject({
      origin:"PAID_HISTORY",sampleCount:3,proposedLimitCents:12000,activePolicyChanged:false,
    });
    expect((await cap()).limit).toBe(25000);
    const res=await decidePolicyProposal({
      id:proposed.id,actorId:actor,action:"REJECT",
      expectedDigest:proposed.digest,explanation,
    });
    expect(res.activePolicyChanged).toBe(false);
    expect((await cap()).limit).toBe(25000);
    await expect(preparePolicyProposal({
      actorId:actor,organizationId:org,origin:"ADMIN_MANUAL",proposedLimitCents:30000,
    })).rejects.toThrow("POLICY_PROPOSAL_MUST_TIGHTEN");
    const payout=await pool.query([
      "select count(*)::int as n from payment_executions e",
      "join payment_requests pr on pr.id=e.payment_request_id",
      "where pr.organization_id=$1",
    ].join(" "),[org]);
    expect(payout.rows[0].n).toBe(0);
  });
  it("permanently shuts off active standing authority with exact admin confirmation and immutable evidence",async()=>{
    const active=await pool.query(
      "select id,organization_id,auto_pay_max_amount_cents,created_at from policies where organization_id=$1 and active=true",
      [org]);
    expect(active.rows.length).toBe(1);
    const p=active.rows[0], policyId=String(p.id);
    const digest=policyShutdownDigest({
      id:policyId,organizationId:org,limitCents:Number(p.auto_pay_max_amount_cents),
      createdAt:p.created_at,
    });
    const params={id:policyId,actorId:actor,expectedDigest:digest,
      explanation:"Emergency stop while payment data is independently verified.",
      confirmation:"DISABLE" as const};
    await expect(disableActivePolicy({...params,expectedDigest:"a".repeat(64)}))
      .rejects.toThrow("POLICY_SHUTDOWN_SNAPSHOT_CHANGED");
    await expect(disableActivePolicy({...params,actorId:randomUUID()}))
      .rejects.toThrow("POLICY_NOT_FOUND");
    const disabled=await disableActivePolicy(params);
    expect(disabled).toMatchObject({disabled:true,autoPayEnabled:false,policyId});
    const after=await pool.query("select count(*)::int as n from policies where organization_id=$1 and active=true",[org]);
    expect(after.rows[0].n).toBe(0);
    await expect(disableActivePolicy(params)).rejects.toThrow("POLICY_NOT_ACTIVE");
    const evidence=await pool.query(
      "select policy_snapshot_sha256,old_limit_cents,actor_user_id from policy_shutdown_events where policy_id=$1",
      [policyId]);
    expect(evidence.rows).toHaveLength(1);
    expect(evidence.rows[0]).toMatchObject({
      policy_snapshot_sha256:digest,old_limit_cents:25000,actor_user_id:actor,
    });
    const pay=await pool.query(
      "select count(*)::int as n from payment_requests where organization_id=$1",[org]);
    expect(pay.rows[0].n).toBe(0);
  });

});
