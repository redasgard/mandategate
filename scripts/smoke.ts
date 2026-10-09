import { createPdf } from "../tests/helpers/pdf-fixture";
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

const adminCookie=signIn.headers.get("set-cookie")!.split(";")[0];
const adminUploadPath=`${baseUrl}/api/admin/invoice-artifacts`;
const adminPdf=createPdf([
  "Northstar Components Invoice NS-SMOKE-ADM-01 USD Total 1.01 ap@northstar.example",
]);
const adminBody=new Uint8Array(adminPdf);
const adminHeaders={
  cookie:adminCookie,origin:baseUrl,"content-type":"application/pdf",
  "x-mandategate-organization-id":"org_demo",
};
const fakeOrigin=await fetch(adminUploadPath,{
  method:"POST",headers:{...adminHeaders,origin:"https://foreign-origin.example"},
  body:adminBody,
});
if(fakeOrigin.status!==403)throw new Error("admin upload accepted forged Origin");
const anonymousUpload=await fetch(adminUploadPath,{
  method:"POST",
  headers:{origin:baseUrl,"content-type":"application/pdf",
    "x-mandategate-organization-id":"org_demo"},
  body:adminBody,
});
if(anonymousUpload.status!==401)throw new Error("admin upload accepted anonymous user");
const unauthorizedOrgUpload=await fetch(adminUploadPath,{
  method:"POST",
  headers:{...adminHeaders,"x-mandategate-organization-id":"org_not_member"},
  body:adminBody,
});
if(unauthorizedOrgUpload.status!==404)throw new Error("admin upload crossed org membership");
const adminUpload=await fetch(adminUploadPath,{
  method:"POST",headers:adminHeaders,body:adminBody,
});
if(![200,201].includes(adminUpload.status))
  throw new Error(`admin upload failed: ${adminUpload.status} ${await adminUpload.text()}`);
const adminUploaded=await adminUpload.json() as {
  artifact:{artifactId:string;sha256:string;analysisStatus:string};
  paymentAuthorized:boolean;paymentExecuted:boolean;trustState:string;
};
if(adminUploaded.artifact.analysisStatus!=="STORED_UNTRUSTED" ||
   adminUploaded.trustState!=="STORED_UNTRUSTED" ||
   adminUploaded.paymentAuthorized!==false ||adminUploaded.paymentExecuted!==false)
  throw new Error("admin upload improperly gained payment authority");
const adminId=adminUploaded.artifact.artifactId;
const source=await fetch(`${adminUploadPath}/${adminId}/source`,{
  headers:{cookie:adminCookie},
});
if(source.status!==200 ||source.headers.get("x-artifact-sha256")!==adminUploaded.artifact.sha256)
  throw new Error("admin source read lost artifact SHA provenance");
const sourceBytes=Buffer.from(await source.arrayBuffer());
if(!sourceBytes.equals(adminPdf))throw new Error("admin original PDF bytes changed");
const parse=await fetch(`${adminUploadPath}/${adminId}/pdf-pages`,{
  method:"POST",headers:{cookie:adminCookie,origin:baseUrl},
});
if(![200,201].includes(parse.status))
  throw new Error(`admin source page parse failed: ${parse.status} ${await parse.text()}`);
const parsedPages=await parse.json() as {
  pages:Array<{pageNumber:number;text:string;textSha256:string}>;
  issuerAuthenticated:boolean;paymentAuthorized:boolean;artifactSha256:string;
};
if(parsedPages.artifactSha256!==adminUploaded.artifact.sha256 ||
   parsedPages.pages.length!==1 ||
   !parsedPages.pages[0].text.includes("NS-SMOKE-ADM-01") ||
   parsedPages.issuerAuthenticated!==false ||parsedPages.paymentAuthorized!==false)
  throw new Error("admin PDF parser provenance or untrusted status failed");

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

console.log("smoke passed: admin raw PDF upload + actual page parsing + scoped auth + separate principals + ALLOW/ESCALATE/DENY, zero payouts executed");
