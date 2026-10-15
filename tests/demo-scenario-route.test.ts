import {describe,expect,it} from "vitest";
import {POST} from "../app/api/admin/demo-scenarios/route";
const origin=process.env.BETTER_AUTH_URL??"http://127.0.0.1:3000";
describe("synthetic demo HTTP gate",()=>{
 it("refuses cross-site requests before accessing sessions",async()=>{
  const r=await POST(new Request(origin+"/api/admin/demo-scenarios",{
   method:"POST",headers:{origin:"https://evil.example"}}));
  expect(r.status).toBe(403);
 });
 it("refuses access outside the exact Neon demo preview",async()=>{
  const r=await POST(new Request(origin+"/api/admin/demo-scenarios",{
   method:"POST",headers:{origin}}));
  expect(r.status).toBe(404);
  expect((await r.json()).error).toBe("DEMO_PREVIEW_DISABLED");
 });
});
