import {describe,expect,it} from "vitest";
import {POST} from "../app/api/admin/demo-scenarios/route";
const origin=process.env.BETTER_AUTH_URL??"http://127.0.0.1:3000";
describe("synthetic demo HTTP gate",()=>{
 it("refuses cross-site requests before accessing sessions",async()=>{
  const r=await POST(new Request(origin+"/api/admin/demo-scenarios",{
   method:"POST",headers:{origin:"https://evil.example"}}));
  expect(r.status).toBe(403);
 });
 it("refuses access without the exact preview or disposable CI admission",async()=>{
  // The ordinary unit-test runner may use the exact payment-disabled CI lab;
  // remove its trust marker so the negative route assertion remains honest.
  const original=process.env.MANDATEGATE_EMBEDDED_POSTGRES_CI;
  process.env.MANDATEGATE_EMBEDDED_POSTGRES_CI="0";
  try{
   const r=await POST(new Request(origin+"/api/admin/demo-scenarios",{
    method:"POST",headers:{origin}}));
   expect(r.status).toBe(404);
   expect((await r.json()).error).toBe("DEMO_PREVIEW_DISABLED");
  }finally{
   if(original===undefined)delete process.env.MANDATEGATE_EMBEDDED_POSTGRES_CI;
   else process.env.MANDATEGATE_EMBEDDED_POSTGRES_CI=original;
  }
 });
});
