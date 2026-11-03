/**
 * CI-only capture hygiene: the disposable CI database accumulates
 * memberships, vendors and requests while the vitest database suite runs.
 * Those rows are invisible to real deployments, but the signed-in demo
 * admin's screens are scoped by CURRENT active memberships, so foreign test
 * organizations leak into the captured product UI.
 *
 * This script removes the demo admin's memberships on every organization
 * other than org_demo (the canonical fixture) immediately before the app
 * starts for visual capture. It never deletes vendor/request rows, never
 * touches org_demo, and refuses to run outside the exact payment-disabled
 * embedded-Postgres CI identity.
 */
const env=process.env;
if(!(env.CI==="true"&&env.MANDATEGATE_EMBEDDED_POSTGRES_CI==="1"&&
 env.MANDATEGATE_RUNTIME_MODE==="legacy"&&env.MANDATEGATE_DISABLE_PAYMENTS==="1"&&
 env.BETTER_AUTH_URL==="http://127.0.0.1:3000"&&env.PORT==="3000"&&
 env.DATABASE_URL==="postgresql://postgres:postgres@127.0.0.1:55432/mandategate"&&
 env.DEMO_ADMIN_EMAIL==="admin@mandategate.local"&&
 !env.PAYPAL_CLIENT_ID&&!env.PAYPAL_CLIENT_SECRET&&!env.EXPLABS_API_KEY&&
 !env.DEMO_PAYPAL_RECEIVER_EMAIL))
 throw new Error("CI_CLEANUP_REQUIRES_EXACT_PAYMENT_DISABLED_CI_LAB");
const {default:pg}=await import("pg");
const db=new pg.Pool({connectionString:env.DATABASE_URL,max:1});
try{
 const admin=await db.query('select id from "user" where email=$1',[env.DEMO_ADMIN_EMAIL]);
 if(admin.rows.length!==1)throw new Error("CI_CLEANUP_DEMO_ADMIN_MISSING");
 const adminId=admin.rows[0].id;
 const before=await db.query(
  "select count(*)::int as n from organization_admin_memberships where user_id=$1 and organization_id<>$2",
  [adminId,"org_demo"]);
 const removed=await db.query(
  "delete from organization_admin_memberships where user_id=$1 and organization_id<>$2 returning organization_id",
  [adminId,"org_demo"]);
 const kept=await db.query(
  "select count(*)::int as n from organization_admin_memberships where user_id=$1 and organization_id=$2 and role='ADMIN' and active=true",
  [adminId,"org_demo"]);
 if(kept.rows[0].n!==1)throw new Error("CI_CLEANUP_ORG_DEMO_MEMBERSHIP_LOST");
 console.log("CI_CLEANUP_FOREIGN_MEMBERSHIPS before="+before.rows[0].n+
  " removed="+removed.rows.length);
}finally{
 await db.end().catch(()=>undefined);
}
