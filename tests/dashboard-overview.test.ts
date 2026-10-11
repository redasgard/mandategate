import { beforeEach, describe, expect, it, vi } from "vitest";
const spies = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../src/db/pool", () => ({ pool: { query: spies.query } }));
import { readDashboardSummary } from "../src/db/dashboard-overview";

beforeEach(() => {
  spies.query.mockReset();
  spies.query.mockImplementation(async (statement: string) => {
    if (statement.includes("as pending_review")) {
      return { rows: [{ pending_review: 2, denied: 1, payout_unknown: 1 }] };
    }
    if (statement.includes("as cents")) {
      return { rows: [{ currency: "USD", cents: "9007199254740993", n: 1 }] };
    }
    return { rows: [{
      id: "pending-1", invoice_number: "INV-21", vendor: "Test vendor",
      amount_cents: 15000, currency: "USD", reason_codes: ["AP_INVOICE_NUMBER_REPLAY"],
    }] };
  });
});

describe("risk-first dashboard projection", () => {
  it("keeps every query bound to current active ADMIN membership", async () => {
    const overview = await readDashboardSummary("actor-123");
    expect(overview.pendingReview).toBe(2);
    expect(overview.denied).toBe(1);
    expect(overview.payoutUnknown).toBe(1);
    expect(overview.paidThisMonth).toEqual([
      { currency: "USD", cents: "9007199254740993", count: 1 },
    ]);
    expect(overview.pendingInvoices[0].reasons).toEqual(["AP_INVOICE_NUMBER_REPLAY"]);
    expect(spies.query).toHaveBeenCalledTimes(3);
    for (const [sql, params] of spies.query.mock.calls) {
      expect(sql).toContain("organization_admin_memberships");
      expect(sql).toContain("m.user_id=$1");
      expect(sql).toContain("m.role='ADMIN'");
      expect(sql).toContain("m.active=true");
      expect(params).toEqual(["actor-123"]);
    }
  });
  it("reports no cases or fabricated paid totals when no evidence exists", async () => {
    spies.query.mockImplementation(async (statement: string) => ({
      rows: statement.includes("as pending_review")
        ? [{ pending_review: 0, denied: 0, payout_unknown: 0 }] : [],
    }));
    const overview = await readDashboardSummary("actor-empty");
    expect(overview.pendingReview).toBe(0);
    expect(overview.paidThisMonth).toEqual([]);
    expect(overview.pendingInvoices).toEqual([]);
  });
});
