import { createPdf, createScannedPdf } from "../tests/helpers/pdf-fixture";
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

const readinessPath=baseUrl+"/api/admin/gate-h/readiness?organizationId=org_demo";
const anonymousReadiness=await fetch(readinessPath);
if(anonymousReadiness.status!==401)
  throw Error("READINESS_ANONYMOUS_ACCESS_NOT_BLOCKED");
const otherOrgReadiness=await fetch(
 baseUrl+"/api/admin/gate-h/readiness?organizationId=org_other",
 {headers:{cookie:adminCookie}},
);
if(otherOrgReadiness.status!==404)
  throw Error("READINESS_CROSS_TENANT_ACCESS_NOT_BLOCKED");
const adminReadiness=await fetch(readinessPath,{headers:{cookie:adminCookie}});
if(adminReadiness.status!==200 ||
   adminReadiness.headers.get("cache-control")!=="private, no-store")
  throw Error("READINESS_AUTHORIZED_READ_FAILED");
const {readiness}=await adminReadiness.json() as {
 readiness:{contract:string;status:string;payoutAuthorized:boolean;
 modelOrPaymentRequestsMade:boolean;organizationId:string};
};
if(readiness.contract!=="mandategate/gate-h-readonly-inventory/v1" ||
   readiness.organizationId!=="org_demo" ||readiness.status!=="BLOCKED" ||
   readiness.payoutAuthorized!==false ||
   readiness.modelOrPaymentRequestsMade!==false)
  throw Error("READINESS_INVENTORY_MISREPRESENTED_AUTHORITY");
console.log("read-only Gate H readiness smoke passed: admin-scoped, no payments");

// Route-level HTTP checks: an anonymous/invalid session must be redirected,
// while a valid admin session sees the real server-rendered dashboard.
for (const options of [
  { label: "anonymous", headers: {} },
  { label: "invalid-session", headers: { cookie: adminCookie.split("=")[0] + "=invalid-synthetic-session" } },
] satisfies Array<{label: string; headers: Record<string,string>}>) {
  const denied=await fetch(`${baseUrl}/dashboard`,{headers:options.headers.cookie ? {cookie:options.headers.cookie} : undefined,redirect:"manual"});
  const destination=denied.headers.get("location")??"";
  if (![302,303,307,308].includes(denied.status) ||
      !new URL(destination,baseUrl).pathname.startsWith("/sign-in")) {
    throw Error(`dashboard accepted ${options.label}: ${denied.status} ${destination}`);
  }
}
// Autonomous mandates are a real admin feature, never a public payment trigger.
const unauthMandates=await fetch(baseUrl+"/autopay",{redirect:"manual"});
if(![302,303,307,308].includes(unauthMandates.status))
  throw Error("anonymous autopay mandate console was not restricted");
const mandateScreen=await fetch(baseUrl+"/autopay",{headers:{cookie:adminCookie}});
if(mandateScreen.status!==200 ||
    !(await mandateScreen.text()).includes("Standing mandates"))
  throw Error("signed-in autopay mandate console not rendered");
console.log("autopay UI smoke passed: session required, inert grant preparation only, zero payouts");

const signedDashboard=await fetch(`${baseUrl}/dashboard`,{headers:{cookie:adminCookie}});
if(signedDashboard.status!==200 ||
   !(await signedDashboard.text()).includes("Attention required")) {
  throw Error("signed-in dashboard risk view failed to render");
}
// PRD-first operations shell: authenticated main navigation, agent and admin
// invoice evidence in the same bounded read-only Payments surface.
for (const [route,expected] of [
  ["/dashboard","Payment operations"],
  ["/payments","Incoming invoices"],
  ["/vendors","Trusted recipients"],
  ["/policies","Policies &amp; mandates"],
  ["/activity","Events and detection evidence"],
] as const) {
  const page=await fetch(baseUrl+route,{headers:{cookie:adminCookie}});
  const markup=await page.text();
  if(page.status!==200 || !markup.includes(expected) ||
     !markup.includes('aria-label="Primary navigation"')) {
    throw Error("operations UI smoke failed: "+route+" ("+page.status+")");
  }
}
console.log("operations UI smoke passed: authenticated PRD navigation, incoming invoices and decision ledger");

