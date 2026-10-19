import { describe, expect, it } from "vitest";
import { judgeProvisioningAllowed } from "../src/demo/judge-provision-gate";

const baseline: Record<string,string|undefined> = {
  MANDATEGATE_RUNTIME_MODE: "neon-preview",
  MANDATEGATE_DISABLE_PAYMENTS: "1",
  DATABASE_URL: "postgresql://synthetic:synthetic@ep-silent-poetry-arjowm4d.c-4.us-west-2.aws.neon.tech/neondb?sslmode=require",
};

describe("one-time judge provisioning environment gate", () => {
  it("accepts the exact payments-disabled Neon preview only", () => {
    expect(judgeProvisioningAllowed(baseline)).toBe(true);
  });
  it("rejects the active Sandbox Payouts runtime even when it shows the judge page", () => {
    for (const disabled of ["0","1"]) {
      expect(judgeProvisioningAllowed({
        ...baseline, MANDATEGATE_RUNTIME_MODE:"neon-sandbox",
        MANDATEGATE_DISABLE_PAYMENTS:disabled, MANDATEGATE_JUDGE_PREVIEW_ENABLED:"1",
      })).toBe(false);
    }
  });
  it("rejects an enabled payment switch, default mode, wrong database or incomplete environment", () => {
    for (const patch of [
      {MANDATEGATE_DISABLE_PAYMENTS:"0"},
      {MANDATEGATE_DISABLE_PAYMENTS:undefined},
      {MANDATEGATE_RUNTIME_MODE:"legacy"},
      {MANDATEGATE_RUNTIME_MODE:undefined},
      {DATABASE_URL:"postgresql://synthetic:synthetic@other.example.com/neondb"},
      {DATABASE_URL:"postgresql://synthetic:synthetic@ep-silent-poetry-arjowm4d.c-4.us-west-2.aws.neon.tech/other"},
      {DATABASE_URL:undefined},
    ]) expect(judgeProvisioningAllowed({...baseline,...patch})).toBe(false);
  });
});
