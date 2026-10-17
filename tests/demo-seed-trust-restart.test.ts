import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/pool";
import { ensureDemoAuthorityFixture } from "../src/db/demo-seed-authority";

const nonce = randomUUID();
const organizationId = "restart_seed_" + nonce;
const vendorId = "vendor_restart_" + nonce;
const destinationId = "destination_restart_" + nonce;
const policyId = "policy_restart_" + nonce;
const trusted = "trusted@example.test";
const replacement = "replaced@example.test";
const seed = (receiver: string) => ensureDemoAuthorityFixture({
  organizationId, vendorId, destinationId, policyId, receiver,
});

beforeAll(async () => {
  await seed(trusted);
});
afterAll(async () => {
  await pool.query("delete from policies where id=$1", [policyId]);
  await pool.query("delete from vendor_destinations where id=$1", [destinationId]);
  await pool.query("delete from vendors where id=$1", [vendorId]);
  await pool.query("delete from organizations where id=$1", [organizationId]);
  await pool.end();
});

describe("restart-safe demo trusted-state seed", () => {
  it("creates the initial fictional organization, policy, vendor and destination", async () => {
    const records = await Promise.all([
      pool.query("select name from organizations where id=$1", [organizationId]),
      pool.query("select name,normal_max_amount_cents from vendors where id=$1", [vendorId]),
      pool.query("select destination,trusted from vendor_destinations where id=$1", [destinationId]),
      pool.query("select active,auto_pay_max_amount_cents from policies where id=$1", [policyId]),
    ]);
    expect(records[0].rows[0]?.name).toBe("MandateGate Demo Org");
    expect(records[1].rows[0]).toMatchObject({name:"Northstar Components",normal_max_amount_cents:250000});
    expect(records[2].rows[0]).toMatchObject({destination:trusted,trusted:true});
    expect(records[3].rows[0]).toMatchObject({active:true,auto_pay_max_amount_cents:300000});
  });

  it("does not restore a revoked destination, disabled policy, or vendor risk limit on replay", async () => {
    await pool.query("update organizations set name='Renamed demo' where id=$1", [organizationId]);
    await pool.query("update vendors set name='Renamed vendor',normal_max_amount_cents=100 where id=$1", [vendorId]);
    await pool.query("update vendor_destinations set trusted=false where id=$1", [destinationId]);
    await pool.query("update policies set active=false,auto_pay_max_amount_cents=100 where id=$1", [policyId]);

    await seed(replacement);
    await seed(replacement);

    const [org, vendor, destination, policy] = await Promise.all([
      pool.query("select name from organizations where id=$1", [organizationId]),
      pool.query("select name,normal_max_amount_cents from vendors where id=$1", [vendorId]),
      pool.query("select destination,trusted from vendor_destinations where id=$1", [destinationId]),
      pool.query("select active,auto_pay_max_amount_cents from policies where id=$1", [policyId]),
    ]);
    expect(org.rows[0]?.name).toBe("Renamed demo");
    expect(vendor.rows[0]).toMatchObject({name:"Renamed vendor",normal_max_amount_cents:100});
    expect(destination.rows[0]).toMatchObject({destination:trusted,trusted:false});
    expect(policy.rows[0]).toMatchObject({active:false,auto_pay_max_amount_cents:100});
    const counts = await pool.query(
      "select (select count(*)::int from vendor_destinations where id=$1) as destinations, (select count(*)::int from policies where id=$2) as policies",
      [destinationId,policyId],
    );
    expect(counts.rows[0]).toMatchObject({destinations:1,policies:1});
  });
});