const adminUploadPath=`${baseUrl}/api/admin/invoice-artifacts`;
const enrollment=await fetch(`${baseUrl}/api/admin/vendor-origin-channels`,{
  method:"POST",headers:{
    cookie:adminCookie,origin:baseUrl,"content-type":"application/json",
  },
  body:JSON.stringify({
    organizationId:"org_demo",vendorId:"vendor_northstar",
    kind:"TRUSTED_PORTAL",
    // CI-only simulated independent record. This is not a real vendor event
    // and is not evidence for the live Gate H payout.
    independentEvidenceReference:"portal-event:synthetic-ci-source-not-real-issuer",
    confirmedOutsideInvoice:true,
  }),
});
if(![200,201].includes(enrollment.status))
  throw new Error(`admin enrollment request failed: ${enrollment.status} ${await enrollment.text()}`);
const enrolled=await enrollment.json() as {channel:{
  id:string;kind:string;evidenceStatus:string;issuerAuthenticated:boolean;paymentAuthorized:boolean;
}};
if(!enrolled.channel.id || enrolled.channel.kind!=="TRUSTED_PORTAL" ||
   enrolled.channel.evidenceStatus!=="ADMIN_ASSERTED_NOT_INDEPENDENTLY_VERIFIED" ||
   enrolled.channel.issuerAuthenticated!==false ||
   enrolled.channel.paymentAuthorized!==false)
  throw new Error("admin enrollment was misrepresented as genuine issuer or payment authority");

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
  sourcePreparation:{state:string;pageCount?:number;replayed?:boolean;parserVersion?:string;reasonCode?:string};
  sourceVerified:boolean;paymentAuthorized:boolean;paymentExecuted:boolean;trustState:string;
};
if(adminUploaded.artifact.analysisStatus!=="STORED_UNTRUSTED" ||
   adminUploaded.trustState!=="STORED_UNTRUSTED" ||
   adminUploaded.sourceVerified!==false ||
   adminUploaded.sourcePreparation.state!=="PARSER_TEXT_AVAILABLE_UNVERIFIED" ||
   adminUploaded.sourcePreparation.pageCount!==1 ||
   adminUploaded.paymentAuthorized!==false ||adminUploaded.paymentExecuted!==false)
  throw new Error("admin upload improperly gained payment authority");
const adminId=adminUploaded.artifact.artifactId;
// Parser text is already prepared at upload, but no T2/issuer verification
// or payment authority is implied by these untrusted source page records.
const autoPrepared=await fetch(`${adminUploadPath}/${adminId}/pdf-pages`,{
  headers:{cookie:adminCookie},
});
if(autoPrepared.status!==200)throw Error("ADMIN_UPLOAD_DID_NOT_PREPARE_PARSER_SOURCE");
const autoPayload=await autoPrepared.json() as {
  pages:Array<{text:string}>;issuerAuthenticated:boolean;paymentAuthorized:boolean;
};
if(autoPayload.pages.length!==1 ||!autoPayload.pages[0].text.includes("NS-SMOKE-ADM-01") ||
   autoPayload.issuerAuthenticated!==false ||autoPayload.paymentAuthorized!==false)
  throw Error("ADMIN_AUTO_PARSER_WAS_MISREPRESENTED_AS_T2_OR_AUTHORITY");
const source=await fetch(`${adminUploadPath}/${adminId}/source`,{
  headers:{cookie:adminCookie},
});
if(source.status!==200 ||source.headers.get("x-artifact-sha256")!==adminUploaded.artifact.sha256)
  throw new Error("admin source read lost artifact SHA provenance");
const sourceBytes=Buffer.from(await source.arrayBuffer());
if(!sourceBytes.equals(adminPdf))throw new Error("admin original PDF bytes changed");
const signedInReviewer=await fetch(`${baseUrl}/invoice-artifacts/${adminId}`,{
  headers:{cookie:adminCookie},
});
if(signedInReviewer.status!==200 ||
   !(await signedInReviewer.text()).includes("Analyze invoice with AI"))
  throw new Error("signed-in document observation UI is inaccessible");

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

