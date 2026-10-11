import {pool} from "../db/pool";
import type { PoolClient } from "pg";
import type {DecisionEvidence} from "../policy/decision";

export type ApPaidSample={
  vendorId:string;invoiceNumber:string;amountCents:number;invoiceDate:string;
  importId:string;rowSha256:string;sourceSha256:string;
};
export type ApRiskInput={
  vendorId:string;invoiceNumber:string;amountCents:number;currency:string;
};
type RiskResult={reasonCodes:string[];evidence:DecisionEvidence[]};
const normalizeId=(s:string)=>s.replace(/[^A-Za-z0-9]/g,"").toUpperCase();
const digits=Array.from("0123456789");
const confusable:Record<string,string>={O:"0",I:"1",L:"1",S:"5",B:"8",Z:"2"};
const canonicalConfusable=(s:string)=>[...normalizeId(s)].map(c=>confusable[c]??c).join("");
const median=(values:number[])=>{
  const copy=[...values].sort((a,b)=>a-b),half=Math.floor(copy.length/2);
  return copy.length%2?copy[half]:Math.floor((copy[half-1]+copy[half])/2);
};
const metadata=(sample:ApPaidSample)=>({
  importId:sample.importId,rowSha256:sample.rowSha256,
  sourceSha256:sample.sourceSha256,
});

/** Pure, deterministic analyst. Imported history can only escalate;
 * it has no authority to ALLOW, DENY or change vendor payment destinations. */
export function detectApHistoryRisk(
  input:ApRiskInput,samples:readonly ApPaidSample[],
):RiskResult {
  const reasons=new Set<string>(), evidence:DecisionEvidence[]=[];
  if(input.currency!=="USD")return {reasonCodes:[],evidence:[]};
  const vendorSamples=samples.filter(s=>s.vendorId===input.vendorId);
  const normalized=normalizeId(input.invoiceNumber);
  const exact=vendorSamples.find(s=>normalizeId(s.invoiceNumber)===normalized);
  if(exact){
    reasons.add("AP_INVOICE_NUMBER_REPLAY");
    evidence.push({
      code:"AP_INVOICE_NUMBER_REPLAY",source:"ap_history.imported_paid_invoice",
      observed:input.invoiceNumber,expected:exact.invoiceNumber,
      provenance:metadata(exact),
    });
  } else {
    // "INV-1001" vs "INV-1002" is ordinary sequential numbering, NOT
    // a typo attack. Flag confusable character changes (I/1, O/0)
    // on the same payable amount, avoiding generic edit distance noise.
    const near=vendorSamples.find(s=>
      normalizeId(s.invoiceNumber)!==normalized &&
      canonicalConfusable(s.invoiceNumber)===canonicalConfusable(input.invoiceNumber) &&
      Math.abs(s.amountCents-input.amountCents)<=Math.max(1,Math.floor(s.amountCents/100)),
    );
    if(near){
      reasons.add("AP_NEAR_DUPLICATE_INVOICE");
      evidence.push({
        code:"AP_NEAR_DUPLICATE_INVOICE",source:"ap_history.confusable_paid_invoice",
        observed:input.invoiceNumber,expected:near.invoiceNumber,
        provenance:metadata(near),
      });
    }
  }
  const paidVendor=vendorSamples.map(s=>s.amountCents);
  const baseline=paidVendor.length>=3?paidVendor:samples.map(s=>s.amountCents);
  const label=paidVendor.length>=3?"vendor":"organization";
  if(baseline.length >= (label==="vendor"?3:5)){
    const typical=median(baseline);
    const threshold=Math.max(Math.ceil(typical*2.5),typical+25_000);
    if(input.amountCents>threshold){
      reasons.add("AP_AMOUNT_OUTLIER");
      const ref=vendorSamples.at(0)??samples.at(0)!;
      evidence.push({
        code:"AP_AMOUNT_OUTLIER",
        source:"ap_history."+label+"_paid_median",
        observed:input.amountCents,expected:typical,
        provenance:{
          ...metadata(ref),
          contributingImportIds:[...new Set(
            (label==="vendor"?vendorSamples:samples).map(s=>s.importId),
          )].sort(),
          sampleCount:baseline.length,
        },
      });
    }
  }
  return {reasonCodes:[...reasons].sort(),evidence};
}

/** The organization constraint is part of the SELECT itself. No CSV/LLM
 * content is allowed to supply SQL identifiers or the tenant binding. */
export async function assessHistoricalPaymentRisk(
  input:ApRiskInput&{organizationId:string},client?:PoolClient,
):Promise<RiskResult> {
  const result=await (client??pool).query([
    // Re-imported ERP exports can repeat older paid rows. Keep the newest
    // import's provenance for each normalized row, without double-counting
    // the same historic payment in median/cadence risk calculations.
    "select s.vendor_id,s.invoice_number,s.amount_cents,s.invoice_date,",
    "s.import_id,s.normalized_row_sha256,s.source_sha256",
    "from (",
    "select distinct on (h.normalized_row_sha256)",
    "h.vendor_id,h.invoice_number,h.amount_cents,h.invoice_date,",
    "h.import_id,h.normalized_row_sha256,i.source_sha256",
    "from ap_history_rows h",
    "join ap_imports i on i.id=h.import_id and i.organization_id=h.organization_id",
    "where h.organization_id=$1 and h.status='PAID' and h.currency=$2",
    "order by h.normalized_row_sha256,i.created_at desc,i.id desc",
    ") s order by s.invoice_date desc,s.normalized_row_sha256 desc limit 2001",
  ].join(" "),[input.organizationId,input.currency]);
  const samples:ApPaidSample[]=result.rows.slice(0,2000).map(r=>({
    vendorId:r.vendor_id,invoiceNumber:r.invoice_number,
    amountCents:Number(r.amount_cents),invoiceDate:r.invoice_date,
    importId:r.import_id,rowSha256:r.normalized_row_sha256,
    sourceSha256:r.source_sha256,
  }));
  const assessed=detectApHistoryRisk(input,samples);
  // If the import set exceeds the bounded sample window, never claim the
  // older paid invoices were cleared by an incomplete query.
  if(result.rows.length>2000) return {
    reasonCodes:[...new Set([...assessed.reasonCodes,"AP_HISTORY_WINDOW_INCOMPLETE"])].sort(),
    evidence:[...assessed.evidence,{
      code:"AP_HISTORY_WINDOW_INCOMPLETE",source:"ap_history.paid_sample_window",
      observed:"more than 2000 distinct paid rows",expected:"complete history",
    }],
  };
  return assessed;
}
