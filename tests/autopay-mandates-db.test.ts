import {createHash,randomUUID} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {pool} from "../src/db/pool";
import {listAutonomousCandidates,previewAutonomousDispatch} from "../src/autonomy/dispatch";
import {PostgresExecutionStore} from "../src/payments/executor/postgres-store";

const org="auto_ci_"+randomUUID(),vendor="vendor_"+randomUUID();
const destination="destination_"+randomUUID(),policy="policy_"+randomUUID();
const req=randomUUID(),logical=randomUUID(),grant=randomUUID();
let actor="";
const sha=(s:string)=>createHash("sha256").update(s).digest("hex");

beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL??"postgresql://invalid@invalid/db");
  if(!["127.0.0.1","localhost"].includes(url.hostname)||
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
const ownCandidates=async()=> (await listAutonomousCandidates(new Date(),50))
  .filter(x=>x.organizationId===org);
const ownPreview=async()=> (await previewAutonomousDispatch(new Date(),50))
  .filter(x=>x.organizationId===org);


describe("Autonomous AP requires exact, revocable prior standing authority",()=>{
  it("does not infer payment consent from an ALLOW or an active policy alone",async()=>{
    expect(await ownCandidates()).toEqual([]);
    expect(await ownPreview()).toEqual([]);
  });
  it("finds one exact scoped mandate, and revalidates current payment authority",async()=>{
    await pool.query([
      "insert into autopay_mandates",
      "(id,organization_id,vendor_id,destination_id,policy_id,source,max_amount_cents,",
      "approved_by_user_id,approval_digest,active,expires_at)",
      "values($1,$2,$3,$4,$5,'agent_api',2000,$6,$7,true,now()+interval '1 day')",
    ].join(" "),[grant,org,vendor,destination,policy,actor,sha("isolated synthetic mandate")]);
    const candidates=await ownCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      requestId:req,logicalPaymentId:logical,authorization:"STANDING_MANDATE",
      amountCents:1000,currency:"USD",
    });
    const preview=await ownPreview();
    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({preview:"WOULD_DISPATCH",reason:"CURRENT_AUTHORITY"});
    const records=await pool.query(
      "select count(*)::int as n from payment_executions where logical_payment_id=$1",[logical]);
    expect(records.rows[0].n).toBe(0);
  });
  it("cannot dispatch after recipient, grantor, policy or grant expiry changes",async()=>{
    const empty=async()=>expect(await ownCandidates()).toHaveLength(0);
    // Advance the evaluation clock; don't violate the immutable validity
    // constraint by backdating a real mandate's expiry before creation.
    const expired=(await listAutonomousCandidates(new Date(Date.now()+2*24*3600*1000),50))
      .filter(x=>x.organizationId===org);
    expect(expired).toHaveLength(0);
    await pool.query("update organization_admin_memberships set active=false where organization_id=$1 and user_id=$2",[org,actor]);
    await empty();
    await pool.query("update organization_admin_memberships set active=true where organization_id=$1 and user_id=$2",[org,actor]);
    await pool.query("update policies set active=false where id=$1",[policy]);
    await empty();
    await pool.query("update policies set active=true where id=$1",[policy]);
    await pool.query("update vendor_destinations set trusted=false where id=$1",[destination]);
    await empty();
    await pool.query("update vendor_destinations set trusted=true where id=$1",[destination]);
    await pool.query("update autopay_mandates set max_amount_cents=100 where id=$1",[grant]);
    await empty();
    await pool.query("update autopay_mandates set max_amount_cents=2000 where id=$1",[grant]);
    expect(await ownCandidates()).toHaveLength(1);
  });
  it("does not enqueue the same logical payment after durable execution identity exists",async()=>{
    const store=new PostgresExecutionStore();
    const authoritative=await store.getAuthoritativePayment(req);
    expect(authoritative?.logicalPaymentId).toBe(logical);
    await store.getOrCreateExecution(authoritative!);
    expect(await ownCandidates()).toEqual([]);
    const rows=await pool.query(
      "select status from payment_executions where logical_payment_id=$1",[logical]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].status).toBe("READY");
  });
});
