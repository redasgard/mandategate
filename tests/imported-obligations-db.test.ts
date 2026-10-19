import {createHash,randomUUID} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {pool} from "../src/db/pool";
import {readImportedObligations} from "../src/db/imported-obligations";

const org="s9_obligations_"+randomUUID();
const other="s9_foreign_"+randomUUID();
const vendor="s9_vendor_"+randomUUID();
const otherVendor="s9_vendor_"+randomUUID();
let actor="";
const sha=(s:string)=>createHash("sha256").update(s).digest("hex");
const now=new Date("2026-10-19T13:12:00Z");
beforeAll(async()=>{
  const uri=new URL(process.env.DATABASE_URL??"postgresql://invalid@invalid/db");
  if(!["127.0.0.1","localhost"].includes(uri.hostname)||
     process.env.MANDATEGATE_DISABLE_PAYMENTS!=="1"||
     process.env.CI!=="true")throw Error("OBLIGATION_TEST_REQUIRES_DISPOSABLE_DATABASE");
  const a=await pool.query('select id from "user" where email=$1',[process.env.DEMO_ADMIN_EMAIL]);
  if(a.rows.length!==1)throw Error("SYNTHETIC_CI_ADMIN_REQUIRED");
  actor=String(a.rows[0].id);
  for(const id of [org,other]){
    await pool.query("insert into organizations(id,name) values($1,'AP history test org')",[id]);
  }
  for(const [id,which] of [[vendor,org],[otherVendor,other]]){
    await pool.query("insert into vendors(id,organization_id,name,normal_max_amount_cents) values($1,$2,'Test vendor',200000)",[id,which]);
  }
  await pool.query(
    "insert into organization_admin_memberships(user_id,organization_id,role,active) values($1,$2,'ADMIN',true)",[actor,org]);
  async function imported(which:string,source:string,date:string){
    const id=randomUUID(),bytes=Buffer.from(source),sourceHash=sha(source);
    await pool.query([
      "insert into ap_imports(id,organization_id,imported_by_user_id,source_sha256,source_bytes,",
      "source_record_count,accepted_row_count,quarantine_count,duplicate_count,ignored_columns,created_at)",
      "values($1,$2,$3,$4,$5,3,3,0,0,'[]'::jsonb,$6)",
    ].join(" "),[id,which,actor,sourceHash,bytes,date]);
    return id;
  }
  const old=await imported(org,"old snapshot","2026-10-14T10:00:00Z");
  const latest=await imported(org,"new snapshot","2026-10-15T10:00:00Z");
  const foreign=await imported(other,"foreign snapshot","2026-10-15T10:00:00Z");
  async function row(which:string,vid:string,imp:string,index:number,invoice:string,status:string,due:string){
    await pool.query([
      "insert into ap_history_rows",
      "(organization_id,import_id,source_row_number,normalized_row_sha256,",
      "vendor_id,vendor_name,invoice_number,invoice_date,amount_cents,currency,status,due_date)",
      "values($1,$2,$3,$4,$5,'Test vendor',$6,'2026-10-01',12500,'USD',$7,$8)",
    ].join(" "),[which,imp,index,sha(which+imp+invoice+status),vid,invoice,status,due]);
  }
  await row(org,vendor,old,2,"INV-REPLACED","PENDING","2026-10-17");
  await row(org,vendor,latest,2,"INV-REPLACED","PAID","2026-10-17");
  await row(org,vendor,old,3,"INV-OPEN","PENDING","2026-10-18");
  await row(org,vendor,latest,3,"INV-FUTURE","APPROVED","2026-10-24");
  await row(other,otherVendor,foreign,2,"INV-FOREIGN","PENDING","2026-10-16");
});
afterAll(async()=>{await pool.end();});
describe("S9 imported obligations PostgreSQL security and stale-snapshot rules",()=>{
  it("ignores older pending rows paid in later import and cannot leak foreign tenant",async()=>{
    const x=await readImportedObligations(actor,now);
    expect(x.items.map(item=>item.invoiceNumber).sort())
      .toEqual(["INV-FUTURE","INV-OPEN"]);
    expect(x.overdue).toEqual({count:1,cents:"12500"});
    expect(x.upcoming).toEqual({count:1,cents:"12500"});
    expect(x.items.some(item=>item.organizationId===other)).toBe(false);
    expect(x.basis).toBe("UNVERIFIED_IMPORTED_AP_HISTORY");
  });
  it("revocation of active admin immediately hides imported obligations",async()=>{
    await pool.query("update organization_admin_memberships set active=false where organization_id=$1 and user_id=$2",[org,actor]);
    try{
      expect((await readImportedObligations(actor,now)).items).toEqual([]);
    }finally{
      await pool.query("update organization_admin_memberships set active=true where organization_id=$1 and user_id=$2",[org,actor]);
    }
  });
});
