import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {pool} from "../src/db/pool";
import {submitCanonicalPaymentRequest} from "../src/payments/submit";
import {
  openTrustCaseForDeclinedEscalation,resolveVendorReverificationCase,
  listVendorTrustCases,
} from "../src/vendor-trust/reverification";
import {readVendorTrustRequestContext} from "../src/vendor-trust/review-context";
import {
  getEscalationSnapshot,recordPaymentEscalationReview,
} from "../src/history/escalation-review";

const organizationId="trust_escal_org_"+randomUUID();
const vendorId="trust_escal_vendor_"+randomUUID();
const trusted="original@vendor.test", changed="verified-changed@vendor.test";
let actor="",paymentId="",caseId="";
const previousSandbox=process.env.PAYPAL_BASE_URL;

beforeAll(async()=>{
  process.env.PAYPAL_BASE_URL="https://api-m.sandbox.paypal.com";
  const admin=await pool.query('select id from "user" where email=$1',[process.env.DEMO_ADMIN_EMAIL]);
  if(!admin.rows[0])throw Error("CI_ADMIN_REQUIRED");
  actor=admin.rows[0].id;
  await pool.query("insert into organizations(id,name) values($1,'Trust escalation test')",[organizationId]);
  await pool.query(
    "insert into organization_admin_memberships(user_id,organization_id,role,active) values($1,$2,'ADMIN',true)",
    [actor,organizationId]);
  await pool.query(
    "insert into vendors(id,organization_id,name,normal_max_amount_cents) values($1,$2,'Known supplier',10000)",
    [vendorId,organizationId]);
  await pool.query(
    "insert into vendor_destinations(id,vendor_id,destination,trusted) values($1,$2,$3,true)",
    ["dest_"+randomUUID(),vendorId,trusted]);
  await pool.query(
    "insert into policies(id,organization_id,name,auto_pay_max_amount_cents,active) values($1,$2,'Review policy',250000,true)",
    ["policy_"+randomUUID(),organizationId]);
});
afterAll(async()=>{
  if(previousSandbox===undefined)delete process.env.PAYPAL_BASE_URL;
  else process.env.PAYPAL_BASE_URL=previousSandbox;
  await pool.end();
});

