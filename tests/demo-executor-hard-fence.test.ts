import {describe,expect,it,vi} from "vitest";
import {executeAuthorizedPayment,ExecutionRejectedError} from "../src/payments/executor/service";
import type {AuthoritativePayment,ExecutionStore,PaymentGateway} from "../src/payments/executor/types";
const base:AuthoritativePayment={
 requestId:"11111111-1111-4111-8111-111111111111",
 logicalPaymentId:"22222222-2222-4222-8222-222222222222",
 amountCents:120000,currency:"USD",
 requestedDestination:"ap@northstar.example",
 currentTrustedDestination:"ap@northstar.example",
 decisionOutcome:"ALLOW",invoiceNumber:"DEMO-NORMAL-2026",
};
function dependencies(payment:AuthoritativePayment){
 const store={getAuthoritativePayment:vi.fn().mockResolvedValue(payment),
   getOrCreateExecution:vi.fn().mockResolvedValue({status:"PAID"})} as unknown as ExecutionStore;
 const gateway={createSinglePayout:vi.fn()} as unknown as PaymentGateway;
 return {store,gateway};
}
describe("synthetic showcase payment executor hard fence",()=>{
 for(const name of ["DEMO-NORMAL-2026","DEMO-ANOMALY-2026","DEMO-SUBSTITUTION-2026"]){
  it("refuses "+name+" without creating an execution or invoking a gateway",async()=>{
    const {store,gateway}=dependencies({...base,invoiceNumber:name});
    await expect(executeAuthorizedPayment(base.requestId,{store,gateway}))
      .rejects.toThrow("SYNTHETIC_DEMO_NOT_PAYABLE");
    expect(store.getOrCreateExecution).not.toHaveBeenCalled();
    expect(gateway.createSinglePayout).not.toHaveBeenCalled();
  });
 }
 it("does not globally block a different authorized invoice",async()=>{
   const {store,gateway}=dependencies({...base,invoiceNumber:"NS-1001"});
   const result=await executeAuthorizedPayment(base.requestId,{store,gateway});
   expect(result.status).toBe("PAID");
   expect(store.getOrCreateExecution).toHaveBeenCalledOnce();
   expect(gateway.createSinglePayout).not.toHaveBeenCalled();
 });
});
