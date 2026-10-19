import {createHash,randomUUID} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {pool} from "../src/db/pool";
import {listAutonomousCandidates,previewAutonomousDispatch} from "../src/autonomy/dispatch";
import {PostgresExecutionStore} from "../src/payments/executor/postgres-store";
import {AutopayMandateError,decideAutopayMandate,
  prepareAutopayMandate,readAutopayMandateConsole} from "../src/autonomy/mandates";

const org="auto_ci_"+randomUUID(),vendor="vendor_"+randomUUID();
const destination="destination_"+randomUUID(),policy="policy_"+randomUUID();
const req=randomUUID(),logical=randomUUID();
const explanation="Reviewed the exact trusted recipient, vendor and maximum for CI-only tests.";
let actor="",grantId="",digest="";
let requestAfterGrant="",logicalAfterGrant="";
let createdAt="";
const sha=(s:string)=>createHash("sha256").update(s).digest("hex");

beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL??"postgresql://invalid@invalid/db");
  if(!["127.0.0.1","localhost"].includes(url.hostname)||
     url.pathname!=="/mandategate"||
     process.env.MANDATEGATE_DISABLE_PAYMENTS!=="1"||
     process.env.CI!=="true")
    throw Error("AUTOPAY_TEST_REQUIRES_DISPOSABLE_NONPAYING_POSTGRES");
  const users=await pool.query('select id from "user" where email=$1',[process.env.DEMO_ADMIN_EMAIL]);
  if(users.rows.length!==1)throw Error("SYNTHETIC_ADMIN_SEED_REQUIRED");
  actor=String(users.rows[0].id);
  await pool.query("insert into organizations(id,name) values($1,'Autonomy isolated test')",[org]);
  await pool.query(
    "insert into vendors(id,organization_id,name,normal_max_amount_cents) values($1,$2,'Test vendor',5000)",
    [vendor,org]);
  await pool.query(
    "insert into vendor_destinations(id,vendor_id,destination,trusted) values($1,$2,'autopay@test.invalid',true)",
    [destination,vendor]);
  await pool.query(
    "insert into policies(id,organization_id,name,auto_pay_max_amount_cents,active) values($1,$2,'Auto limit',5000,true)",
    [policy,org]);
  await pool.query(
    "insert into organization_admin_memberships(user_id,organization_id,role,active) values($1,$2,'ADMIN',true)",
    [actor,org]);
  await pool.query([
    "insert into payment_requests",
    "(id,logical_payment_id,organization_id,vendor_id,invoice_number,",
    "amount_cents,currency,requested_destination,status,source)",
    "values($1,$2,$3,$4,'AUTO-TEST-1',1000,'USD','autopay@test.invalid','ALLOWED','agent_api')",
  ].join(" "),[req,logical,org,vendor]);
  await pool.query([
    "insert into payment_decisions(id,payment_request_id,outcome,reason_codes,evidence)",
    "values($1,$2,'ALLOW','[\"WITHIN_TRUSTED_BASELINE\"]'::jsonb,'[]'::jsonb)",
  ].join(" "),[randomUUID(),req]);
});
afterAll(async()=>{await pool.end();});
const ownCandidates=async(now=new Date())=>
  (await listAutonomousCandidates(now,50)).filter(x=>x.organizationId===org);
const ownPreview=async()=> (await previewAutonomousDispatch(new Date(),50))
  .filter(x=>x.organizationId===org);
const act=(partial:Record<string,unknown>={})=>decideAutopayMandate({
  id:grantId,actorId:actor,expectedDigest:digest,action:"ACTIVATE",
  confirmation:"ENABLE AUTOPAY",explanation,...partial,
} as Parameters<typeof decideAutopayMandate>[0]);

