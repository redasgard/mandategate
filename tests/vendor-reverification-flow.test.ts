import {randomUUID,createHash} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {pool} from "../src/db/pool";
import {submitCanonicalPaymentRequest} from "../src/payments/submit";
import {
  listVendorTrustCases,resolveVendorReverificationCase,
} from "../src/vendor-trust/reverification";
import {postgresExecutionStore} from "../src/payments/executor/postgres-store";
import {executeAuthorizedPayment} from "../src/payments/executor/service";
import type {PaymentGateway} from "../src/payments/executor/types";

const organizationId="trust_org_"+randomUUID(),vendorId="trust_vendor_"+randomUUID();
const trusted="known@vendor.test";
const receiverA="attacker-one@example.net",receiverB="attacker-two@example.net";
let actor="";
let caseA="",caseB="",requestA="",requestB="";
const beforeSandbox=process.env.PAYPAL_BASE_URL;
beforeAll(async()=>{
  process.env.PAYPAL_BASE_URL="https://api-m.sandbox.paypal.com";
  const admin=await pool.query('select id from "user" where email=$1',[process.env.DEMO_ADMIN_EMAIL]);
  if(!admin.rows[0])throw Error("CI_ADMIN_MISSING");
  actor=admin.rows[0].id;
  await pool.query("insert into organizations(id,name) values($1,'Trust test org')",[organizationId]);
  await pool.query("insert into organization_admin_memberships(user_id,organization_id,role,active) values($1,$2,'ADMIN',true)",[actor,organizationId]);
  await pool.query("insert into vendors(id,organization_id,name,normal_max_amount_cents) values($1,$2,'Trust vendor',200000)",[vendorId,organizationId]);
  await pool.query("insert into vendor_destinations(id,vendor_id,destination,trusted) values($1,$2,$3,true)",["initial_"+randomUUID(),vendorId,trusted]);
  await pool.query("insert into policies(id,organization_id,name,auto_pay_max_amount_cents,active) values($1,$2,'Normal demo policy',250000,true)",["policy_"+randomUUID(),organizationId]);
});
afterAll(async()=>{
  if(beforeSandbox===undefined)delete process.env.PAYPAL_BASE_URL;
  else process.env.PAYPAL_BASE_URL=beforeSandbox;
  await pool.end();
});
async function deny(dest:string){
  return submitCanonicalPaymentRequest({
    organizationId,vendorId,invoiceNumber:"MISMATCH-"+randomUUID(),amountCents:10000,
    currency:"USD",paymentDestination:dest,
    idempotencyKey:"mismatch-"+randomUUID(),source:"agent_api",
  });
}
async function current(){
  return pool.query("select id,destination,trusted from vendor_destinations where vendor_id=$1 order by created_at,id",[vendorId]);
}
function proof(ref:string){return "vendor-case/"+ref;}
describe("separate verified vendor destination workflow",()=>{
  it("creates re-verification-required case atomically with DENY, not payment",async()=>{
    const denied=await deny(receiverA);
    requestA=denied.requestId;
    expect(denied.decision.outcome).toBe("DENY");
    expect(denied.decision.reasonCodes).toContain("DESTINATION_MISMATCH");
    expect(denied.paymentExecuted).toBe(false);
    const cases=await pool.query("select id,observed_destination_sha256 from vendor_reverification_cases where payment_request_id=$1",[requestA]);
    expect(cases.rows).toHaveLength(1);
    caseA=cases.rows[0].id;
    expect(cases.rows[0].observed_destination_sha256).toBe(
      createHash("sha256").update(receiverA).digest("hex"),
    );
    const dest=await current();
    expect(dest.rows.filter(x=>x.trusted)).toMatchObject([{destination:trusted}]);
    const payments=await pool.query("select count(*)::int as n from payment_executions where payment_request_id=$1",[requestA]);
    expect(payments.rows[0].n).toBe(0);
  });
  it("cannot approve DENY with ordinary escalation reviewer or foreign actor",async()=>{
    const {recordPaymentEscalationReview}=await import("../src/history/escalation-review");
    await expect(recordPaymentEscalationReview({
      requestId:requestA,reviewerId:actor,action:"ACCEPT",
      expectedSnapshotSha256:"0".repeat(64),
      explanation:"Cannot override destination mismatch using review",
    })).rejects.toMatchObject({code:"ESCALATION_NOT_PENDING"});
    await expect(resolveVendorReverificationCase({
      actorUserId:randomUUID(),caseId:caseA,action:"VERIFY",
      reason:"Unauthorized foreign account changes are forbidden",
      evidenceReference:proof("external-contact-ticket-123"),
      verificationMethod:"KNOWN_CONTACT_CALLBACK",
      confirmedIndependentVerification:true,
    })).rejects.toMatchObject({code:"VENDOR_REVERIFICATION_NOT_AUTHORIZED"});
  });
  it("reject action leaves trusted destination untouched and is terminal",async()=>{
    const resolved=await resolveVendorReverificationCase({
      actorUserId:actor,caseId:caseA,action:"REJECT",
      reason:"Retarget attempt rejected; vendor was not independently confirmed",
      evidenceReference:proof("rejected-suspicious-invoice-123"),
      verificationMethod:null,
      confirmedIndependentVerification:false,
    });
    expect(resolved).toMatchObject({status:"REJECTED",originalPaymentDecision:"DENY",originalPaymentExecuted:false});
    expect((await current()).rows.find(x=>x.trusted)?.destination).toBe(trusted);
    await expect(resolveVendorReverificationCase({
      actorUserId:actor,caseId:caseA,action:"REJECT",
      reason:"Second terminal resolution must always be rejected",
      evidenceReference:proof("duplicate-case-resolution-987"),
      verificationMethod:null,
      confirmedIndependentVerification:false,
    })).rejects.toMatchObject({code:"VENDOR_REVERIFICATION_ALREADY_RESOLVED"});
  });
  it("independent recipient approval never executes an original DENY",async()=>{
    const next=await deny(receiverB);
    requestB=next.requestId;
    const q=await pool.query("select id from vendor_reverification_cases where payment_request_id=$1",[requestB]);
    caseB=q.rows[0].id;
    const arg={
      actorUserId:actor,caseId:caseB,action:"VERIFY" as const,
      reason:"Reviewer checked registered vendor contact and obtained signed instructions",
      evidenceReference:proof("verified-new-recipient-1234"),
      verificationMethod:"KNOWN_CONTACT_CALLBACK" as const,
      confirmedIndependentVerification:true,
    };
    await expect(resolveVendorReverificationCase({
      ...arg,confirmedIndependentVerification:false,
    })).rejects.toMatchObject({code:"VENDOR_VERIFICATION_ATTESTATION_REQUIRED"});
    await expect(resolveVendorReverificationCase({
      ...arg,verificationMethod:null,
    })).rejects.toMatchObject({code:"VENDOR_VERIFICATION_METHOD_REQUIRED"});
    process.env.PAYPAL_BASE_URL="https://api-m.paypal.com";
    await expect(resolveVendorReverificationCase(arg))
      .rejects.toMatchObject({code:"VENDOR_VERIFICATION_PAYMENT_ENV_UNSUPPORTED"});
    process.env.PAYPAL_BASE_URL="https://api-m.sandbox.paypal.com";
    const resolved=await resolveVendorReverificationCase(arg);
    expect(resolved).toMatchObject({
      status:"VERIFIED",originalPaymentDecision:"DENY",
      verificationMethod:"KNOWN_CONTACT_CALLBACK",verificationBasis:"ADMIN_ATTESTATION",
    });
    const versions=await current();
    expect(versions.rows.filter(x=>x.trusted).map(x=>x.destination)).toEqual([receiverB]);
    const cases=await listVendorTrustCases(actor);
    expect(cases.some(x=>x.id===caseB && x.resolution==="VERIFIED")).toBe(true);
    expect((await pool.query("select status from payment_requests where id=$1",[requestB])).rows[0].status).toBe("DENIED");
    const p=await postgresExecutionStore.getAuthoritativePayment(requestB);
    expect(p?.decisionOutcome).toBe("DENY");
    let posted=0;
    const gateway:PaymentGateway={
      createSinglePayout:async()=>{posted++;return{payoutBatchId:"FORBIDDEN"};},
      getBatchItem:async()=>{throw Error("NO_PAYOUT");},
      getPayoutItem:async()=>{throw Error("NO_PAYOUT");},
    };
    await expect(executeAuthorizedPayment(requestB,{store:postgresExecutionStore,gateway}))
      .rejects.toThrow("PAYMENT_NOT_AUTHORIZED");
    expect(posted).toBe(0);
  });
});
