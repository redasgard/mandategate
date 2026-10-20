import {randomUUID} from "node:crypto";
import {auth} from "@/src/auth/auth";
import {isTrustedMutationOrigin} from "@/src/auth/same-origin";
import {pool} from "@/src/db/pool";
import {DEMO_ORG_ID,DEMO_VENDOR_ID,DEMO_TRUSTED_DESTINATION} from "@/src/demo/scenarios";
import {SANDBOX_INVOICE} from "@/src/demo/sandbox-payout-constants";
import {sandboxFictionalIssuerChannelAllowed} from "@/src/demo/sandbox-fictional-origin";

export const runtime="nodejs";

/**
 * One explicit administrator action to initialize the TEST vendor's
 * trusted PayPal Sandbox recipient, not a payment or proof of real identity.
 * Never accepts a destination from the browser or an invoice/AI response.
 */
export async function POST(request:Request){
  if(!isTrustedMutationOrigin(request))
    return Response.json({error:"INVALID_ORIGIN"},{status:403});
  const session=await auth.api.getSession({headers:request.headers});
  if(!session)return Response.json({error:"UNAUTHORIZED"},{status:401});
  if(!sandboxFictionalIssuerChannelAllowed(DEMO_ORG_ID,DEMO_VENDOR_ID))
    return Response.json({error:"PAYPAL_SANDBOX_SETUP_UNAVAILABLE"},{status:404});
  if(request.headers.get("content-length") &&
     request.headers.get("content-length")!=="0")
    return Response.json({error:"REQUEST_BODY_NOT_ALLOWED"},{status:400});
  const receiver=process.env.DEMO_PAYPAL_RECEIVER_EMAIL!;
  const client=await pool.connect();
  try{
    await client.query("begin");
    const member=await client.query(
      "select 1 from organization_admin_memberships where organization_id=$1 and user_id=$2 and role='ADMIN' and active=true for share",
      [DEMO_ORG_ID,session.user.id],
    );
    if(member.rows.length!==1){
      await client.query("rollback");
      return Response.json({error:"NOT_FOUND"},{status:404});
    }
    // Serializes two administrator clicks; never overwrites a live supplier.
    const vendor=await client.query(
      "select id from vendors where organization_id=$1 and id=$2 for update",
      [DEMO_ORG_ID,DEMO_VENDOR_ID],
    );
    if(vendor.rows.length!==1){
      await client.query("rollback");
      return Response.json({error:"NOT_FOUND"},{status:404});
    }
    const prior=await client.query(
      "select 1 from payment_requests where organization_id=$1 and vendor_id=$2 and invoice_number=$3 limit 1",
      [DEMO_ORG_ID,DEMO_VENDOR_ID,SANDBOX_INVOICE],
    );
    if(prior.rows.length!==0){
      await client.query("rollback");
      return Response.json({error:"SANDBOX_INVOICE_ALREADY_PROCESSED"},{status:409});
    }
    const active=await client.query(
      "select id,destination from vendor_destinations where vendor_id=$1 and trusted=true for update",
      [DEMO_VENDOR_ID],
    );
    if(active.rows.length>1 ||
       active.rows.some(row=>row.destination!==DEMO_TRUSTED_DESTINATION &&
         row.destination!==receiver)){
      await client.query("rollback");
      return Response.json({error:"NON_PLACEHOLDER_TRUST_RECORD_PRESENT"},{status:409});
    }
    if(active.rows.length===1 && active.rows[0].destination===receiver){
      await client.query("commit");
      return Response.json({
        status:"CONFIGURED",changed:false,recipient:receiver,
        paymentSubmitted:false,
      },{headers:{"Cache-Control":"no-store"}});
    }
    await client.query(
      "update vendor_destinations set trusted=false where vendor_id=$1 and trusted=true and destination=$2",
      [DEMO_VENDOR_ID,DEMO_TRUSTED_DESTINATION],
    );
    const record="v_dest_sandbox_"+randomUUID();
    await client.query(
      "insert into vendor_destinations(id,vendor_id,destination,trusted) values($1,$2,$3,true)",
      [record,DEMO_VENDOR_ID,receiver],
    );
    await client.query("commit");
    console.info("PAYPAL_SANDBOX_TEST_RECIPIENT_BOUND",JSON.stringify({
      vendorId:DEMO_VENDOR_ID,destinationRecordId:record,
    }));
    return Response.json({
      status:"CONFIGURED",changed:true,recipient:receiver,
      paymentSubmitted:false,
    },{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    await client.query("rollback").catch(()=>undefined);
    throw error;
  }finally{client.release();}
}
