# Gate H live staging and PayPal Sandbox verification runbook

**State:** BLOCKED for execution pending a securely connected staging service, real issuer origin, authenticated reviewer and live Experiential account evidence. The separate DB and web service have been provisioned, but no code is deployed or DB linked.
**Current implementation checkpoint:** `6e0a5d82fe29168daf50110b676d07dbd7bc541e`, GitHub Actions `37856559061`, 24 test files / 160 tests PASS.
**Release rule:** no PR #2 merge or stable deployment until Gate H live evidence and independent review pass.

## 0A. Isolated paid PostgreSQL resource (provisioned)

- **Workspace:** Yevhen's workspace, `tea-d27bea6uk2gs73dv4up0`.
- **New database:** `mandategate-gate-h-staging-db` (`dpg-db4351rl550s73acup8g-a`), PostgreSQL 18, Oregon, paid `basic_256mb`, 1 GB allocated, disk autoscaling disabled, public IP allowlist empty; Render status **available** when rechecked.
- **Dashboard:** https://dashboard.render.com/d/dpg-db4351rl550s73acup8g-a
- **Existing free database:** `mandategate-sandbox-db` (`dpg-db39d5rbc2fs73d1ke70-a`) remains separate/unchanged. **Do not repurpose it or a stable database URL.**
- **Billing:** Render lists $6/month compute for the 256 MB plan and includes the first GB of storage; compute prorates for short-lived instances. This paid database will **not** expire automatically. Delete it via the Render Dashboard when Gate H work is complete or abandoned; connector has no delete Postgres action.
- **Credentials:** The connected API exposes no PostgreSQL connection string/password. A new isolated staging web service must receive the **internal** URL from the Render Dashboard via secrets. Configure separate Better Auth secret/base URL and reviewer credentials, distinct invoice/payment agent keys, Sandbox-only PayPal credentials, and Experiential credentials. Never place secrets in GitHub or chat. Auto-deploy must remain OFF.
- **Before any migration:** independently inspect staging `DATABASE_URL` target metadata (expected DB `mandategate_gate_h_staging_db`), check it cannot reach the existing free/stable DB, verify effective runtime vars are scoped to staging, then run bounded migration/seed and health checks.
- **New staging web service:** `mandategate-gate-h-staging` (`srv-db4367u0tbcc73cugar0`), free web plan, Oregon, https://mandategate-gate-h-staging.onrender.com, branch `build/slice-3-invoice-intake`, **auto-deploy OFF**, latest service listing showed no deploy history.
- **Nonsecret staging configuration:** `BETTER_AUTH_URL` set to the staging URL; `MANDATEGATE_STAGING=1`; `GATE_H_ISOLATED_DATABASE_CONFIRMED=0`; `GATE_H_LIVE_GLM_PROOF_ENABLED=0`; PayPal base URL pinned to Sandbox. No approval/grant set.
- **Required manual secret wiring:** In Render Dashboard open the new database, use its `Internal Database URL` as `DATABASE_URL` **only for** the new staging web service. Generate independent `BETTER_AUTH_SECRET` (at least 32 characters), `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD`, `DEMO_AGENT_API_KEY`, `DEMO_PAYMENT_AGENT_API_KEY` and relevant `PAYPAL_*` / `EXPLABS_API_KEY` for staging. Never paste any secret into GitHub/chat and never reuse existing stable keys. The connector cannot retrieve credentials.
- **Before manual deploy:** independently verify the internal URL targets `mandategate_gate_h_staging_db` (not the old free DB); review secrets and role separation; leave live GLM and payout flags OFF; trigger one manual staging deploy after secrets are set. Creating the web skeleton does not verify application isolation, live reviewer session, provider privacy, or PayPal.

## 0. Authority and safety boundaries

