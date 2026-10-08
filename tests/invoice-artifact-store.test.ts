import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/pool";
import {
  ArtifactQuotaError,
  MAX_ORGANIZATION_ARTIFACT_BYTES,
  MAX_ORGANIZATION_ARTIFACT_COUNT,
  assertInvoiceArtifactQuota,
  findInvoiceArtifactMetadata,
  loadInvoiceArtifactForAnalysis,
  storeUntrustedInvoiceArtifact,
} from "../src/artifacts/postgres-store";

const orgOne = "artifact_test_" + randomUUID();
const orgTwo = "artifact_test_" + randomUUID();
const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");

beforeAll(async () => {
  for (const id of [orgOne, orgTwo]) {
    await pool.query("insert into organizations (id, name) values ($1, 'Invoice artifact test')", [id]);
  }
});

afterAll(async () => {
  await pool.query("delete from invoice_artifacts where organization_id = any($1::text[])", [[orgOne, orgTwo]]);
  await pool.query("delete from organizations where id = any($1::text[])", [[orgOne, orgTwo]]);
  await pool.end();
});

describe("organization-bound artifact store", () => {
  it("persists exact bytes, deduplicates same-org uploads, and scopes reads", async () => {
    const first = await storeUntrustedInvoiceArtifact({
      organizationId: orgOne,
      contentType: "application/pdf",
      content: pdf,
    });
    const replay = await storeUntrustedInvoiceArtifact({
      organizationId: orgOne,
      contentType: "application/pdf",
      content: pdf,
    });
    const anotherOrg = await storeUntrustedInvoiceArtifact({
      organizationId: orgTwo,
      contentType: "application/pdf",
      content: pdf,
    });

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.artifactId).toBe(first.artifactId);
    expect(anotherOrg.artifactId).not.toBe(first.artifactId);
    expect(first.sha256).toBe(anotherOrg.sha256);
    expect((await loadInvoiceArtifactForAnalysis(orgOne, first.artifactId))?.content.equals(pdf)).toBe(true);
    expect(await findInvoiceArtifactMetadata(orgTwo, first.artifactId)).toBeNull();
    expect(await loadInvoiceArtifactForAnalysis(orgTwo, first.artifactId)).toBeNull();
    await expect(
      pool.query("update invoice_artifacts set content = $1 where id = $2", [
        Buffer.from("tampered invoice"),
        first.artifactId,
      ]),
    ).rejects.toThrow(/INVOICE_ARTIFACT_CONTENT_IMMUTABLE/);
  });
  it("rejects organization quota exhaustion before a new write", () => {
    expect(() =>
      assertInvoiceArtifactQuota(MAX_ORGANIZATION_ARTIFACT_BYTES, 1, 1),
    ).toThrow(ArtifactQuotaError);
    expect(() =>
      assertInvoiceArtifactQuota(0, MAX_ORGANIZATION_ARTIFACT_COUNT, 1),
    ).toThrow(ArtifactQuotaError);
    expect(() =>
      assertInvoiceArtifactQuota(0, 0, 100),
    ).not.toThrow();
  });

});
