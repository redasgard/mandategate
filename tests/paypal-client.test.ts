import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PayPalPayoutsClient } from "../src/payments/paypal/client";

function jsonResponse(status:number, body:any) {
  return new Response(JSON.stringify(body), { status, headers:{"content-type":"application/json"} });
}

const input={paypalRequestId:"req",senderBatchId:"batch",senderItemId:"item",receiver:"vendor@example.com",amountCents:120000,currency:"USD",note:"invoice"};

describe("PayPal Payouts client",()=>{
  // The fake fetch transport is deliberate: these tests verify request shaping,
  // NOT permission to make an external PayPal call. Preserve the CI-wide kill
  // switch outside this isolated test suite.
  beforeEach(() => vi.stubEnv("MANDATEGATE_DISABLE_PAYMENTS", "0"));
  afterEach(() => vi.unstubAllEnvs());

  it("refuses all payout transport when the payment kill switch is enabled", async () => {
    vi.stubEnv("MANDATEGATE_DISABLE_PAYMENTS", "1");
    const mockFetch = vi.fn<typeof fetch>();
    const client = new PayPalPayoutsClient({
      baseUrl:"https://api-m.sandbox.paypal.com",
      clientId:"ci-id",clientSecret:"ci-secret",fetchImpl:mockFetch,
    });
    await expect(client.createSinglePayout(input)).rejects.toThrow("PAYMENTS_DISABLED_FOR_PREVIEW");
    expect(mockFetch).not.toHaveBeenCalled();
  });
  it("caches OAuth and sends all deterministic correlation IDs",async()=>{
    const calls:{url:string;init:RequestInit}[]=[]; let tokenCalls=0;
    const fakeFetch:typeof fetch=async(input:any,init:any={})=>{const url=String(input);calls.push({url,init});if(url.endsWith("/v1/oauth2/token")){tokenCalls++;return jsonResponse(200,{access_token:"token",expires_in:3600});}if(url.endsWith("/v1/payments/payouts")&&init.method==="POST")return jsonResponse(201,{batch_header:{payout_batch_id:"BATCH-7"}});if(url.includes("/v1/payments/payouts/BATCH-7"))return jsonResponse(200,{items:[{payout_item_id:"ITEM-7",transaction_status:"SUCCESS"}]});throw new Error(`unexpected ${url}`);};
    const client=new PayPalPayoutsClient({baseUrl:"https://api-m.sandbox.paypal.com",clientId:"id",clientSecret:"secret",fetchImpl:fakeFetch,now:()=>1000});
    expect((await client.createSinglePayout(input)).payoutBatchId).toBe("BATCH-7");
    const payoutCall=calls.find(c=>c.url.endsWith("/v1/payments/payouts")&&c.init.method==="POST")!;
    expect((payoutCall.init.headers as any)["PayPal-Request-Id"]).toBe("req");
    const body=JSON.parse(String(payoutCall.init.body));
    expect(body.sender_batch_header.sender_batch_id).toBe("batch");
    expect(body.items[0].sender_item_id).toBe("item");
    expect(body.items[0].amount.value).toBe("1200.00");
    expect((await client.getBatchItem("BATCH-7")).transactionStatus).toBe("SUCCESS");
    expect(tokenCalls).toBe(1);
  });

  it("recovers the original payout batch from a duplicate HATEOAS link",async()=>{
    const fakeFetch:typeof fetch=async(input:any,init:any={})=>{const url=String(input);if(url.endsWith("/v1/oauth2/token"))return jsonResponse(200,{access_token:"token",expires_in:3600});if(url.endsWith("/v1/payments/payouts")&&init.method==="POST")return jsonResponse(400,{name:"BATCH_ALREADY_EXISTS",links:[{rel:"self",href:"https://api-m.sandbox.paypal.com/v1/payments/payouts/ORIGINAL-1"}]});throw new Error("unexpected");};
    const client=new PayPalPayoutsClient({baseUrl:"https://api-m.sandbox.paypal.com",clientId:"id",clientSecret:"secret",fetchImpl:fakeFetch});
    expect((await client.createSinglePayout(input)).payoutBatchId).toBe("ORIGINAL-1");
  });

  it("does not treat an unrelated error containing a payout link as duplicate recovery",async()=>{
    const fakeFetch:typeof fetch=async(input:any,init:any={})=>{const url=String(input);if(url.endsWith("/v1/oauth2/token"))return jsonResponse(200,{access_token:"token",expires_in:3600});if(url.endsWith("/v1/payments/payouts")&&init.method==="POST")return jsonResponse(400,{name:"INVALID_REQUEST",links:[{rel:"self",href:"https://api-m.sandbox.paypal.com/v1/payments/payouts/NOT-A-DUPLICATE"}]});throw new Error("unexpected");};
    const client=new PayPalPayoutsClient({baseUrl:"https://api-m.sandbox.paypal.com",clientId:"id",clientSecret:"secret",fetchImpl:fakeFetch});
    await expect(client.createSinglePayout(input)).rejects.toThrow("INVALID_REQUEST");
  });

  it("rejects production hosts in the hackathon build",()=>{
    expect(()=>new PayPalPayoutsClient({baseUrl:"https://api-m.paypal.com",clientId:"id",clientSecret:"secret"})).toThrow(/Sandbox/);
  });
});
