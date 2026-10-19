import {postgresExecutionStore} from "../payments/executor/postgres-store";
import {executeAuthorizedPayment} from "../payments/executor/service";
import type {PaymentGateway} from "../payments/executor/types";
import {AutopayBudgetError,inspectAutopayBinding,
  inspectClaimedAutopayBinding,reserveAutopayBudget} from "./budget";

/**
 * This is a safety-bounded integration harness, NOT a scheduler nor a PayPal
 * integration. Fake gateway only; no production credentials or providers.
 * NEVER call this method from a web route or a shared/Neon database.
 */
function assertDisposableSimulationEnvironment(){
  const url=new URL(process.env.DATABASE_URL??"postgresql://invalid@invalid/db");
  if(process.env.CI!=="true"||
     process.env.MANDATEGATE_DISABLE_PAYMENTS!=="1"||
     process.env.MANDATEGATE_RUNTIME_MODE!=="legacy"||
     process.env.PAYPAL_CLIENT_ID||process.env.PAYPAL_CLIENT_SECRET||
     url.hostname!=="127.0.0.1"||url.port!=="55432"||
     url.pathname!=="/mandategate") {
    throw Error("AUTOPAY_SIMULATION_DISPOSABLE_CI_ONLY");
  }
}
export type AutonomousSimulationResult={
  requestId:string;
  mode:"SYNTHETIC_FAKE_GATEWAY";
  outcome:"HELD"|"SIMULATED_EXECUTION";
  reason?:string;
  simulatedStatus?:string;
  externalPaymentExecuted:false;
};
export async function simulateBoundAutopay(
  requestId:string,
  gateway:PaymentGateway,
  hooks:{beforeSubmit?:()=>Promise<void>}={},
):Promise<AutonomousSimulationResult>{
  assertDisposableSimulationEnvironment();
  const base={
    requestId,mode:"SYNTHETIC_FAKE_GATEWAY" as const,
    externalPaymentExecuted:false as const,
  };
  const current=await inspectAutopayBinding(requestId);
  if(!current)return {...base,outcome:"HELD",reason:"MISSING_OR_STALE_GRANT"};
  const authoritative=await postgresExecutionStore.getAuthoritativePayment(requestId);
  if(!authoritative||authoritative.logicalPaymentId!==current.logicalPaymentId||
     authoritative.amountCents!==current.amountCents||
     authoritative.decisionOutcome!=="ALLOW")
    return {...base,outcome:"HELD",reason:"PAYMENT_AUTHORITY_NOT_CURRENT"};
  try{
    await reserveAutopayBudget(requestId);
  }catch(e){
    if(e instanceof AutopayBudgetError)
      return {...base,outcome:"HELD",reason:e.code};
    throw e;
  }
  const result=await executeAuthorizedPayment(requestId,{
    store:postgresExecutionStore,
    gateway,
    beforeSubmit:async()=>{
      await hooks.beforeSubmit?.();
      const latest=await inspectClaimedAutopayBinding(requestId);
      if(!latest||!latest.existingReservation||
         latest.logicalPaymentId!==current.logicalPaymentId||
         latest.mandateId!==current.mandateId||
         latest.grantDigest!==current.grantDigest||
         latest.amountCents!==current.amountCents)
        throw Error("AUTOPAY_GRANT_CHANGED_BEFORE_SUBMISSION");
    },
  });
  return {...base,outcome:"SIMULATED_EXECUTION",
    simulatedStatus:result.status};
}
