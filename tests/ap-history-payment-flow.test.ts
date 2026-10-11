import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {pool} from "../src/db/pool";
import {importApHistory} from "../src/history/store";
import {assessHistoricalPaymentRisk} from "../src/history/anomaly";
import {submitCanonicalPaymentRequest} from "../src/payments/submit";

const org="historical_decision_"+randomUUID();
const vendor="vendor_"+randomUUID();
const destination="trusted@vendor.test";
let actorId="";
const csv=Buffer.from([
  "vendor_name,invoice_number,invoice_date,amount_decimal,currency,status,payment_destination",
  "Northstar Test,INV-1001,2026-08-01,100.00,USD,PAID,old@vendor.test",
  "Northstar Test,INV-1002,2026-08-02,100.00,USD,PAID,old@vendor.test",
  "Northstar Test,INV-1003,2026-08-03,110.00,USD,PAID,old@vendor.test",
].join("\r\n")+"\r\n");

beforeAll(async()=>{
  const admin=await pool.query('select id from "user" where email=$1',[process.env.DEMO_ADMIN_EMAIL]);
  if(admin.rows.length!==1)throw Error("CI_ADMIN_MISSING");
  actorId=admin.rows[0].id;
  await pool.query("insert into organizations(id,name) values($1,'Historical risk CI fixture')",[org]);
  await pool.query("insert into organization_admin_memberships(user_id,organization_id,role,active) values($1,$2,'ADMIN',true)",[actorId,org]);
  await pool.query("insert into vendors(id,organization_id,name,normal_max_amount_cents) values($1,$2,'Northstar Test',300000)",[vendor,org]);
  await pool.query("insert into vendor_destinations(id,vendor_id,destination,trusted) values($1,$2,$3,true)",["dest_"+randomUUID(),vendor,destination]);
  await pool.query("insert into policies(id,organization_id,name,auto_pay_max_amount_cents,active) values($1,$2,'Approvals policy',400000,true)",["policy_"+randomUUID(),org]);
  await importApHistory({organizationId:org,actorUserId:actorId,content:csv});
});
afterAll(async()=>{await pool.end();});

const submit=(invoiceNumber:string,amountCents:number,paymentDestination=destination)=>
  submitCanonicalPaymentRequest({
    organizationId:org,vendorId:vendor,invoiceNumber,amountCents,currency:"USD",
    paymentDestination,idempotencyKey:"ap-integration-"+randomUUID(),
    source:"agent_api",
  });

describe("actual imported AP history influences deterministic payment kernel",()=>{
  it("escalates replay of previously paid invoice and binds immutable import provenance",async()=>{
    const decision=await submit("INV-1001",10000);
    expect(decision.decision.outcome).toBe("ESCALATE");
    expect(decision.decision.reasonCodes).toContain("AP_INVOICE_NUMBER_REPLAY");
    const match=decision.decision.evidence.find(x=>x.code==="AP_INVOICE_NUMBER_REPLAY");
    expect(match?.provenance?.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(match?.provenance?.importId).toBeTruthy();
    const execution=await pool.query("select count(*)::int as n from payment_executions where payment_request_id=$1",[decision.requestId]);
    expect(execution.rows[0].n).toBe(0);
  });
  it("detects near duplicate without flagging normal sequential invoice numbering",async()=>{
    const near=await submit("INV-1OO1",10000);
    expect(near.decision.reasonCodes).toContain("AP_NEAR_DUPLICATE_INVOICE");
    const sequential=await submit("INV-1004",10000);
    expect(sequential.decision.outcome).toBe("ALLOW");
    expect(sequential.decision.reasonCodes).not.toContain("AP_NEAR_DUPLICATE_INVOICE");
  });
  it("escalates a huge but policy-allowed amount due to vendor baseline",async()=>{
    const candidate=await submit("INV-HUGE",200000);
    expect(candidate.decision.outcome).toBe("ESCALATE");
    expect(candidate.decision.reasonCodes).toContain("AP_AMOUNT_OUTLIER");
    expect(candidate.decision.reasonCodes).not.toContain("AMOUNT_OUTSIDE_VENDOR_BASELINE");
  });
  it("destination substitution is DENY, never upgraded by imported historic destinations",async()=>{
    const attempt=await submit("INV-RETARGET",10000,"old@vendor.test");
    expect(attempt.decision.outcome).toBe("DENY");
    expect(attempt.decision.reasonCodes).toContain("DESTINATION_MISMATCH");
    const current=await pool.query("select destination from vendor_destinations where vendor_id=$1 and trusted=true",[vendor]);
    expect(current.rows[0].destination).toBe(destination);
  });
  it("identical source replay does not duplicate median samples; changed import versions are immutable",async()=>{
    const duplicate=await importApHistory({organizationId:org,actorUserId:actorId,content:csv});
    expect(duplicate.replayed).toBe(true);
    const changed=Buffer.concat([csv,Buffer.from("Northstar Test,INV-1004,2026-08-04,120.00,USD,PAID,old@vendor.test\r\n")]);
    const v2=await importApHistory({organizationId:org,actorUserId:actorId,content:changed});
    expect(v2.replayed).toBe(false);
    const r=await assessHistoricalPaymentRisk({organizationId:org,vendorId:vendor,
      invoiceNumber:"INV-FAR",amountCents:400000,currency:"USD"});
    const reason=r.evidence.find(x=>x.code==="AP_AMOUNT_OUTLIER");
    expect(reason?.provenance?.sampleCount).toBe(4);
    expect(reason?.provenance?.contributingImportIds).toContain(v2.importId);
    expect(reason?.provenance?.contributingImportIds).toHaveLength(1);
    const stored=await pool.query("select count(*)::int as n from ap_imports where organization_id=$1",[org]);
    expect(stored.rows[0].n).toBe(2);
  });
});
