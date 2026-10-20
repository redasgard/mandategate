import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), decisions: vi.fn(), summary: vi.fn(), incidents: vi.fn(),
  obligations: vi.fn(), incoming: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error("REDIRECT:" + path); },
}));
vi.mock("../src/auth/auth", () => ({
  auth: { api: { getSession: mocks.session } },
}));
vi.mock("../src/auth/judge-dashboard", () => ({ isRestrictedJudge: async () => false }));
vi.mock("../src/db/views", () => ({ listRecentDecisions: mocks.decisions }));
vi.mock("../src/db/dashboard-incidents", () => ({
  readDashboardIncidents: mocks.incidents,
  parseIncidentFilter: (raw: unknown) => raw === "PAYOUT" ? "PAYOUT" : "ALL",
  INCIDENT_FILTERS: ["ALL","REVIEW","BLOCKED","PAYOUT"],
}));
vi.mock("../src/db/imported-obligations", () => ({
  readImportedObligations: mocks.obligations,
}));
vi.mock("../src/db/dashboard-overview", () => ({
  readDashboardSummary: mocks.summary,
}));
vi.mock("../src/db/operations-inbox", () => ({ readIncomingInvoices: mocks.incoming }));
import DashboardPage from "../app/dashboard/page";

beforeEach(() => {
  for (const key of ["session","decisions","summary","incidents","obligations","incoming"] as const)
    mocks[key].mockReset();
  mocks.incidents.mockResolvedValue([]);
  mocks.incoming.mockResolvedValue([]);
  mocks.obligations.mockResolvedValue({
    asOfUtc:"2026-10-19", upcomingHorizon:"2026-11-02", items:[],
    overdue:{count:0,cents:"0"}, upcoming:{count:0,cents:"0"}, later:{count:0,cents:"0"},
    incomplete:false, basis:"UNVERIFIED_IMPORTED_AP_HISTORY",
  });
  mocks.session.mockResolvedValue({ user: { id: "reviewer-admin", email: "admin@example.test" } });
  mocks.decisions.mockResolvedValue([]);
  mocks.summary.mockResolvedValue({
    pendingReview: 0, denied: 0, payoutUnknown: 0,
    paidThisMonth: [], pendingInvoices: [],
  });
});

describe("PRD-first operations dashboard", () => {
  it("prioritizes risks, money and agent intake without requiring a human invoice-upload journey", async () => {
    const html = renderToStaticMarkup(await DashboardPage());
    for(const link of ["/payments","/vendors","/policies","/activity"])
      expect(html).toContain('href="'+link+'"');
    expect(html).toContain('aria-label="Primary navigation"');
    expect(html).toContain('aria-label="Attention required"');
    expect(html).toContain("Money position");
    expect(html).toContain("Incoming invoices");
    expect(html).toContain('href="/invoice-artifacts"');
    expect(html).not.toContain('aria-label="Invoice intake"');
    expect(html).not.toContain("Download Northstar invoice");

    expect(mocks.decisions).toHaveBeenCalledWith("reviewer-admin");
    expect(mocks.summary).toHaveBeenCalledWith("reviewer-admin");
    expect(mocks.incidents).toHaveBeenCalledWith("reviewer-admin", "ALL");
    expect(mocks.obligations).toHaveBeenCalledWith("reviewer-admin");
    expect(mocks.incoming).toHaveBeenCalledWith("reviewer-admin", 5);
  });

  it("never loads organization projections for visitors without sessions", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(DashboardPage()).rejects.toThrow("REDIRECT:/sign-in");
    for(const key of ["decisions","summary","incidents","obligations","incoming"] as const)
      expect(mocks[key]).not.toHaveBeenCalled();
  });
});
