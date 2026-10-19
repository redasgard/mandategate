import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {pool} from "../src/db/pool";
import {submitCanonicalPaymentRequest} from "../src/payments/submit";
import {prepareAutopayMandate,decideAutopayMandate} from "../src/autonomy/mandates";
import {runSyntheticAutopayQueue} from "../src/autonomy/synthetic-queue";
import type {PaymentGateway,PayoutSubmission} from "../src/payments/executor/types";

const org="queue_ci_"+randomUUID(),foreign="queue_ci_"+randomUUID();
const vendors=[randomUUID(),randomUUID()].map(x=>"vendor_"+x);
const destinations=[randomUUID(),randomUUID()].map(x=>"dest_"+x);
const policies=[randomUUID(),randomUUID()].map(x=>"policy_"+x);
const invoiceDestination="fictional-receiver@fake-provider.invalid";
const reason="Synthetic queue mandate confirmation, no external provider payments.";
let actor="",mandateId="",digest="",pregrant="";
const sent:PayoutSubmission[]=[];
const gateway:PaymentGateway={
  createSinglePayout:async p=>{sent.push(p);return {payoutBatchId:"FAKE-"+randomUUID()};},
  getBatchItem:async b=>({payoutBatchId:b,payoutItemId:"FAKE-"+randomUUID(),transactionStatus:"SUCCESS"}),
  getPayoutItem:async i=>({payoutBatchId:"FAKE",payoutItemId:i,transactionStatus:"SUCCESS"}),
};
async function request(tenant:string,vendor:string,invoice:string,amountCents=1000){
  const r=await submitCanonicalPaymentRequest({
    organizationId:tenant,vendorId:vendor,invoiceNumber:invoice,
    amountCents,currency:"USD",paymentDestination:invoiceDestination,
    idempotencyKey:"autonomy-test-"+randomUUID(),source:"agent_api",
  });
  expect(r.decision.outcome).toBe("ALLOW");
  return r.requestId;
}
async function grant(tenant:string,vendor:string,maxTotal:number,count:number){
  const g=await prepareAutopayMandate({
    organizationId:tenant,vendorId:vendor,actorId:actor,
    maxAmountCents:2000,maxTotalAmountCents:maxTotal,maxPaymentCount:count,
    validityDays:7,
  });
  await decideAutopayMandate({
    id:g.id,actorId:actor,expectedDigest:g.digest,action:"ACTIVATE",
    confirmation:"ENABLE AUTOPAY",explanation:reason,
  });
  return g;
}
beforeAll(async()=>{
  const db=new URL(process.env.DATABASE_URL??"postgresql://invalid@invalid/db");
  if(process.env.CI!=="true"||process.env.MANDATEGATE_DISABLE_PAYMENTS!=="1"||
     process.env.MANDATEGATE_RUNTIME_MODE!=="legacy"||
     db.hostname!=="127.0.0.1"||db.port!=="55432"||db.pathname!=="/mandategate")
    throw Error("AUTOPAY_QUEUE_TEST_ONLY_DISPOSABLE_CI");
  const u=await pool.query('select id from "user" where email=$1',[process.env.DEMO_ADMIN_EMAIL]);
  expect(u.rows).toHaveLength(1);actor=String(u.rows[0].id);
  for(let i=0;i<2;i++){
    const tenant=i===0?org:foreign;
    await pool.query("insert into organizations(id,name) values($1,'Synthetic queue org')",[tenant]);
    await pool.query("insert into vendors(id,organization_id,name,normal_max_amount_cents) values($1,$2,'Test vendor',20000)",[vendors[i],tenant]);
    await pool.query("insert into vendor_destinations(id,vendor_id,destination,trusted) values($1,$2,$3,true)",[destinations[i],vendors[i],invoiceDestination]);
    await pool.query("insert into policies(id,organization_id,name,auto_pay_max_amount_cents,active) values($1,$2,'Synthetic queue policy',20000,true)",[policies[i],tenant]);
    await pool.query("insert into organization_admin_memberships(user_id,organization_id,role,active) values($1,$2,'ADMIN',true)",[actor,tenant]);
  }
});
afterAll(async()=>{await pool.end();});