describe("post-decision recipient change -> safe independent trust investigation",()=>{
  it("refuses to open a case on an unsettled ESCALATE or on still-trusted receiver",async()=>{
    const submitted=await submitCanonicalPaymentRequest({
      organizationId,vendorId,
      invoiceNumber:"ESCALATED-"+randomUUID(),amountCents:260000,
      currency:"USD",paymentDestination:trusted,
      idempotencyKey:"escalation-"+randomUUID(),source:"agent_api",
    });
    paymentId=submitted.requestId;
    expect(submitted.decision.outcome).toBe("ESCALATE");
    expect(submitted.status).toBe("ESCALATED");
    await expect(openTrustCaseForDeclinedEscalation({
      actorUserId:actor,requestId:paymentId,
    })).rejects.toMatchObject({code:"VENDOR_CASE_REQUIRES_DECLINED_ESCALATION"});
    expect((await pool.query("select count(*)::int as n from vendor_reverification_cases where payment_request_id=$1",
      [paymentId])).rows[0].n).toBe(0);
  });
  it("declines exact request first and refuses case while the recipient remains trusted",async()=>{
    const snap=await getEscalationSnapshot(paymentId,actor);
    expect(snap?.trustedDestinationCurrent).toBe(true);
    const review=await recordPaymentEscalationReview({
      requestId:paymentId,reviewerId:actor,action:"DECLINE",
      expectedSnapshotSha256:snap!.snapshotSha256,
      explanation:"Recipient requires independent out-of-band re-verification",
    });
    expect(review).toMatchObject({status:"DECLINED",executed:false});
    await expect(openTrustCaseForDeclinedEscalation({
      actorUserId:actor,requestId:paymentId,
    })).rejects.toMatchObject({code:"VENDOR_CASE_RECIPIENT_ALREADY_TRUSTED"});
  });
  it("detects a later destination change; blocks foreigners; opens immutable case once",async()=>{
    await pool.query(
      "update vendor_destinations set trusted=false where vendor_id=$1 and trusted=true",
      [vendorId]);
    await pool.query(
      "insert into vendor_destinations(id,vendor_id,destination,trusted) values($1,$2,$3,true)",
      ["dest_"+randomUUID(),vendorId,changed]);
    await expect(openTrustCaseForDeclinedEscalation({
      actorUserId:randomUUID(),requestId:paymentId,
    })).rejects.toMatchObject({code:"VENDOR_CASE_PAYMENT_NOT_FOUND",httpStatus:404});
    const created=await openTrustCaseForDeclinedEscalation({
      actorUserId:actor,requestId:paymentId,
    });
    caseId=created.caseId;
    expect(created).toMatchObject({
      replayed:false,paymentAuthorized:false,paymentExecuted:false,
      originalPaymentStatus:"DECLINED",
    });
    expect(await openTrustCaseForDeclinedEscalation({
      actorUserId:actor,requestId:paymentId,
    })).toMatchObject({caseId,replayed:true});
    const stored=await pool.query(
      "select count(*)::int as n from vendor_reverification_cases where payment_request_id=$1",
      [paymentId],
    );
    expect(stored.rows[0].n).toBe(1);
    const scoped=await readVendorTrustRequestContext(actor,paymentId);
    expect(scoped).toMatchObject({
      caseId,outcome:"ESCALATE",requestStatus:"DECLINED",
      requestedDestination:trusted,trustedDestination:changed,trustedDestinationCount:1,
    });
    expect(await readVendorTrustRequestContext(randomUUID(),paymentId)).toBeNull();
    const listed=await listVendorTrustCases(actor,paymentId);
    expect(listed[0]).toMatchObject({
      id:caseId,original_outcome:"ESCALATE",original_payment_status:"DECLINED",
    });
  });
  it("recorded independent recipient verification never reopens the original payment",async()=>{
    const request={
      actorUserId:actor,caseId,action:"VERIFY" as const,
      reason:"Reviewer confirmed recipient by callback to known vendor contact",
      evidenceReference:"external-record/posthoc-escalation-recipient-1234",
      verificationMethod:"KNOWN_CONTACT_CALLBACK" as const,
      confirmedIndependentVerification:true,
    };
    process.env.PAYPAL_BASE_URL="https://api-m.paypal.com";
    await expect(resolveVendorReverificationCase(request))
      .rejects.toMatchObject({code:"VENDOR_VERIFICATION_PAYMENT_ENV_UNSUPPORTED"});
    process.env.PAYPAL_BASE_URL="https://api-m.sandbox.paypal.com";
    const result=await resolveVendorReverificationCase(request);
    expect(result).toMatchObject({
      originalPaymentDecision:"ESCALATE",originalPaymentExecuted:false,
      verificationBasis:"ADMIN_ATTESTATION",verificationMethod:"KNOWN_CONTACT_CALLBACK",
    });
    const status=await pool.query("select status from payment_requests where id=$1",[paymentId]);
    expect(status.rows[0].status).toBe("DECLINED");
    const exec=await pool.query("select count(*)::int as n from payment_executions where payment_request_id=$1",
      [paymentId]);
    expect(exec.rows[0].n).toBe(0);
    await expect(recordPaymentEscalationReview({
      requestId:paymentId,reviewerId:actor,action:"ACCEPT",
      expectedSnapshotSha256:"a".repeat(64),
      explanation:"Cannot resurrect a declined request after destination review",
    })).rejects.toMatchObject({code:"ESCALATION_NOT_PENDING"});
    const newTrust=await pool.query(
      "select destination from vendor_destinations where vendor_id=$1 and trusted=true",
      [vendorId],
    );
    expect(newTrust.rows.map(x=>x.destination)).toEqual([trusted]);
  });
});
