import {describe,expect,it} from "vitest";
import {medianInteger,summarizePaidHistory} from "../src/history/baselines";
const base={
  organization_id:"org_a",organization_name:"Organization A",
  vendor_id:"vendor_a",vendor_name:"Vendor A",import_id:"import_a",
};
describe("source-bound AP payment cadence baselines",()=>{
  it("computes median cents and median days, with sparse history null",()=>{
    const history=[
      {...base,amount_cents:10000,invoice_date:"2026-10-01"},
      {...base,amount_cents:12000,invoice_date:"2026-10-05"},
      {...base,amount_cents:11000,invoice_date:"2026-10-11"},
    ];
    expect(summarizePaidHistory(history)).toMatchObject([{
      paidInvoiceCount:3,medianAmountCents:11000,
      medianInvoiceCadenceDays:5,
      firstInvoiceDate:"2026-10-01",
      lastInvoiceDate:"2026-10-11",
      historicalImportIds:["import_a"],
    }]);
    expect(summarizePaidHistory(history.slice(0,2))[0].medianInvoiceCadenceDays).toBeNull();
    expect(medianInteger([])).toBeNull();
  });
  it("never merges distinct vendors or organizations",()=>{
    const rows=[
      {...base,amount_cents:10000,invoice_date:"2026-10-01"},
      {...base,vendor_id:"vendor_b",vendor_name:"Vendor B",amount_cents:50000,
        invoice_date:"2026-10-02",import_id:"import_b"},
      {...base,organization_id:"org_b",organization_name:"Organization B",
        amount_cents:99999,invoice_date:"2026-10-03",import_id:"import_other_org"},
    ];
    expect(summarizePaidHistory(rows)).toHaveLength(3);
    expect(summarizePaidHistory(rows).every(x=>x.paidInvoiceCount===1)).toBe(true);
  });
});
