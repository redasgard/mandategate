# Judge demo: evidence-first runbook (2026-10-30)

## What the current main branch can actually show

This document separates the approved PRD from implemented functionality. Do not record a staged outcome as if it were live.

1. Sign in to the authenticated MandateGate dashboard.
2. An operations agent calls `POST /api/agent/payment-requests` with a scoped API key and a distinct Idempotency-Key for each case. The JSON contract is `vendorId`, `invoiceNumber`, `amountCents`, `currency`, and `paymentDestination`. Current ingress takes structured request data, **not a PDF upload**.
3. Three synthetic submissions use the seeded vendor `vendor_northstar` and the configured trusted destination:
   - **ALLOW:** `120000` cents, USD, exact trusted destination. Show the ALLOW decision, reasons, and evidence on payment detail. If a separately authorized Sandbox proof is being filmed, use the authenticated Execute button, then show PayPal batch/item IDs and final reconciliation; an ALLOW decision alone does not send money.
   - **ESCALATE:** `280000` cents, USD, exact trusted destination. Show the risk decision. **Do not claim the admin Accept/Decline workflow exists in the current UI.** No payout should be initiated.
   - **DENY:** `120000` cents, USD, deliberately changed destination. Show the reason/evidence. **Do not claim vendor re-verification was completed**, because the current UI does not implement that workflow.
4. Use a fresh unique invoice number and idempotency key for every replay. Reusing a key with changed input correctly produces a conflict.
5. Distinguish `ALLOW` (decision), `EXECUTING` / `SUBMITTED` (payment in progress), and `PAID` (reconciled remote outcome). PayPal Payouts is asynchronous: submission is not success.

## Missing PRD acceptance that must not be narrated as completed

- Dashboard available balance, current-period spend, upcoming/overdue obligations.
- Human escalation Accept/Decline with mandatory explanation, attachment option, and immediate/scheduled execution.
- Vendor destination re-verification lifecycle.
- PDF/image invoice upload, extraction, independent historical evidence, and historical near-duplicate analysis.
- Persistent Assistant, policy lifecycle, independent trail anchoring, and P1/P2 surfaces.
- A complete hosted three-case judge replay with live payment evidence from the same demo session.

## Safe recording boundaries

Use synthetic fixtures and Sandbox only; never call production PayPal. Do not include tokens, passwords, receiver addresses, or raw webhook secrets in a recording. Never repeatedly run the ALLOW payout to refresh the visuals. Prefer a previously verified payment detail for illustrating reconciliation unless a new exact payout has been separately authorized. Show execution status explicitly; absence of PayPal identifiers is not proof of payment.

## Correct short narrative

“An operations agent requests an invoice payment. MandateGate receives the request and evaluates its authority without granting the agent PayPal credentials. A normal request is allowed, but that decision is separate from submitting and reconciling a Sandbox payout. An unusual amount is escalated, and a changed payment destination is denied. Here are the evidence and reason codes behind each result.”

If showing only the present UI, close with “This build demonstrates the decision boundary and a separately tested Sandbox payout integration. The admin escalation and vendor re-verification screens are not yet implemented.” Do not claim the full PRD is finished.

## Acceptance for the complete PRD demo (NOT YET MET)

One judge-controlled agent submission creates an invoice with independently verified context; ALLOW leads to a reconciled Sandbox payment; ESCALATE reaches an admin with accept/decline and mandatory reason, without preapproval money movement; DENY enforces re-verification; all three have linked detailed evidence and activity history. Hosted operation, credentials, model provenance, and payout behavior must be re-verified against the exact deployed commit.
