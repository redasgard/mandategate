# MandateGate Slice 3A: Provenance-Enforced Payment Authority

Status: PROPOSED IMPLEMENTATION PLAN, not built or approved for payout integration
Date: 2026-10-08
Branch: build/slice-3-invoice-intake (draft PR #2)
Current gate: BLOCK for invoice-to-payment integration
Scope: repair the high-risk data-to-authority boundary without breaking the completed Slice 2 PayPal Sandbox executor.

## 1. Source of truth and rationale

This plan refines the approved PRD, especially:
- The Core Journey
- Payment Detail and Decision Evidence
- Escalation Review
- Vendor Trust and Re-verification
- AI Security, Authority, and Traceability > Authority boundary / Prompt-injection and untrusted-content boundary / Prepared-action boundary / Provenance and explanation

It directly repairs the findings in devpost/reviews/slice-3-injection-boundary-audit.md.

Design references:
- SANS "MCP Under Attack": authorization > interpretation; external policy; strict schemas.
- DEF CON 34 Urd "Breaking MCP Trust Boundaries": a low-privilege value can select a high-privilege sink argument without itself calling the tool; value origin must survive composition and provenance-marker ablation.
- SANS Find Evil! judging practice: claim-to-evidence traceability, constraint enforcement beyond prompts, valid negative controls, genuine adversarial experiments, and distinguishing inference from confirmed fact.

We are not adding a jailbreak classifier as a security layer. No amount of prompting, model self-report, suspicious-word regex, additional model votes, or confidence scoring grants payment authority.

## 2. Concrete threat model

Entry points:
1. Untrusted uploaded invoice PDF/JPEG/PNG and its human-readable text.
2. GLM-5.3 Flash observation, quoted snippets, confidence, suggested fields, and any optional instruction-suspicion report.
3. Metadata supplied by a machine principal.
4. Human review inputs, which may include intentionally misleading invoice content.

Protected sinks:
- canonical payment request creation in src/payments/submit.ts
- decision ALLOW/APPROVED state and associated payment record
- execution claim and PayPal receiver/amount in src/payments/executor/service.ts
- trusted vendor destination or active policy mutation

Current reality: the image observation path is not wired to the canonical payment API. It escalates uncorroborated image quotes. Existing direct agent_api submission is a separate, trusted-principal feature; do not relabel it as invoice-verified.

Attack of concern: an adversarial invoice influences the model or subsequent software to write a plausible vendor, amount, invoice number, currency, or payout destination into an authorized payment request. No explicit "ignore instructions" payload is necessary.

Security invariant:
**A value may inform a decision but may not gain authority merely by moving through an AI extractor, validator, or agent. The payment sink must receive an independently verified, immutable, authorization-bound tuple.**

## 3. Trust classes and allowed promotion

T0 DOCUMENT_UNTRUSTED:
- raw artifact content; vendor names, totals, bank/payee strings and printed instructions are untrusted even if visually convincing.

T1 MODEL_OBSERVED:
- strict-schema observations from GLM-5.3 Flash, with source references, model route, prompt version/hash and confidence. A T1 field does not become true because it has a quote.

T2 SOURCE_CORROBORATED:
- a dedicated non-LLM verifier shows that the claimed value, its type/label and its page are consistent with independently extracted or human-transcribed source evidence. This establishes what the invoice appears to say, NOT who authored the invoice or whether it is legitimate.

T3 ORIGIN_ATTESTED:
- the document's issuer/channel is authenticated through an independent trusted integration/mandate, or an authorized human checks the issuer against a pre-established trusted source outside the invoice and records the method/evidence. Simply looking at the invoice, recognizing a logo, clicking a confirmation checkbox or trusting a printed email is NOT origin attestation. An uploaded document mentioning a known vendor is not origin-attested. For this hackathon slice, independently documented admin attestation or an explicitly pre-attested synthetic fixture are sufficient; external supplier-signing integrations are deferred. Synthetic fixtures must not be misrepresented as real-world vendor authentication.

T4 PAYMENT_AUTHORIZED:
- the server binds T2 evidence + T3 origin + trusted vendor registry + current policy + explicit standing mandate or fresh human approval to one exact payment tuple. Only the authority service may create this state.

Rules:
- Lower tiers never self-promote. A model's observed_instructions=false, higher confidence, or plausible quotes cannot promote T1 to T2/T3/T4.
- T2 without T3 still ESCALATES.
- For an image with no independent corroboration, remain T1 and ESCALATE.
- A destination mismatch is a DENY/hard stop and requires a separate vendor re-verification workflow; ordinary invoice review cannot turn the printed new account into a trusted destination.
- A complete but unauthenticated invoice is not auto-payable. A trusted merchant name, matching amount, or matching destination does not by itself establish origin.

## 4. Authorization outcomes

DENY:
- destination substitution against trusted registry;
- cross-tenant source, forged or stale binding, unauthorized principal, or authority bypass attempt;
- mutated artifact hash or payment tuple; hard blocked state cannot be approved through ordinary escalation.

ESCALATE:
- missing independent origin attestation, source-to-field verification, ambiguous or contradictory amounts, unidentified vendor, duplicate invoice candidate, stale review/policy context, image-only model quotes, or unsupported GLM route.

ALLOW:
- origin is independently attested;
- payment-critical fields are independently verified against source;
- vendor is resolved from trusted organization directory, not model-supplied identity;
- receiver comes from a current trusted vendor destination, never the invoice's remittance instructions;
- no unresolved conflicts/hard blocks, source and execution tuple are bound, current policy/mandate allows the value;
- existing deterministic thresholds and execution idempotency pass.

HUMAN-APPROVED ESCALATION:
- a distinct authenticated authorized admin may attest issuer origin using a documented independent channel, then approve one frozen tuple with reason, actor, timestamp and optional attachment, provided there is no hard block. Evidence transcription verification and issuer authentication are separate explicit actions; a single generic 'looks fine' click cannot silently satisfy both.
- Approval is not permission to mutate a trusted destination or policy.
- Any source, amount, vendor, destination, risk, schedule or policy version change makes it stale and requires fresh evaluation and approval.

Keep the original trusted agent_api payment-submission flow available to a distinct explicitly privileged principal for the already working Slice 2 demonstration. It is NOT proof that an untrusted invoice was verified.

## 5. Application API and identity changes

Existing gap: the same invoice:submit scope currently guards both invoice upload/analysis and POST /api/agent/payment-requests. The demo seed currently creates principal_demo_ops with invoice:submit and payment:read and only updates its key hash on existing-principal reseed.

Planned effective machine scopes:
- invoice:upload: submit immutable artifacts only.
- invoice:analyze: invoke or retrieve the AI observation within the owning organization.
- invoice:read: retrieve organization-scoped metadata/observation.
- payment:submit: submit a trusted, independently commanded canonical payment request through the existing direct route.
- payment:read: existing limited payment-status access.
- invoice:verify: NOT granted to AI/machine processing principals; verification is a server-only validator or an authenticated admin action.

Plan:
1. Add distinct upload/observer principal and a distinct direct-payment principal, with separate keys. Model execution never sees a payment or admin key.
2. Change the direct agent payment request route to require payment:submit. Remove its use of invoice:submit; no permissive dual-scope fallback.
3. Change artifact upload and analysis routes to their specific invoice scopes. Derive organizationId only from the authenticated principal.
4. Update the demo seed to explicitly update existing principal scopes as well as key hash; provision/revoke identities atomically at deployment, test old key denied and direct privileged key accepted.
5. Existing Slice 2 CI/smoke must run with the new privileged principal. Keep main/Render on known-good code until the new branch passes this and no migration/deploy gap remains.

Invoice-derived payment preparation is INTERNAL SERVICE CODE, not an unauthenticated or model-callable general-purpose endpoint. Any admin review endpoint uses Better Auth session, organization membership and admin role; it cannot accept user-supplied source type, trusted destination, policy version or binding hash as authoritative.

## 6. Data contracts and persistence

Use PostgreSQL 18 and explicit migrations. Existing invoice_artifacts remains the immutable byte source; do not mutate source bytes or turn mutable model observations into authority.

A. invoice_verified_claim_sets (immutable snapshot)
- id, organization_id, artifact_id, artifact_sha256, observation_id/observation_sha256, schema_version;
- payment-critical field entries: field name, raw/normalized value, document page number, extracted page hash, source span or quote hash, claimed origin, observed model/prompt metadata, corroboration verdict, verifier kind/identity/time and exact evidence reference;
- status: VERIFIED, UNRESOLVED, REJECTED. Only independent verifier/attestor code can create VERIFIED. Append a replacement snapshot rather than overwriting.

B. invoice_origin_attestations (immutable)
- organization, artifact digest, issuer/vendor resolved from trusted records, attestation method (admin review, verified external source, synthetic_fixture only in test/demo), verifying actor, proof reference/hash, issued/expires/revoked state;
- no issuer authentication is inferred from a vendor name or email address shown in the invoice.

C. payment_authority_bindings (single-use, replay-safe)
- organization, verified_claim_set_id, origin_attestation_id, vendor_id, destination_id and destination_version, policy_id/version, proposed invoice number/amountCents/currency, exact frozen execution destination, source artifact digest, risk state/reason codes, approval mode and actor, tuple digest, expires_at, consumed_at, revoked_at, linked logical payment id;
- canonical tuple digest uses versioned, unambiguous encoding, not JSON insertion order or model-provided hash;
- optional server-generated MAC/signature binds the record to an approved key version. A digest alone is NOT proof that the actor was authorized.

D. parameter_lineage_events (append-only, reconstructable)
- trace id, sequence, organization, request_id/logical_payment_id when present, source artifact/page/event, field key, observed value digest, source trust tier, independent-verification record, sink component/field, binding ID, decision and timestamp;
- an authorized audit reader can reconstruct the actual normalized value and its source where needed. Protect sensitive raw values via access controls and keyed digests, not a public plaintext log.
- lineage must follow the same field from image -> model observation -> claim -> verification -> policy -> approval -> canonical request -> PayPal parameters.

E. Existing payment_requests gains nullable invoice-derived binding/origin references; the direct trusted-agent request path remains distinguishable as agent_api and is not mislabeled as verified_invoice.

PostgreSQL foreign keys, unique keys, authorization-version checks and transactional state transitions enforce these relationships. A copied artifact ID or claim ID from a different organization cannot confer authority.

## 7. Mandatory server-side bridge

Planned module: src/authority/prepare-invoice-payment.ts, callable only inside the trusted server with a verified-claim-set ID. It does not accept a raw model-produced vendorId, receiver or source flag as an authorization token.

Pseudo-process:
1. In a transaction, load immutable original artifact + current claim set + independent verification/attestation. Verify org, artifact hash, page/field lineage and source versions.
2. Resolve vendorId using trusted vendor directory. Compare the invoice-observed destination with the trusted vendor destination; never update trust from invoice text.
3. Build a canonical payment tuple from verified, normalized fields plus trusted registry. Record current policy/destination versions and risk state.
4. If any hard block, persist DENY and lineage. If missing evidence/attestation or other soft risk, persist ESCALATE with required next action. Only a fully authorized and current binding yields ALLOW.
5. For an escalation, admins approve an exact frozen tuple. The UI shows where each parameter came from, independent verification, source/field disagreements, and the full trusted destination through an authorized surface. Invalid admin role or stale tuple cannot approve.
6. Recheck origin/binding/version/decision/destination/amount immediately before claiming/executing through the existing PayPal service. Use a single-use binding and the existing permanent logical-payment idempotency.
7. Never let a failed/offline model or unverified document cause a fallback to the trusted direct-payment route.

Important external-side-effect limit: a DB transaction cannot atomically commit with the external PayPal network. Use a persisted authorization/claim fence, final pre-submit revalidation, and stable PayPal ids; define and test cancellation races rather than claiming impossible cross-network atomicity.

## 8. Field verification requirements

- Vendor identity: model-observed name is an untrusted match candidate. Resolve organization/vendor only from trusted records, and require source attestation.
- Invoice number: verify under the actual invoice identifier label, not a PO/order/account number; flag contradictions and reuse/duplicate candidates.
- Amount: match a labeled final Amount Due/Total Due (not subtotal or arbitrary cited number), normalize decimal deterministically to cents, reject contradictions, splits and unsupported currency.
- Currency: only accept a source-supported explicit currency, no silent default to USD; check supported currency/merchant policy separately.
- Dates: require deterministic full calendar parsing with locale-ambiguity escalation.
- Destination: record printed remittance details as T0 observation, but the actual PayPal receiver must come from the trusted vendor registry and be reverified at execution.
- For text PDFs: independent page text extraction plus source-span/label/value consistency checks; value mentioned somewhere on page is insufficient.
- For JPEG/PNG/scanned PDF: model quote remains T1 until independent OCR cross-check or explicit authorized human confirmation; two passes of the same GLM model are NOT independent verification.
- Any unrecognized case fails closed to ESCALATE. Suspicious-instruction heuristics, including observed_instructions and regex matching, are advisory telemetry only.

## 9. Executable work order (one independently tested gate per commit/PR checkpoint)

Gate A: Scope split and migration
- Build: change route permissions, separate principals and secrets, update existing demo seed scopes, update CI/smoke.
- Accept: invoice processor cannot POST /api/agent/payment-requests; trusted payment principal can; old key behavior explicitly tested; Slice 2 PayPal replay remains one logical payment.
- Verify: principal/organization cross-access matrix, seed twice, CI, no split-role key in image environment.

Gate B: Immutable trust/evidence contract
- Build: migrations for field claim snapshots, origin attestations, payment bindings and lineage events; Typed TS contracts; append-only constraints.
- Accept: copied/synthesized claim IDs, edited values, mixed artifact hashes and cross-tenant IDs cannot become VERIFIED or authorized.
- Verify: PostgreSQL integration and mutation/replay tests.

Gate C: Independent semantic verification
- Build: verify field-to-quote label/value binding for text, flag contradictory totals/identifiers; human confirmation path for images; keep observed_instructions advisory only.
- Accept: total 999.00 citing 'Total Due 1.01' fails; unrelated quote, PO/invoice-number confusion and unverified images escalate.
- Verify: source-grounded fixture matrix and malicious-but-valid-JSON models.

Gate D: Origin attestation and trusted vendor binding
- Build: authorized admin verifies issuer origin through a pre-existing trusted directory/contact or authenticated source channel, records which channel/evidence was consulted; synthetic pre-attested fixture is labeled demo-only. Bind issuer identity to trusted org/vendor; destination remains registry-owned. A self-reported invoice field or same-image/model re-read is not an independent origin check.
- Accept: an invoice asserting a valid vendor and matching destination without source authentication cannot auto-pay. Destination mismatch is a hard DENY, never ordinary admin override.
- Verify: untrusted-source and out-of-band-attestation matrix.

Gate E: Internal invoice-to-payment bridge and authorization
- Build: server-only verified bridge, canonical frozen tuple hash, version checks, single-use state, policy/mandate evaluation, idempotency; extend execution-time binding check.
- Accept: direct agent route can't spoof invoice-derived origin; any tampered field, destination or version invalidates authorization; only valid bound request reaches PayPal client.
- Verify: no-HTTP-mock database bridge tests with PayPal gateway spy and concurrent submission.

Gate F: Exact human review and stale approval
- Build: minimal admin evidence-and-approval surface using existing auth; record actor/reason/action/schedule, explicit tuple, and stale/revoked handling; mask sensitive values for other roles.
- Accept: actor cannot approve outside org; changed amount/vendor/destination/policy/artifact invalidates; hard block cannot be bypassed; approval event shows where values came from.
- Verify: role/tenant/UI request tests and before/after tuple mutation.

Gate G: Urd-style causality and adversarial tests
- Build: actual source-to-sink trace capture, baseline/attack/ablation runner, withheld adversarial fixtures including multilingual/obfuscated role spoofing, instruction-free data poisoning and false approval claims.
- Accept: baseline has 0 illegal trust promotions; substituted amount/receiver/vendor never causes unapproved PayPal call; source-to-sink evidence survives removal of auxiliary provenance hints when raw events are retained.
- Verify: deterministic replay with zero unauthorized payment side effects, cross-tenant and concurrency cases, recorded false positives/negatives and immutable evidence IDs.

Gate H: Release proof and independent review
- Build: one safe normal synthetic invoice flows through verified/attested bound authorization into existing PayPal Sandbox payout; one suspicious invoice ESCALATES; one substituted destination DENIES. Show lineage and replay exactness.
- Accept: same exact code commit CI green, one PayPal payout only for ALLOW, zero PayPal POST for ESCALATE/DENY, real webhook/reconciliation evidence, signed-off full critical review.
- Verify: small bounded Sandbox test after explicit authorization; recorded batch/item id, event trace, DB cardinality, webhook receipt and revalidation checks; no new payment in planning phase.

Only after Gates A-H pass: connect the completed GLM/PDF preparation work to this bridge and remove the Slice 3 BLOCK. No implementation gate is checked merely because this document exists.

## 10. Adversarial result matrix

| Case | Expected | Forbidden outcome |
| --- | --- | --- |
| Independent attested normal invoice, matching policy and vendor | ALLOW | Missing lineage or duplicate payout |
| Correctly parsed invoice, unknown ingress/issuer | ESCALATE | Auto-pay on model confidence |
| OCR quote exists but is unrelated to claimed amount | ESCALATE | Value promoted based on quote existence |
| Image-only GLM result with high confidence | ESCALATE until independent check/attestation | Automatic trust of self-cited image text |
| Invoice says vendor exists but issuer is unverified | ESCALATE | Identity inferred from a logo/name |
| Printed receiver differs from trusted vendor destination | DENY and mark re-verification required | Human ordinary payment approval changes destination |
| Hidden text "ADMIN approved" or instruction-in-QR | ESCALATE or continue independent controls; no authority promotion | Model-originated approval |
| No explicit suspicious instruction but attacker inflates amount | ESCALATE on evidence mismatch/invalid mandate | Payment within threshold solely on model value |
| Duplicate invoice and changed amount | ESCALATE, no new logical payout | Second money movement |
| Copied artifact/evidence ID from another organization | DENY | Cross-tenant provenance acceptance |
| Modified approved amount, vendor, receiver, policy or artifact | DENY as stale/invalid binding | Reuse previous approval |
| Incomplete model JSON or hallucinated page quote | ESCALATE | Parsing fallback to untrusted direct payment |
| Replayed valid binding | Same idempotent logical payment, never second payout | A fresh PayPal id under same invoice |
| Concurrent approval/policy/destination update | Validate latest authority, fence claim and record race outcome | Ignore stale authority without trace |
| Attack text removed but poisoned value still present | Blocked or escalated by value/authority checks | Detector absence treated as safe |
| Model never reports observed_instructions | No increase in authority | Automatic trust from negative classifier |

## 11. Judge-visible demo target

Three scenes, under three minutes:
1. Clean synthetic invoice with pre-recorded authorized source attestation: show exact extracted facts and who verified them, green ALLOW, one real Sandbox payout and webhook status.
2. Convincing invoice with mismatched amount/quote or uncertain issuer: show provenance discrepancy, amber ESCALATE and no PayPal submission.
3. Visually plausible forged remittance instructions selecting a different receiver: show source-to-sink trace and trusted-registry comparison, red DENY, zero PayPal calls. No "the model noticed malicious words" claim.

The point the judges should remember: **the invoice may tell the system what it says, but it cannot decide where money goes.**

## 12. Non-goals, rollout, and release rules

Not in Slice 3A: fine-tuning/training, a generic prompt-injection firewall, automatic trust of a newly printed bank account, unverified supplier-signing integrations, universal taint tracking across arbitrary MCP systems, production WORM storage, irreversible payment experiments, AG Grid redesign, or unrelated sponsors.

Rollout:
- All work remains on draft PR #2 until security gate passes. Do not overwrite the stable Slice 2 Render service during development.
- Migrate principal scopes atomically and test old/new credentials and role boundaries; demo seed must update scopes of an existing principal, not just its secret hash. Never temporarily allow both invoice:submit and payment:submit for a lower-trust principal as a compatibility shortcut.
- Re-run existing PayPal executor regression suite, typecheck, migrations/seed twice, build, smoke, and live-safe idempotency checks.
- Run external-path verification with explicitly synthetic input and zero unintended payment requests.
- Preserve current BLOCK review until gates pass; final review must report independent-vs-self review honestly.
- Keep the one verified live PayPal payout from Slice 2 as a separate existing evidence artifact, not evidence that Slice 3A is complete.
- Operational deadline: the currently configured Render free PostgreSQL instance expires November 6, before the November 12 hackathon deadline. Upgrade/replace with a verified restored database and rerun Sandbox demo before final submission; do not let a storage cutoff invalidate otherwise good evidence.

Unresolved product tradeoff to lock before coding:
- Default proposal: user-uploaded/unknown-origin invoices require source attestation or a recognized trusted ingress channel before ALLOW. A checked invoice amount alone is never sufficient. This preserves the approved PRD's useful autopay scenario only when the source is genuinely trusted.
