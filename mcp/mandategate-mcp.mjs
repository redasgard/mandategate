#!/usr/bin/env node
/**
 * MandateGate MCP server (stdio transport, dependency-free).
 *
 * Exposes the scoped agent payment-request API to MCP clients (Claude Code,
 * Claude Desktop, Cursor, any MCP host). Deliberately there is NO tool to
 * approve, execute, refund or change limits: an MCP client can only submit a
 * payment request and re-read its persisted decision. Authority stays with the
 * MandateGate policy kernel and a human reviewer.
 *
 * Configuration (environment):
 *   MANDATEGATE_BASE_URL  MandateGate origin, default http://localhost:3000
 *   MANDATEGATE_AGENT_KEY scoped agent key (local demo: DEMO_PAYMENT_AGENT_API_KEY)
 *
 * Run:  MANDATEGATE_AGENT_KEY=... node mcp/mandategate-mcp.mjs
 */
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

export const PROTOCOL_VERSION = "2025-06-18";
export const SERVER_INFO = { name: "mandategate", version: "0.1.0" };

const FIELDS = {
  vendorId: { type: "string", minLength: 1, maxLength: 120,
    description: "Vendor identifier (local demo: vendor_northstar)." },
  invoiceNumber: { type: "string", minLength: 1, maxLength: 120 },
  amountCents: { type: "integer", minimum: 1,
    description: "Amount in integer cents, e.g. 120000 = USD 1,200.00." },
  currency: { type: "string", pattern: "^[A-Z]{3}$",
    description: "ISO 4217 code, e.g. USD." },
  paymentDestination: { type: "string", minLength: 3, maxLength: 320,
    description: "Payee destination taken from the invoice. It must match the vendor's trusted destination or the request is denied." },
  idempotencyKey: { type: "string", minLength: 8, maxLength: 128,
    pattern: "^[A-Za-z0-9._:-]+$",
    description: "Caller-chosen key making retries safe: resending the same key with the same fields reads back the original decision instead of creating a duplicate request." },
};

export const TOOLS = [
  {
    name: "submit_payment_request",
    description:
      "Submit a vendor payment request to MandateGate for authorization review. Returns the recorded decision (ALLOW, ESCALATE or DENY), reason codes and paymentExecuted=false. This tool never moves money: a request can proceed to a PayPal Sandbox payout only after independent policy checks and explicit human approval outside this tool.",
    inputSchema: {
      type: "object",
      properties: { ...FIELDS, idempotencyKey: { ...FIELDS.idempotencyKey,
        description: FIELDS.idempotencyKey.description + " Optional: one is generated when omitted." } },
      required: ["vendorId", "invoiceNumber", "amountCents", "currency", "paymentDestination"],
      additionalProperties: false,
    },
  },
  {
    name: "check_payment_request",
    description:
      "Read back the persisted decision for a previously submitted logical request. Implemented as an idempotent replay: provide the original idempotencyKey and the exact same fields; no new request is created and no payment state changes.",
    inputSchema: {
      type: "object",
      properties: FIELDS,
      required: ["vendorId", "invoiceNumber", "amountCents", "currency", "paymentDestination", "idempotencyKey"],
      additionalProperties: false,
    },
  },
];

const textResult = (value, isError = false) => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

export function createMandategateServer({ fetchImpl = fetch, env = process.env } = {}) {
  const base = (env.MANDATEGATE_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const key = env.MANDATEGATE_AGENT_KEY;

  async function submitAgainstApi(args, { requireGivenKey }) {
    if (!key)
      return textResult("MANDATEGATE_AGENT_KEY is not configured. Set it to a scoped agent key; in the local demo this is the DEMO_PAYMENT_AGENT_API_KEY value from .env.local.", true);
    const { vendorId, invoiceNumber, amountCents, currency, paymentDestination } = args ?? {};
    if (!vendorId || !invoiceNumber || !Number.isInteger(amountCents) ||
        !/^[A-Z]{3}$/.test(currency ?? "") || !paymentDestination)
      return textResult("Missing or invalid required fields: vendorId, invoiceNumber, amountCents (integer), currency (e.g. USD), paymentDestination.", true);
    const given = typeof args.idempotencyKey === "string" && args.idempotencyKey.length >= 8
      ? args.idempotencyKey : null;
    if (requireGivenKey && !given)
      return textResult("idempotencyKey is required to re-read an existing request.", true);
    const idempotencyKey = given ?? `mcp-${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`;

    let response;
    try {
      response = await fetchImpl(`${base}/api/agent/payment-requests`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({ vendorId, invoiceNumber, amountCents, currency, paymentDestination }),
      });
    } catch (error) {
      return textResult(`Could not reach MandateGate at ${base}: ${error?.message ?? error}`, true);
    }
    const raw = await response.text();
    let body;
    try { body = JSON.parse(raw); } catch { body = raw; }
    if (!response.ok)
      return textResult({ httpStatus: response.status, idempotencyKey, response: body }, true);
    return textResult({ idempotencyKey, replayed: response.status === 200, paymentExecuted: false, decision: body });
  }

  async function handleMessage(message) {
    const { id, method, params } = message ?? {};
    if (method === "initialize")
      return { jsonrpc: "2.0", id, result: {
        protocolVersion: typeof params?.protocolVersion === "string" ? params.protocolVersion : PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      } };
    if (method === "notifications/initialized" || method === "notifications/cancelled") return null;
    if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
    if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
    if (method === "tools/call") {
      const name = params?.name;
      const args = params?.arguments ?? {};
      if (name === "submit_payment_request")
        return { jsonrpc: "2.0", id, result: await submitAgainstApi(args, { requireGivenKey: false }) };
      if (name === "check_payment_request")
        return { jsonrpc: "2.0", id, result: await submitAgainstApi(args, { requireGivenKey: true }) };
      return { jsonrpc: "2.0", id, result: textResult(`Unknown tool: ${String(name)}`, true) };
    }
    if (id !== undefined)
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${String(method)}` } };
    return null;
  }

  return { handleMessage };
}

export function attachStdio(server, { input = process.stdin, output = process.stdout } = {}) {
  const lines = createInterface({ input });
  lines.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message;
    try { message = JSON.parse(trimmed); } catch { return; }
    try {
      const response = await server.handleMessage(message);
      if (response) output.write(JSON.stringify(response) + "\n");
    } catch (error) {
      if (message?.id !== undefined)
        output.write(JSON.stringify({ jsonrpc: "2.0", id: message.id,
          error: { code: -32603, message: String(error?.message ?? error) } }) + "\n");
    }
  });
  return lines;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  attachStdio(createMandategateServer());
  console.error("MandateGate MCP server ready (stdio). Tools: submit_payment_request, check_payment_request.");
}
