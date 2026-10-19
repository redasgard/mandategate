import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {pool} from "../src/db/pool";
import {prepareAutopayMandate,decideAutopayMandate} from "../src/autonomy/mandates";
import {submitCanonicalPaymentRequest} from "../src/payments/submit";
import {simulateBoundAutopay} from "../src/autonomy/simulated-runner";
import type {PaymentGateway,PayoutSubmission} from "../src/payments/executor/types";

const org="synth_runner_"+randomUUID(),vendor="synth_vendor_"+randomUUID();
const destination="dest_"+randomUUID(),policy="policy_"+randomUUID();
const recipient="test-only@fake-provider.invalid";
const explanation="Synthetic scoped auto-pay mandate, no financial provider is used.";
let actor="",grantId="",digest="",prior="",normal="",revoked="";

const payments:PayoutSubmission[]=[];
const gateway:PaymentGateway={
  createSinglePayout:async value=>{
    payments.push(value);
    return {payoutBatchId:"FAKE_BATCH_"+randomUUID()};
  },
  getBatchItem:async id=>({
    payoutBatchId:id,payoutItemId:"FAKE_ITEM_"+randomUUID(),
    transactionStatus:"SUCCESS",
  }),
  getPayoutItem:async id=>({
    payoutBatchId:"FAKE_BATCH_ALREADY",payoutItemId:id,transactionStatus:"SUCCESS",
  }),
};
async function submit(invoice:string) {
  const x=await submitCanonicalPaymentRequest({
    organizationId:org,vendorId:vendor,invoiceNumber:invoice,
    amountCents:1000,currency:"USD",paymentDestination:recipient,
    idempotencyKey:"ci-sim-"+randomUUID(),source:"agent_api",
  });
  expect(x.decision.outcome).toBe("ALLOW");
  return x.requestId;
}
beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL??"postgresql://invalid@invalid/db");
  if(process.env.CI!=="true"||process.env.MANDATEGATE_DISABLE_PAYMENTS!=="1"||
     process.env.MANDATEGATE_RUNTIME_MODE!=="legacy"||
     url.hostname!=="127.0.0.1"||url.port!=="55432"||
     url.pathname!=="/mandategate")
    throw Error("RUNNER_TEST_REQUIRES_DISPOSABLE_NONPAYING_DATABASE");
  const users=await pool.query('select id from "user" where email=$1',[process.env.DEMO_ADMIN_EMAIL]);
  expect(users.rows.length).toBe(1);
  actor=String(users.rows[0].id);
  await pool.query("insert into organizations(id,name) values($1,'Runner-only test org')",[org]);
  await pool.query(
    "insert into vendors(id,organization_id,name,normal_max_amount_cents) values($1,$2,'Test only',10000)",[vendor,org]);
  await pool.query(
    "insert into vendor_destinations(id,vendor_id,destination,trusted) values($1,$2,$3,true)",[destination,vendor,recipient]);
  await pool.query(
    "insert into policies(id,organization_id,name,auto_pay_max_amount_cents,active) values($1,$2,'Test only',10000,true)",[policy,org]);
  await pool.query(
    "insert into organization_admin_memberships(user_id,organization_id,role,active) values($1,$2,'ADMIN',true)",[actor,org]);
});
afterAll(async()=>{await pool.end()});
describe("S11 mock-provider automatic execution boundary",()=>{
  it("holds a pre-grant ordinary ALLOW without making any fake payout",async()=>{
    prior=await submit("PRE-GRANT");
    expect(await simulateBoundAutopay(prior,gateway)).toMatchObject({
      outcome:"HELD",reason:"MISSING_OR_STALE_GRANT",
      externalPaymentExecuted:false,mode:"SYNTHETIC_FAKE_GATEWAY",
    });
    expect(payments).toHaveLength(0);
  });
  it("executes one already-granted, budget-reserved synthetic ALLOW through the real store",async()=>{
    const grant=await prepareAutopayMandate({
      organizationId:org,vendorId:vendor,actorId:actor,
      maxAmountCents:2000,maxTotalAmountCents:3000,maxPaymentCount:3,validityDays:7,
    });
    grantId=grant.id;digest=grant.digest;
    await decideAutopayMandate({
      id:grantId,actorId:actor,expectedDigest:digest,action:"ACTIVATE",
      confirmation:"ENABLE AUTOPAY",explanation,
    });
    normal=await submit("POST-GRANT-NORMAL");
    const result=await simulateBoundAutopay(normal,gateway);
    expect(result).toMatchObject({
      outcome:"SIMULATED_EXECUTION",simulatedStatus:"PAID",
      externalPaymentExecuted:false,mode:"SYNTHETIC_FAKE_GATEWAY",
    });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({receiver:recipient,amountCents:1000,currency:"USD"});
    const observed=await pool.query([
      "select e.status,e.paypal_request_id,r.amount_cents",
      "from payment_executions e join autopay_budget_reservations r",
      "on r.payment_request_id=e.payment_request_id where e.payment_request_id=$1",
    ].join(" "),[normal]);
    expect(observed.rows).toHaveLength(1);
    expect(observed.rows[0]).toMatchObject({status:"PAID",amount_cents:1000});
    expect((await simulateBoundAutopay(normal,gateway)).outcome).toBe("HELD");
    expect(payments).toHaveLength(1);
    const forbidden=await pool.query(
      "select count(*)::int as n from autopay_payment_bindings where payment_request_id=$1",[prior]);
    expect(forbidden.rows[0].n).toBe(0);
  });
  it("revocation during the claimed pre-submit window blocks the fake gateway",async()=>{
    revoked=await submit("POST-GRANT-REVOKED");
    const result=await simulateBoundAutopay(revoked,gateway,{
      beforeSubmit:async()=>{await decideAutopayMandate({
        id:grantId,actorId:actor,expectedDigest:digest,action:"REVOKE",
        confirmation:"REVOKE",
        explanation:"Stop autonomous payouts before simulated provider submission.",
      });},
    });
    expect(result).toMatchObject({
      outcome:"SIMULATED_EXECUTION",simulatedStatus:"PAYMENT_BLOCKED",
      externalPaymentExecuted:false,
    });
    expect(payments).toHaveLength(1);
    const rows=await pool.query([
      "select e.status,r.amount_cents",
      "from payment_executions e join autopay_budget_reservations r",
      "on r.payment_request_id=e.payment_request_id where e.payment_request_id=$1",
    ].join(" "),[revoked]);
    expect(rows.rows).toMatchObject([{status:"PAYMENT_BLOCKED",amount_cents:1000}]);
    const audit=await pool.query("select event_type from autopay_mandate_events where mandate_id=$1",[grantId]);
    expect(audit.rows.map(r=>r.event_type).sort()).toEqual(["GRANTED","REVOKED"]);
    expect((await simulateBoundAutopay(revoked,gateway)).outcome).toBe("HELD");
  });
});
