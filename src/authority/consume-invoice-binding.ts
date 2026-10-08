import { randomUUID } from "node:crypto";
import { pool } from "../db/pool";
import { inspectCurrentAuthorityBinding } from "./binding-guard";

/**
 * This is an INTERNAL, explicitly approved invoice path. It accepts no
 * invoice-derived vendor, recipient, amount, currency or source flag.
 * All values come exclusively from the immutable approved binding and current
 * server-side authoritative records. No model/agent API exposes this helper.
 */
export async function consumeApprovedInvoiceBinding(bindingId: string) {
  const client=await pool.connect();
  try {
    await client.query("begin");
    const state=await client.query(
      "select authorization_status,linked_payment_request_id from payment_authority_bindings where id=$1 for update",
      [bindingId],
    );
    if(!state.rows[0]) throw new Error("PAYMENT_BINDING_NOT_FOUND");
    if(state.rows[0].authorization_status==="CONSUMED") {
      const id=state.rows[0].linked_payment_request_id;
      if(!id)throw new Error("PAYMENT_BINDING_CONSUMPTION_INCOMPLETE");
      const existing=await client.query(
        [
          "select pr.id as request_id,pr.logical_payment_id,pr.status,",
          "pd.outcome,pd.reason_codes",
          "from payment_requests pr join payment_decisions pd on pd.payment_request_id=pr.id",
          "where pr.id=$1 and pr.authority_binding_id=$2 and pr.source='verified_invoice'",
        ].join(" "),
        [id,bindingId],
      );
      if(!existing.rows[0])throw new Error("PAYMENT_BINDING_REPLAY_INCONSISTENT");
      await client.query("commit");
      return {
        requestId:existing.rows[0].request_id as string,
        logicalPaymentId:existing.rows[0].logical_payment_id as string,
        status:existing.rows[0].status as string,
        decision:{
          outcome:existing.rows[0].outcome as string,
          reasonCodes:existing.rows[0].reason_codes as string[],
        },
        replayed:true,
        paymentExecuted:false as const,
      };
    }
    if(state.rows[0].authorization_status!=="AUTHORIZED")throw new Error("PAYMENT_BINDING_NOT_APPROVED");

    const bound=await inspectCurrentAuthorityBinding(client,bindingId,"AUTHORIZED");
    const requestId=randomUUID(),logicalPaymentId=randomUUID();
    await client.query(
      [
        "insert into payment_requests",
        "(id,logical_payment_id,organization_id,vendor_id,idempotency_key,",
        "invoice_number,amount_cents,currency,requested_destination,status,source,authority_binding_id)",
        "values($1,$2,$3,$4,$5,$6,$7,$8,$9,'ALLOWED','verified_invoice',$10)",
      ].join(" "),
      [
        requestId,logicalPaymentId,bound.organizationId,bound.vendorId,
        "invoice-verified-binding:"+bindingId,bound.invoiceNumber,
        bound.amountCents,bound.currency,bound.recipient,bindingId,
      ],
    );
    await client.query(
      [
        "insert into payment_decisions",
        "(id,payment_request_id,outcome,reason_codes,evidence)",
        "values($1,$2,'ALLOW',$3::jsonb,$4::jsonb)",
      ].join(" "),
      [
        randomUUID(),requestId,
        JSON.stringify(["PROVENANCE_BOUND_HUMAN_APPROVED"]),
        JSON.stringify([{
          code:"PROVENANCE_BOUND_HUMAN_APPROVED",
          source:"authority_binding",
          observed:bound.tupleSha256,
        }]),
      ],
    );
    const claimed=await client.query(
      [
        "update payment_authority_bindings",
        "set authorization_status='CONSUMED',consumed_at=now(),linked_payment_request_id=$2",
        "where id=$1 and authorization_status='AUTHORIZED'",
        "returning id",
      ].join(" "),
      [bindingId,requestId],
    );
    if(!claimed.rows[0])throw new Error("PAYMENT_BINDING_CONCURRENT_CONSUMPTION");
    await client.query(
      [
        "insert into parameter_lineage_events",
        "(trace_id,sequence,organization_id,artifact_id,binding_id,",
        "source_kind,trust_tier,event_type,source_record_id,field_name,",
        "observed_value_sha256,sink_component,sink_field)",
        "select $2,1,organization_id,artifact_id,id,'HUMAN',4,",
        "'AUTHORIZED_BINDING_CONSUMED',$3,'payment_tuple',tuple_sha256,",
        "'payment_requests','verified_invoice'",
        "from payment_authority_bindings where id=$1",
      ].join(" "),
      [bindingId,randomUUID(),bound.approvalActor],
    );
    await client.query("commit");
    return {
      requestId,logicalPaymentId,status:"ALLOWED",
      decision:{outcome:"ALLOW",reasonCodes:["PROVENANCE_BOUND_HUMAN_APPROVED"]},
      replayed:false,paymentExecuted:false as const,
    };
  } catch(error) {
    await client.query("rollback").catch(()=>undefined);
    throw error;
  } finally {
    client.release();
  }
}
