import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/pool";
import { listRecentDecisions, getDecisionDetail } from "../src/db/views";

const goodOrg = "read_good_" + randomUUID(), otherOrg = "read_other_" + randomUUID();
const goodVendor = "vendor_" + randomUUID(), otherVendor = "vendor_" + randomUUID();
const ownId = randomUUID(), otherId = randomUUID();
let adminId = "";
beforeAll(async () => {
  const admins = await pool.query('select id from "user" where email=$1', [process.env.DEMO_ADMIN_EMAIL]);
  if (!admins.rows[0]) throw new Error("TEST_ADMIN_MISSING");
  adminId = admins.rows[0].id;
  await pool.query("insert into organizations (id,name) values ($1,'Your org'),($2,'Other org')", [goodOrg,otherOrg]);
  await pool.query("insert into organization_admin_memberships(user_id,organization_id,role,active) values($1,$2,'ADMIN',true)", [adminId,goodOrg]);
  await pool.query("insert into vendors (id,organization_id,name,normal_max_amount_cents) values ($1,$2,'Yours',999999),($3,$4,'Foreign',999999)", [goodVendor,goodOrg,otherVendor,otherOrg]);
  await pool.query([
    "insert into payment_requests(id,logical_payment_id,organization_id,vendor_id,invoice_number,amount_cents,currency,requested_destination,status,source)",
    "values($1,$2,$3,$4,'YOUR-INV',101,'USD','owned@example.test','ALLOWED','demo_fixture'),",
    "($5,$6,$7,$8,'OTHER-INV',101,'USD','foreign@example.test','ALLOWED','demo_fixture')",
  ].join(" "), [ownId,randomUUID(),goodOrg,goodVendor,otherId,randomUUID(),otherOrg,otherVendor]);
  await pool.query("insert into payment_decisions(id,payment_request_id,outcome,reason_codes,evidence) values($1,$2,'ALLOW','[]','[]'),($3,$4,'ALLOW','[]','[]')",
    [randomUUID(),ownId,randomUUID(),otherId]);
});
afterAll(async () => {
  await pool.query("delete from payment_decisions where payment_request_id = any($1::text[])", [[ownId,otherId]]);
  await pool.query("delete from payment_requests where id = any($1::text[])", [[ownId,otherId]]);
  await pool.query("delete from vendors where id = any($1::text[])", [[goodVendor,otherVendor]]);
  await pool.query("delete from organization_admin_memberships where organization_id=any($1::text[])", [[goodOrg,otherOrg]]);
  await pool.query("delete from organizations where id=any($1::text[])", [[goodOrg,otherOrg]]);
  await pool.end();
});
describe("tenant-isolated financial dashboard and details",()=>{
  it("returns current organization's payments but never foreign tenant's", async()=>{
    const list=await listRecentDecisions(adminId,100);
    expect(list.some(x=>x.requestId===ownId)).toBe(true);
    expect(list.some(x=>x.requestId===otherId)).toBe(false);
    expect(await getDecisionDetail(ownId,adminId)).toMatchObject({requestId:ownId});
    expect(await getDecisionDetail(otherId,adminId)).toBeNull();
  });
  it("honors revocation at query time",async()=>{
    await pool.query("update organization_admin_memberships set active=false where organization_id=$1 and user_id=$2",[goodOrg,adminId]);
    expect((await listRecentDecisions(adminId,100)).some(x=>x.requestId===ownId)).toBe(false);
    expect(await getDecisionDetail(ownId,adminId)).toBeNull();
  });
});
