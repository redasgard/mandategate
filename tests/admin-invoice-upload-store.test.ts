import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/pool";
import {
  ArtifactAdminAccessError,loadInvoiceArtifactForAnalysis,
  storeUntrustedInvoiceArtifact,
} from "../src/artifacts/postgres-store";

const adminOrg="admin_upload_test_"+randomUUID();
const foreignOrg="admin_upload_test_"+randomUUID();
const original=Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
const changed=Buffer.from("%PDF-1.7\n2 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
let actor="";

beforeAll(async()=>{
  const admin=await pool.query('select id from "user" where email=$1 limit 1',[
    process.env.DEMO_ADMIN_EMAIL,
  ]);
  if(admin.rows.length!==1)throw new Error("TEST_DEMO_ADMIN_REQUIRED");
  actor=admin.rows[0].id;
  await pool.query("insert into organizations(id,name) values($1,'Allowed admin org'),($2,'Foreign admin org')",
    [adminOrg,foreignOrg]);
  await pool.query([
    "insert into organization_admin_memberships(user_id,organization_id,role,active)",
    "values($1,$2,'ADMIN',true)",
  ].join(" "),[actor,adminOrg]);
});

afterAll(async()=>{
  await pool.query("delete from invoice_artifacts where organization_id=any($1::text[])",[
    [adminOrg,foreignOrg],
  ]);
  await pool.query("delete from organization_admin_memberships where organization_id=any($1::text[])",[
    [adminOrg,foreignOrg],
  ]);
  await pool.query("delete from organizations where id=any($1::text[])",[
    [adminOrg,foreignOrg],
  ]);
  await pool.end();
});

describe("transaction-scoped admin invoice intake",()=>{
  it("allows an active admin's organization, preserves bytes and exact replay",async()=>{
    const first=await storeUntrustedInvoiceArtifact({
      organizationId:adminOrg,adminUserId:actor,
      contentType:"application/pdf",content:original,
    });
    expect(first.replayed).toBe(false);
    expect(first.analysisStatus).toBe("STORED_UNTRUSTED");
    const repeated=await storeUntrustedInvoiceArtifact({
      organizationId:adminOrg,adminUserId:actor,
      contentType:"application/pdf",content:original,
    });
    expect(repeated.replayed).toBe(true);
    expect(repeated.artifactId).toBe(first.artifactId);
    expect((await loadInvoiceArtifactForAnalysis(adminOrg,first.artifactId))?.content.equals(original)).toBe(true);
    expect(await loadInvoiceArtifactForAnalysis(foreignOrg,first.artifactId)).toBeNull();
    const payments=await pool.query("select count(*)::int as n from payment_requests where organization_id=$1",
      [adminOrg]);
    expect(payments.rows[0].n).toBe(0);
  });

  it("refuses foreign tenant and unauthorized actor without writing",async()=>{
    for(const testCase of [
      {organizationId:foreignOrg,adminUserId:actor},
      {organizationId:adminOrg,adminUserId:randomUUID()},
    ]){
      await expect(storeUntrustedInvoiceArtifact({
        ...testCase,contentType:"application/pdf",content:changed,
      })).rejects.toBeInstanceOf(ArtifactAdminAccessError);
    }
    const count=await pool.query(
      "select count(*)::int as n from invoice_artifacts where organization_id=any($1::text[])",
      [[foreignOrg]],
    );
    expect(count.rows[0].n).toBe(0);
  });
  it("refuses disabled admin role after membership revocation",async()=>{
    await pool.query([
      "update organization_admin_memberships set active=false",
      "where user_id=$1 and organization_id=$2",
    ].join(" "),[actor,adminOrg]);
    await expect(storeUntrustedInvoiceArtifact({
      organizationId:adminOrg,adminUserId:actor,
      contentType:"application/pdf",content:changed,
    })).rejects.toMatchObject({code:"ORGANIZATION_NOT_FOUND"});
    const count=await pool.query(
      "select count(*)::int as n from invoice_artifacts where organization_id=$1",
      [adminOrg],
    );
    expect(count.rows[0].n).toBe(1);
  });
});