const verifiedFacts={
  vendor_name:{value:"Northstar Components",sourceFragment:"Northstar Components",pageNumber:1},
  invoice_number:{value:"NS-SMOKE-ADM-01",sourceFragment:"Invoice NS-SMOKE-ADM-01",pageNumber:1},
  currency:{value:"USD",sourceFragment:"USD",pageNumber:1},
  total_amount_decimal:{value:"1.01",sourceFragment:"Total 1.01",pageNumber:1},
  invoice_payment_destination:{
    value:"ap@northstar.example",sourceFragment:"ap@northstar.example",pageNumber:1,
  },
};
const reviewBody={
  artifactId:adminId,expectedArtifactSha256:adminUploaded.artifact.sha256,
  reviewerReason:"Verified exact parser-backed PDF fields in synthetic CI reviewer journey",
  facts:verifiedFacts,
};
const factsPath=`${adminUploadPath}/${adminId}/verify-pdf-facts`;
const wrongReceiver=await fetch(factsPath,{
  method:"POST",headers:{
    cookie:adminCookie,origin:baseUrl,"content-type":"application/json",
  },
  body:JSON.stringify({...reviewBody,facts:{
    ...verifiedFacts,
    invoice_payment_destination:{
      value:"intruder@example.test",sourceFragment:"intruder@example.test",pageNumber:1,
    },
  }}),
});
if(wrongReceiver.status!==422)
  throw new Error(`source verifier accepted injected receiver: ${wrongReceiver.status}`);
const review=await fetch(factsPath,{
  method:"POST",headers:{
    cookie:adminCookie,origin:baseUrl,"content-type":"application/json",
  },
  body:JSON.stringify(reviewBody),
});
if(review.status!==201)
  throw new Error(`signed-in T2 source review failed: ${review.status} ${await review.text()}`);
const reviewed=await review.json() as {review:{
  claimSetId:string;sourceVerified:boolean;issuerAuthenticated:boolean;paymentAuthorized:boolean;
}};
if(!reviewed.review.claimSetId ||reviewed.review.sourceVerified!==true ||
   reviewed.review.issuerAuthenticated!==false ||reviewed.review.paymentAuthorized!==false)
  throw new Error("source verifier incorrectly granted issuer or payment authority");
// A separate image-only PDF is intentionally not the text PDF verified above.
// Convincing model-visible content is insufficient: no PDF.js page text means
// no T2 VERIFIED claim, issuer authentication, bound tuple, or PayPal payment.
// CI never invokes the external GLM provider for this negative case.
const scannedPdf=await createScannedPdf();
const scannedUpload=await fetch(adminUploadPath,{
  method:"POST",headers:adminHeaders,body:new Uint8Array(scannedPdf),
});
if(![200,201].includes(scannedUpload.status))
  throw new Error(`scanned PDF upload failed: ${scannedUpload.status} ${await scannedUpload.text()}`);
const scan=await scannedUpload.json() as {
  artifact:{artifactId:string;sha256:string;analysisStatus:string};
  sourcePreparation:{state:string;reasonCode?:string};sourceVerified:boolean;
  paymentAuthorized:boolean;paymentExecuted:boolean;
};
if(!scan.artifact.artifactId || scan.artifact.analysisStatus!=="STORED_UNTRUSTED" ||
   scan.sourcePreparation.state!=="NO_INDEPENDENT_PDF_TEXT" ||
   scan.sourcePreparation.reasonCode!=="PDF_PAGE_TEXT_UNAVAILABLE" ||
   scan.sourceVerified!==false ||
   scan.paymentAuthorized!==false || scan.paymentExecuted!==false)
  throw new Error("scanned PDF intake was incorrectly trusted or executed");
const scannedId=scan.artifact.artifactId;
const scannedPages=await fetch(`${adminUploadPath}/${scannedId}/pdf-pages`,{
  method:"POST",headers:{cookie:adminCookie,origin:baseUrl},
});
const scannedPagesResult=await scannedPages.json() as {error?:string};
if(scannedPages.status!==422 || scannedPagesResult.error!=="PDF_PAGE_TEXT_UNAVAILABLE")
  throw new Error("image-only PDF unexpectedly supplied independently corroborated page text");
const fakeScannedReview=await fetch(`${adminUploadPath}/${scannedId}/verify-pdf-facts`,{
  method:"POST",headers:{
    cookie:adminCookie,origin:baseUrl,"content-type":"application/json",
  },
  body:JSON.stringify({
    ...reviewBody,
    artifactId:scannedId,
    expectedArtifactSha256:scan.artifact.sha256,
    reviewerReason:"Negative synthetic scan: model-like facts cannot replace independent PDF text",
  }),
});
const scannedReviewResult=await fakeScannedReview.json() as {error?:string};
if(fakeScannedReview.status!==409 ||
   scannedReviewResult.error!=="PDF_INDEPENDENT_SOURCE_NOT_PREPARED")
  throw new Error("scanned source was promoted into a PDF-verified T2 claim");
