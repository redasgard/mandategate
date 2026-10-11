import {randomUUID} from "node:crypto";
import {beforeAll,afterAll,describe,expect,it} from "vitest";
import {pool} from "../src/db/pool";
import {importApHistory} from "../src/history/store";
const org="ap_import_test_"+randomUUID(),vendor="v_"+randomUUID();
let admin="";
beforeAll(async()=>{
  const row=await pool.query('select id from "user" where email=$1',[process.env.DEMO_ADMIN_EMAIL]);
  if(!row.rows[0])throw new Error("DEMO_ADMIN_REQUIRED");
  admin=row.rows[0].id;
  await pool.query("insert into organizations(id,name) values($1,'CSV test org')",[org]);
  await pool.query("insert into organization_admin_memberships(user_id,organization_id,role,active) values($1,$2,'ADMIN',true)",[admin,org]);
  await pool.query("insert into vendors(id,organization_id,name,normal_max_amount_cents) values($1,$2,'Northstar Components',100000)",[vendor,org]);
});
afterAll(async()=>{await pool.end();});
describe("AP import is versioned historical evidence, never payment authority",()=>{
  it("saves bytes and accepted rows, quarantines missing vendors and replays exactly",async()=>{
    const csv=Buffer.from(
      "vendor_name,invoice_number,invoice_date,amount_decimal,currency,status,payment_destination\n"+
      "Northstar Components,INV-101,2026-09-01,100.00,USD,PAID,old@vendor.test\n"+
      "Missing Vendor,INV-102,2026-09-02,100.00,USD,PAID,attacker@vendor.test\n",
    );
    const saved=await importApHistory({organizationId:org,actorUserId:admin,content:csv});
    expect(saved).toMatchObject({records:2,accepted:1,quarantined:1,replayed:false,
      paymentAuthorized:false,paymentExecuted:false});
    const same=await importApHistory({organizationId:org,actorUserId:admin,content:csv});
    expect(same.replayed).toBe(true);
    expect(same.importId).toBe(saved.importId);
    const imported=await pool.query("select source_bytes from ap_imports where id=$1",[saved.importId]);
    expect(imported.rows[0].source_bytes.equals(csv)).toBe(true);
    const row=await pool.query("select vendor_id,observed_payment_destination from ap_history_rows where import_id=$1",[saved.importId]);
    expect(row.rows).toMatchObject([{vendor_id:vendor,observed_payment_destination:"old@vendor.test"}]);
    const quarantine=await pool.query("select reason_codes from ap_history_quarantine where import_id=$1",[saved.importId]);
    expect(quarantine.rows[0].reason_codes).toContain("AP_VENDOR_UNRESOLVED");
    expect((await pool.query("select count(*)::int as n from payment_requests where organization_id=$1",[org])).rows[0].n).toBe(0);
    expect((await pool.query("select count(*)::int as n from vendor_destinations where vendor_id=$1",[vendor])).rows[0].n).toBe(0);
  });
  it("rejects unsigned, foreign or revoked administrator without importing",async()=>{
    const csv=Buffer.from("vendor_name,invoice_number,invoice_date,amount_decimal,currency,status\nNorthstar Components,INV,2026-09-01,1.00,USD,PAID\n");
    await expect(importApHistory({organizationId:org,actorUserId:randomUUID(),content:csv}))
      .rejects.toMatchObject({code:"ORGANIZATION_NOT_FOUND"});
    await pool.query("update organization_admin_memberships set active=false where organization_id=$1 and user_id=$2",[org,admin]);
    await expect(importApHistory({organizationId:org,actorUserId:admin,content:csv}))
      .rejects.toMatchObject({code:"ORGANIZATION_NOT_FOUND"});
  });
});
