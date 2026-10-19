import { pool } from "./pool";

export type ObligationItem = {
  id: string;
  organizationId: string;
  vendor: string;
  invoiceNumber: string;
  amountCents: number;
  currency: "USD";
  status: "PENDING" | "APPROVED";
  dueDate: string;
  importId: string;
  importCreatedAt: string;
  importSourceSha256: string;
  category: "OVERDUE" | "UPCOMING" | "LATER";
};

export type ObligationOverview = {
  asOfUtc: string;
  upcomingHorizon: string;
  items: ObligationItem[];
  overdue: { count: number; cents: string };
  upcoming: { count: number; cents: string };
  later: { count: number; cents: string };
  incomplete: boolean;
  basis: "UNVERIFIED_IMPORTED_AP_HISTORY";
};

const MAX_VISIBLE = 200;

/**
 * Latest known status of each imported invoice, bounded to active ADMIN
 * organizations in the SQL, before de-duplication. A newer imported PAID
 * status suppresses a previously PENDING/APPROVED entry. This is never a
 * scheduler, validated liability, or authorization to create a payout.
 */
export async function readImportedObligations(
  actorId:string,
  now:Date=new Date(),
):Promise<ObligationOverview> {
  if(!Number.isFinite(now.valueOf()))throw Error("OBLIGATION_CLOCK_INVALID");
  const asOfUtc=now.toISOString().slice(0,10);
  const upcomingHorizon=new Date(Date.UTC(
    now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+14,
  )).toISOString().slice(0,10);
  const result=await pool.query([
    "with latest as (",
    "select h.id,h.organization_id,h.vendor_name,h.invoice_number,h.invoice_date,",
    "h.amount_cents,h.currency,h.status,h.due_date,h.import_id,",
    "i.source_sha256,i.created_at as import_created_at,",
    "row_number() over (partition by h.organization_id,h.vendor_id,",
    "h.invoice_number,h.invoice_date order by i.created_at desc,i.id desc,",
    "h.source_row_number desc,h.id desc) as row_rank",
    "from ap_history_rows h",
    "join ap_imports i on i.id=h.import_id and i.organization_id=h.organization_id",
    "where exists (select 1 from organization_admin_memberships m",
    "where m.organization_id=h.organization_id and m.user_id=$1",
    "and m.role='ADMIN' and m.active=true)",
    ")",
    "select id,organization_id,vendor_name,invoice_number,amount_cents,currency,",
    "status,due_date,import_id,source_sha256,import_created_at",
    "from latest where row_rank=1",
    "and status in ('PENDING','APPROVED') and currency='USD'",
    "and due_date is not null",
    "order by due_date asc,organization_id,id limit $2",
  ].join(" "),[actorId,MAX_VISIBLE+1]);
  const rows=result.rows.slice(0,MAX_VISIBLE);
  const totals={
    OVERDUE:{count:0,cents:0n},
    UPCOMING:{count:0,cents:0n},
    LATER:{count:0,cents:0n},
  };
  const items:ObligationItem[]=rows.map(row=>{
    const dueDate=String(row.due_date);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dueDate))throw Error("IMPORTED_AP_DUE_DATE_INVALID");
    const cents=Number(row.amount_cents);
    if(!Number.isSafeInteger(cents)||cents<=0)
      throw Error("IMPORTED_AP_AMOUNT_INVALID");
    const category:ObligationItem["category"]=dueDate<asOfUtc
      ?"OVERDUE":dueDate<=upcomingHorizon?"UPCOMING":"LATER";
    totals[category].count++;
    totals[category].cents+=BigInt(cents);
    return {
      id:String(row.id),organizationId:String(row.organization_id),
      vendor:String(row.vendor_name),invoiceNumber:String(row.invoice_number),
      amountCents:cents,currency:"USD",status:row.status==="APPROVED"?"APPROVED":"PENDING",
      dueDate,importId:String(row.import_id),
      importCreatedAt:new Date(row.import_created_at).toISOString(),
      importSourceSha256:String(row.source_sha256),category,
    };
  });
  return {
    asOfUtc,upcomingHorizon,items,
    overdue:{count:totals.OVERDUE.count,cents:totals.OVERDUE.cents.toString()},
    upcoming:{count:totals.UPCOMING.count,cents:totals.UPCOMING.cents.toString()},
    later:{count:totals.LATER.count,cents:totals.LATER.cents.toString()},
    incomplete:result.rows.length>MAX_VISIBLE,
    basis:"UNVERIFIED_IMPORTED_AP_HISTORY",
  };
}
