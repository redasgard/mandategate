import { describe, expect, it, vi } from "vitest";
import { createMandategateServer, TOOLS } from "../mcp/mandategate-mcp.mjs";
import type { MandategateServer } from "../mcp/mandategate-mcp.mjs";

const baseEnv = {
  MANDATEGATE_BASE_URL: "http://127.0.0.1:3000",
  MANDATEGATE_AGENT_KEY: "mg_demo_payment_key_synthetic_000000000000",
};

const okResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300, status,
  text: async () => JSON.stringify(body),
});

const call = (server: MandategateServer, name: string, args: Record<string, unknown>) =>
  server.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name, arguments: args } });

describe("MandateGate MCP server (stdio contract)", () => {
  it("completes the initialize handshake and advertises both tools", async () => {
    const server = createMandategateServer({ env: baseEnv, fetchImpl: vi.fn() });
    const init = await server.handleMessage({ jsonrpc: "2.0", id: 0, method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } });
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect(init.result.serverInfo.name).toBe("mandategate");
    const list = await server.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(list.result.tools.map((t: { name: string }) => t.name).sort())
      .toEqual(["check_payment_request", "submit_payment_request"]);
    const names = TOOLS.map(t => t.name);
    expect(names).not.toContain("approve_payment");
    expect(names).not.toContain("execute_payment");
  });

  it("returns a protocol error for unknown methods and a tool error for unknown tools", async () => {
    const server = createMandategateServer({ env: baseEnv, fetchImpl: vi.fn() });
    const bad = await server.handleMessage({ jsonrpc: "2.0", id: 7, method: "does/not-exist" });
    expect(bad.error.code).toBe(-32601);
    const unknown = await call(server, "refund_everything", {});
    expect(unknown.result.isError).toBe(true);
    expect(unknown.result.content[0].text).toContain("Unknown tool");
  });

  it("refuses to submit without a configured agent key, before any network call", async () => {
    const fetchImpl = vi.fn();
    const server = createMandategateServer({ env: { ...baseEnv, MANDATEGATE_AGENT_KEY: "" }, fetchImpl });
    const result = await call(server, "submit_payment_request", {
      vendorId: "vendor_northstar", invoiceNumber: "MCP-1", amountCents: 120000,
      currency: "USD", paymentDestination: "ap@northstar.example" });
    expect(result.result.isError).toBe(true);
    expect(result.result.content[0].text).toContain("MANDATEGATE_AGENT_KEY");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("submits an idempotent request with a generated key and returns the decision", async () => {
    const fetchImpl = vi.fn(async (_url: string, _options: { headers: Record<string, string> }) =>
      okResponse(201, {
        requestId: "req-1", outcome: "ALLOW", reasonCodes: ["WITHIN_TRUSTED_BASELINE"],
        status: "ALLOWED", paymentExecuted: false,
      }));
    const server = createMandategateServer({ env: baseEnv, fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await call(server, "submit_payment_request", {
      vendorId: "vendor_northstar", invoiceNumber: "MCP-1", amountCents: 120000,
      currency: "USD", paymentDestination: "ap@northstar.example" });
    const payload = JSON.parse(result.result.content[0].text);
    expect(payload.replayed).toBe(false);
    expect(payload.paymentExecuted).toBe(false);
    expect(payload.decision.outcome).toBe("ALLOW");
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:3000/api/agent/payment-requests");
    expect(options.headers.authorization).toBe("Bearer " + baseEnv.MANDATEGATE_AGENT_KEY);
    expect(options.headers["idempotency-key"]).toMatch(/^mcp-/);
  });

  it("re-reads a persisted decision through idempotent replay and reports HTTP errors", async () => {
    const fetchImpl = vi.fn(async (_url: string, _options: { headers: Record<string, string> }) =>
      okResponse(200, { outcome: "DENY", reasonCodes: ["DESTINATION_MISMATCH"] }));
    fetchImpl
      .mockResolvedValueOnce(okResponse(200, { outcome: "DENY", reasonCodes: ["DESTINATION_MISMATCH"] }))
      .mockResolvedValueOnce(okResponse(409, { error: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST" }));
    const server = createMandategateServer({ env: baseEnv, fetchImpl: fetchImpl as unknown as typeof fetch });
    const replay = await call(server, "check_payment_request", {
      vendorId: "vendor_northstar", invoiceNumber: "MCP-1", amountCents: 120000,
      currency: "USD", paymentDestination: "changed-payee@synthetic.invalid",
      idempotencyKey: "mcp-check-00000001" });
    const payload = JSON.parse(replay.result.content[0].text);
    expect(payload.replayed).toBe(true);
    expect(payload.decision.outcome).toBe("DENY");
    const conflict = await call(server, "check_payment_request", {
      vendorId: "vendor_northstar", invoiceNumber: "MCP-1", amountCents: 120000,
      currency: "USD", paymentDestination: "changed-payee@synthetic.invalid",
      idempotencyKey: "mcp-check-00000001" });
    expect(conflict.result.isError).toBe(true);
    expect(conflict.result.content[0].text).toContain("409");
    const missingKey = await call(server, "check_payment_request", {
      vendorId: "vendor_northstar", invoiceNumber: "MCP-1", amountCents: 120000,
      currency: "USD", paymentDestination: "ap@northstar.example" });
    expect(missingKey.result.isError).toBe(true);
    expect(missingKey.result.content[0].text).toContain("idempotencyKey");
  });
});
