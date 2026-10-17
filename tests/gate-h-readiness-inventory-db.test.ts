import { afterAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/pool";
import { readGateHInventory } from "../src/gate-h/readiness-inventory";

afterAll(async () => { await pool.end(); });

describe("Gate H read-only inventory against the migrated CI PostgreSQL schema", () => {
  it("runs on seeded organization without mutating payment records", async () => {
    const query = [
      "select count(*)::int as n from payment_executions e",
      "join payment_requests pr on pr.id=e.payment_request_id",
      "where pr.organization_id=$1",
    ].join(" ");
    const before = await pool.query(query, ["org_demo"]);
    const report = await readGateHInventory("org_demo");
    const after = await pool.query(query, ["org_demo"]);

    expect(report.contract).toBe("mandategate/gate-h-readonly-inventory/v1");
    expect(report.status).toBe("BLOCKED");
    expect(report.payoutAuthorized).toBe(false);
    expect(report.modelOrPaymentRequestsMade).toBe(false);
    expect(report.counts.allPaymentExecutions).toBe(before.rows[0]?.n);
    expect(after.rows[0]?.n).toBe(before.rows[0]?.n);
    expect(report.tiers.strictPrivacy).toBe("NOT_EVALUATED");
  });
});
