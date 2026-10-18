import { describe, expect, it } from "vitest";
import { postSignInDestination } from "../src/auth/signin-target";

describe("safe Better Auth post-login redirect", () => {
  it("returns to the restricted judge page only for an exact allowlisted path", () => {
    expect(postSignInDestination("?returnTo=%2Fjudge")).toBe("/judge");
    expect(postSignInDestination("?returnTo=/judge")).toBe("/judge");
  });

  it("defaults to the admin dashboard when there is no return path", () => {
    expect(postSignInDestination("")).toBe("/dashboard");
    expect(postSignInDestination("?returnTo=%2Fdashboard")).toBe("/dashboard");
  });

  it("never follows an external host, protocol-relative URL, or near-match", () => {
    for (const search of [
      "?returnTo=https%3A%2F%2Fevil.example",
      "?returnTo=%2F%2Fevil.example",
      "?returnTo=%2Fjudge%2F..%2Fdashboard",
      "?returnTo=%2Fjudge%3Fsecret%3D1",
      "?returnTo=%2Fjudge%23hidden",
      "?returnTo=%5C%5Cevil.example",
      "?returnTo=%2Fjudge%2F",
      "?returnTo=%2Fjudge&returnTo=%2F%2Fevil.example",
      "?returnTo=%2F%2Fevil.example&returnTo=%2Fjudge",
    ]) {
      expect(postSignInDestination(search)).toBe("/dashboard");
    }
  });
});
