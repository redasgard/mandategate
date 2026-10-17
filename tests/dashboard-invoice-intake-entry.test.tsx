import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), decisions: vi.fn(), summary: vi.fn(),
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
vi.mock("../src/db/dashboard-overview", () => ({
  readDashboardSummary: mocks.summary,
}));
import DashboardPage from "../app/dashboard/page";

beforeEach(() => {
  mocks.session.mockReset();
  mocks.decisions.mockReset();
  mocks.summary.mockReset();
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
    expect(html).toContain("Upload and review an invoice");
    expect(html).toContain("Nothing on the intake page sends a payout");
    expect(html).toContain("separate from payment approval");
    expect(mocks.decisions).toHaveBeenCalledWith("reviewer-admin");
    expect(mocks.summary).toHaveBeenCalledWith("reviewer-admin");
  });

  it("does not expose the invoice intake to unauthenticated visitors", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(DashboardPage()).rejects.toThrow("REDIRECT:/sign-in");
    expect(mocks.decisions).not.toHaveBeenCalled();
    expect(mocks.summary).not.toHaveBeenCalled();
  });
});
