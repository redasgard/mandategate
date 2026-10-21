import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocked = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../src/db/pool", () => ({ pool: { query: mocked.query } }));
import { parseIncidentFilter, readDashboardIncidents } from "../src/db/dashboard-incidents";
import { IncidentInvestigation } from "../app/dashboard/incident-cards";

beforeEach(() => {
  mocked.query.mockReset().mockResolvedValue({ rows: [] });
});

describe("incident investigations are tenant-scoped and read-only", () => {
  it("uses only allowlisted filter literals and binds active ADMIN membership", async () => {
    for (const input of ["ALL", "REVIEW", "BLOCKED", "PAYOUT"] as const) {
      await readDashboardIncidents("actor-1", input, 800);
    }
    expect(mocked.query).toHaveBeenCalledTimes(4);
    for (const [sql, params] of mocked.query.mock.calls) {
      expect(sql).toContain("m.user_id=$1");
      expect(sql).toContain("m.role='ADMIN' and m.active=true");
      expect(sql).toContain("e.status");
      expect(sql).toContain("pr.created_at desc");
      // Human review is actionable; a completed deterministic DENY is not.
      const priority = sql.slice(sql.lastIndexOf("order by case"));
      expect(priority.indexOf("when pr.status='ESCALATED'")).toBeLessThan(
        priority.indexOf("when pr.status='DENIED'"));
      expect(params[0]).toBe("actor-1");
      expect(params[2]).toBe(40);
    }
    expect(parseIncidentFilter("'; drop table payment_requests;--")).toBe("ALL");
    expect(parseIncidentFilter(["PAYOUT"])).toBe("ALL");
    expect(parseIncidentFilter("review")).toBe("ALL");
  });

  it("renders real persisted signals with evidence and a safe investigation link", async () => {
    mocked.query.mockResolvedValue({ rows: [{
      id:"req-1",organization:"Acme",invoice_number:"INV-10",
      vendor:"Northstar", amount_cents:12500,currency:"USD",
      status:"DENIED",source:"agent_api",
      reason_codes:["DESTINATION_MISMATCH"],execution_status:null,
      created_at:new Date("2026-10-19T18:00:00Z"),
    }]});
    const items = await readDashboardIncidents("actor-2", "BLOCKED");
    expect(items[0]).toMatchObject({kind:"BLOCKED",title:"Destination substitution blocked"});
    const html=renderToStaticMarkup(<IncidentInvestigation incidents={items} activeFilter="BLOCKED"/>);
    expect(html).toContain('aria-label="Incident investigation"');
    expect(html).toContain("MandateGate deterministic policy");
    expect(html).toContain("DESTINATION_MISMATCH");
    expect(html).toContain('href="/payments/req-1"');
    expect(html).not.toContain("Execute payment");
  });

  it("does not turn a pending/unknown payout into a new submission affordance",async()=>{
    mocked.query.mockResolvedValue({rows:[{
      id:"req-p", organization:"Synthetic", invoice_number:"INV-P",
      vendor:"Vendor", amount_cents:101, currency:"USD",
      status:"APPROVED",reason_codes:["WITHIN_TRUSTED_BASELINE"],
      execution_status:"PAYMENT_UNKNOWN_MANUAL_RECONCILIATION",
      created_at:new Date("2026-10-19T18:05:00Z"),
    }]});
    const [entry]=await readDashboardIncidents("actor-2", "PAYOUT");
    const html=renderToStaticMarkup(<IncidentInvestigation incidents={[entry]} activeFilter="PAYOUT"/>);
    expect(entry.kind).toBe("PAYOUT");
    expect(html).toContain("Do not submit another payment");
    expect(html).not.toContain("PAY NOW");
  });
});
