import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/pool";

const org1 = "authority_test_" + randomUUID();
const org2 = "authority_test_" + randomUUID();
const artifact1 = randomUUID();
const artifact2 = randomUUID();
const vendor1 = "vendor_" + randomUUID();
const vendor2 = "vendor_" + randomUUID();
const destination1 = "destination_" + randomUUID();
const policy1 = "policy_" + randomUUID();
const trace = randomUUID();
const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
const hash = createHash("sha256").update(pdf).digest("hex");
const digest = (s: string) => createHash("sha256").update(s).digest("hex");

let client: PoolClient;
let claimId = "";
let attestationId = "";
let bindingId = "";

async function expectRejected(sql: string, params: unknown[], error: string) {
  await client.query("savepoint expected_refusal");
  let failure: unknown;
  try {
    await client.query(sql, params);
  } catch (caught) {
    failure = caught;
  }
  await client.query("rollback to savepoint expected_refusal");
  if (!failure) throw new Error("UNSAFE_SQL_MUTATION_ACCEPTED");
  const observed = failure as { code?: string; message?: string };
  expect(observed.code === error || observed.message?.includes(error)).toBe(true);
}

beforeAll(async () => {
  client = await pool.connect();
  await client.query("begin");

  await client.query(
    "insert into organizations (id, name) values ($1, 'Provenance test'), ($2, 'Foreign org')",
    [org1, org2],
  );
  await client.query(
    "insert into vendors (id, organization_id, name, normal_max_amount_cents) values ($1, $2, 'Vendor One', 10000), ($3, $4, 'Foreign vendor', 10000)",
    [vendor1, org1, vendor2, org2],
  );
  await client.query(
    "insert into vendor_destinations (id, vendor_id, destination, trusted) values ($1, $2, 'trusted@example.com', true)",
    [destination1, vendor1],
  );
  await client.query(
    "insert into policies (id, organization_id, name, auto_pay_max_amount_cents, active) values ($1, $2, 'Policy One', 10000, true)",
    [policy1, org1],
  );
  for (const [id, org] of [[artifact1, org1], [artifact2, org2]]) {
    await client.query(
      [
        "insert into invoice_artifacts",
        "(id, organization_id, mime_type, byte_size, sha256, content)",
        "values ($1, $2, 'application/pdf', $3, $4, $5)",
      ].join(" "),
      [id, org, pdf.length, hash, pdf],
    );
  }
  claimId = (await client.query(
    [
      "insert into invoice_verified_claim_sets",
      "(organization_id, artifact_id, artifact_sha256, observation_sha256, snapshot_sha256, source_kind)",
      "values ($1, $2, $3, $4, $5, 'PDF_TEXT') returning id",
    ].join(" "),
    [org1, artifact1, hash, digest("model-result"), digest("claim-snapshot")],
  )).rows[0].id;

  await client.query(
    [
      "insert into invoice_claim_field_sources",
      "(organization_id, artifact_id, claim_set_id, field_name,",
      "raw_value, normalized_value, source_page, source_quote_sha256, claimed_value_sha256, trust_tier)",
      "values ($1, $2, $3, 'total_amount_decimal', '1.01', '1.01', 1, $4, $5, 1)",
    ].join(" "),
    [org1, artifact1, claimId, digest("Total Due 1.01"), digest("1.01")],
  );

  attestationId = (await client.query(
    [
      "insert into invoice_origin_attestations",
      "(organization_id, artifact_id, artifact_sha256, vendor_id, method,",
      "verifier_actor, proof_sha256, expires_at)",
      "values ($1, $2, $3, $4, 'SYNTHETIC_FIXTURE', 'ci-test-only', $5, now() + interval '1 day') returning id",
    ].join(" "),
    [org1, artifact1, hash, vendor1, digest("synthetic-origin-test")],
  )).rows[0].id;

  bindingId = (await client.query(
    [
      "insert into payment_authority_bindings",
      "(organization_id, artifact_id, artifact_sha256, verified_claim_set_id,",
      "origin_attestation_id, vendor_id, destination_id, policy_id,",
      "invoice_number, amount_cents, currency, destination_sha256,",
      "policy_snapshot_sha256, tuple_sha256, expires_at)",
      "values ($1, $2, $3, $4, $5, $6, $7, $8, 'INV-TEST', 101, 'USD',",
      "$9, $10, $11, now() + interval '1 hour') returning id",
    ].join(" "),
    [org1, artifact1, hash, claimId, attestationId, vendor1, destination1, policy1,
      digest("trusted@example.com"), digest("policy-fixture"), digest("bound-tuple")],
  )).rows[0].id;

  await client.query(
    [
      "insert into parameter_lineage_events",
      "(trace_id, sequence, organization_id, artifact_id, claim_set_id,",
      "binding_id, source_kind, trust_tier, event_type, field_name, observed_value_sha256)",
      "values ($1, 1, $2, $3, $4, $5, 'MODEL', 1, 'FIELD_OBSERVED',",
      "'total_amount_decimal', $6)",
    ].join(" "),
    [trace, org1, artifact1, claimId, bindingId, digest("1.01")],
  );
});

afterAll(async () => {
  if (client) {
    await client.query("rollback");
    client.release();
  }
  await pool.end();
});

