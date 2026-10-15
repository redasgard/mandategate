import {describe,expect,it} from "vitest";
import {DEMO_CASES,DEMO_TRUSTED_DESTINATION,demoRequests,demoPreviewEnabled} from "../src/demo/scenarios";
const good={MANDATEGATE_RUNTIME_MODE:"neon-preview",MANDATEGATE_DISABLE_PAYMENTS:"1",
 DATABASE_URL:"postgresql://user:pass@ep-silent-poetry-arjowm4d-pooler.c-4.us-west-2.aws.neon.tech/neondb?sslmode=require"};
describe("bounded nonpayable demo scenario definitions",()=>{
 it("requires payment-disabled exact Neon preview",()=>{
   expect(demoPreviewEnabled(good)).toBe(true);
   for(const v of [
    {...good,MANDATEGATE_DISABLE_PAYMENTS:"0"},
    {...good,MANDATEGATE_RUNTIME_MODE:"legacy"},
    {...good,DATABASE_URL:good.DATABASE_URL.replace("arjowm4d-pooler","evil-pooler")},
    {...good,DATABASE_URL:"postgresql://u:p@localhost/neondb"},
   ])expect(demoPreviewEnabled(v)).toBe(false);
 });
 it("builds three synthetics with distinct idempotency keys and deterministic risk",()=>{
  const requests=demoRequests(DEMO_TRUSTED_DESTINATION);
  expect(requests).toHaveLength(3);
  expect(DEMO_CASES.map(x=>x.expectedOutcome)).toEqual(["ALLOW","ESCALATE","DENY"]);
  expect(new Set(requests.map(x=>x.idempotencyKey)).size).toBe(3);
  expect(requests.every(x=>x.source==="demo_fixture")).toBe(true);
  expect(requests[2].paymentDestination).not.toBe(DEMO_TRUSTED_DESTINATION);
  expect(requests.slice(0,2).every(x=>x.paymentDestination===DEMO_TRUSTED_DESTINATION)).toBe(true);
 });
 it("refuses unverified receiver",()=>{
  expect(()=>demoRequests("real-payee@somewhere.example")).toThrow("DEMO_RECEIVER_NOT_SYNTHETIC");
 });
});