const scannedProposal=await fetch(`${adminUploadPath}/${scannedId}/proposals`,{
  method:"POST",headers:{
    cookie:adminCookie,origin:baseUrl,"content-type":"application/json",
  },
  body:JSON.stringify({
    claimSetId:"11111111-1111-4111-8111-111111111111",
    attestationId:"22222222-2222-4222-8222-222222222222",
    expectedArtifactSha256:scan.artifact.sha256,
  }),
});
if(scannedProposal.status!==200)
  throw new Error(`scanned source proposal failed: ${scannedProposal.status} ${await scannedProposal.text()}`);
const scannedDecision=await scannedProposal.json() as {
  proposal:{outcome:string;reasonCodes:string[];bindingId:string|null;tupleSha256:string|null};
  paymentAuthorized:boolean;paymentExecuted:boolean;
};
if(scannedDecision.proposal.outcome!=="ESCALATE" ||
   !scannedDecision.proposal.reasonCodes.includes("SOURCE_CLAIM_NOT_INDEPENDENTLY_VERIFIED") ||
   scannedDecision.proposal.bindingId!==null ||
   scannedDecision.proposal.tupleSha256!==null ||
   scannedDecision.paymentAuthorized!==false || scannedDecision.paymentExecuted!==false)
  throw new Error("scanned model-only source reached a payment-authority binding");
console.log("PASS scanned-PDF authority negative: no independently verified T2, issuer proof or payment");

const withoutIssuer=await fetch(`${adminUploadPath}/${adminId}/proposals`,{
  method:"POST",headers:{
    cookie:adminCookie,origin:baseUrl,"content-type":"application/json",
  },
  body:JSON.stringify({
    claimSetId:reviewed.review.claimSetId,
    attestationId:"11111111-1111-4111-8111-111111111111",
    expectedArtifactSha256:adminUploaded.artifact.sha256,
  }),
});
if(withoutIssuer.status!==200)
  throw new Error(`unverified issuer proposal failed: ${withoutIssuer.status} ${await withoutIssuer.text()}`);
const proposed=await withoutIssuer.json() as {proposal:{
  outcome:string;reasonCodes:string[];bindingId:string|null;
},paymentAuthorized:boolean;paymentExecuted:boolean};
if(proposed.proposal.outcome!=="ESCALATE" ||
   proposed.proposal.bindingId!==null ||
   !proposed.proposal.reasonCodes.includes("ISSUER_ORIGIN_UNVERIFIED_OR_EXPIRED") ||
   proposed.paymentAuthorized!==false ||proposed.paymentExecuted!==false)
  throw new Error("PDF source-only invoice could bypass issuer attestation");

// Strictly synthetic CI authority-flow smoke. Human records are simulated and
// MUST NOT be presented as a real vendor issuer callback or actual payment proof.
const origin=await fetch(`${adminUploadPath}/${adminId}/origin-attestations`,{
  method:"POST",headers:{
    cookie:adminCookie,origin:baseUrl,"content-type":"application/json",
  },
  body:JSON.stringify({
    vendorId:"vendor_northstar",channelId:enrolled.channel.id,
    expectedArtifactSha256:adminUploaded.artifact.sha256,
    independentEvidenceReference:"portal-event:synthetic-ci-invoice-attestation-not-real",
  }),
});
if(origin.status!==201)
  throw new Error(`CI human-asserted origin attestation failed: ${origin.status} ${await origin.text()}`);
const originResult=await origin.json() as {
  attestation:{id:string;method:string;paymentAuthorized:boolean;independentEvidenceClaim:string};
  externallyVerifiedBySoftware:boolean;
};
if(!originResult.attestation.id ||
   originResult.externallyVerifiedBySoftware!==false ||
   originResult.attestation.independentEvidenceClaim!=="HUMAN_ATTESTATION" ||
   originResult.attestation.method!=="ADMIN_OUT_OF_BAND" ||
   originResult.attestation.paymentAuthorized!==false)
  throw new Error("CI human assertion was incorrectly presented as third-party verification");

const sourceBound=await fetch(`${adminUploadPath}/${adminId}/proposals`,{
  method:"POST",headers:{
    cookie:adminCookie,origin:baseUrl,"content-type":"application/json",
  },
  body:JSON.stringify({
    claimSetId:reviewed.review.claimSetId,
    attestationId:originResult.attestation.id,
    expectedArtifactSha256:adminUploaded.artifact.sha256,
  }),
});
if(sourceBound.status!==200)
  throw new Error(`source-bound CI proposal failed: ${sourceBound.status} ${await sourceBound.text()}`);
