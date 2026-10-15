import {mkdir,writeFile} from "node:fs/promises";
import {makeSyntheticPdf,EXPECTED_SHA256} from "./glm-synthetic-receiver.mjs";
const BASE="https://mandategate-web.onrender.com";
const result={
  scenario:"GLM_SYNTHETIC_RECEIVER_MISMATCH", sourceSha256:EXPECTED_SHA256,
  privacyMode:"SYNTHETIC_NON_ZDR_TEST", paymentExecuted:false,
  model:"glm-5.3-flash", state:"BLOCK", code:"NOT_STARTED",
  inferenceAttempted:false, providerServedInferenceProven:false
};
function check(v,code){if(!v)throw Error(code);}
async function req(path,options={},timeout=145000){
  return fetch(BASE+path,{...options,redirect:"manual",signal:AbortSignal.timeout(timeout)});
}
async function json(r){try{return await r.json();}catch{return {};}}
async function save(){
  await mkdir("out",{recursive:true});
  await writeFile("out/glm-synthetic-observation.json",JSON.stringify(result,null,2)+"\n");
  const lines=[
    "# Synthetic GLM invoice observation",
    "Verdict: "+result.state,
    "Reason: "+result.code,
    "Target model: "+result.model,
    "Source SHA-256: "+result.sourceSha256,
    "Inference attempted: "+String(result.inferenceAttempted),
    "Serving route verified: "+String(result.providerServedInferenceProven),
    "Payments disabled and zero transfer requested.",
    "Fictional invoice only; non-ZDR retention risk acknowledged.",
    "This does not establish real issuer authorization or ZDR compliance.",""
  ];
  await writeFile("out/glm-synthetic-observation.md",lines.join("\n"));
  console.log(lines.join("\n"));
}
async function run(){
  const password=process.env.DEMO_ADMIN_PASSWORD;
  check(typeof password==="string"&&password.length>=12,"DEMO_ADMIN_CREDENTIAL_MISSING");
  const health=await req("/api/health",{},60000);
  check(health.status===200&&(await json(health)).database==="ready","HOSTED_DATABASE_UNAVAILABLE");
  const disabled=await req("/api/paypal/webhooks",{
    method:"POST",headers:{"content-type":"application/json"},body:"{}"
  });
  check(disabled.status===503&&(await json(disabled)).error==="PAYMENT_INTEGRATIONS_DISABLED_FOR_PREVIEW",
    "PAYMENT_KILL_SWITCH_UNVERIFIED");
  const login=await req("/api/auth/sign-in/email",{
    method:"POST",headers:{origin:BASE,"content-type":"application/json"},
    body:JSON.stringify({email:"admin@mandategate.local",password})
  });
  check(login.status===200,"DEMO_ADMIN_LOGIN_FAILED");
  const cookie=login.headers.get("set-cookie")?.split(";")[0];
  check(cookie?.includes("="),"DEMO_ADMIN_COOKIE_MISSING");
  const invoice=makeSyntheticPdf();
  const uploaded=await req("/api/admin/invoice-artifacts",{
    method:"POST",
    headers:{cookie,origin:BASE,"content-type":"application/pdf","x-mandategate-organization-id":"org_demo"},
    body:invoice
  });
  const metadata=await json(uploaded);
  check([200,201].includes(uploaded.status),"SYNTHETIC_UPLOAD_HTTP_"+uploaded.status);
  check(metadata.artifact?.sha256===EXPECTED_SHA256,"SYNTHETIC_SOURCE_SHA_MISMATCH");
  check(metadata.trustState==="STORED_UNTRUSTED"&&metadata.paymentAuthorized===false,
    "SYNTHETIC_SOURCE_TRUST_MISMATCH");
  const id=metadata.artifact?.artifactId;
  check(typeof id==="string"&&/^[0-9a-f-]{36}$/i.test(id),"SYNTHETIC_ARTIFACT_ID_INVALID");
  result.artifactId=id;
  // Never repeat inference for an already-analyzed stored source.
  if(metadata.artifact.analysisStatus!=="STORED_UNTRUSTED"){
    result.code="ARTIFACT_ALREADY_ANALYZED";return;
  }
  result.inferenceAttempted=true;
  const observed=await req("/api/admin/invoice-artifacts/"+encodeURIComponent(id)+"/observe-synthetic",{
    method:"POST",
    headers:{cookie,origin:BASE,"content-type":"application/json"},
    body:JSON.stringify({
      expectedArtifactSha256:EXPECTED_SHA256,
      syntheticFixtureOnly:true,
      acknowledgeProviderRetentionRisk:true
    })
  });
  const data=await json(observed);
  if(observed.status!==200){
    result.code=typeof data.error==="string"&&/^[A-Z0-9_]+$/.test(data.error)
      ?data.error:"GLM_SYNTHETIC_ROUTE_REFUSED";
    result.httpStatus=observed.status;return;
  }
  check(data.privacyMode==="SYNTHETIC_NON_ZDR_TEST"&&
    data.issuerAuthenticated===false&&data.paymentAuthorized===false&&
    data.paymentExecuted===false,"GLM_AUTHORITY_BOUNDARY_FAILED");
  const observation=data.observation;
  check(observation?.status==="ESCALATE"&&
    Array.isArray(observation.reasonCodes)&&
    observation.reasonCodes.includes("SYNTHETIC_NON_ZDR_TEST_ONLY"),
    "GLM_ESCALATION_MISSING");
  const proof=observation.evidence;
  check(proof?.model==="glm-5.3-flash"&&
    typeof proof?.provider==="string"&&proof.provider.length>0&&
    typeof proof?.requestId==="string"&&proof.requestId.length>0&&
    proof.artifactSha256===EXPECTED_SHA256&&
    proof.syntheticNonZdrTest===true,"GLM_SERVING_PROOF_INVALID");
  result.state="PASS";result.code="REAL_SYNTHETIC_GLM_INFERENCE";
  result.providerServedInferenceProven=true;
  result.provider=proof.provider;
  result.requestId=proof.requestId;
  result.reasonCodes=observation.reasonCodes;
  result.gatewayZdr=proof.zdr===true;
}
try{await run();}catch(e){
  const message=e instanceof Error?e.message:"UNKNOWN";
  result.state="BLOCK";
  result.code=/^[A-Z0-9_]{3,120}$/.test(message)?message:"HARNESS_UNEXPECTED_ERROR";
}finally{
  await save();
  if(result.state!=="PASS")process.exitCode=1;
}
