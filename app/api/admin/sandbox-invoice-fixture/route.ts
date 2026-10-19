import {NextRequest} from "next/server";
import {auth} from "@/src/auth/auth";
import {pool} from "@/src/db/pool";
import {DEMO_ORG_ID} from "@/src/demo/scenarios";
import {createSandboxInvoicePdf} from "@/src/demo/sandbox-invoice-pdf";

export const runtime="nodejs";
export async function GET(request:NextRequest){
  const session=await auth.api.getSession({headers:request.headers});
  if(!session)return Response.json({error:"UNAUTHORIZED"},{status:401});
  if(process.env.MANDATEGATE_SANDBOX_VERIFIED_INVOICE_DEMO!=="1"||
    process.env.MANDATEGATE_RUNTIME_MODE!=="neon-sandbox"||
    process.env.PAYPAL_BASE_URL!=="https://api-m.sandbox.paypal.com"||
    !process.env.DEMO_PAYPAL_RECEIVER_EMAIL)
    return Response.json({error:"SANDBOX_INVOICE_DEMO_DISABLED"},{status:503});
  const admin=await pool.query(
    "select 1 from organization_admin_memberships where user_id=$1 and organization_id=$2 and role='ADMIN' and active=true limit 1",
    [session.user.id,DEMO_ORG_ID],
  );
  if(admin.rows.length!==1)
    return Response.json({error:"NOT_FOUND"},{status:404});
  let file;
  try{file=createSandboxInvoicePdf(process.env.DEMO_PAYPAL_RECEIVER_EMAIL);}
  catch{return Response.json({error:"SANDBOX_RECEIVER_INVALID"},{status:503});}
  return new Response(new Uint8Array(file.bytes),{
    headers:{
      "Content-Type":"application/pdf",
      "Content-Disposition":"attachment; filename=\"mandategate-sandbox-101.pdf\"",
      "Cache-Control":"private, no-store",
      "X-Content-Type-Options":"nosniff",
    },
  });
}
