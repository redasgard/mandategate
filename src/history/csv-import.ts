import {createHash} from "node:crypto";
import {parse} from "csv-parse/sync";
import {invoiceDecimalToCents,isIsoCalendarDate} from "../invoices/normalize";

export const MAX_AP_CSV_BYTES=2*1024*1024;
export const MAX_AP_CSV_RECORDS=5000;
const REQUIRED=[
  "vendor_name","invoice_number","invoice_date","amount_decimal","currency","status",
] as const;
const OPTIONAL=[
  "due_date","paid_at","payment_destination","department","cost_center",
] as const;
const ALLOWED=new Set<string>([...REQUIRED,...OPTIONAL]);
const STATUSES=new Set(["PAID","PENDING","APPROVED","CANCELLED","REJECTED","FAILED","VOID"]);

export class ApCsvError extends Error {
  constructor(public readonly code:string,public readonly httpStatus=422) {
    super(code);this.name="ApCsvError";
  }
}
function refuse(code:string,status=422):never {throw new ApCsvError(code,status);}
export const apSha=(value:Buffer|string)=>createHash("sha256").update(value).digest("hex");

export type NormalizedApRow={
  sourceRowNumber:number;rowSha256:string;
  vendorName:string;invoiceNumber:string;invoiceDate:string;
  dueDate:string|null;paidAt:string|null;amountDecimal:string;
  amountCents:number;currency:string;status:string;
  paymentDestination:string|null;department:string|null;costCenter:string|null;
};
export type QuarantinedApRow={
  sourceRowNumber:number;rowSha256:string;reasonCodes:string[];
};
export type ParsedApCsv={
  sourceSha256:string;rowCount:number;rows:NormalizedApRow[];
  quarantined:QuarantinedApRow[];duplicatesCollapsed:number;
  ignoredColumns:string[];
};
const optional=(s:string|undefined):string|null=>s?.trim()||null;
const safeText=(s:string|null,max:number)=>s===null || (s.length>0&&s.length<=max);
const canonicalRow=(row:Omit<NormalizedApRow,"sourceRowNumber"|"rowSha256">)=>
  JSON.stringify([
    row.vendorName.toLocaleLowerCase("en-US"),row.invoiceNumber,row.invoiceDate,
    row.amountDecimal,row.currency,row.status,row.dueDate,row.paidAt,
    row.paymentDestination,row.department,row.costCenter,
  ]);

/** RFC4180 parsing. CSV values, including spreadsheet formulas, are always inert data. */
export function parseApHistoryCsv(bytes:Buffer):ParsedApCsv {
  if(bytes.length===0)refuse("AP_CSV_EMPTY",400);
  if(bytes.length>MAX_AP_CSV_BYTES)refuse("AP_CSV_TOO_LARGE",413);
  if(bytes.includes(0))refuse("AP_CSV_BINARY_UNSUPPORTED");
  let utf8:string;
  try{utf8=new TextDecoder("utf-8",{fatal:true}).decode(bytes);}
  catch{refuse("AP_CSV_UTF8_INVALID");}
  let records:string[][];
  try {
    records=parse(utf8!,{
      bom:true,skip_empty_lines:true,relax_column_count:true,
      relax_quotes:false,max_record_size:16_384,
      record_delimiter:["\r\n","\n","\r"],
    }) as string[][];
  } catch {refuse("AP_CSV_SYNTAX_INVALID");}
  if(!Array.isArray(records)||records.length<2)refuse("AP_CSV_NO_DATA");
  if(records.length-1>MAX_AP_CSV_RECORDS)refuse("AP_CSV_RECORD_LIMIT",413);
  const headers=records[0].map(x=>x.trim().toLowerCase());
  if(headers.some(x=>!x || x.length>64))refuse("AP_CSV_HEADER_INVALID");
  if(new Set(headers).size!==headers.length)refuse("AP_CSV_DUPLICATE_HEADER");
  if(REQUIRED.some(x=>!headers.includes(x)))refuse("AP_CSV_REQUIRED_HEADER_MISSING");
  const ignoredColumns=headers.filter(x=>!ALLOWED.has(x));
  const pick=(record:string[],field:string):string=>record[headers.indexOf(field)]??"";
  const rows:NormalizedApRow[]=[];
  const quarantined:QuarantinedApRow[]=[];
  const fingerprints=new Set<string>();
  let duplicatesCollapsed=0;
  for(const [index,values] of records.slice(1).entries()){
    // Source row number is 1-based CSV record index (including the header),
    // not a line number: RFC4180 allows newlines inside quoted cells.
    const sourceRowNumber=index+2;
    const rowSha256=apSha(JSON.stringify(values));
    const problems:string[]=[];
    if(values.length!==headers.length)problems.push("AP_CSV_COLUMN_COUNT_MISMATCH");
    const vendorName=pick(values,"vendor_name").trim();
    const invoiceNumber=pick(values,"invoice_number").trim();
    const invoiceDate=pick(values,"invoice_date").trim();
    const amountDecimal=pick(values,"amount_decimal").trim();
    const currency=pick(values,"currency").trim().toUpperCase();
    const status=pick(values,"status").trim().toUpperCase();
    const dueDate=optional(pick(values,"due_date"));
    const paidAt=optional(pick(values,"paid_at"));
    const paymentDestination=optional(pick(values,"payment_destination"));
    const department=optional(pick(values,"department"));
    const costCenter=optional(pick(values,"cost_center"));
    const amountCents=invoiceDecimalToCents(amountDecimal);
    if(!safeText(vendorName,120))problems.push("AP_VENDOR_NAME_INVALID");
    if(!safeText(invoiceNumber,120))problems.push("AP_INVOICE_NUMBER_INVALID");
    if(!isIsoCalendarDate(invoiceDate))problems.push("AP_INVOICE_DATE_INVALID");
    if(amountCents===null)problems.push("AP_AMOUNT_INVALID");
    if(currency!=="USD")problems.push("AP_CURRENCY_UNSUPPORTED");
    if(!STATUSES.has(status))problems.push("AP_STATUS_UNSUPPORTED");
    if(dueDate!==null&&!isIsoCalendarDate(dueDate))problems.push("AP_DUE_DATE_INVALID");
    if(paidAt!==null&&!isIsoCalendarDate(paidAt))problems.push("AP_PAID_AT_INVALID");
    for(const v of [paymentDestination,department,costCenter]){
      if(!safeText(v,320))problems.push("AP_OPTIONAL_FIELD_TOO_LONG");
    }
    if(problems.length || amountCents===null) {
      quarantined.push({sourceRowNumber,rowSha256,reasonCodes:[...new Set(problems)].sort()});
      continue;
    }
    const fields={
      vendorName,invoiceNumber,invoiceDate,amountDecimal,amountCents,
      currency,status,dueDate,paidAt,paymentDestination,department,costCenter,
    };
    const fingerprint=apSha(canonicalRow(fields));
    if(fingerprints.has(fingerprint)){duplicatesCollapsed++;continue;}
    fingerprints.add(fingerprint);
    rows.push({sourceRowNumber,rowSha256:fingerprint,...fields});
  }
  return {
    sourceSha256:apSha(bytes),rowCount:records.length-1,
    rows,quarantined,duplicatesCollapsed,ignoredColumns,
  };
}
