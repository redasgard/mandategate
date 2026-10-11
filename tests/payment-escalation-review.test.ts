import {randomUUID} from "node:crypto";
import {beforeAll,afterAll,describe,expect,it} from "vitest";
import {pool} from "../src/db/pool";
import {postgresExecutionStore} from "../src/payments/executor/postgres-store";
import {executeAuthorizedPayment} from "../src/payments/executor/service";
import type {PayoutSubmission,PaymentGateway} from "../src/payments/executor/types";
import {
  escalationSnapshotDigest,getEscalationSnapshot,recordPaymentEscalationReview,
} from "../src/history/escalation-review";
const org="escal_review_"+randomUUID(),vendor="v_"+randomUUID(),dest="d_"+randomUUID();
const policy="p_"+randomUUID(),payAccept=randomUUID(),payDecline=randomUUID(),payRevoke=randomUUID();
let actor="";
beforeAll(async()=>{
  const u=await pool.query('select id from "user" where email=$1',[process.env.DEMO_ADMIN_EMAIL]);
  if(!u.rows[0])throw new Error("DEMO_ADMIN_REQUIRED");
  actor=u.rows[0].id;
  await pool.query("insert into organizations(id,name) values($1,'Review test')",[org]);
  await pool.query("insert into organization_admin_memberships(user_id,organization_id,role,active) values($1,$2,'ADMIN',true)",[actor,org]);
  await pool.query("insert into vendors(id,organization_id,name,normal_max_amount_cents) values($1,$2,'Review vendor',1000)",[vendor,org]);
  await pool.query("insert into vendor_destinations(id,vendor_id,destination,trusted) values($1,$2,'ap@review.test',true)",[dest,vendor]);
  await pool.query("insert into policies(id,organization_id,name,auto_pay_max_amount_cents,active) values($1,$2,'Policy',1000,true)",[policy,org]);
  for(const id of [payAccept,payDecline,payRevoke]){
    await pool.query([
      "insert into payment_requests(id,logical_payment_id,organization_id,vendor_id,invoice_number,amount_cents,currency,requested_destination,status,source)",
      "values($1,$2,$3,$4,$5,9999,'USD','ap@review.test','ESCALATED','demo_fixture')",
    ].join(" "),[id,randomUUID(),org,vendor,"INV-"+id.slice(0,8)]);
    await pool.query("insert into payment_decisions(id,payment_request_id,outcome,reason_codes,evidence) values($1,$2,'ESCALATE','[\"AMOUNT_OUTSIDE_VENDOR_BASELINE\"]','[]')",[randomUUID(),id]);
  }
});
afterAll(async()=>{await pool.end();});
describe("bound human escalation decisions",()=>{
  it("rejects cross-org reviewers and stale request digests",async()=>{
    const snap=await getEscalationSnapshot(payAccept,actor);
    expect(snap?.status).toBe("ESCALATED");
    expect(await getEscalationSnapshot(payAccept,randomUUID())).toBeNull();
    await expect(recordPaymentEscalationReview({
      requestId:payAccept,reviewerId:actor,action:"ACCEPT",
      expectedSnapshotSha256:"0".repeat(64),explanation:"Approving synthetic test after review",
    })).rejects.toMatchObject({code:"ESCALATION_SNAPSHOT_CHANGED"});
  });
  it("accepts once with reason and never executes PayPal",async()=>{
    const snap=await getEscalationSnapshot(payAccept,actor);
    const review=await recordPaymentEscalationReview({
      requestId:payAccept,reviewerId:actor,action:"ACCEPT",
      expectedSnapshotSha256:snap!.snapshotSha256,
      explanation:"Approved after confirming this is synthetic test",
    });
    expect(review).toMatchObject({status:"APPROVED",approvedForExecution:true,executed:false});
    const saved=await pool.query("select status from payment_requests where id=$1",[payAccept]);
    expect(saved.rows[0].status).toBe("APPROVED");
    expect((await pool.query("select count(*)::int as n from payment_executions where payment_request_id=$1",[payAccept])).rows[0].n).toBe(0);
    await expect(recordPaymentEscalationReview({
      requestId:payAccept,reviewerId:actor,action:"ACCEPT",
      expectedSnapshotSha256:snap!.snapshotSha256,
      explanation:"Second attempt should not be allowed",
    })).rejects.toMatchObject({code:"ESCALATION_NOT_PENDING"});
  });
  it("declines with recorded actor and required reason",async()=>{
    const snap=await getEscalationSnapshot(payDecline,actor);
    await expect(recordPaymentEscalationReview({
      requestId:payDecline,reviewerId:actor,action:"DECLINE",
      expectedSnapshotSha256:snap!.snapshotSha256,explanation:"short",
    })).rejects.toMatchObject({code:"ESCALATION_REVIEW_INVALID"});
    const row=await recordPaymentEscalationReview({
      requestId:payDecline,reviewerId:actor,action:"DECLINE",
      expectedSnapshotSha256:snap!.snapshotSha256,
      explanation:"Declined duplicate invoice pending vendor clarification",
    });
    expect(row).toMatchObject({status:"DECLINED",approvedForExecution:false});
    const stored=await pool.query("select reviewer_user_id,explanation,action from payment_escalation_reviews where payment_request_id=$1",[payDecline]);
    expect(stored.rows[0]).toMatchObject({reviewer_user_id:actor,action:"DECLINE"});
  });
  it("maps only accepted reviews to execution authority and forbids declined payouts",async()=>{
    const allowed=await postgresExecutionStore.getAuthoritativePayment(payAccept);
    const blocked=await postgresExecutionStore.getAuthoritativePayment(payDecline);
    expect(allowed?.decisionOutcome).toBe("APPROVED");
    expect(blocked?.decisionOutcome).toBe("ESCALATE");
    const posts:PayoutSubmission[]=[];
    const gateway:PaymentGateway={
      createSinglePayout:async input=>{posts.push(input);return{payoutBatchId:"CI-FAKE-BATCH-123"};},
      getBatchItem:async batch=>({payoutItemId:"CI-FAKE-ITEM",payoutBatchId:batch,transactionStatus:"SUCCESS"}),
      getPayoutItem:async item=>({payoutItemId:item,payoutBatchId:"CI-FAKE-BATCH-123",transactionStatus:"SUCCESS"}),
    };
    await expect(executeAuthorizedPayment(payDecline,{store:postgresExecutionStore,gateway}))
      .rejects.toThrow("PAYMENT_NOT_AUTHORIZED");
    expect(posts).toHaveLength(0);
    const executed=await executeAuthorizedPayment(payAccept,{store:postgresExecutionStore,gateway});
    expect(executed.status).toBe("PAID");
    expect(posts).toHaveLength(1);
    // An idempotent second local call cannot originate another external POST.
    await executeAuthorizedPayment(payAccept,{store:postgresExecutionStore,gateway});
    expect(posts).toHaveLength(1);
  });


  it("can safely decline an escalation after vendor destination is revoked",async()=>{
    await pool.query("update vendor_destinations set trusted=false where id=$1",[dest]);
    const snap=await getEscalationSnapshot(payRevoke,actor);
    expect(snap?.trustedDestinationCurrent).toBe(false);
    const recorded=await recordPaymentEscalationReview({
      requestId:payRevoke,reviewerId:actor,action:"DECLINE",
      expectedSnapshotSha256:snap!.snapshotSha256,
      explanation:"Declined because the vendor destination trust was revoked",
    });
    expect(recorded.status).toBe("DECLINED");
    expect((await pool.query("select count(*)::int as n from payment_executions where payment_request_id=$1",[payRevoke])).rows[0].n).toBe(0);
  });

});
