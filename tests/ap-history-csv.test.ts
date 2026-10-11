import {describe,expect,it} from "vitest";
import {parseApHistoryCsv,ApCsvError,MAX_AP_CSV_BYTES} from "../src/history/csv-import";
const cols="vendor_name,invoice_number,invoice_date,amount_decimal,currency,status,due_date,paid_at,payment_destination,department,cost_center";
const data=(rows:string[])=>Buffer.from([cols,...rows].join("\r\n")+"\r\n");
describe("RFC4180 AP import normalization as inert evidence",()=>{
  it("parses quoted comma, optional fields, BOM and preserves provenance",()=>{
    const result=parseApHistoryCsv(Buffer.concat([
      Buffer.from([0xef,0xbb,0xbf]),
      data(['"Northstar, Components",INV-009,2026-09-10,12.30,usd,paid,2026-09-20,2026-09-18,old@example.test,AP,CC01']),
    ]));
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      vendorName:"Northstar, Components",amountCents:1230,currency:"USD",status:"PAID",
      sourceRowNumber:2,paymentDestination:"old@example.test",
    });
    expect(result.rows[0].rowSha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("collapses exact normalized duplicate rows without adding authority",()=>{
    const r=parseApHistoryCsv(data([
      "Vendor A,ABC,2026-09-10,12.30,USD,PAID,,,,,",
      "Vendor A,ABC,2026-09-10,12.30,USD,PAID,,,,,",
    ]));
    expect(r.rows).toHaveLength(1);
    expect(r.duplicatesCollapsed).toBe(1);
  });
  it("quarantines invalid dates, amounts, currencies and record width",()=>{
    const r=parseApHistoryCsv(data([
      "Vendor A,A1,09/10/2026,12.30,USD,PAID,,,,,",
      "Vendor A,A2,2026-09-10,12.3,USD,PAID,,,,,",
      "Vendor A,A3,2026-09-10,12.30,EUR,PAID,,,,,",
      "Vendor A,A4,2026-09-10,12.30,USD,PAID",
    ]));
    expect(r.rows).toHaveLength(0);
    expect(r.quarantined).toHaveLength(4);
    expect(r.quarantined[0].reasonCodes).toContain("AP_INVOICE_DATE_INVALID");
  });
  it("treats spreadsheet formulas as literal strings without evaluation",()=>{
    const r=parseApHistoryCsv(data([
      "Vendor A,ABC,2026-09-10,12.30,USD,PAID,,,,=HYPERLINK(https://attacker.invalid),+SUM(A1)",
    ]));
    expect(r.rows[0].department).toBe("=HYPERLINK(https://attacker.invalid)");
    expect(r.rows[0].costCenter).toBe("+SUM(A1)");
  });
  it("rejects case-folded duplicate headers and syntax errors",()=>{
    for(const raw of [
      "vendor_name,Vendor_Name,invoice_number,invoice_date,amount_decimal,currency,status\nA,B,C,2026-09-10,1.00,USD,PAID",
      'vendor_name,invoice_number,invoice_date,amount_decimal,currency,status\n"never-closed',
    ]){
      expect(()=>parseApHistoryCsv(Buffer.from(raw))).toThrow(ApCsvError);
    }
  });
  it("rejects oversized and binary inputs",()=>{
    expect(()=>parseApHistoryCsv(Buffer.alloc(MAX_AP_CSV_BYTES+1,65)))
      .toThrow(/AP_CSV_TOO_LARGE/);
    expect(()=>parseApHistoryCsv(Buffer.from([0,1,2]))).toThrow(/AP_CSV_BINARY_UNSUPPORTED/);
  });
});