describe("Gate B: tenant-bound immutable authority records", () => {
  it("stores claims only against an actual artifact and its exact SHA-256", async () => {
    await expectRejected(
      "insert into invoice_verified_claim_sets (organization_id, artifact_id, artifact_sha256, observation_sha256, snapshot_sha256, source_kind) values ($1, $2, $3, $4, $5, 'GLM_IMAGE')",
      [org1, artifact1, "0".repeat(64), digest("model"), digest("snapshot")],
      "23503",
    );
    await expectRejected(
      "insert into invoice_verified_claim_sets (organization_id, artifact_id, artifact_sha256, observation_sha256, snapshot_sha256, source_kind) values ($1, $2, $3, $4, $5, 'GLM_IMAGE')",
      [org2, artifact1, hash, digest("model"), digest("snapshot")],
      "23503",
    );
  });

  it("does not confuse a model observation with independently VERIFIED evidence", async () => {
    const row = (await client.query(
      "select verification_status, verifier_actor from invoice_verified_claim_sets where id=$1",
      [claimId],
    )).rows[0];
    expect(row).toMatchObject({verification_status: "UNVERIFIED", verifier_actor: null});
    await expectRejected(
      "insert into invoice_verified_claim_sets (organization_id, artifact_id, artifact_sha256, observation_sha256, snapshot_sha256, source_kind, verification_status) values ($1,$2,$3,$4,$5,'GLM_IMAGE','VERIFIED')",
      [org1, artifact1, hash, digest("other"), digest("other-claim")],
      "23514",
    );
  });

  it("rejects cross-tenant field and source-to-sink lineage references", async () => {
    await expectRejected(
      "insert into invoice_claim_field_sources (organization_id, artifact_id, claim_set_id, field_name, claimed_value_sha256) values ($1,$2,$3,'total_amount_decimal',$4)",
      [org2, artifact2, claimId, digest("101")],
      "23503",
    );
    await expectRejected(
      "insert into parameter_lineage_events (trace_id, sequence, organization_id, artifact_id, claim_set_id, source_kind, trust_tier, event_type, field_name, observed_value_sha256) values ($1,2,$2,$3,$4,'MODEL',1,'FIELD_OBSERVED','vendor_name',$5)",
      [trace, org2, artifact2, claimId, digest("Vendor X")],
      "23503",
    );
  });

  it("rejects payment binding to a forged or cross-tenant issuer/verified-claim identity", async () => {
    const q = [
      "insert into payment_authority_bindings",
      "(organization_id, artifact_id, artifact_sha256, verified_claim_set_id, origin_attestation_id,",
      "vendor_id, destination_id, policy_id, invoice_number, amount_cents, currency,",
      "destination_sha256, policy_snapshot_sha256, tuple_sha256, expires_at)",
      "values ($1,$2,$3,$4,$5,$6,$7,$8,'INV-FORGED',101,'USD',$9,$10,$11,now()+interval '1 hour')",
    ].join(" ");
    await expectRejected(q, [
      org1, artifact1, hash, randomUUID(), attestationId, vendor1, destination1, policy1,
      digest("trusted@example.com"), digest("policy"), digest("tuple"),
    ], "23503");
    await expectRejected(q, [
      org2, artifact2, hash, claimId, attestationId, vendor1, destination1, policy1,
      digest("trusted@example.com"), digest("policy"), digest("tuple"),
    ], "23503");
  });

  it("does not allow AUTHORIZED on a binding without approval proof", async () => {
    await expectRejected(
      "update payment_authority_bindings set authorization_status = 'AUTHORIZED' where id = $1",
      [bindingId],
      "23514",
    );
  });

  it("enforces immutable original claim, field, attestation and lineage records", async () => {
    for (const [sql,params] of [
      ["update invoice_verified_claim_sets set verification_status = 'VERIFIED' where id=$1", [claimId]],
      ["delete from invoice_claim_field_sources where claim_set_id=$1", [claimId]],
      ["update invoice_origin_attestations set verifier_actor = 'attacker' where id=$1", [attestationId]],
      ["delete from parameter_lineage_events where trace_id=$1", [trace]],
    ] as const) {
      await expectRejected(sql, [...params], "AUTHORITY_PROVENANCE_IMMUTABLE");
    }
  });

  it("locks proposed payment tuple fields against modification or deletion", async () => {
    await expectRejected(
      "update payment_authority_bindings set amount_cents = 99900 where id=$1",
      [bindingId],
      "PAYMENT_BINDING_TUPLE_IMMUTABLE",
    );
    await expectRejected(
      "update payment_authority_bindings set destination_id = $2 where id=$1",
      [bindingId, "forged_destination"],
      "PAYMENT_BINDING_TUPLE_IMMUTABLE",
    );
    await expectRejected(
      "delete from payment_authority_bindings where id=$1",
      [bindingId],
      "AUTHORITY_PROVENANCE_IMMUTABLE",
    );
  });

  it("enforces one event at each source-to-sink trace sequence", async () => {
    await expectRejected(
      "insert into parameter_lineage_events (trace_id, sequence, organization_id, artifact_id, source_kind, trust_tier, event_type, field_name, observed_value_sha256) values ($1,1,$2,$3,'MODEL',1,'FIELD_OBSERVED','invoice_number',$4)",
      [trace, org1, artifact1, digest("INV-TEST")],
      "23505",
    );
  });
});
