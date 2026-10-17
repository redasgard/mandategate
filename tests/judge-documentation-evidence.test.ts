import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const readme = read("README.md");
const matrix = read("devpost/judge-evidence-matrix.md");
const plan = read("devpost/october-2026-execution-plan.md");
const archivedLedger = read("devpost/build-state.md");
const archivedReview = read("devpost/reviews/slice-2-critical-review.md");

describe("judge documentation and evidence-bound claims", () => {
  it("keeps GLM T1, synthetic policy decisions and historical PayPal proof separate", () => {
    expect(readme).toContain("There are **three separate evidence paths**");
    expect(readme).toContain("not** triggered by the AI-reviewed invoices");
    expect(readme).toContain("Strict Gate H remains **BLOCKED**");
    expect(readme).toContain("consented synthetic route is **not** strict account-level ZDR");
    expect(readme).toContain("No payout occurs through judge replay");
    expect(readme).not.toContain("Known vendor + normal invoice -> `ALLOW` -> PayPal Sandbox payout");
    expect(readme).not.toContain("Trail history is hash-chained, checkpointed, signed, and externally anchored");
  });

  it("pins historical Sandbox identifiers to archived evidence instead of current Neon", () => {
    for (const id of [
      "ff515077-bf90-4800-80d7-3ef8f33d6ee2",
      "BA7V96FCY8Z64",
      "A3R9LWD8XTX72",
    ]) {
      expect(matrix).toContain(id);
      expect(archivedLedger).toContain(id);
      expect(archivedReview).toContain(id);
    }
    expect(matrix).toContain("previous Render deployment");
    expect(matrix).toContain("not GLM-to-PayPal");
    expect(matrix).toContain("No new PayPal payout");
    expect(readme).toContain("not** triggered by the AI-reviewed invoices");
  });

  it("does not list aspirational P1/P2 services as implemented integrations", () => {
    expect(readme).toContain("**Targeted but not release-verified:**");
    for (const name of ["Bryntum", "Elastic", "Zapier MCP", "Qwen / Jev / Laya"]) {
      expect(readme).toContain(name);
    }
    expect(matrix).toContain("**NOT ACCEPTED**");
    expect(readme).toContain("Inclusion in the architecture");
  });

  it("describes reproducible local setup without promising credentials or unguarded hosted replay", () => {
    const seed = read("scripts/seed.ts");
    const scope = read("src/auth/principal-provisioning.ts");
    const demo = read("src/demo/scenarios.ts");
    expect(readme).toContain("git switch build/slice-3-invoice-intake");
    expect(readme).toContain("DEMO_ADMIN_PASSWORD");
    expect(readme).toContain("set before the first seed");
    expect(readme).toContain("The seed **does not print the password**");
    expect(seed).toContain("demo admin credential material is intentionally not logged");
    expect(scope).toContain("at least 32 characters");
    expect(readme).toContain("MANDATEGATE_DISABLE_PAYMENTS=1");
    expect(demo).toContain('env.MANDATEGATE_DISABLE_PAYMENTS!=="1"');
    expect(readme).toContain("is **not** enabled automatically on an arbitrary local PostgreSQL installation");
    expect(readme).toContain("External judge access has not yet been independently verified");
  });

  it("uses the owner's October deadline, while explicitly leaving publication incomplete", () => {
    expect(readme).toContain("October 29, 2026, 6 PM Pacific");
    expect(readme).toContain("currently **private**");
    expect(readme).toContain("default `main` branch has not yet received");
    expect(matrix).toContain("actual Devpost confirmation");
    expect(plan).toContain("**Status:** ACTIVE on the development branch");
    expect(plan).toContain("THURSDAY OCTOBER 29, 2026, 6:00 PM PACIFIC");
    expect(plan).toContain("Nothing may be left to November 1");
  });

  it("binds the current evidence matrix to the exact previously verified CI and Render revision", () => {
    expect(matrix).toContain("a5586882bf54dd383155722fb18da2cc0fbc99be");
    expect(matrix).toContain("dep-db9cb8hsrm7s739ei99g");
    expect(matrix).toContain("38987835124");
    expect(matrix).toContain("38987838738");
    expect(matrix).toContain("351 passing tests");
    expect(matrix).toContain("0");
    expect(matrix).toContain("live invoice/issuer");
  });
});