describe("S12 unattended batch on fake gateway, bounded to synthetic tenant",()=>{
 it("blocks a non-synthetic org or an unbounded batch without database mutation",async()=>{
   await expect(runSyntheticAutopayQueue({
     organizationId:"org_demo",gateway,
   })).rejects.toThrow("AUTOPAY_SYNTHETIC_ORGANIZATION_REQUIRED");
   await expect(runSyntheticAutopayQueue({
     organizationId:org,maxRequests:1000,gateway,
   })).rejects.toThrow("AUTOPAY_QUEUE_BOUND_INVALID");
   expect(sent).toHaveLength(0);
 });
 it("autonomously processes safe requests, respects both budgets, and never re-pays",async()=>{
   pregrant=await request(org,vendors[0],"PRE-GRANT-INELIGIBLE");
   const g=await grant(org,vendors[0],2000,2);
   mandateId=g.id;digest=g.digest;
   const ids=await Promise.all([
     request(org,vendors[0],"QUEUED-FIRST"),
     request(org,vendors[0],"QUEUED-SECOND"),
     request(org,vendors[0],"QUEUED-THIRD"),
   ]);
   // There is a valid alternate tenant, not eligible for this scoped queue.
   await grant(foreign,vendors[1],2000,2);
   const foreignId=await request(foreign,vendors[1],"FOREIGN-NEVER-SELECTED");
   const first=await runSyntheticAutopayQueue({organizationId:org,gateway});
   expect(first).toMatchObject({
     mode:"DISPOSABLE_FAKE_GATEWAY_ONLY",selected:3,simulatedPaid:2,held:1,
     blocked:0,externalPaymentExecuted:false,
   });
   expect(first.outcomes.some(x=>x.requestId===pregrant)).toBe(false);
   expect(first.outcomes.some(x=>x.requestId===foreignId)).toBe(false);
   expect(sent).toHaveLength(2);
   expect(sent.map(x=>x.receiver)).toEqual([invoiceDestination,invoiceDestination]);
   const state=await pool.query([
     "select pr.invoice_number,e.status from payment_executions e",
     "join payment_requests pr on pr.id=e.payment_request_id",
     "where pr.organization_id=$1 order by pr.invoice_number",
   ].join(" "),[org]);
   expect(state.rows).toHaveLength(2);
   expect(state.rows.every(x=>x.status==="PAID")).toBe(true);
   // The scoped query below is authoritative; no client-side sums.
   const scoped=await pool.query([
     "select count(*)::int as n,sum(amount_cents)::int as cents",
     "from autopay_budget_reservations where mandate_id=$1",
   ].join(" "),[mandateId]);
   expect(scoped.rows[0]).toMatchObject({n:2,cents:2000});
   const again=await runSyntheticAutopayQueue({organizationId:org,gateway});
   expect(again).toMatchObject({simulatedPaid:0,selected:1,held:1});
   expect(sent).toHaveLength(2);
   for(const id of ids.slice(0,2)){
     const executions=await pool.query("select count(*)::int as n from payment_executions where payment_request_id=$1",[id]);
     expect(executions.rows[0].n).toBeLessThanOrEqual(1);
   }
   expect((await pool.query(
     "select count(*)::int as n from payment_executions where payment_request_id=$1",[foreignId]
   )).rows[0].n).toBe(0);
 });
 it("revocation stops subsequent automatic selection and retains reservations",async()=>{
   await decideAutopayMandate({
     id:mandateId,actorId:actor,expectedDigest:digest,
     action:"REVOKE",confirmation:"REVOKE",
     explanation:"The test admin has explicitly disabled this standing mandate.",
   });
   const summary=await runSyntheticAutopayQueue({organizationId:org,gateway});
   expect(summary.selected).toBe(0);
   expect(summary.simulatedPaid).toBe(0);
   expect(sent).toHaveLength(2);
   const budget=await pool.query([
     "select count(*)::int as n,sum(amount_cents)::int as cents",
     "from autopay_budget_reservations where mandate_id=$1",
   ].join(" "),[mandateId]);
   expect(budget.rows[0]).toMatchObject({n:2,cents:2000});
 });
});
