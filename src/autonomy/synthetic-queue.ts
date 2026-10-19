import type {PaymentGateway} from "../payments/executor/types";
import {previewAutonomousDispatch} from "./dispatch";
import {
  assertDisposableSimulationEnvironment,
  simulateBoundAutopay,
} from "./simulated-runner";

export type QueueRunSummary={
  mode:"DISPOSABLE_FAKE_GATEWAY_ONLY";
  selected:number;
  simulatedPaid:number;
  held:number;
  blocked:number;
  unresolved:number;
  externalPaymentExecuted:false;
  outcomes:Array<{
    requestId:string;
    state:"SIMULATED_PAID"|"SIMULATED_BLOCKED"|"SIMULATED_PENDING"|"HELD";
    reason?:string;
  }>;
};
/**
 * A real queue-style batch orchestrator, constrained to a synthetic org in
 * disposable local CI. NO Cron, background daemon, hosted endpoint or PayPal
 * gateway. Only original mandate-bound ALLOW is ever dispatched here.
 *
 * Future production worker must use explicit source authorization, atomic
 * submission fence and a genuine provider with independent financial review.
 */
export async function runSyntheticAutopayQueue(input:{
  organizationId:string;
  gateway:PaymentGateway;
  maxRequests?:number;
}):Promise<QueueRunSummary>{
  assertDisposableSimulationEnvironment();
  // Prevent even accidental invocation on a real or demo organization.
  if(!/^queue_ci_[0-9a-f-]{36}$/i.test(input.organizationId))
    throw Error("AUTOPAY_SYNTHETIC_ORGANIZATION_REQUIRED");
  const max=input.maxRequests??10;
  if(!Number.isSafeInteger(max)||max<1||max>10)
    throw Error("AUTOPAY_QUEUE_BOUND_INVALID");
  const selected=await previewAutonomousDispatch(new Date(),max,input.organizationId);
  const outcomes:QueueRunSummary["outcomes"]=[];
  for(const candidate of selected){
    if(candidate.authorization!=="STANDING_MANDATE" ||
       candidate.preview!=="WOULD_DISPATCH") {
      outcomes.push({requestId:candidate.requestId,state:"HELD",
        reason:"ELIGIBILITY_NOT_CURRENT"});
      continue;
    }
    const res=await simulateBoundAutopay(candidate.requestId,input.gateway);
    if(res.outcome==="HELD"){
      outcomes.push({requestId:candidate.requestId,state:"HELD",reason:res.reason});
    }else if(res.simulatedStatus==="PAID"){
      outcomes.push({requestId:candidate.requestId,state:"SIMULATED_PAID"});
    }else if(res.simulatedStatus==="PAYMENT_BLOCKED"){
      outcomes.push({requestId:candidate.requestId,state:"SIMULATED_BLOCKED"});
    }else{
      outcomes.push({requestId:candidate.requestId,state:"SIMULATED_PENDING"});
    }
  }
  return {
    mode:"DISPOSABLE_FAKE_GATEWAY_ONLY",selected:selected.length,
    simulatedPaid:outcomes.filter(x=>x.state==="SIMULATED_PAID").length,
    held:outcomes.filter(x=>x.state==="HELD").length,
    blocked:outcomes.filter(x=>x.state==="SIMULATED_BLOCKED").length,
    unresolved:outcomes.filter(x=>x.state==="SIMULATED_PENDING").length,
    externalPaymentExecuted:false,outcomes,
  };
}
