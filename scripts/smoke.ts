export {};
const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const apiKey = process.env.DEMO_AGENT_API_KEY;
const adminEmail = process.env.DEMO_ADMIN_EMAIL;
const adminPassword = process.env.DEMO_ADMIN_PASSWORD;

if (!apiKey || !adminEmail || !adminPassword) {
  throw new Error("DEMO_AGENT_API_KEY, DEMO_ADMIN_EMAIL, and DEMO_ADMIN_PASSWORD are required");
}

const health = await fetch(`${baseUrl}/api/health`);
if (!health.ok) throw new Error(`health failed: ${health.status}`);

const signIn = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { origin: baseUrl, "content-type": "application/json" },
  body: JSON.stringify({ email: adminEmail, password: adminPassword }),
});
if (!signIn.ok) throw new Error(`admin sign-in failed: ${signIn.status} ${await signIn.text()}`);
if (!signIn.headers.get("set-cookie")) throw new Error("admin sign-in returned no session cookie");

const cases = [
  {
    expected: "ALLOW",
    body: { vendorId: "vendor_northstar", invoiceNumber: "SMOKE-ALLOW", amountCents: 120000, currency: "USD", paymentDestination: "ap@northstar.example" },
  },
  {
    expected: "ESCALATE",
    body: { vendorId: "vendor_northstar", invoiceNumber: "SMOKE-ESCALATE", amountCents: 280000, currency: "USD", paymentDestination: "ap@northstar.example" },
  },
  {
    expected: "DENY",
    body: { vendorId: "vendor_northstar", invoiceNumber: "SMOKE-DENY", amountCents: 120000, currency: "USD", paymentDestination: "changed-destination@example.net" },
  },
] as const;

for (const [index, testCase] of cases.entries()) {
  const response = await fetch(`${baseUrl}/api/agent/payment-requests`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "idempotency-key": `smoke-${index}-${testCase.expected.toLowerCase()}`,
    },
    body: JSON.stringify(testCase.body),
  });
  if (![200, 201].includes(response.status)) {
    throw new Error(`submission failed: ${response.status} ${await response.text()}`);
  }
  const result = (await response.json()) as {
    decision: { outcome: string };
    paymentExecuted: boolean;
  };
  if (result.decision.outcome !== testCase.expected) {
    throw new Error(`expected ${testCase.expected}, got ${result.decision.outcome}`);
  }
  if (result.paymentExecuted !== false) {
    throw new Error("decision smoke must not execute a payment");
  }
}

console.log("smoke passed: admin sign-in + ALLOW/ESCALATE/DENY, zero payments executed");