const bound=await sourceBound.json() as {proposal:{
  outcome:string;reasonCodes:string[];bindingId:string|null;tupleSha256:string|null;
},paymentAuthorized:boolean;paymentExecuted:boolean};
if(bound.proposal.outcome!=="ESCALATE" ||
   !bound.proposal.reasonCodes.includes("PENDING_EXACT_HUMAN_APPROVAL") ||
   !bound.proposal.bindingId ||!bound.proposal.tupleSha256 ||
   bound.paymentAuthorized!==false ||bound.paymentExecuted!==false)
  throw new Error("CI source proposal bypassed mandatory frozen-tuple human approval");

const reviewEndpoint=`${baseUrl}/api/admin/invoice-bindings/${bound.proposal.bindingId}`;
const attemptedStale=await fetch(reviewEndpoint,{
  method:"POST",headers:{
    cookie:adminCookie,origin:baseUrl,"content-type":"application/json",
  },
  body:JSON.stringify({
    action:"APPROVE",reason:"CI-only synthetic review with deliberately stale tuple",
    expectedTupleSha256:"0".repeat(64),
  }),
});
if(attemptedStale.status!==409)
  throw new Error("stale exact-tuple approval was not rejected");

const finalized=await fetch(reviewEndpoint,{
  method:"POST",headers:{
    cookie:adminCookie,origin:baseUrl,"content-type":"application/json",
  },
  body:JSON.stringify({
    action:"APPROVE",
    reason:"Synthetic CI-only admin assertion. Not a real supplier verification or payout.",
    expectedTupleSha256:bound.proposal.tupleSha256,
  }),
});
if(finalized.status!==200)
  throw new Error(`CI exact-tuple review failed: ${finalized.status} ${await finalized.text()}`);
const approved=await finalized.json() as {review:{
  status:string;action:string;paymentExecuted:boolean;
}};
if(approved.review.status!=="AUTHORIZED" ||
   approved.review.action!=="APPROVE" ||approved.review.paymentExecuted!==false)
  throw new Error("synthetic human review incorrectly created a payment execution");

const replayApproval=await fetch(reviewEndpoint,{
  method:"POST",headers:{
    cookie:adminCookie,origin:baseUrl,"content-type":"application/json",
  },
  body:JSON.stringify({
    action:"APPROVE",reason:"Second identical authorization is not allowed",
    expectedTupleSha256:bound.proposal.tupleSha256,
  }),
});
if(replayApproval.status!==409)
  throw new Error("approved authority tuple could be approved twice");

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

// Signed-in, production Next HTTP exercise of the approved AP-history journey.
// The CSV and every invoice are synthetic. No PayPal route is invoked.
const historyCSV=Buffer.from([
  "vendor_name,invoice_number,invoice_date,amount_decimal,currency,status,payment_destination",
  "Northstar Components,NS-SMOKE-HIST-101,2026-09-01,100.00,USD,PAID,older@example.test",
  "Northstar Components,NS-SMOKE-HIST-102,2026-09-02,110.00,USD,PAID,older@example.test",
  "Northstar Components,NS-SMOKE-HIST-103,2026-09-03,120.00,USD,PAID,older@example.test",
].join("\r\n")+"\r\n");
const history=await fetch(`${baseUrl}/api/admin/ap-history`,{
  method:"POST",headers:{
    cookie:adminCookie,origin:baseUrl,
    "content-type":"text/csv","x-mandategate-organization-id":"org_demo",
  },body:new Uint8Array(historyCSV),
});
if(![200,201].includes(history.status))
  throw Error(`signed-in historical CSV upload failed: ${history.status} ${await history.text()}`);
const storedHistory=await history.json() as {import:{
  accepted:number;quarantined:number;paymentExecuted:boolean;sourceSha256:string;
}};
if(storedHistory.import.accepted!==3 ||storedHistory.import.quarantined!==0 ||
   storedHistory.import.paymentExecuted!==false ||
   !/^[0-9a-f]{64}$/.test(storedHistory.import.sourceSha256))
  throw Error("historical import lost provenance or gained payment authority");
const historyPage=await fetch(`${baseUrl}/ap-history`,{headers:{cookie:adminCookie}});
if(historyPage.status!==200 ||!(await historyPage.text()).includes("AP baselines"))
  throw Error("signed-in AP history UI inaccessible");

