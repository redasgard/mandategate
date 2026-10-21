import {describe,expect,it} from "vitest";
import {compareTrustedRecipient} from "../src/ui/trusted-recipient";

describe("Current trusted recipient comparison is informational only",()=>{
  it("does not infer trust from invoice payment destination",()=>{
    expect(compareTrustedRecipient([], "changed@example.test").isMismatch).toBe(true);
    expect(compareTrustedRecipient(["trusted@example.test"],"changed@example.test").label)
      .toBe("Destination mismatch · investigate");
  });
  it("does not pick one of two conflicting active records",()=>{
    const result=compareTrustedRecipient(["one@example.test","two@example.test"],"one@example.test");
    expect(result.isMismatch).toBe(true);
    expect(result.destination).toBe("Multiple active records");
  });
  it("labels an exact single current trusted match without granting authority",()=>{
    const result=compareTrustedRecipient(["trusted@example.test"],"trusted@example.test");
    expect(result.isMismatch).toBe(false);
    expect(result.label).toBe("Matches current trusted destination");
  });
});
