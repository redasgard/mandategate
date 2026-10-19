import {beforeEach,describe,expect,it,vi} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
const mocks=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("../src/db/pool",()=>({pool:{query:mocks.query}}));
import {readImportedObligations} from "../src/db/imported-obligations";
import {ImportedObligations} from "../app/dashboard/imported-obligations";

beforeEach(()=>mocks.query.mockReset().mockResolvedValue({rows:[]}));
const now=new Date("2026-10-19T13:12:00Z");
describe("imported AP obligations remain evidence, not payout authority",()=>{
 it("binds active ADMIN organization before choosing latest invoice status",async()=>{
   await readImportedObligations("actor-1",now);
   const [sql,params]=mocks.query.mock.calls[0];
   expect(sql).toContain("m.role='ADMIN' and m.active=true");
   expect(sql).toContain("m.user_id=$1");
   expect(sql).toContain("row_number() over");
   expect(sql).toContain("row_rank=1");
   expect(params).toEqual(["actor-1",201]);
 });
 it("separates overdue/upcoming/later in UTC, with provenance and no PAY controls",async()=>{
   mocks.query.mockResolvedValue({rows:[
     {id:"a",organization_id:"org_demo",vendor_name:"Northstar",
      invoice_number:"N-1",amount_cents:101,currency:"USD",status:"PENDING",
      due_date:"2026-10-18",import_id:"12345678-abc",
      source_sha256:"a".repeat(64),import_created_at:now},
     {id:"b",organization_id:"org_demo",vendor_name:"Northstar",
      invoice_number:"N-2",amount_cents:12500,currency:"USD",status:"APPROVED",
      due_date:"2026-10-22",import_id:"87654321-abc",
      source_sha256:"b".repeat(64),import_created_at:now},
     {id:"c",organization_id:"org_demo",vendor_name:"Northstar",
      invoice_number:"N-3",amount_cents:2500,currency:"USD",status:"PENDING",
      due_date:"2026-11-10",import_id:"abc-def",
      source_sha256:"c".repeat(64),import_created_at:now},
   ]});
   const o=await readImportedObligations("actor-1",now);
   expect([o.overdue.count,o.upcoming.count,o.later.count]).toEqual([1,1,1]);
   expect(o.upcoming.cents).toBe("12500");
   expect(o.basis).toBe("UNVERIFIED_IMPORTED_AP_HISTORY");
   const html=renderToStaticMarkup(<ImportedObligations overview={o}/>);
   expect(html).toContain("unverified historical observations");
   expect(html).toContain("2026-10-22");
   expect(html).toContain("SHA");
   expect(html).not.toContain("Pay now");
 });
 it("refuses to present truncated evidence as a complete portfolio total",async()=>{
   mocks.query.mockResolvedValue({rows:Array.from({length:201},(_,i)=>({
     id:String(i),organization_id:"demo",vendor_name:"V",invoice_number:String(i),
     amount_cents:100,currency:"USD",status:"PENDING",due_date:"2026-10-01",
     import_id:"abc12345678",source_sha256:"a".repeat(64),import_created_at:now,
   }))});
   const o=await readImportedObligations("actor-1",now);
   expect(o.incomplete).toBe(true);
   expect(o.overdue.count).toBe(200);
   expect(renderToStaticMarkup(<ImportedObligations overview={o} compact/>))
     .toContain("Counts and amounts are partial");
 });
});