describe("S10 autonomous mandate human-grant lifecycle and payment isolation",()=>{
  it("refuses to treat ALLOW or policy cap as unattended-payment consent",async()=>{
    expect(await ownCandidates()).toEqual([]);
    expect(await ownPreview()).toEqual([]);
    await expect(prepareAutopayMandate({
      organizationId:org,vendorId:vendor,actorId:randomUUID(),
      maxAmountCents:2000,validityDays:7,
    })).rejects.toMatchObject({code:"AUTOPAY_ORGANIZATION_NOT_FOUND"});
    await expect(prepareAutopayMandate({
      organizationId:org,vendorId:vendor,actorId:actor,
      maxAmountCents:5001,validityDays:7,
    })).rejects.toMatchObject({code:"AUTOPAY_CAP_EXCEEDS_CURRENT_AUTHORITY"});
  });
  it("prepares an INERT, scoped, immutable record with no grant event",async()=>{
    const prepared=await prepareAutopayMandate({
      organizationId:org,vendorId:vendor,actorId:actor,
      maxAmountCents:2000,validityDays:7,
    });
    expect(prepared).toMatchObject({
      state:"PREPARED",active:false,paymentExecuted:false,
      organizationId:org,vendorId:vendor,
      destination:"autopay@test.invalid",maxAmountCents:2000,
    });
    grantId=prepared.id;digest=prepared.digest;
    const q=await pool.query("select active,created_at from autopay_mandates where id=$1",[grantId]);
    expect(q.rows[0].active).toBe(false);
    createdAt=new Date(q.rows[0].created_at).toISOString();
    expect(await ownCandidates()).toEqual([]);
    const console=await readAutopayMandateConsole(actor);
    expect(console.mandates.find(x=>x.id===grantId)?.state).toBe("PREPARED");
    expect(console.vendors.some(x=>x.id===vendor)).toBe(true);
    expect((await pool.query("select id from autopay_mandate_events where mandate_id=$1",[grantId])).rows)
      .toHaveLength(0);
    await expect(pool.query("update autopay_mandates set active=true where id=$1",[grantId]))
      .rejects.toThrow("AUTOPAY_GRANT_EVENT_REQUIRED");
    await expect(pool.query("update autopay_mandates set max_amount_cents=1 where id=$1",[grantId]))
      .rejects.toThrow("AUTOPAY_MANDATE_SCOPE_IMMUTABLE");
    await expect(pool.query("delete from autopay_mandates where id=$1",[grantId]))
      .rejects.toThrow("AUTOPAY_MANDATE_IMMUTABLE");
  });
  it("blocks guessed digest, foreign approver, revoked actor and stale trusted recipient",async()=>{
    await expect(act({expectedDigest:"f".repeat(64)}))
      .rejects.toMatchObject({code:"AUTOPAY_SNAPSHOT_CHANGED"});
    await expect(act({actorId:randomUUID()}))
      .rejects.toMatchObject({code:"AUTOPAY_ORGANIZATION_NOT_FOUND"});
    await pool.query("update organization_admin_memberships set active=false where user_id=$1 and organization_id=$2",[actor,org]);
    try{
      await expect(act()).rejects.toMatchObject({code:"AUTOPAY_ORGANIZATION_NOT_FOUND"});
    }finally{
      await pool.query("update organization_admin_memberships set active=true where user_id=$1 and organization_id=$2",[actor,org]);
    }
    await pool.query("update vendor_destinations set destination='changed@test.invalid' where id=$1",[destination]);
    try{
      await expect(act()).rejects.toMatchObject({code:"AUTOPAY_SNAPSHOT_CHANGED"});
    }finally{
      await pool.query("update vendor_destinations set destination='autopay@test.invalid' where id=$1",[destination]);
    }
    const unchanged=await pool.query("select active from autopay_mandates where id=$1",[grantId]);
    expect(unchanged.rows[0].active).toBe(false);
  });
  it("atomically grants current exact authority with one immutable event and no payout",async()=>{
    const result=await act();
    expect(result).toMatchObject({state:"ACTIVE",active:true,paymentExecuted:false});
    await expect(act()).rejects.toMatchObject({code:"AUTOPAY_NOT_PREPARED"});
    const event=await pool.query(
      "select event_type,mandate_digest,actor_user_id from autopay_mandate_events where mandate_id=$1",[grantId]);
    expect(event.rows).toMatchObject([{
      event_type:"GRANTED",mandate_digest:digest,actor_user_id:actor,
    }]);
    // Pre-grant ALLOW must NEVER become payable retroactively.
    expect(await ownCandidates()).toEqual([]);
    requestAfterGrant=randomUUID();logicalAfterGrant=randomUUID();
    await pool.query([
      "insert into payment_requests",
      "(id,logical_payment_id,organization_id,vendor_id,invoice_number,",
      "amount_cents,currency,requested_destination,status,source)",
      "values($1,$2,$3,$4,'AUTO-TEST-POST-GRANT',1000,'USD',",
      "'autopay@test.invalid','ALLOWED','agent_api')",
    ].join(" "),[requestAfterGrant,logicalAfterGrant,org,vendor]);
    await pool.query([
      "insert into payment_decisions(id,payment_request_id,outcome,reason_codes,evidence)",
      "values($1,$2,'ALLOW','[\"WITHIN_TRUSTED_BASELINE\"]'::jsonb,'[]'::jsonb)",
    ].join(" "),[randomUUID(),requestAfterGrant]);
    const candidates=await ownCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      requestId:requestAfterGrant,authorization:"STANDING_MANDATE",amountCents:1000,
    });
    expect((await ownPreview())[0]).toMatchObject({
      preview:"WOULD_DISPATCH",reason:"CURRENT_AUTHORITY",
    });
    expect((await pool.query(
      "select count(*)::int as n from payment_executions where logical_payment_id=$1",[logicalAfterGrant]
    )).rows[0].n).toBe(0);
  });
  it("drops eligibility after time expiry, admin revocation, policy or receiver change",async()=>{
    const empty=async()=>expect(await ownCandidates()).toEqual([]);
    expect(await ownCandidates(new Date(Date.now()+8*86400000))).toEqual([]);
    await pool.query("update organization_admin_memberships set active=false where user_id=$1 and organization_id=$2",[actor,org]);
    await empty();
    await pool.query("update organization_admin_memberships set active=true where user_id=$1 and organization_id=$2",[actor,org]);
    await pool.query("update policies set active=false where id=$1",[policy]);
    await empty();
    await pool.query("update policies set active=true where id=$1",[policy]);
    await pool.query("update vendor_destinations set trusted=false where id=$1",[destination]);
    await empty();
    await pool.query("update vendor_destinations set trusted=true where id=$1",[destination]);
    await pool.query("update vendors set normal_max_amount_cents=900 where id=$1",[vendor]);
    await empty();
    await pool.query("update vendors set normal_max_amount_cents=5000 where id=$1",[vendor]);
    expect(await ownCandidates()).toHaveLength(1);
    // Once an execution identity exists, no second automatic dispatch is selected.
    const store=new PostgresExecutionStore();
    const current=await store.getAuthoritativePayment(requestAfterGrant);
    expect(current?.logicalPaymentId).toBe(logicalAfterGrant);
    await store.getOrCreateExecution(current!);
    expect(await ownCandidates()).toEqual([]);
    expect((await pool.query(
      "select status from payment_executions where logical_payment_id=$1",[logicalAfterGrant]
    )).rows[0].status).toBe("READY");
  });
  it("revokes a granted mandate permanently, retaining immutable audit evidence",async()=>{
    await expect(decideAutopayMandate({
      id:grantId,actorId:actor,expectedDigest:digest,action:"REVOKE",
      confirmation:"REVOKE",explanation,
    })).resolves.toMatchObject({state:"REVOKED",active:false,paymentExecuted:false});
    expect(await ownCandidates()).toEqual([]);
    const records=await pool.query(
      "select event_type from autopay_mandate_events where mandate_id=$1 order by created_at",
      [grantId]);
    expect(records.rows.map(r=>r.event_type).sort()).toEqual(["GRANTED","REVOKED"]);
    await expect(pool.query("update autopay_mandates set active=true where id=$1",[grantId]))
      .rejects.toThrow("AUTOPAY_REVOKED_MANDATE_TERMINAL");
    await expect(pool.query("update autopay_mandate_events set explanation='tampered' where mandate_id=$1",[grantId]))
      .rejects.toThrow();
    await expect(act()).rejects.toMatchObject({code:"AUTOPAY_NOT_PREPARED"});
    const latest=await readAutopayMandateConsole(actor);
    expect(latest.mandates.find(x=>x.id===grantId)?.state).toBe("REVOKED");
    expect(new Date(createdAt).valueOf()).toBeLessThan(Date.now());
  });
});