const replayHistorical=await fetch(`${baseUrl}/api/agent/payment-requests`,{
  method:"POST",headers:{
    authorization:`Bearer ${paymentKey}`,
    "content-type":"application/json","idempotency-key":"smoke-ap-history-replay-v1",
  },body:JSON.stringify({
    vendorId:"vendor_northstar",
    invoiceNumber:"NS-SMOKE-HIST-101",amountCents:10000,currency:"USD",
    paymentDestination:trustedDestination,
  }),
});
if(![200,201].includes(replayHistorical.status))
  throw Error(`historical replay proposal request failed: ${replayHistorical.status} ${await replayHistorical.text()}`);
const historicalDecision=await replayHistorical.json() as {
  requestId:string;paymentExecuted:boolean;decision:{outcome:string;reasonCodes:string[]};
};
if(historicalDecision.decision.outcome!=="ESCALATE" ||
   !historicalDecision.decision.reasonCodes.includes("AP_INVOICE_NUMBER_REPLAY")||
   historicalDecision.paymentExecuted!==false)
  throw Error("imported paid invoice replay did not deterministically escalate without payout");
// An agent-origin escalation is an investigation, not a mandatory manual
// invoice-upload or Send-PayPal step. This read-only UI check never pays.
const detailPath=`${baseUrl}/payments/${historicalDecision.requestId}`;
const anonDetail=await fetch(detailPath,{redirect:"manual"});
if(![302,303,307,308].includes(anonDetail.status))
  throw Error("payment investigation exposed without login");
const paymentDetail=await fetch(detailPath,{headers:{cookie:adminCookie}});
const paymentMarkup=await paymentDetail.text();
if(paymentDetail.status!==200 ||
   !paymentMarkup.includes("Payment investigation") ||
   !paymentMarkup.includes("Why MandateGate made this decision") ||
   !paymentMarkup.includes("Agent API") ||
   !paymentMarkup.includes("Human review required") ||
   paymentMarkup.includes("Send this payment")) {
  throw Error("payment investigation UI does not match agent-first PRD");
}
const historicalReviewPath=`${baseUrl}/api/admin/payments/${historicalDecision.requestId}/review`;
const unsignedReview=await fetch(historicalReviewPath);
if(unsignedReview.status!==401)throw Error("anonymous reviewer could read financial decision snapshot");
const beforeDecline=await fetch(historicalReviewPath,{headers:{cookie:adminCookie}});
if(beforeDecline.status!==200)
  throw Error(`admin could not read exact escalation tuple: ${beforeDecline.status}`);
const snap=await beforeDecline.json() as {snapshot:{
  snapshotSha256:string;outcome:string;status:string;trustedDestinationCurrent:boolean;
}};
if(!/^[0-9a-f]{64}$/.test(snap.snapshot.snapshotSha256) ||
   snap.snapshot.outcome!=="ESCALATE"||snap.snapshot.status!=="ESCALATED" ||
   snap.snapshot.trustedDestinationCurrent!==true)
  throw Error("admin escalation tuple integrity failure");
const staleReview=await fetch(historicalReviewPath,{
  method:"POST",headers:{
    cookie:adminCookie,origin:baseUrl,"content-type":"application/json",
  },body:JSON.stringify({
    action:"DECLINE",explanation:"Synthetic historical invoice rejected by human reviewer",
    expectedSnapshotSha256:"0".repeat(64),
  }),
});
if(staleReview.status!==409)throw Error("stale historical review digest incorrectly accepted");
const declinedHistory=await fetch(historicalReviewPath,{
  method:"POST",headers:{
    cookie:adminCookie,origin:baseUrl,"content-type":"application/json",
  },body:JSON.stringify({
    action:"DECLINE",
    explanation:"This invoice number was already paid in synthetic imported history.",
    expectedSnapshotSha256:snap.snapshot.snapshotSha256,
  }),
});
if(declinedHistory.status!==201)
  throw Error(`recorded decline HTTP failed: ${declinedHistory.status} ${await declinedHistory.text()}`);
const recordedDecline=await declinedHistory.json() as {review:{
  action:string;status:string;executed:boolean;approvedForExecution:boolean;
}};
if(recordedDecline.review.action!=="DECLINE" ||
   recordedDecline.review.status!=="DECLINED" ||
   recordedDecline.review.executed!==false ||
   recordedDecline.review.approvedForExecution!==false)
  throw Error("historical decline changed payment authority");
