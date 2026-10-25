import {auth} from "@/src/auth/auth";
import {pool} from "@/src/db/pool";
import {
 classifyGateHInventory,GATE_H_INVENTORY_SQL,
} from "@/src/gate-h/readiness-inventory";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const headers={"Cache-Control":"private, no-store"};
const organizationPattern=/^[A-Za-z0-9_-]{1,120}$/;

/**
 * Read-only, ADMIN-scoped inventory for invoice authority gates.
 * The membership check and inventory are from the SAME SQL snapshot.
 * Row counts never authorize a model call, request or PayPal execution.
 */
export async function GET(request:Request){
 const session=await auth.api.getSession({headers:request.headers});
 if(!session)return Response.json({error:"UNAUTHORIZED"},{status:401,headers});

 const params=new URL(request.url).searchParams;
 const ids=params.getAll("organizationId");
 if(ids.length!==1 || !organizationPattern.test(ids[0]) ||
    [...params.keys()].some(key=>key!=="organizationId"))
  return Response.json({error:"ORGANIZATION_REQUIRED"},{status:400,headers});

 try{
  const result=await pool.query([
   "select inventory.* from (",GATE_H_INVENTORY_SQL,") inventory",
   "where exists (select 1 from organization_admin_memberships m",
   "where m.organization_id=$1 and m.user_id=$2",
   "and m.role='ADMIN' and m.active=true)",
   "limit 1",
  ].join(" "),[ids[0],session.user.id]);
  if(result.rows.length!==1)
   return Response.json({error:"NOT_FOUND"},{status:404,headers});
  const readiness=classifyGateHInventory(ids[0],result.rows[0]);
  return Response.json({readiness},{headers});
 }catch{
  return Response.json({error:"READINESS_UNAVAILABLE"},{status:503,headers});
 }
}
