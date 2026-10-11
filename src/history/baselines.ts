import {pool} from "../db/pool";

export type VendorApBaseline={
  organizationId:string;organizationName:string;
  vendorId:string;vendorName:string;
  paidInvoiceCount:number;medianAmountCents:number|null;
  medianInvoiceCadenceDays:number|null;
  firstInvoiceDate:string|null;lastInvoiceDate:string|null;
  historicalImportIds:string[];
};

type PaidRow={
  organization_id:string;organization_name:string;
  vendor_id:string;vendor_name:string;
  amount_cents:number;invoice_date:string;import_id:string;
};

export function medianInteger(values:readonly number[]):number|null{
  if(!values.length)return null;
  const v=[...values].sort((a,b)=>a-b);
  const mid=Math.floor(v.length/2);
  return v.length%2?v[mid]:Math.round((v[mid-1]+v[mid])/2);
}
export function summarizePaidHistory(rows:readonly PaidRow[]):VendorApBaseline[]{
  const byVendor=new Map<string,PaidRow[]>();
  for(const row of rows){
    const key=JSON.stringify([row.organization_id,row.vendor_id]);
    byVendor.set(key,[...(byVendor.get(key)??[]),row]);
  }
  return [...byVendor.values()].map(items=>{
    const dates=[...new Set(items.map(x=>x.invoice_date))].sort();
    const gaps=dates.slice(1).map((date,i)=>{
      const now=Date.parse(date+"T00:00:00Z"),prior=Date.parse(dates[i]+"T00:00:00Z");
      return Math.round((now-prior)/86400000);
    });
    return{
      organizationId:items[0].organization_id,
      organizationName:items[0].organization_name,
      vendorId:items[0].vendor_id,
      vendorName:items[0].vendor_name,
      paidInvoiceCount:items.length,
      medianAmountCents:medianInteger(items.map(x=>x.amount_cents)),
      // Cadence isn't meaningful from only two dates. A third observed
      // payment date supplies at least two independent gaps for median.
      medianInvoiceCadenceDays:gaps.length<2?null:medianInteger(gaps),
      firstInvoiceDate:dates[0]??null,
      lastInvoiceDate:dates.at(-1)??null,
      historicalImportIds:[...new Set(items.map(x=>x.import_id))].sort(),
    };
  }).sort((a,b)=>a.organizationName.localeCompare(b.organizationName)||
    a.vendorName.localeCompare(b.vendorName));
}
/**
 * Read only. Imported destinations are intentionally not projected as
 * trusted vendor records. Each distinct history row counts once even when
 * the same payment recurs in a later versioned ERP CSV export.
 */
export async function loadAdminApBaselines(adminUserId:string):Promise<VendorApBaseline[]>{
  const result=await pool.query([
    "select recent.organization_id,recent.organization_name,recent.vendor_id,",
    "recent.vendor_name,recent.amount_cents,recent.invoice_date,recent.import_id",
    "from (",
    "select distinct on (h.organization_id,h.normalized_row_sha256)",
    "h.organization_id,o.name as organization_name,h.vendor_id,v.name as vendor_name,",
    "h.amount_cents,h.invoice_date,h.import_id,h.normalized_row_sha256",
    "from ap_history_rows h",
    "join ap_imports i on i.id=h.import_id and i.organization_id=h.organization_id",
    "join organizations o on o.id=h.organization_id",
    "join vendors v on v.id=h.vendor_id and v.organization_id=h.organization_id",
    "join organization_admin_memberships m on m.organization_id=h.organization_id",
    "where m.user_id=$1 and m.role='ADMIN' and m.active=true",
    "and h.status='PAID' and h.currency='USD'",
    "order by h.organization_id,h.normalized_row_sha256,i.created_at desc,i.id desc",
    ") recent order by recent.invoice_date desc limit 5000",
  ].join(" "),[adminUserId]);
  return summarizePaidHistory(result.rows);
}