// A second DECLINE exercises the DB's terminal-state check, even when
// the globally disabled payment rail independently rejects all ACCEPTs.
const secondReview=await fetch(historicalReviewPath,{
  method:"POST",headers:{cookie:adminCookie,origin:baseUrl,"content-type":"application/json"},
  body:JSON.stringify({action:"DECLINE",
    explanation:"A second review must not rewrite the first terminal action.",
    expectedSnapshotSha256:snap.snapshot.snapshotSha256}),
});
if(secondReview.status!==409)
  throw Error("historical review allowed duplicate terminal action: "+secondReview.status);
const rejectedAccept=await fetch(historicalReviewPath,{
  method:"POST",headers:{cookie:adminCookie,origin:baseUrl,"content-type":"application/json"},
  body:JSON.stringify({action:"ACCEPT",
    explanation:"A declined review must not gain payment authority while the rail is disabled.",
    expectedSnapshotSha256:snap.snapshot.snapshotSha256}),
});
if(process.env.MANDATEGATE_DISABLE_PAYMENTS==="1" && rejectedAccept.status!==503)
  throw Error("disabled payment rail did not reject ACCEPT: "+rejectedAccept.status);
const obligationsDenied=await fetch(baseUrl+"/obligations",{redirect:"manual"});
if(![302,303,307,308].includes(obligationsDenied.status))
  throw Error("anonymous imported AP obligations view was not restricted");
const obligationsPage=await fetch(baseUrl+"/obligations",{headers:{cookie:adminCookie}});
const obligationsHtml=await obligationsPage.text();
if(obligationsPage.status!==200 ||
   !obligationsHtml.includes("AP horizon") ||
   !obligationsHtml.includes("Imported outstanding invoices"))
  throw Error("signed-in imported AP obligations view not rendered");
const obligationsDashboard=await fetch(baseUrl+"/dashboard",{headers:{cookie:adminCookie}});
if(obligationsDashboard.status!==200 ||
   !(await obligationsDashboard.text()).includes("Imported AP obligations"))
  throw Error("dashboard did not show imported obligations without payout scheduling");
console.log("obligation smoke passed: signed-in imported AP view and dashboard, anonymous denied, no payouts");

const trustPage=await fetch(`${baseUrl}/vendors`,{headers:{cookie:adminCookie}});
if(trustPage.status!==200 ||
   !(await trustPage.text()).includes("Destination change investigations"))
  throw Error("signed-in vendor trust case dashboard unavailable");

const activityPage=await fetch(`${baseUrl}/activity`,{headers:{cookie:adminCookie}});
if(activityPage.status!==200 ||
   !(await activityPage.text()).includes("Events and detection evidence"))
  throw Error("signed-in activity and evidence view unavailable");

// S8 product path: an authenticated admin can prepare an inert proposal and
// explicitly reject it; no authorization or PayPal POST is created.
const policiesNoSession=await fetch(baseUrl+"/policies",{redirect:"manual"});
if(![302,303,307,308].includes(policiesNoSession.status))
  throw Error("policy console accepted anonymous access");
const policyPage=await fetch(baseUrl+"/policies",{headers:{cookie:adminCookie}});
if(policyPage.status!==200 ||
   !(await policyPage.text()).includes("Prepared policy changes"))
  throw Error("signed-in policy console did not render");
const proposalOriginHeaders={cookie:adminCookie,origin:baseUrl,"content-type":"application/json"};
const badPolicyOrigin=await fetch(baseUrl+"/api/admin/policy-proposals",{
  method:"POST",headers:{...proposalOriginHeaders,origin:"https://hostile.example"},
  body:JSON.stringify({organizationId:"org_demo",origin:"ADMIN_MANUAL",proposedLimitCents:1}),
});
if(badPolicyOrigin.status!==403)throw Error("policy proposal accepted forged origin");
const preparedPolicy=await fetch(baseUrl+"/api/admin/policy-proposals",{
  method:"POST",headers:proposalOriginHeaders,
  body:JSON.stringify({organizationId:"org_demo",origin:"ADMIN_MANUAL",proposedLimitCents:1}),
});
if(preparedPolicy.status!==201)
  throw Error("policy prepare HTTP failed: "+preparedPolicy.status+" "+await preparedPolicy.text());
const preparedPolicyJson=await preparedPolicy.json() as {
  proposal:{id:string;digest:string;activePolicyChanged:boolean}
};
if(!preparedPolicyJson.proposal.id||preparedPolicyJson.proposal.activePolicyChanged!==false)
  throw Error("policy proposal granted unexpected authority");
