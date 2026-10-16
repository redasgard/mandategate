import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/pool";
import { storeUntrustedInvoiceArtifact } from "../src/artifacts/postgres-store";
import { createPdf } from "./helpers/pdf-fixture";
import {
  assertActualGateHGlmObservation, assertStrictGateHGlmReceipt,
} from "../src/gate-h/glm-evidence";

const organizationId="gate_h_glm_"+randomUUID();
const sha=(s:string)=>createHash("sha256").update(s).digest("hex");
const fixtures=new Map<string,{artifactId:string;sourceSha256:string;requestId:string}>();

function receipt(sourceSha256:string) {
  return {
    state:"ESCALATE",
    model:"glm-5.3-flash",
    gateway_zdr:true,
    error_code:null,
    synthetic_consent_seen:false,
    gateway_request_id:"ci-mocked-request-id",
    provider_name:"ci-simulated-not-a-live-provider",
    prompt_version:"invoice-vision-observer-v2",
    prompt_sha256:sha("ci-only-prompt"),
    input_sha256:sourceSha256,
    source_artifact_sha256:sourceSha256,
    extraction:{vendor_name:{value:"Northstar Components"}},
    reason_codes:["IMAGE_EVIDENCE_NOT_VERIFIED"],
  };
}

async function verify(name:string) {
  const fixture=fixtures.get(name);
  if(!fixture) throw Error("CI_FIXTURE_MISSING");
  return assertActualGateHGlmObservation({
    organizationId,
    artifactId:fixture.artifactId,
    gatewayRequestId:fixture.requestId,
  });
}

beforeAll(async()=>{
  const user=await pool.query(
    'select id from "user" where email=$1',
    [process.env.DEMO_ADMIN_EMAIL??"admin@mandategate.local"],
  );
  if(!user.rows[0]?.id)throw Error("SEED_ADMIN_REQUIRED");
  const userId:string=user.rows[0].id;
  await pool.query(
    "insert into organizations (id,name) values ($1,$2)",
    [organizationId,"Synthetic Gate H privacy proof regression"],
  );

  for(const [name,reasons] of [
    ["strict-shaped",["IMAGE_EVIDENCE_NOT_VERIFIED"]],
    ["synthetic-reason",["IMAGE_EVIDENCE_NOT_VERIFIED","SYNTHETIC_NON_ZDR_TEST_ONLY"]],
    ["synthetic-consent",["IMAGE_EVIDENCE_NOT_VERIFIED"]],
  ] as const){
    // Entirely fictional bytes and metadata. No real model or issuer is called.
    const stored=await storeUntrustedInvoiceArtifact({
      organizationId,
      contentType:"application/pdf",
      content:createPdf(["CI-only source "+name+"; not a vendor document"]),
    });
    const requestId="ci-mock-"+name;
    fixtures.set(name,{
      artifactId:stored.artifactId,
      sourceSha256:stored.sha256,
      requestId,
    });
    await pool.query([
      "insert into invoice_image_observations",
      "(artifact_id,organization_id,state,model,prompt_version,prompt_sha256,",
      "provider_name,gateway_request_id,input_sha256,gateway_zdr,",
      "extraction,reason_codes,error_code)",
      "values ($1,$2,'ESCALATE','glm-5.3-flash',$3,$4,$5,$6,$7,true,$8::jsonb,$9::jsonb,null)",
    ].join(" "),[
      stored.artifactId,organizationId,"invoice-vision-observer-v2",
      sha("ci-only-prompt"),"ci-simulated-not-a-live-provider",
      requestId,stored.sha256,JSON.stringify({vendor_name:{value:"Northstar Components"}}),
      JSON.stringify(reasons),
    ]);
    if(name==="synthetic-consent"){
      // The receipt has no synthetic reason tag. Independent consent audit
      // must still prevent treating it as ordinary ZDR evidence.
      await pool.query([
        "insert into invoice_synthetic_non_zdr_test_consents",
        "(organization_id,artifact_id,actor_user_id,source_sha256)",
        "values($1,$2,$3,$4)",
      ].join(" "),[organizationId,stored.artifactId,userId,stored.sha256]);
    }
  }
});
afterAll(async()=>{await pool.end();});

describe("Gate H strict serving proof excludes synthetic retention exceptions",()=>{
  it("recognizes only correctly shaped STRICT-looking CI metadata",async()=>{
    const source=fixtures.get("strict-shaped")!;
    expect(()=>assertStrictGateHGlmReceipt(receipt(source.sourceSha256))).not.toThrow();
    // This proves the SQL predicate and parser only, not live model privacy.
    await expect(verify("strict-shaped")).resolves.toBeUndefined();
  });

  it("rejects a ZDR=true synthetic receipt by its persisted exception reason",async()=>{
    await expect(verify("synthetic-reason")).rejects.toMatchObject({
      code:"GATE_H_REAL_GLM_ADVERSARIAL_EVIDENCE_NOT_FOUND",
    });
  });

  it("rejects ZDR=true when a synthetic consent exists but the reason is missing",async()=>{
    await expect(verify("synthetic-consent")).rejects.toMatchObject({
      code:"GATE_H_REAL_GLM_ADVERSARIAL_EVIDENCE_NOT_FOUND",
    });
  });

  it("binds exact organization, artifact and gateway request identity",async()=>{
    const good=fixtures.get("strict-shaped")!;
    for(const input of [
      {organizationId:"foreign_org",artifactId:good.artifactId,gatewayRequestId:good.requestId},
      {organizationId,artifactId:randomUUID(),gatewayRequestId:good.requestId},
      {organizationId,artifactId:good.artifactId,gatewayRequestId:"spoofed-other-request"},
    ]){
      await expect(assertActualGateHGlmObservation(input)).rejects.toMatchObject({
        code:"GATE_H_REAL_GLM_ADVERSARIAL_EVIDENCE_NOT_FOUND",
      });
    }
  });

  it("rejects malformed, failed, retargeted and insufficient mock route proofs",()=>{
    const good=receipt(fixtures.get("strict-shaped")!.sourceSha256);
    for(const change of [
      {state:"FAILED"},{state:"EXTRACTED_UNTRUSTED"},
      {model:"lookalike-model"},{gateway_zdr:false},
      {error_code:"EXPERIENTIAL_ROUTE_FAILURE"},{error_code:undefined},
      {provider_name:" "},{gateway_request_id:" "},
      {input_sha256:"f".repeat(64)},{input_sha256:"not-a-digest"},
      {prompt_sha256:"0"},{prompt_version:" "},
      {extraction:null},{extraction:"invalid"},
      {synthetic_consent_seen:true},{synthetic_consent_seen:undefined},
      {reason_codes:null},{reason_codes:{}},
      {reason_codes:["MODEL_CONFIDENT"]},
      {reason_codes:["IMAGE_EVIDENCE_NOT_VERIFIED",42]},
      {reason_codes:["IMAGE_EVIDENCE_NOT_VERIFIED","SYNTHETIC_NON_ZDR_TEST_ONLY"]},
    ]){
      expect(()=>assertStrictGateHGlmReceipt({...good,...change}))
        .toThrowError("GATE_H_REAL_GLM_ADVERSARIAL_EVIDENCE_NOT_FOUND");
    }
  });
});
