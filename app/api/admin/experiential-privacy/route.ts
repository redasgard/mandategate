import { auth } from "@/src/auth/auth";
import { pool } from "@/src/db/pool";
import { ExperientialInvoiceVisionGateway, InvoiceVisionGatewayError } from "@/src/ai/gateway/experiential-vision";

// Live account metadata only. No image or invoice content leaves the server.
// A real model-serving response is separately needed for Gate H.
export const runtime="nodejs";

export async function GET(request:Request) {
  const session=await auth.api.getSession({headers:request.headers});
  if(!session)return Response.json({error:"UNAUTHORIZED"},{status:401});
  const role=await pool.query(
    "select 1 from organization_admin_memberships where user_id=$1 and role='ADMIN' and active=true limit 1",
    [session.user.id],
  );
  if(!role.rows[0])return Response.json({error:"REVIEWER_ADMIN_MEMBERSHIP_REQUIRED"},{status:403});
  const gateway=new ExperientialInvoiceVisionGateway();
  try{
    const receipt=await gateway.verifyPrivacyAndModel();
    return Response.json({
      privacyPreflight:"PASS",receipt,
      providerServedInferenceProven:false,
      invoiceContentSubmitted:false,
      paymentAuthorized:false,
    },{headers:{"Cache-Control":"private, no-store"}});
  }catch(error) {
    if(error instanceof InvoiceVisionGatewayError)
      return Response.json({privacyPreflight:"BLOCK",error:error.code},{
        status:503,headers:{"Cache-Control":"private, no-store"},
      });
    throw error;
  }
}