const stalePolicy=await fetch(baseUrl+"/api/admin/policy-proposals/"+preparedPolicyJson.proposal.id,{
  method:"POST",headers:proposalOriginHeaders,
  body:JSON.stringify({action:"ACTIVATE",expectedDigest:"0".repeat(64),
    explanation:"A stale proposal must never activate spending rules."}),
});
if(stalePolicy.status!==409)throw Error("policy accepted stale digest");
const rejectedPolicy=await fetch(baseUrl+"/api/admin/policy-proposals/"+preparedPolicyJson.proposal.id,{
  method:"POST",headers:proposalOriginHeaders,
  body:JSON.stringify({action:"REJECT",expectedDigest:preparedPolicyJson.proposal.digest,
    explanation:"Rejected synthetic policy fixture after negative confirmation test."}),
});
if(rejectedPolicy.status!==200)
  throw Error("policy rejection failed: "+rejectedPolicy.status+" "+await rejectedPolicy.text());
const afterPolicy=await fetch(baseUrl+"/policies",{headers:{cookie:adminCookie}});
if(afterPolicy.status!==200 || !(await afterPolicy.text()).includes("REJECTED"))
  throw Error("policy proposal review status did not persist");
console.log("policy smoke passed: authenticated preview, inert prepare, stale confirmation denied, rejection recorded, no payout");

// An active session must lose payment visibility as soon as its ADMIN
// membership is revoked. CI-only: never alter membership on hosted services.
if (process.env.CI === "true") {
  const dbHost = new URL(process.env.DATABASE_URL??"postgres://invalid").hostname;
  if (baseUrl !== "http://127.0.0.1:3000" ||
      dbHost !== "127.0.0.1" ||
      adminEmail !== "admin@mandategate.local") {
    throw Error("dashboard revocation smoke requires isolated localhost CI and synthetic admin");
  }
  const {pool}=await import("../src/db/pool");
  try {
    const users=await pool.query('select id from "user" where email=$1',[adminEmail]);
    if(users.rows.length!==1)throw Error("synthetic reviewer identity not unique");
    const actorId=users.rows[0].id as string;
    const member=await pool.query(
      "select role,active from organization_admin_memberships where user_id=$1 and organization_id='org_demo'",
      [actorId],
    );
    if(member.rows.length!==1 || member.rows[0].role!=="ADMIN" || member.rows[0].active!==true)
      throw Error("synthetic demo reviewer must start as active ADMIN");
    const current=await fetch(`${baseUrl}/dashboard`,{headers:{cookie:adminCookie}});
    if(current.status!==200 || !(await current.text()).includes(historicalDecision.requestId))
      throw Error("signed-in dashboard must show synthetic historical payment before revocation");
    await pool.query(
      "update organization_admin_memberships set active=false where user_id=$1 and organization_id='org_demo'",
      [actorId],
    );
    try {
      const revoked=await fetch(`${baseUrl}/dashboard`,{headers:{cookie:adminCookie}});
      if(revoked.status!==200)throw Error("revoked session dashboard response failed");
      const markup=await revoked.text();
      // Demo admin may have access to other test organizations. Revocation
      // must remove this organization's data, not require a globally empty UI.
      if(markup.includes(historicalDecision.requestId) ||
         !markup.includes("Attention required")) {
        throw Error("revoked session retained target invoice or failed to render dashboard");
      }
    } finally {
      await pool.query(
        "update organization_admin_memberships set active=true where user_id=$1 and organization_id='org_demo'",
        [actorId],
      );
    }
    const restored=await fetch(`${baseUrl}/dashboard`,{headers:{cookie:adminCookie}});
    if(restored.status!==200 || !(await restored.text()).includes(historicalDecision.requestId))
      throw Error("dashboard membership restoration was not reflected");
    const {verifyDashboardCrossOrgHttp}=await import("./verify-dashboard-cross-org-http");
    await verifyDashboardCrossOrgHttp(baseUrl,pool);
    console.log("dashboard auth smoke passed: anonymous denied, invalid cookie denied, active admin allowed, revoked organization invoice hidden, restored admin allowed");
  } finally {
    await pool.end();
  }
}
console.log("smoke passed: signed-in PDF T2-T4 synthetic authority, historical CSV import, imported replay ESCALATE, stale/repeat review denial, admin DECLINE, vendor trust alerts, activity view, zero payouts");