- Operate only in the explicitly confirmed Render workspace `tea-d27bea6uk2gs73dv4up0`. Stage-specific DB and web service are created. Their credentials have not been fetched, so no database data was accessed.
- Create **distinct staging**: separate Render service, separate PostgreSQL instance, Better Auth base URL/secret, admin password, invoice-only agent key, payment-only agent key and PayPal Sandbox credentials. **Do not** reuse a preview service pointed to the stable database.
- `main` and the stable Slice 2 service remain untouched. Pin exactly one Git SHA across tests and staging. Check health, migration and seed replay.
- Financial authority is **not** delegated to GLM or the operations agent. The complete invoice chain must reach an independently verified, issuer-attested, exact approved tuple.
- No fabricated supplier, printed contact or typed callback reference is evidence of a real external issuer. Seeded Northstar `SYNTHETIC_FIXTURE` channels are **intentionally ineligible** as a genuine T3 authorization channel.
- The one-time payout proof requires a genuinely independently verified vendor/channel and a known **Sandbox Personal receiver**. Never use a real bank or live PayPal payout destination.

## 1. Real issuer origin, not a reference-string substitute

1. Independently identify the supplier from a known prior ERP/portal/contract or trusted callback contact, **not from the invoice**. Verify the enrolled channel using a separate actual communication/ERP record.
2. Enroll `KNOWN_CALLBACK`, `TRUSTED_PORTAL` or `ERP_INTEGRATION` only with an authorized administrator, recording the evidence digest and actor **before** submitting that invoice. Do not upgrade `SYNTHETIC_FIXTURE` to a real channel.
3. Upload the controlled supplier PDF only afterward, recording artifact ID, original SHA-256 and organization. New channels added after this timestamp are rejected by attestation, proposal and executor guards.
4. Log in as the authorized human at `/invoice-artifacts`, open the exact PDF, run bounded PDF page extraction, compare its visible source with parser text, and record all T2 critical fields with exact quote, page, digest and reason.
5. Select the previously enrolled T3 channel, genuinely contact its known source outside the invoice, and record a reference to that real event. Human attestation is not the same as a cryptographic external supplier signature.
6. Build the frozen tuple. Separately inspect `/invoice-bindings/[id]`, compare source, vendor, receiver, amount, current policy and SHA digest, and use a signed-in admin for exact-tuple approval. Reject or block on any mismatch, expired channel, out-of-order enrollment, replay or stale source.

**Proof needed:** actor ID, channel enrollment time, invoice creation time, independent receipt reference, claim set ID, origin attestation ID, approval proof/digest, immutable event IDs and negative actor/session attempts.

## 2. Actual GLM privacy and adversarial evidence

1. On isolated staging, configure `EXPLABS_API_KEY` as a secret. In `/invoice-artifacts/privacy`, run the metadata preflight. Capture account org ID, observed timestamp, ZDR, no-training, prompt capture off, and model `glm-5.3-flash`; never log credentials or prompt text.
2. Inspect and approve a truly **synthetic**, non-customer PNG/JPEG adversarial invoice. Hash its exact bytes independently. Set only that digest in `GATE_H_SYNTHETIC_IMAGE_SHA256_ALLOWLIST`.
3. Enable **only staging** with `MANDATEGATE_STAGING=1` and `GATE_H_LIVE_GLM_PROOF_ENABLED=1`. All other environments must keep these flags absent/off.
4. Submit the synthetic image using the separated invoice-upload principal. Use an authenticated same-origin POST to `/api/admin/invoice-artifacts/{id}/adversarial-glm` with JSON `{"expectedArtifactSha256":"<exact image digest>","syntheticFixtureOnly":true}`.
5. Capture actual serving provider, `x-gateway-zdr`-validated result, exact returned `glm-5.3-flash`, gateway request ID, prompt version/hash, source image digest, outcome and reason codes. Check zero payment requests and zero PayPal posts. The observation must remain T1/untrusted and ESCALATE. Test a changed receiver or a model-injected approval separately; no approval or trusted receiver change is permitted.
6. Disable the live-proof flags immediately after evidence. The metadata preflight **alone** is not a served-model privacy proof.

**Proof needed:** actual Experiential API responses, serving ID/ZDR evidence, prompt hash, synthetic image SHA, attack and control cases, source-to-sink trace and recorded zero financial side effects. Do not claim production-grade provider privacy merely from screenshots or mocked CI.

