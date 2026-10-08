import { createHash, randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/pool";
import {
  attestInvoiceIssuerFromTrustedChannel,
} from "../src/authority/origin-attestation";

const org = "origin_test_" + randomUUID();
const other = "origin_test_" + randomUUID();
const vendor = "vendor_" + randomUUID();
const otherVendor = "vendor_" + randomUUID();
const artifactId = randomUUID();
const channelId = "channel_" + randomUUID();
const badChannelId = "channel_" + randomUUID();
const syntheticChannelId = "channel_" + randomUUID();
const lateChannelId = "channel_" + randomUUID();
const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
const digest = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
let actor = "";

const basic = () => ({
  actorUserId: actor,
  organizationId: org,
  artifactId,
  vendorId: vendor,
  channelId,
  independentEvidenceReference: "callback-record:vendor-callback-case-001",
});

beforeAll(async () => {
  const adminEmail = process.env.DEMO_ADMIN_EMAIL ?? "admin@mandategate.local";
  const user = await pool.query('select id from "user" where email=$1 limit 1', [adminEmail]);
  if (!user.rows[0]) throw new Error("SEED_ADMIN_REQUIRED_FOR_ORIGIN_TEST");
  actor = user.rows[0].id;
  await pool.query(
    "insert into organizations(id,name) values ($1,'Origin test'),($2,'Other tenant')",
    [org, other],
  );
  await pool.query(
    "insert into vendors(id,organization_id,name,normal_max_amount_cents) values ($1,$2,'Vendor One',10000),($3,$4,'Vendor Two',10000)",
    [vendor, org, otherVendor, other],
  );
  await pool.query(
    "insert into organization_admin_memberships(user_id,organization_id,role) values ($1,$2,'ADMIN')",
    [actor,org],
  );
  for(const [id,orgId,vendorId,kind] of [
    [channelId,org,vendor,"KNOWN_CALLBACK"],
    [badChannelId,other,otherVendor,"KNOWN_CALLBACK"],
    [syntheticChannelId,org,vendor,"SYNTHETIC_FIXTURE"],
  ]) {
    await pool.query(
      "insert into vendor_origin_channels(id,organization_id,vendor_id,kind,enrolled_evidence_sha256,enrolled_by_user_id,created_at) values($1,$2,$3,$4,$5,$6,now()-interval '1 day')",
      [id,orgId,vendorId,kind,digest("independent-enrollment:"+id),actor],
    );
  }
  await pool.query(
    "insert into invoice_artifacts(id,organization_id,mime_type,byte_size,sha256,content) values ($1,$2,'application/pdf',$3,$4,$5)",
    [artifactId,org,pdf.length,digest(pdf),pdf],
  );
  await pool.query(
    "insert into vendor_origin_channels(id,organization_id,vendor_id,kind,enrolled_evidence_sha256,enrolled_by_user_id,created_at) values($1,$2,$3,'KNOWN_CALLBACK',$4,$5,now()+interval '1 day')",
    [lateChannelId,org,vendor,digest("untrusted-after-invoice"),actor],
  );
});

afterAll(async () => { await pool.end(); });

describe("Gate D: trusted origin channel must predate invoice-derived authority", () => {
  it("refuses a channel enrolled after the invoice even when an admin supplies a callback reference", async () => {
    await expect(attestInvoiceIssuerFromTrustedChannel({
      ...basic(),channelId:lateChannelId,
    })).rejects.toMatchObject({code:"TRUSTED_CHANNEL_MUST_PREDATE_INVOICE"});
  });

  it("refuses unprivileged issuer attestation without an organization admin", async () => {
    await expect(attestInvoiceIssuerFromTrustedChannel({
      ...basic(), actorUserId: "fake-human-actor",
    })).rejects.toMatchObject({code:"ADMIN_ORGANIZATION_ROLE_REQUIRED"});
  });

  it("refuses an attacker-provided origin channel from another tenant", async () => {
    await expect(attestInvoiceIssuerFromTrustedChannel({
      ...basic(), channelId:badChannelId,
    })).rejects.toMatchObject({code:"TRUSTED_VENDOR_ORIGIN_CHANNEL_REQUIRED"});
  });

  it("requires a separately sourced reference of the matching channel kind", async () => {
    for(const independentEvidenceReference of [
      "invoice says vendor is genuine",
      "erp-entry:replaced-reference-record-001",
      "callback-record:",
    ]) {
      await expect(attestInvoiceIssuerFromTrustedChannel({
        ...basic(), independentEvidenceReference,
      })).rejects.toThrow();
    }
  });

  it("persists an immutable, non-authorizing human origin attestation exactly once", async () => {
    const first = await attestInvoiceIssuerFromTrustedChannel(basic());
    const duplicate = await attestInvoiceIssuerFromTrustedChannel(basic());
    expect(duplicate.id).toBe(first.id);
    expect(first).toMatchObject({
      organizationId:org, vendorId:vendor, artifactId,
      channelId, method:"ADMIN_OUT_OF_BAND", paymentAuthorized:false,
      independentEvidenceClaim:"HUMAN_ATTESTATION",
    });
    expect(first.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
    await expect(pool.query(
      "update invoice_origin_attestations set verifier_actor='other' where id=$1",
      [first.id],
    )).rejects.toThrow(/AUTHORITY_PROVENANCE_IMMUTABLE/);
    const count = await pool.query(
      "select count(*)::int as n from invoice_origin_attestations where artifact_id=$1 and origin_channel_id=$2",
      [artifactId,channelId],
    );
    expect(count.rows[0].n).toBe(1);
  });

  it("does not allow production-style origin claims from synthetic fixtures", async () => {
    const payload = {
      ...basic(), channelId:syntheticChannelId,
      independentEvidenceReference:"synthetic-fixture:clearly-labeled-test-only",
    };
    await expect(attestInvoiceIssuerFromTrustedChannel(payload)).rejects.toMatchObject({
      code:"SYNTHETIC_ORIGIN_NOT_PERMITTED",
    });
    const demo = await attestInvoiceIssuerFromTrustedChannel(payload, {allowSyntheticFixture:true});
    expect(demo.method).toBe("SYNTHETIC_FIXTURE");
    expect(demo.paymentAuthorized).toBe(false);
  });

  it("revocation of a vendor channel prevents new origin attestations", async () => {
    await pool.query("update vendor_origin_channels set active=false where id=$1",[channelId]);
    await expect(attestInvoiceIssuerFromTrustedChannel({
      ...basic(), independentEvidenceReference:"callback-record:later-proof-case-999",
    })).rejects.toMatchObject({code:"TRUSTED_VENDOR_ORIGIN_CHANNEL_REQUIRED"});
    await expect(pool.query(
      "update vendor_origin_channels set active=true where id=$1",[channelId],
    )).rejects.toThrow(/ORIGIN_CHANNEL_IDENTITY_IMMUTABLE/);
  });
});
