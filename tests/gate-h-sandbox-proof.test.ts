import {describe,expect,it} from "vitest";
import {
 assertNegativeCaseResult,checkBoundedSandboxPayout,
 GateHSandboxError,makeSinglePayoutPostFence,
 validateGateHSandboxEnvironment,
} from "../src/gate-h/sandbox-proof";

const uuid=(s:string)=>s.padEnd(8,"0")+"-1111-4111-8111-111111111111";
const data:NodeJS.ProcessEnv={
 NODE_ENV:"test",
 MANDATEGATE_STAGING:"1",
 GATE_H_ISOLATED_DATABASE_CONFIRMED:"1",
 PAYPAL_BASE_URL:"https://api-m.sandbox.paypal.com",
 GATE_H_ORGANIZATION_ID:"org_demo_ci",
 GATE_H_ALLOW_BINDING_ID:uuid("00000001"),
 GATE_H_ALLOW_ARTIFACT_SHA256:"a".repeat(64),
 GATE_H_ALLOW_TUPLE_SHA256:"b".repeat(64),
 DEMO_PAYPAL_RECEIVER_EMAIL:"sandbox-receiver@example.test",
 GATE_H_ESCALATE_ARTIFACT_ID:uuid("00000002"),
 GATE_H_ESCALATE_CLAIM_SET_ID:uuid("00000003"),
 GATE_H_ESCALATE_ATTESTATION_ID:uuid("00000004"),
 GATE_H_DENY_ARTIFACT_ID:uuid("00000005"),
 GATE_H_DENY_CLAIM_SET_ID:uuid("00000006"),
 GATE_H_DENY_ATTESTATION_ID:uuid("00000007"),
};
const payable={
 amountCents:101,currency:"USD",receiver:"sandbox-receiver@example.test",
 artifactSha256:"a".repeat(64),tupleSha256:"b".repeat(64),
 authorizationStatus:"AUTHORIZED",sourceKind:"PDF_TEXT",
 verificationStatus:"VERIFIED",originMethod:"ADMIN_OUT_OF_BAND",
 originChannelKind:"KNOWN_CALLBACK",channelPredatesArtifact:true,
 approvalActor:"admin_user",
};
const expected={
 receiver:"sandbox-receiver@example.test",
 artifactSha256:"a".repeat(64),tupleSha256:"b".repeat(64),
};

describe("Gate H exact one Sandbox payout guard",()=>{
  it("requires exact staging host, isolated DB and distinct negative fixtures",()=>{
    expect(()=>validateGateHSandboxEnvironment(data,"preflight")).not.toThrow();
    for(const override of [
      {MANDATEGATE_STAGING:"0"},
      {GATE_H_ISOLATED_DATABASE_CONFIRMED:"0"},
      {PAYPAL_BASE_URL:"https://api-m.paypal.com"},
      {GATE_H_DENY_ARTIFACT_ID:data.GATE_H_ESCALATE_ARTIFACT_ID},
    ]){
      expect(()=>validateGateHSandboxEnvironment({...data,...override},"preflight"))
        .toThrow(GateHSandboxError);
    }
  });
  it("requires separate one-time payout grant, issuer evidence, GLM receipt and sandbox credentials",()=>{
    expect(()=>validateGateHSandboxEnvironment(data,"submit"))
      .toThrow(GateHSandboxError);
    const base={...data,
      GATE_H_PAYPAL_SINGLE_POST_GRANT:"SUBMIT_SINGLE_101_CENT_SANDBOX_PAYOUT",
      GATE_H_ISSUER_PROOF_INDEPENDENTLY_REVIEWED:"1",
      PAYPAL_CLIENT_ID:"synthetic-client",
      PAYPAL_CLIENT_SECRET:"synthetic-secret",
      PAYPAL_WEBHOOK_ID:"synthetic-webhook",
      GATE_H_ACTUAL_GLM_ARTIFACT_ID:uuid("00000008"),
      GATE_H_ACTUAL_GLM_GATEWAY_REQUEST_ID:"synthetic-gateway-id",
    };
    expect(()=>validateGateHSandboxEnvironment(base,"submit")).not.toThrow();
    expect(()=>validateGateHSandboxEnvironment({
      ...base,GATE_H_PAYPAL_SINGLE_POST_GRANT:"allow",
    },"submit")).toThrow(GateHSandboxError);
    expect(()=>validateGateHSandboxEnvironment({
      ...base,GATE_H_ISSUER_PROOF_INDEPENDENTLY_REVIEWED:"0",
    },"submit")).toThrow(GateHSandboxError);
  });
  it("rejects wrong amount/receiver/hash or nonhuman source",()=>{
    checkBoundedSandboxPayout(payable,expected);
    for(const modified of [
      {amountCents:102},{currency:"EUR"},{receiver:"attacker@example.test"},
      {artifactSha256:"0".repeat(64)},{tupleSha256:"0".repeat(64)},
      {authorizationStatus:"PROPOSED"},{sourceKind:"GLM_IMAGE"},
      {verificationStatus:"UNVERIFIED"},{originMethod:"SYNTHETIC_FIXTURE"},
      {originChannelKind:"SYNTHETIC_FIXTURE"},
      {channelPredatesArtifact:false},{approvalActor:null},
    ]){
      expect(()=>checkBoundedSandboxPayout({...payable,...modified},expected))
        .toThrow(GateHSandboxError);
    }
  });
  it("requires ESCALATE/DENY to have no created binding",()=>{
    assertNegativeCaseResult({outcome:"ESCALATE",bindingId:null,paymentAuthorized:false},"ESCALATE");
    assertNegativeCaseResult({outcome:"DENY",bindingId:null,paymentAuthorized:false},"DENY");
    expect(()=>assertNegativeCaseResult({
      outcome:"ALLOW",bindingId:uuid("00000009"),paymentAuthorized:false,
    },"DENY")).toThrow(GateHSandboxError);
  });
  it("allows only one PHYSICAL PayPal Payouts POST, even on transient retry",async()=>{
    const visited:string[]=[];
    const mock:typeof fetch=async(input)=>{
      visited.push(String(input));
      return new Response("{}",{status:500});
    };
    const fence=makeSinglePayoutPostFence(mock);
    const url="https://api-m.sandbox.paypal.com/v1/payments/payouts";
    await fence.outbound(url,{method:"POST"});
    expect(fence.getPostCount()).toBe(1);
    await expect(fence.outbound(url,{method:"POST"}))
      .rejects.toMatchObject({code:"GATE_H_SECOND_PAYOUT_POST_DENIED"});
    expect(visited).toHaveLength(1);
    await expect(fence.outbound("https://api-m.paypal.com/v1/payments/payouts",{
      method:"POST",
    })).rejects.toMatchObject({code:"GATE_H_EXTERNAL_HOST_DENIED"});
    expect(visited).toHaveLength(1);
  });
});