## 3. Three distinct PDF invoice scenarios

Prepare three different immutable artifacts in one isolated organization:

- **ALLOW candidate:** amount exactly USD 1.01; independently verified T2 source, legitimate pre-enrolled T3, current vendor destination matching a Sandbox Personal receiver, current policy, and a *fresh authenticated* exact-tuple approval.
- **ESCALATE:** otherwise parseable invoice, but independent issuer origin missing. The runner requires the causal reason `ISSUER_ORIGIN_UNVERIFIED_OR_EXPIRED` and **no binding**.
- **DENY:** genuine source shows a different remittance receiver from the trusted destination, and the issuer is independently attested. The runner requires `INVOICE_DESTINATION_SUBSTITUTION` and **no binding**.

Do not let the DENY case fail for an unrelated missing claim, expired channel or missing role. That would not prove destination-substitution protection.

Record `GATE_H_ORGANIZATION_ID`, `GATE_H_ALLOW_BINDING_ID`, `GATE_H_ALLOW_ARTIFACT_SHA256`, `GATE_H_ALLOW_TUPLE_SHA256`, `GATE_H_{ESCALATE,DENY}_{ARTIFACT_ID,CLAIM_SET_ID,ATTESTATION_ID}`. All case IDs must be bound to the same isolated organization.

## 4. One-time PayPal Sandbox test

Set **only on staging**:
- `MANDATEGATE_STAGING=1`, `GATE_H_ISOLATED_DATABASE_CONFIRMED=1` **only after independent DB isolation check**.
- `PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com`, `DEMO_PAYPAL_RECEIVER_EMAIL` to the exact known Sandbox Personal receiver.
- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` from Sandbox; never log keys.
- `GATE_H_ACTUAL_GLM_ARTIFACT_ID`, `GATE_H_ACTUAL_GLM_GATEWAY_REQUEST_ID` must match a real previously persisted `glm-5.3-flash`, ZDR and ESCALATE observation in this same isolated organization.

Then run:
1. `pnpm gate-h:sandbox preflight`. **Read-only**, no payout.
2. Independently check the actual external issuer evidence and set `GATE_H_ISSUER_PROOF_INDEPENDENTLY_REVIEWED=1` only after verifying it. This environment flag is operator testimony and does not replace the receipt.
3. For exactly one authorized Sandbox submission, set `GATE_H_PAYPAL_SINGLE_POST_GRANT=SUBMIT_SINGLE_101_CENT_SANDBOX_PAYOUT` and run `pnpm gate-h:sandbox submit` once. The script checks both negative outcomes first, rechecks real provider account privacy, consumes only the approved binding, and fences the PayPal network adapter to at most **one physical POST** to `/v1/payments/payouts`. A transient failure becomes a blocked/manual-reconciliation condition, not an automatic second POST. Do **not** rerun submission.
4. Verify PayPal batch and item IDs and exactly one logical execution. Allow for asynchronous webhook delivery and reconciliation.
5. Run `pnpm gate-h:sandbox verify` later as a **read-only** check. It fails until a real verified webhook and reconciliation event exist and no webhook reconcile failure has occurred. Verify the external PayPal Sandbox API record independently.

**Release acceptance:** exactly one confirmed ALLOW payout; zero Payouts POST for ESCALATE and DENY; exact stored PDF page-to-T2-to-T3-to-T4-to-payment parameter lineage; webhook/reconciliation proof; the same deployed code commit CI green; separate security critical review at least 8.5/10 and no material safety findings.

## 5. Evidence and cleanup

Retain only sanitized fixture digests, actor IDs, reference IDs, PayPal Sandbox batch/item IDs, provider request ID, immutable event IDs and timestamped environment verification. Do not paste credentials, real invoices, phone numbers or secret webhook payloads into PR comments or the Devpost submission. Disable stage-only GLM proof and single-Payout grant flags. Keep PR #2 draft and stable Render unchanged until an evidence-backed Gate H release decision.
