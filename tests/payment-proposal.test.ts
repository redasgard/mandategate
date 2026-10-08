import { createHash, randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/pool";
import { prepareInvoicePaymentProposal } from "../src/authority/payment-proposal";

const org = "proposal_test_" + randomUUID();
const foreignOrg = "proposal_test_" + randomUUID();
const vendorId = "vendor_" + randomUUID();
const destinationId = "destination_" + randomUUID();
const channelId = "channel_" + randomUUID();
const policyId = "policy_" + randomUUID();
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
let admin = "";
const trusted = "trusted@example.com";

type Fixture = { artifactId: string; claimSetId: string; attestationId: string };

async function makeFixture(name: string, opts: {
  printedReceiver?: string;
  claimVerified?: boolean;
  expiredOrigin?: boolean;
  insufficientField?: boolean;
} = {}): Promise<Fixture> {
  const artifactId = randomUUID();
  const fixturePdf = Buffer.from("%PDF-1.7\n% Invoice fixture " + name + "\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
  const invoiceNumber = "INV-" + name;
  await pool.query(
    "insert into invoice_artifacts(id,organization_id,mime_type,byte_size,sha256,content) values($1,$2,'application/pdf',$3,$4,$5)",
    [artifactId,org,fixturePdf.length,sha(fixturePdf),fixturePdf],
  );
  const claimSetId = (await pool.query(
    [
      "insert into invoice_verified_claim_sets",
      "(organization_id,artifact_id,artifact_sha256,observation_sha256,snapshot_sha256,",
      "source_kind,verification_status,verifier_method,verifier_actor,verifier_proof_sha256)",
      "values($1,$2,$3,$4,$5,'HUMAN_TRANSCRIPTION',$6,$7,$8,$9) returning id",
    ].join(" "),
    [
      org,artifactId,sha(fixturePdf),sha("untrusted-model:"+name),sha("verified-snapshot:"+name),
      opts.claimVerified===false?"UNVERIFIED":"VERIFIED",
      opts.claimVerified===false?null:"ADMIN_EXPLICIT",
      opts.claimVerified===false?null:admin,
      opts.claimVerified===false?null:sha("separate-review:"+name),
    ],
  )).rows[0].id;
  const fields = {
    vendor_name: "Trusted Components",
    invoice_number: invoiceNumber,
    currency: "USD",
    total_amount_decimal: "1.01",
    invoice_payment_destination: opts.printedReceiver ?? trusted,
  };
  for(const [field,value] of Object.entries(fields)) {
    await pool.query(
      [
        "insert into invoice_claim_field_sources",
        "(organization_id,artifact_id,claim_set_id,field_name,",
        "raw_value,normalized_value,source_page,source_quote_sha256,claimed_value_sha256,",
        "trust_tier,verifier_proof_sha256)",
        "values($1,$2,$3,$4,$5,$5,1,$6,$7,$8,$9)",
      ].join(" "),
      [
        org,artifactId,claimSetId,field,value,
        sha("verified-page-quote:"+field+":"+value),sha(value),
        opts.insufficientField && field==="total_amount_decimal"?1:2,
        opts.insufficientField && field==="total_amount_decimal"?null:sha("review:"+field+":"+name),
      ],
    );
  }
  const attestationId = (await pool.query(
    [
      "insert into invoice_origin_attestations",
      "(organization_id,artifact_id,artifact_sha256,vendor_id,origin_channel_id,method,",
      "verifier_actor,proof_sha256,independent_evidence_reference,expires_at)",
      "values($1,$2,$3,$4,$5,'ADMIN_OUT_OF_BAND',$6,$7,$8,now()+($9 || ' minutes')::interval) returning id",
    ].join(" "),
    [org,artifactId,sha(fixturePdf),vendorId,channelId,admin,sha("origin:"+name),
     "callback-record:test-"+name,opts.expiredOrigin?"-10":"60"],
  )).rows[0].id;
  return {artifactId,claimSetId,attestationId};
}

const propose = (f: Fixture, organizationId=org) =>
  prepareInvoicePaymentProposal({
    organizationId,
    artifactId:f.artifactId,
    claimSetId:f.claimSetId,
    attestationId:f.attestationId,
  });

beforeAll(async () => {
  const user = await pool.query(
    'select id from "user" where email=$1 limit 1',
    [process.env.DEMO_ADMIN_EMAIL ?? "admin@mandategate.local"],
  );
  if(!user.rows[0]) throw new Error("SEED_ADMIN_REQUIRED");
  admin=user.rows[0].id;
  await pool.query(
    "insert into organizations(id,name) values($1,'Proposal test'),($2,'Other tenant')",
    [org,foreignOrg],
  );
  await pool.query(
    "insert into vendors(id,organization_id,name,normal_max_amount_cents) values($1,$2,'Trusted Components',10000)",
    [vendorId,org],
  );
  await pool.query(
    "insert into vendor_destinations(id,vendor_id,destination,trusted) values($1,$2,$3,true)",
    [destinationId,vendorId,trusted],
  );
  await pool.query(
    "insert into policies(id,organization_id,name,auto_pay_max_amount_cents,active) values($1,$2,'Policy One',10000,true)",
    [policyId,org],
  );
  await pool.query(
    "insert into organization_admin_memberships(user_id,organization_id,role) values($1,$2,'ADMIN')",
    [admin,org],
  );
  await pool.query(
    [
      "insert into vendor_origin_channels",
      "(id,organization_id,vendor_id,kind,enrolled_evidence_sha256,enrolled_by_user_id)",
      "values($1,$2,$3,'KNOWN_CALLBACK',$4,$5)",
    ].join(" "),
    [channelId,org,vendorId,sha("pre-enrolled-callback"),admin],
  );
});

afterAll(async()=>{await pool.end();});

describe("Gate E: fail-closed source-to-payment-proposal bridge",()=>{
  it("builds only an ESCALATED immutable proposal, never a payment or payout",async()=>{
    const f=await makeFixture("NORMAL");
    const first=await propose(f);
    expect(first).toMatchObject({
      outcome:"ESCALATE",
      reasonCodes:["PENDING_EXACT_HUMAN_APPROVAL"],
      paymentAuthorized:false,
    });
    expect(first.bindingId).toBeTruthy();
    expect(first.tupleSha256).toMatch(/^[a-f0-9]{64}$/);
    const again=await propose(f);
    expect(again.bindingId).toBe(first.bindingId);
    const db=await pool.query(
      "select authorization_status,proposed_outcome,amount_cents from payment_authority_bindings where id=$1",
      [first.bindingId],
    );
    expect(db.rows[0]).toMatchObject({
      authorization_status:"PROPOSED",proposed_outcome:"ESCALATE",amount_cents:101,
    });
    const money=await pool.query(
      "select count(*)::int as n from payment_requests where organization_id=$1",
      [org],
    );
    expect(money.rows[0].n).toBe(0);
    const trace=await pool.query(
      "select count(*)::int as n from parameter_lineage_events where binding_id=$1",
      [first.bindingId],
    );
    expect(trace.rows[0].n).toBeGreaterThanOrEqual(5);
    await expect(pool.query(
      "update payment_authority_bindings set amount_cents=99900 where id=$1",
      [first.bindingId],
    )).rejects.toThrow(/PAYMENT_BINDING_TUPLE_IMMUTABLE/);
  });

  it("hard denies a forged printed receiver; it never selects the payout destination",async()=>{
    const f=await makeFixture("FORGED-RECEIVER",{printedReceiver:"attacker@example.com"});
    const result=await propose(f);
    expect(result).toMatchObject({
      outcome:"DENY",bindingId:null,paymentAuthorized:false,
      reasonCodes:["INVOICE_DESTINATION_SUBSTITUTION"],
    });
  });

  it("escalates model-only and unsupported source evidence",async()=>{
    const f=await makeFixture("UNVERIFIED",{claimVerified:false});
    const result=await propose(f);
    expect(result).toMatchObject({
      outcome:"ESCALATE",bindingId:null,
      reasonCodes:["SOURCE_CLAIM_NOT_INDEPENDENTLY_VERIFIED"],
    });
  });

  it("refuses source fields without independently verified T2 evidence",async()=>{
    const f=await makeFixture("MISSING-FIELD",{insufficientField:true});
    const result=await propose(f);
    expect(result).toMatchObject({
      outcome:"ESCALATE",bindingId:null,
      reasonCodes:["SOURCE_FIELD_PROOF_INCOMPLETE"],
    });
  });

  it("does not accept stale issuer attestation",async()=>{
    const f=await makeFixture("EXPIRED-ORIGIN",{expiredOrigin:true});
    const result=await propose(f);
    expect(result).toMatchObject({
      outcome:"ESCALATE",bindingId:null,
      reasonCodes:["ISSUER_ORIGIN_UNVERIFIED_OR_EXPIRED"],
    });
  });

  it("never reads an artifact from a different organization",async()=>{
    const f=await makeFixture("CROSS-TENANT");
    const result=await propose(f,foreignOrg);
    expect(result).toMatchObject({
      outcome:"DENY",bindingId:null,paymentAuthorized:false,
      reasonCodes:["SOURCE_ARTIFACT_NOT_OWNED"],
    });
  });
});
