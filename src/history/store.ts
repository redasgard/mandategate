import { pool } from "../db/pool";
import { parseApHistoryCsv, ApCsvError, type NormalizedApRow, type QuarantinedApRow } from "./csv-import";

export class ApImportPermissionError extends Error {
  constructor(public readonly code:string,public readonly httpStatus=403){
    super(code);this.name="ApImportPermissionError";
  }
}
export type ApImportResult={
  importId:string;organizationId:string;sourceSha256:string;
  records:number;accepted:number;quarantined:number;duplicatesCollapsed:number;
  ignoredColumns:string[];replayed:boolean;paymentAuthorized:false;paymentExecuted:false;
};

/** Strictly a historical evidence ingestion service, never a vendor
 * destination mutation or autonomous payment request producer. */
export async function importApHistory(input:{
  organizationId:string;actorUserId:string;content:Buffer;
}):Promise<ApImportResult> {
  const client=await pool.connect();
  try{
    await client.query("begin");
    const admin=await client.query(
      ["select 1 from organization_admin_memberships",
       "where organization_id=$1 and user_id=$2 and role='ADMIN' and active=true",
       "for share"].join(" "),[input.organizationId,input.actorUserId]);
    if(admin.rows.length!==1)
      throw new ApImportPermissionError("ORGANIZATION_NOT_FOUND",404);
    // Parse only after the authoritative role check; malicious file content
    // never determines which organization or vendor to bind.
    const parsed=parseApHistoryCsv(input.content);
    const previous=await client.query(
      "select * from ap_imports where organization_id=$1 and source_sha256=$2 for share",
      [input.organizationId,parsed.sourceSha256]);
    if(previous.rows[0]){
      const p=previous.rows[0];
      await client.query("commit");
      return {
        importId:p.id,organizationId:input.organizationId,
        sourceSha256:parsed.sourceSha256,records:p.source_record_count,
        accepted:p.accepted_row_count,quarantined:p.quarantine_count,
        duplicatesCollapsed:p.duplicate_count,ignoredColumns:p.ignored_columns,
        replayed:true,paymentAuthorized:false,paymentExecuted:false,
      };
    }
    const vendors=await client.query("select id,name from vendors where organization_id=$1",
      [input.organizationId]);
    const byName=new Map<string,string[]>();
    for(const v of vendors.rows as Array<{id:string;name:string}>){
      const key=v.name.trim().toLocaleLowerCase("en-US");
      byName.set(key,[...(byName.get(key)??[]),v.id]);
    }
    const accepted:Array<NormalizedApRow & {vendorId:string}>=[];
    const quarantined:QuarantinedApRow[]=[...parsed.quarantined];
    for(const row of parsed.rows){
      const matches=byName.get(row.vendorName.toLocaleLowerCase("en-US"))??[];
      if(matches.length!==1){
        quarantined.push({sourceRowNumber:row.sourceRowNumber,
          rowSha256:row.rowSha256,
          reasonCodes:[matches.length?"AP_VENDOR_AMBIGUOUS":"AP_VENDOR_UNRESOLVED"]});
        continue;
      }
      accepted.push({...row,vendorId:matches[0]});
    }
    const created=await client.query(
      ["insert into ap_imports",
       "(organization_id,imported_by_user_id,source_sha256,source_bytes,",
       "source_record_count,accepted_row_count,quarantine_count,duplicate_count,ignored_columns)",
       "values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)",
       "on conflict(organization_id,source_sha256) do nothing",
       "returning id"].join(" "),[
        input.organizationId,input.actorUserId,parsed.sourceSha256,input.content,
        parsed.rowCount,accepted.length,quarantined.length,parsed.duplicatesCollapsed,
        JSON.stringify(parsed.ignoredColumns),
      ]);
    if(!created.rows[0]){
      const winner=await client.query(
        "select * from ap_imports where organization_id=$1 and source_sha256=$2",
        [input.organizationId,parsed.sourceSha256]);
      if(!winner.rows[0])throw new Error("AP_IMPORT_CONFLICT_INCONSISTENT");
      const p=winner.rows[0];
      await client.query("commit");
      return {importId:p.id,organizationId:input.organizationId,
        sourceSha256:parsed.sourceSha256,records:p.source_record_count,
        accepted:p.accepted_row_count,quarantined:p.quarantine_count,
        duplicatesCollapsed:p.duplicate_count,ignoredColumns:p.ignored_columns,
        replayed:true,paymentAuthorized:false,paymentExecuted:false};
    }
    const importId=created.rows[0].id as string;
    for(const row of accepted){
      await client.query([
        "insert into ap_history_rows",
        "(organization_id,import_id,source_row_number,normalized_row_sha256,",
        "vendor_id,vendor_name,invoice_number,invoice_date,amount_cents,currency,status,",
        "due_date,paid_at,observed_payment_destination,department,cost_center)",
        "values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)",
      ].join(" "),[
        input.organizationId,importId,row.sourceRowNumber,row.rowSha256,
        row.vendorId,row.vendorName,row.invoiceNumber,row.invoiceDate,row.amountCents,
        row.currency,row.status,row.dueDate,row.paidAt,row.paymentDestination,
        row.department,row.costCenter,
      ]);
    }
    for(const row of quarantined){
      await client.query([
        "insert into ap_history_quarantine",
        "(organization_id,import_id,source_row_number,source_row_sha256,reason_codes)",
        "values($1,$2,$3,$4,$5::jsonb)",
      ].join(" "),[
        input.organizationId,importId,row.sourceRowNumber,row.rowSha256,
        JSON.stringify(row.reasonCodes),
      ]);
    }
    await client.query("commit");
    return {importId,organizationId:input.organizationId,
      sourceSha256:parsed.sourceSha256,records:parsed.rowCount,
      accepted:accepted.length,quarantined:quarantined.length,
      duplicatesCollapsed:parsed.duplicatesCollapsed,ignoredColumns:parsed.ignoredColumns,
      replayed:false,paymentAuthorized:false,paymentExecuted:false};
  }catch(error){
    await client.query("rollback").catch(()=>undefined);
    throw error;
  }finally{client.release();}
}
