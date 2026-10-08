import { describe, expect, it } from "vitest";
import { derivePayPalIds } from "../src/payments/executor/ids";
import { executeAuthorizedPayment, reconcileExecution } from "../src/payments/executor/service";
import { canApplyRemoteStatusTransition } from "../src/payments/paypal/status";
import type { AuthoritativePayment, ExecutionRecord, ExecutionStatus, ExecutionStore, PaymentGateway, PayoutItemSnapshot, PayoutSubmission } from "../src/payments/executor/types";

const payment: AuthoritativePayment = {
  requestId: "request-1", logicalPaymentId: "logical-1", amountCents: 120000, currency: "USD",
  requestedDestination: "vendor@example.com", currentTrustedDestination: "vendor@example.com",
  decisionOutcome: "ALLOW", invoiceNumber: "INV-1",
};

class Store implements ExecutionStore {
  row: ExecutionRecord | null = null;
  constructor(public authoritative = payment) {}
  async getAuthoritativePayment(id:string){ return id===this.authoritative.requestId?this.authoritative:null; }
  async getOrCreateExecution(p:AuthoritativePayment){ if(!this.row){const ids=derivePayPalIds(p.logicalPaymentId);this.row={id:"e",paymentRequestId:p.requestId,logicalPaymentId:p.logicalPaymentId,status:"READY",...ids,paypalPayoutBatchId:null,paypalPayoutItemId:null,rawPaypalStatus:null,claimedAt:null,createdAt:new Date("2026-10-01T00:00:00Z"),submittedAt:null,lastReconciledAt:null,outcomeUnknownSince:null};} return structuredClone(this.row); }
  async getExecution(){ if(!this.row)throw new Error(); return structuredClone(this.row); }
  mutateAfterClaim: (() => void) | null = null;
  async tryClaim(_id:string,allowed:ExecutionStatus[]){ await new Promise(r=>setTimeout(r,1)); if(!this.row||!allowed.includes(this.row.status))return null;this.row.status="SUBMITTING";this.row.claimedAt=new Date();this.mutateAfterClaim?.();return structuredClone(this.row); }
  async markSubmitted(_id:string,b:string,n:Date){this.row!.status="EXECUTING";this.row!.paypalPayoutBatchId=b;this.row!.submittedAt=n;return structuredClone(this.row!);}
  async markFailed(_id:string,s:string,_n:Date){this.row!.status="PAYMENT_FAILED";this.row!.rawPaypalStatus=s;return structuredClone(this.row!);}
  async markBlocked(_id:string,s:string,_n:Date){this.row!.status="PAYMENT_BLOCKED";this.row!.rawPaypalStatus=s;return structuredClone(this.row!);}
  async markUnknown(_id:string,n:Date){this.row!.status="PAYMENT_UNKNOWN";this.row!.outcomeUnknownSince??=n;return structuredClone(this.row!);}
  async markManualReconciliation(){this.row!.status="PAYMENT_UNKNOWN_MANUAL_RECONCILIATION";return structuredClone(this.row!);}
  async applyRemoteStatus(_id:string,s:PayoutItemSnapshot,m:ExecutionStatus,n:Date){const applied=canApplyRemoteStatusTransition(this.row!.status,m);if(applied){this.row!.status=m;this.row!.paypalPayoutBatchId=s.payoutBatchId;this.row!.paypalPayoutItemId=s.payoutItemId;this.row!.rawPaypalStatus=s.transactionStatus;this.row!.lastReconciledAt=n;}return{execution:structuredClone(this.row!),applied};}
  async appendEvent(){}
}
class Gateway implements PaymentGateway {
  posts:PayoutSubmission[]=[]; fail=0; status="SUCCESS";
  async createSinglePayout(i:PayoutSubmission){this.posts.push(i);if(this.fail-->0)throw new TypeError("lost");return{payoutBatchId:"B1"};}
  async getBatchItem(b:string){return{payoutItemId:"I1",payoutBatchId:b,transactionStatus:this.status};}
  async getPayoutItem(i:string){return{payoutItemId:i,payoutBatchId:"B1",transactionStatus:this.status};}
}

describe("payment executor",()=>{
  it("lets only one concurrent claimant POST",async()=>{const store=new Store();const gateway=new Gateway();await Promise.all([executeAuthorizedPayment("request-1",{store,gateway}),executeAuthorizedPayment("request-1",{store,gateway})]);expect(gateway.posts).toHaveLength(1);});
  it("reuses all PayPal correlation IDs after a lost response",async()=>{const store=new Store();const gateway=new Gateway();gateway.fail=1;expect((await executeAuthorizedPayment("request-1",{store,gateway,now:()=>new Date("2026-10-02")})).status).toBe("PAYMENT_UNKNOWN");expect((await executeAuthorizedPayment("request-1",{store,gateway,now:()=>new Date("2026-10-03")})).status).toBe("PAID");expect(gateway.posts[1]).toMatchObject({paypalRequestId:gateway.posts[0].paypalRequestId,senderBatchId:gateway.posts[0].senderBatchId,senderItemId:gateway.posts[0].senderItemId});});
  it("never retries an unknown outcome after the 30-day PayPal duplicate window",async()=>{const store=new Store();const gateway=new Gateway();await store.getOrCreateExecution(payment);store.row!.status="PAYMENT_UNKNOWN";store.row!.createdAt=new Date("2026-08-01");expect((await executeAuthorizedPayment("request-1",{store,gateway,now:()=>new Date("2026-10-07")})).status).toBe("PAYMENT_UNKNOWN_MANUAL_RECONCILIATION");expect(gateway.posts).toHaveLength(0);});
  it("revalidates the trusted destination before any POST",async()=>{const store=new Store({...payment,currentTrustedDestination:"changed@example.net"});const gateway=new Gateway();await expect(executeAuthorizedPayment("request-1",{store,gateway})).rejects.toThrow("TRUSTED_DESTINATION_CHANGED");expect(gateway.posts).toHaveLength(0);});
  it("revalidates authority after the execution claim and before POST",async()=>{const store=new Store();const gateway=new Gateway();store.mutateAfterClaim=()=>{store.authoritative={...store.authoritative,currentTrustedDestination:"revoked@example.net"};};const result=await executeAuthorizedPayment("request-1",{store,gateway});expect(result.status).toBe("PAYMENT_BLOCKED");expect(result.rawPaypalStatus).toBe("TRUSTED_DESTINATION_CHANGED");expect(gateway.posts).toHaveLength(0);});
  it("rejects non-USD payout execution in the P0 build",async()=>{const store=new Store({...payment,currency:"EUR"});const gateway=new Gateway();await expect(executeAuthorizedPayment("request-1",{store,gateway})).rejects.toThrow("UNSUPPORTED_PAYOUT_CURRENCY");expect(gateway.posts).toHaveLength(0);});
  it("does not regress PAID when a stale pending status is reconciled",async()=>{const store=new Store();await store.getOrCreateExecution(payment);store.row!.status="PAID";store.row!.paypalPayoutBatchId="B1";store.row!.paypalPayoutItemId="I1";const gateway=new Gateway();gateway.status="PENDING";expect((await reconcileExecution("logical-1",{store,gateway})).status).toBe("PAID");});
  it("allows PAID to move to a reversal state",async()=>{const store=new Store();await store.getOrCreateExecution(payment);store.row!.status="PAID";store.row!.paypalPayoutBatchId="B1";store.row!.paypalPayoutItemId="I1";const gateway=new Gateway();gateway.status="REVERSED";expect((await reconcileExecution("logical-1",{store,gateway})).status).toBe("PAYMENT_REVERSED");});
});
