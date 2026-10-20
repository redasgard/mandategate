import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), decisions: vi.fn(), summary: vi.fn(), incidents: vi.fn(), obligations: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error("REDIRECT:" + path); },
}));
vi.mock("../src/auth/auth", () => ({
  auth: { api: { getSession: mocks.session } },
}));
vi.mock("../src/db/views", () => ({
  listRecentDecisions: mocks.decisions,
}));
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
import DashboardPage from "../app/dashboard/page";

beforeEach(() => {
  mocks.session.mockReset();
  mocks.decisions.mockReset();
  mocks.summary.mockReset();
  mocks.incidents.mockReset().mockResolvedValue([]);
  mocks.obligations.mockReset().mockResolvedValue({
    asOfUtc:"2026-10-19",upcomingHorizon:"2026-11-02",items:[],
    overdue:{count:0,cents:"0"},upcoming:{count:0,cents:"0"},later:{count:0,cents:"0"},
    incomplete:false,basis:"UNVERIFIED_IMPORTED_AP_HISTORY",
  });
  mocks.session.mockResolvedValue({ user: { id: "reviewer-admin", email: "admin@example.test" } });
  mocks.decisions.mockResolvedValue([]);
  mocks.summary.mockResolvedValue({
    pendingReview: 0, denied: 0, payoutUnknown: 0,
    paidThisMonth: [], pendingInvoices: [],
  });
});

describe("judge and admin invoice-intake discovery", () => {
  it("exposes direct upload/review access without implying payment authorization", async () => {
    const html = renderToStaticMarkup(await DashboardPage());
    expect(html).toContain('aria-label="Invoice intake"');
    expect(html).toContain('href="/invoice-artifacts"');
    expect(html).toContain("Analyze, approve and execute invoice payments");
    expect(html).toContain("Approved payments are executed");
    expect(html).toContain("a reviewer controls authorization");
    expect(mocks.decisions).toHaveBeenCalledWith("reviewer-admin");
    expect(mocks.summary).toHaveBeenCalledWith("reviewer-admin");
    expect(mocks.incidents).toHaveBeenCalledWith("reviewer-admin", "ALL");
    expect(mocks.obligations).toHaveBeenCalledWith("reviewer-admin");
    expect(html).toContain('aria-label="Incident investigation"');
  });

  it("does not expose the invoice intake to unauthenticated visitors", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(DashboardPage()).rejects.toThrow("REDIRECT:/sign-in");
    expect(mocks.decisions).not.toHaveBeenCalled();
    expect(mocks.summary).not.toHaveBeenCalled();
    expect(mocks.incidents).not.toHaveBeenCalled();
    expect(mocks.obligations).not.toHaveBeenCalled();
  });
});
