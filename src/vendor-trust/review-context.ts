import {pool} from "../db/pool";

/**
 * Tenant-scoped, read-only payment -> vendor trust investigation context.
 * A case only exists when recorded by the deterministic mismatch workflow.
 * Never infer independent verification from a source document or this view.
 */
export type VendorTrustRequestContext={
  requestId:string;organizationName:string;vendorId:string;vendorName:string;
  invoiceNumber:string;outcome:string;requestStatus:string;
  requestedDestination:string;trustedDestination:string|null;
  trustedDestinationCount:number;caseId:string|null;caseResolution:string|null;
};

export async function readVendorTrustRequestContext(
  adminUserId:string, requestId:string,
):Promise<VendorTrustRequestContext|null>{
  const result=await pool.query([
    "select pr.id as request_id, o.name as organization_name,",
    "pr.vendor_id,v.name as vendor_name,pr.invoice_number,",
    "pr.status as request_status,pd.outcome,pr.requested_destination,",
    "t.trusted_count,t.trusted_destination,",
    "c.id as case_id,",
    "coalesce(case when vr.case_id is not null then 'VERIFIED' end,",
    "r.resolution) as case_resolution",
    "from payment_requests pr",
    "join organizations o on o.id=pr.organization_id",
    "join vendors v on v.id=pr.vendor_id and v.organization_id=pr.organization_id",
    "join payment_decisions pd on pd.payment_request_id=pr.id",
    "join organization_admin_memberships m on m.organization_id=pr.organization_id",
    "left join lateral (select count(*)::int as trusted_count,",
    "  min(destination) as trusted_destination from vendor_destinations",
    "  where vendor_id=pr.vendor_id and trusted=true) t on true",
    "left join vendor_reverification_cases c on c.payment_request_id=pr.id",
    "left join vendor_reverification_resolutions r on r.case_id=c.id",
    "left join vendor_recipient_verifications vr on vr.case_id=c.id",
    "where pr.id=$1 and m.user_id=$2 and m.role='ADMIN' and m.active=true",
    "limit 1",
  ].join(" "),[requestId,adminUserId]);
  const row=result.rows[0];
  if(!row)return null;
  return {
    requestId:String(row.request_id),
    organizationName:String(row.organization_name),
    vendorId:String(row.vendor_id),
    vendorName:String(row.vendor_name),
    invoiceNumber:String(row.invoice_number),
    outcome:String(row.outcome),
    requestStatus:String(row.request_status),
    requestedDestination:String(row.requested_destination),
    trustedDestination:row.trusted_destination==null?null:String(row.trusted_destination),
    trustedDestinationCount:Number(row.trusted_count),
    caseId:row.case_id==null?null:String(row.case_id),
    caseResolution:row.case_resolution==null?null:String(row.case_resolution),
  };
}
