export {};
const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const invoiceKey = process.env.DEMO_AGENT_API_KEY;
const paymentKey = process.env.DEMO_PAYMENT_AGENT_API_KEY;
const adminEmail = process.env.DEMO_ADMIN_EMAIL;
const adminPassword = process.env.DEMO_ADMIN_PASSWORD;
const trustedDestination = process.env.DEMO_PAYPAL_RECEIVER_EMAIL ?? "ap@northstar.example";

if (!invoiceKey || !paymentKey || !adminEmail || !adminPassword) {
  throw new Error("DEMO_AGENT_API_KEY, DEMO_PAYMENT_AGENT_API_KEY, DEMO_ADMIN_EMAIL, and DEMO_ADMIN_PASSWORD are required");
}
if (invoiceKey === paymentKey) throw new Error("Invoice and payment principals must use distinct keys");

const health = await fetch(`${baseUrl}/api/health`);
if (!health.ok) throw new Error(`health failed: ${health.status}`);

const signIn = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { origin: baseUrl, "content-type": "application/json" },
  body: JSON.stringify({ email: adminEmail, password: adminPassword }),
});
if (!signIn.ok) throw new Error(`admin sign-in failed: ${signIn.status} ${await signIn.text()}`);
if (!signIn.headers.get("set-cookie")) throw new Error("admin sign-in returned no session cookie");

const syntheticPdf = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n", "ascii");
const deniedPayment = await fetch(`${baseUrl}/api/agent/payment-requests`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${invoiceKey}`,
    "content-type": "application/json",
    "idempotency-key": "smoke-denied-invoice-principal-v1",
  },
  body: JSON.stringify({
    vendorId: "vendor_northstar",
    invoiceNumber: "SMOKE-LOW-TRUST-CANNOT-PAY",
    amountCents: 101,
    currency: "USD",
    paymentDestination: trustedDestination,
  }),
});
if (deniedPayment.status !== 401) {
  throw new Error(`invoice observer reached privileged payment submission: ${deniedPayment.status}`);
}

const blockedUpload = await fetch(`${baseUrl}/api/agent/invoice-artifacts`, {
  method: "POST",
  headers: { authorization: `Bearer ${paymentKey}`, "content-type": "application/pdf" },
  body: syntheticPdf,
});
if (blockedUpload.status !== 401) {
  throw new Error(`privileged payment principal reached invoice upload: ${blockedUpload.status}`);
}

const uploaded = await fetch(`${baseUrl}/api/agent/invoice-artifacts`, {
  method: "POST",
  headers: { authorization: `Bearer ${invoiceKey}`, "content-type": "application/pdf" },
  body: syntheticPdf,
});
if (![200, 201].includes(uploaded.status)) {
  throw new Error(`invoice upload failed: ${uploaded.status}`);
}
const data = (await uploaded.json()) as { artifact: { artifactId: string; analysisStatus: string } };
const artifactId = data.artifact.artifactId;
if (!artifactId || data.artifact.analysisStatus !== "STORED_UNTRUSTED") {
  throw new Error("invoice upload did not remain untrusted");
}

const metaDenied = await fetch(`${baseUrl}/api/agent/invoice-artifacts/${artifactId}`, {
  headers: { authorization: `Bearer ${paymentKey}` },
});
if (metaDenied.status !== 401) throw new Error("payment principal read invoice metadata");

const metaAllowed = await fetch(`${baseUrl}/api/agent/invoice-artifacts/${artifactId}`, {
  headers: { authorization: `Bearer ${invoiceKey}` },
});
if (metaAllowed.status !== 200) throw new Error("invoice principal could not read its own artifact");

const analysisDenied = await fetch(`${baseUrl}/api/agent/invoice-artifacts/${artifactId}/analyze`, {
  method: "POST",
  headers: { authorization: `Bearer ${paymentKey}` },
});
if (analysisDenied.status !== 401) throw new Error("payment principal invoked invoice image analysis");

const observationDenied = await fetch(`${baseUrl}/api/agent/invoice-artifacts/${artifactId}/analysis`, {
  headers: { authorization: `Bearer ${paymentKey}` },
});
if (observationDenied.status !== 401) throw new Error("payment principal read invoice observation");

const cases = [
  {
    expected: "ALLOW",
    body: { vendorId: "vendor_northstar", invoiceNumber: "SMOKE-ALLOW", amountCents: 120000, currency: "USD", paymentDestination: trustedDestination },
  },
  {
    expected: "ESCALATE",
    body: { vendorId: "vendor_northstar", invoiceNumber: "SMOKE-ESCALATE", amountCents: 280000, currency: "USD", paymentDestination: trustedDestination },
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
      authorization: `Bearer ${paymentKey}`,
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

console.log("smoke passed: separated principals + admin sign-in + ALLOW/ESCALATE/DENY, zero payouts executed");
