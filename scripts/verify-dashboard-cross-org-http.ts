import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import type { Pool } from "pg";

// CI-only: independent signed-in identities and isolated financial fixtures.
// Deliberately no PayPal, external model, or privileged payment route.
export async function verifyDashboardCrossOrgHttp(baseUrl: string, pool: Pool) {
  const db = new URL(process.env.DATABASE_URL ?? "postgres://invalid");
  // A disposable CI database can be hosted by GitHub's postgres:18 service
  // OR an explicitly isolated local PostgreSQL 18 inside a no-provider-key
  // Render build. Never admit Neon, shared hosts or ordinary Render runtime.
  const githubRunner = process.env.GITHUB_ACTIONS === "true" && (db.port === "5432" || db.port === "");
  const embeddedRunner = process.env.MANDATEGATE_EMBEDDED_POSTGRES_CI === "1" &&
    db.port === "55432" && db.username === "postgres" && db.password === "postgres" &&
    process.env.MANDATEGATE_DISABLE_PAYMENTS === "1" &&
    !process.env.PAYPAL_CLIENT_ID && !process.env.PAYPAL_CLIENT_SECRET &&
    !process.env.EXPLABS_API_KEY;
  if (process.env.CI !== "true" || (!githubRunner && !embeddedRunner) ||
      baseUrl !== "http://127.0.0.1:3000" || db.hostname !== "127.0.0.1" ||
      db.pathname !== "/mandategate" ||
      process.env.DEMO_ADMIN_EMAIL !== "admin@mandategate.local" ||
      process.env.BETTER_AUTH_SECRET !== "ci-only-synthetic-secret-at-least-32-characters") {
    throw Error("DASHBOARD_CROSS_ORG_REQUIRES_DISPOSABLE_CI");
  }
  const nonce = randomUUID().replace(/-/g,"");
  const orgs = ["ci_http_org_a_"+nonce,"ci_http_org_b_"+nonce];
  const vendors = ["ci_http_vendor_a_"+nonce,"ci_http_vendor_b_"+nonce];
  const emails = ["ci-a-"+nonce+"@mandategate.test","ci-b-"+nonce+"@mandategate.test"];
  const passwords = ["ci-A-"+nonce+"-synthetic","ci-B-"+nonce+"-synthetic"];
  const pending = ["CI-A-PENDING-"+nonce,"CI-B-PENDING-"+nonce];
  const denied = ["CI-A-DENIED-"+nonce,"CI-B-DENIED-"+nonce];
  const ids:string[] = [], deniedIds:string[] = [], userIds:string[] = [];
  const register = betterAuth({
    database:pool,secret:process.env.BETTER_AUTH_SECRET!,baseURL:baseUrl,
    emailAndPassword:{enabled:true,disableSignUp:false,minPasswordLength:12},
  });
  async function insertInvoice(i:number,kind:"ESCALATED"|"DENIED") {
    const id=randomUUID(), logical=randomUUID();ids.push(id);
    await pool.query(
      "insert into payment_requests(id,logical_payment_id,organization_id,vendor_id,invoice_number,amount_cents,currency,requested_destination,status,source,created_at) " +
      "values($1,$2,$3,$4,$5,$6,'USD','synthetic@mandategate.test',$7,'demo_fixture',now()+interval '2 days')",
      [id,logical,orgs[i],vendors[i],kind==="ESCALATED"?pending[i]:denied[i],i?222:111,kind],
    );
    await pool.query(
      "insert into payment_decisions(id,payment_request_id,outcome,reason_codes,evidence) " +
      "values($1,$2,$3,'[]'::jsonb,'[]'::jsonb)",
      [randomUUID(),id,kind==="ESCALATED"?"ESCALATE":"DENY"],
    );
    if(kind==="DENIED")deniedIds[i]=id;
  }
  async function signIn(i:number) {
    const response=await fetch(baseUrl+"/api/auth/sign-in/email",{
      method:"POST",headers:{origin:baseUrl,"content-type":"application/json"},
      body:JSON.stringify({email:emails[i],password:passwords[i]}),
    });
    if(!response.ok)throw Error("CI_SIGNIN_FAILED_"+response.status);
    const cookie=response.headers.get("set-cookie")?.split(";")[0];
    if(!cookie)throw Error("CI_SIGNIN_COOKIE_MISSING");
    return cookie;
  }
  async function dashboard(cookie:string, showA:boolean, showB:boolean, n:number,phase:string) {
    const response=await fetch(baseUrl+"/dashboard",{headers:{cookie,"cache-control":"no-store"}});
    if(response.status!==200)throw Error(phase+": dashboard HTTP "+response.status);
    const html=await response.text();
    for(const [marker,allowed] of [
      [pending[0],showA],[denied[0],showA],[pending[1],showB],[denied[1],showB],
    ] as Array<[string,boolean]>) {
      if(html.includes(marker)!==allowed)throw Error(phase+": cross-org invoice exposure");
    }
    for(const [key,expected] of [
      ["review",n],["denied",n],["unknown",0],
    ] as Array<[string,number]>) {
      const m=html.match(new RegExp('data-mg-count="'+key+'"[^>]*>(\\d+)</strong>'));
      if(!m||Number(m[1])!==expected)
        throw Error(phase+": incorrect "+key+" expected="+expected+" actual="+(m?.[1]??"missing"));
    }
  }
  async function detail(cookie:string,i:number,expected:number,phase:string) {
    const response=await fetch(baseUrl+"/payments/"+deniedIds[i],{
      headers:{cookie,"cache-control":"no-store"},redirect:"manual",
    });
    if(response.status!==expected)throw Error(phase+": detail HTTP "+response.status+" expected "+expected);
    const html=await response.text();
    if((expected===200)!==html.includes(denied[i]))
      throw Error(phase+": detail body exposure");
  }
  try {
    await pool.query("insert into organizations(id,name) values($1,'CI HTTP org A'),($2,'CI HTTP org B')",orgs);
    await pool.query(
      "insert into vendors(id,organization_id,name,normal_max_amount_cents) " +
      "values($1,$2,'CI synthetic A',999999),($3,$4,'CI synthetic B',999999)",
      [vendors[0],orgs[0],vendors[1],orgs[1]],
    );
    for(let i=0;i<2;i++){await insertInvoice(i,"ESCALATED");await insertInvoice(i,"DENIED");}
    for(let i=0;i<2;i++){
      await register.api.signUpEmail({body:{name:"CI reviewer "+i,email:emails[i],password:passwords[i]}});
      const r=await pool.query('select id from "user" where email=$1',[emails[i]]);
      if(r.rows.length!==1)throw Error("CI_SYNTHETIC_SIGNUP_FAILED");
      userIds[i]=String(r.rows[0].id);
    }
    await pool.query(
      "insert into organization_admin_memberships(user_id,organization_id,role,active) " +
      "values($1,$2,'ADMIN',true),($1,$3,'REVIEWER',true),($4,$3,'ADMIN',true)",
      [userIds[0],orgs[0],orgs[1],userIds[1]],
    );
    const a=await signIn(0),b=await signIn(1);
    await dashboard(a,true,false,1,"A admin/B reviewer");
    await dashboard(b,false,true,1,"B independent admin");
    await detail(a,0,200,"A owns A");
    await detail(a,1,404,"A foreign B denied");
    await detail(b,0,404,"B foreign A denied");
    await detail(b,1,200,"B owns B");

    await pool.query(
      "update organization_admin_memberships set role='ADMIN' where user_id=$1 and organization_id=$2",
      [userIds[0],orgs[1]],
    );
    await dashboard(a,true,true,2,"A promoted B admin");
    await dashboard(b,false,true,1,"B unaffected by promotion");
    await detail(a,1,200,"A promoted B detail");

    await pool.query(
      "update organization_admin_memberships set active=false where user_id=$1 and organization_id=$2",
      [userIds[0],orgs[1]],
    );
    await dashboard(a,true,false,1,"A revoked B");
    await dashboard(b,false,true,1,"B independent after revocation");
    await detail(a,1,404,"A revoked B detail");

    await pool.query(
      "update organization_admin_memberships set active=false where user_id=$1 and organization_id=$2",
      [userIds[0],orgs[0]],
    );
    await dashboard(a,false,false,0,"A revoked both");
    await detail(a,0,404,"A revoked A detail");

    await pool.query(
      "update organization_admin_memberships set active=true,role='ADMIN' where user_id=$1 and organization_id=$2",
      [userIds[0],orgs[0]],
    );
    await dashboard(a,true,false,1,"A restored A");
    await pool.query(
      "update organization_admin_memberships set role='REVIEWER' where user_id=$1 and organization_id=$2",
      [userIds[0],orgs[0]],
    );
    await dashboard(a,false,false,0,"A reviewer-only");
    await pool.query(
      "update organization_admin_memberships set role='ADMIN' where user_id=$1 and organization_id=$2",
      [userIds[0],orgs[0]],
    );
    await dashboard(a,true,false,1,"A admin restored");
    console.log("dashboard cross-org HTTP passed: two sessions, exact metrics, reviewer/admin, revocation/restoration, foreign detail 404, zero payouts");
  } finally {
    await pool.query("delete from payment_decisions where payment_request_id=any($1::text[])",[ids]);
    await pool.query("delete from payment_requests where id=any($1::text[])",[ids]);
    await pool.query("delete from vendors where id=any($1::text[])",[vendors]);
    await pool.query("delete from organization_admin_memberships where organization_id=any($1::text[])",[orgs]);
    await pool.query("delete from organizations where id=any($1::text[])",[orgs]);
    const users=await pool.query('select id from "user" where email=any($1::text[])',[emails]);
    const idsToDelete=users.rows.map(r=>String(r.id));
    if(idsToDelete.length){
      await pool.query('delete from "session" where "userId"=any($1::text[])',[idsToDelete]);
      await pool.query('delete from "account" where "userId"=any($1::text[])',[idsToDelete]);
      await pool.query('delete from "user" where id=any($1::text[])',[idsToDelete]);
    }
  }
}
