# Fictional invoice → PayPal Sandbox Payouts | bounded demo lane

**Scope:** Hackathon demo only, USD **$1.01** in PayPal Sandbox. No real business payment, no production PayPal host, and no claim of real-supplier contact. This lane is deliberately separate from strict Gate H-S (live-provider ZDR).

## Current code

- `src/demo/sandbox-invoice-rail.ts` admits only `verified_invoice` created from an existing consumed binding in `org_demo` / `vendor_northstar` / invoice `MG-SANDBOX-101-2026`, with exactly 101 cents, USD, current trusted Sandbox receiver and the matching binding idempotency key. Requires `MANDATEGATE_SANDBOX_VERIFIED_INVOICE_DEMO=1`, `MANDATEGATE_RUNTIME_MODE=neon-sandbox`, `MANDATEGATE_DISABLE_PAYMENTS=0`, and the **exact** PayPal Sandbox API origin.
- Other user-submitted invoices, GLM observations and the three canonical `DEMO-NORMAL/ANOMALY/SUBSTITUTION` examples are **never** in the payment allowlist.
- `src/payments/executor/postgres-store.ts` still requires a current, `CONSUMED` T4 source binding with T2 PDF facts, valid pre-enrolled non-SYNTHETIC_FIXTURE origin channel, active human verifier/approver, trusted recipient, policy, immutable hashes, and no late imported AP history flags; it repeats authority checks immediately before payout.
- The pre-existing `payment_requests_verified_invoice_natural_uq` index already prevents duplicate `(organization,vendor,invoice_number)` invoice-derived requests. The executor also persists PayPal idempotency fields and serializes claims.
- The historical fixed `sandbox_fixture` payout remains a **separate** no-invoice test when the new invoice feature flag is **off**. The two lanes are mutually exclusive: when invoice mode is on, the old standalone preparation and executor rail are explicitly disabled. It does **not** demonstrate this invoice-derived lane.

## Preparing the fiction-only evidence (does not pay)

**UI path:** With `MANDATEGATE_SANDBOX_VERIFIED_INVOICE_DEMO=1` on the bound **Sandbox development/demo host** (not isolated CI), sign in as the `org_demo` administrator. Open `/sandbox-payout`, follow the link to `/invoice-artifacts`, and use **Download USD 1.01 Sandbox test PDF**. Enroll the Northstar source channel first, then upload the PDF. The PDF is generated with the currently configured Sandbox receiver and includes explicit fictional supplier labels.

1. Use a fictional Northstar Components PDF with exactly one each: `Vendor: Northstar Components`, `Invoice Number: MG-SANDBOX-101-2026`, `Currency: USD`, `Total Due: 1.01`, and `Payment destination: <configured test receiver>`. It must contain no other email/destination or contradictory total. This is synthetic and never represents a real supplier.
2. Sign in as the authorized demo admin and enroll a **simulated** out-of-band channel for Northstar **before** uploading the invoice. Label it a synthetic business-process assertion, not a genuine supplier callback.
3. Upload the original PDF. Independently prepare its PDF.js page text and verify all five labeled T2 facts against exact page quotes; GLM observations remain advisory.
4. Record the fictional source attestation on the pre-enrolled channel. Prepare the proposal, confirm `PENDING_EXACT_HUMAN_APPROVAL`, and approve the exact SHA-256 tuple as the authenticated administrator (T4). Changed receiver produces DENY; absent attestation produces ESCALATE.
5. On the authorized `/invoice-bindings/[id]` page, click **Prepare USD 1.01 Sandbox invoice, no payment**. The server requires an exact matching T4 APPROVED fictional source and returns a canonical request. The next `/payments/[id]` page has a separate explicit **Execute PayPal Sandbox payout** action. The preparation action never posts to PayPal. For CLI-only proof, collect the actual `bindingId`, `artifactSha256`, and `tupleSha256`. Set private environment variables `SANDBOX_INVOICE_BINDING_ID`, `SANDBOX_INVOICE_ARTIFACT_SHA256`, `SANDBOX_INVOICE_TUPLE_SHA256`, `DEMO_PAYPAL_RECEIVER_EMAIL`, plus the existing Sandbox-only runtime settings. Never put PayPal credentials in Git or CLI output.

## One-shot run

- `pnpm demo:sandbox-invoice preflight`: reads existing state, checks the exact T2/T3-simulated/T4 approved binding and confirms no prior invoice-derived request. **Zero Payouts POST**. No GLM entitlement/ZDR requirement for this fiction-only Sandbox experiment.
- A separate owner-approved test action is required before sending test funds. Only at that stage configure the existing Sandbox client credentials and `SANDBOX_INVOICE_SUBMIT_GRANT=SUBMIT_ONE_101_CENT_SANDBOX_INVOICE`.
- `pnpm demo:sandbox-invoice submit`: consumes the exact approved binding, uses the existing durable executor, and puts an additional one-physical-POST fence around `POST /v1/payments/payouts`. It refuses retries through this command after binding consumption. A network-uncertain result requires read-only investigation, not a second submission.
- `pnpm demo:sandbox-invoice verify`: read-only database proof of one submitted event, remote batch and item IDs, verified PayPal webhook, and reconciliation. Submission acceptance is not the same as final recipient settlement.

## Release status

The code path is **not** a live verified end-to-end demo until an actual fictional PDF has been uploaded/reviewed, the exact binding approved, a **separately authorized** Sandbox POST made, and webhook/reconciliation observed on the current host. Neither CI with a fake gateway nor historical Slice 2 payout evidence proves this new path. Strict Gate H-S remains a separate optional production-grade privacy test.

**Human steps:** review/approve the exact fictional test invoice and separately approve the actual one-time $1.01 Sandbox POST. Everything else should be automated or read-only.

**CI:** Isolated PostgreSQL 18, migrations and seeds twice, TypeScript, all unit/DB tests, full Next build, authenticated smoke. Never configure real PayPal keys in CI.

## Deployment and validation state

The isolated Render CI service `srv-dbbaa73rjlhs73dgt9gg` can test this branch against disposable PostgreSQL 18, with fake provider only and payments disabled. It **does not host** the interactive Sandbox application or issue real Payouts POST requests. The original `mandategate-web` service tracks an earlier branch; do not imply that the new invoice UI is present there until its exact deployed SHA is verified. A future release/deployment must explicitly enable the invoice-demo flag and confirm the configured receiver matches the known Sandbox recipient before any test POST.
