import { describe, expect, it } from "vitest";
import { invoiceIntakeLabel } from "../src/ui/invoice-intake-status";
describe("Incoming invoice evidence labels", () => {
  it("does not describe a raw upload as an approved payment", () => {
    expect(invoiceIntakeLabel("STORED_UNTRUSTED")).toBe("Received · untrusted");
    expect(invoiceIntakeLabel("EXTRACTED")).toBe("Extracted · review required");
    expect(invoiceIntakeLabel("ESCALATED")).toBe("Review required");
  });
  it("keeps pending/failed/unknown states explicit", () => {
    expect(invoiceIntakeLabel("PENDING")).toBe("Analysis pending");
    expect(invoiceIntakeLabel("FAILED")).toBe("Analysis failed");
    expect(invoiceIntakeLabel("NEW_STATUS")).toBe("Review state");
  });
});
