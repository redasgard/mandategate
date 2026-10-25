import {auth} from "@/src/auth/auth";
import {pool} from "@/src/db/pool";
import {readGateHInventory} from "@/src/gate-h/readiness-inventory";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const headers={"Cache-Control":"private, no-store"};
const organizationPattern=/^[A-Za-z0-9_-]{1,120}$/;

/**
 * Read-only, ADMIN-scoped inventory for the existing invoice authority gates.
 * Counts never authorize a model call, payment request or PayPal execution.
 */
export async function GET(request:Request){
 const session=await auth.api.getSession({headers:request.headers});
 if(!session)return Response.json({error:"UNAUTHORIZED"},{status:401,headers});

 const url=new URL(request.url);
 const ids=url.searchParams.getAll("organizationId");
 if(ids.length!==1 || !organizationPattern.test(ids[0]) ||
    [...url.searchParams.keys()].some(key=>key!=="organizationId"))
  return Response.json({error:"ORGANIZATION_REQUIRED"},{status:400,headers});

 try{
  const membership=await pool.query(
   "select 1 from organization_admin_memberships where user_id=$1 and organization_id=$2 and role='ADMIN' and active=true limit 1",
   [session.user.id,ids[0]],
  );
  if(membership.rows.length!==1)
   return Response.json({error:"NOT_FOUND"},{status:404,headers});
  const readiness=await readGateHInventory(ids[0]);
  return Response.json({readiness},{headers});
 }catch{
  return Response.json({error:"READINESS_UNAVAILABLE"},{status:503,headers});
 }
}
