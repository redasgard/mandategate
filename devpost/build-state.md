---
doc: build-state
updated: 2026-10-08
mode: fast
---

# Build State

## Gate H bounded three-case Sandbox runner (2026-10-08)

Status: runner **code CI verified**, external proof NOT RUN. Commit `6e0a5d82fe29168daf50110b676d07dbd7bc541e`, GitHub Actions `37856559061`, 24 files / 160 tests green including typecheck/build/smoke.

- New guarded `pnpm gate-h:sandbox preflight|submit|verify` accepts only separately verified staging/DB identity, exact USD 1.01 Sandbox receiver, original PDF and tuple SHA identities, actually approved T2/T3/T4 binding, causal ESCALATE/DENY fixtures and fresh GLM metadata/request proof. A single physical Payouts POST at most is enforced inside this proof runner, even on PayPal client retry. CI never invokes submission.
- Read-only verification demands actual PayPal batch/item, exactly one submission event, verified webhook/reconciliation and zero reconcile failures. It cannot fabricate a live result.
- Runbook: `devpost/gate-h-live-runbook.md`. Critique: `devpost/reviews/slice-3a-gate-h-runner-review.md`, 8.5/10 for isolated code, live Gate H **BLOCKED**.
- No issuer callback, Render staging service, Experiential real inference or PayPal Sandbox Payouts POST was performed. Render account selection needs explicit user confirmation. `main` and stable Render unchanged.

## Gate F2 / GLM privacy staging preflight (2026-10-08)

Status: isolated code verified, live staging unverified. Reviewer journey commit `84e9574b3cd1d355e2b8aa33245d20723fdfb2f9`: GitHub Actions `37855588215` 21 files / 149 tests. GLM metadata/allowlisted image proof lane commit `aaf75f5fee0b9301fbc3c734e4733266c9c025eb`: GitHub Actions `37856010215` 23 files / 155 tests.

- Authenticated reviewer can list org-scoped artifacts and walk through original PDF, verified T2 page-text facts, pre-enrolled T3 channel, human independent callback/ERP record, proposed frozen tuple and separate approval.
- Live GLM metadata preflight checks account identity, ZDR, no-training, content-capture and Flash model without sending invoice content. Its receipt explicitly sets `servingRouteVerified:false`.
- Adversarial GLM inference is disabled except explicit isolated staging flags and an exact synthetic image SHA allowlist. It records a T1 observation and always returns `paymentAuthorized:false`.
- **No Render workspace selected**: Render connector refuses service inspection until the user confirms which workspace to use. Connected workspace offered: “Yevhen’s workspace.” No staging deploy or account key lookup performed.
- **No live supplier callback, GLM API request, or PayPal Sandbox invoice-derived payout occurred.** Gate H stays BLOCKED.
- Self-reviews `devpost/reviews/slice-3a-reviewer-journey-review.md` (8.3/10) and `devpost/reviews/slice-3a-glm-privacy-preflight-review.md` (8.5/10), CONTINUE to staging preflight only.

## Gate D2: Pre-enrolled issuer channel enforcement (2026-10-08)

Status: CI **PASS**, 20 files / 147 tests, GitHub Actions `37855010516`, commit `ef4c69e6db457f07cdef9d691005772689b90484`.

- Reject a post-invoice origin-channel enrollment at T3 attestation, proposal, and executor/binding guard. Even a directly inserted forged attestation cannot bypass the timestamp check.
- An authenticated admin-only Same-Origin issuer-attestation endpoint accepts only a pre-enrolled channel and a separately obtained external callback/ERP/portal reference; no model or machine principal gains this authority.
- Live supplier evidence is **NOT verified**. The API records a human claim, not a cryptographic supplier receipt. Genuine out-of-band confirmation is still required.
- Self-review: `devpost/reviews/slice-3a-issuer-preenrollment-review.md`, 8.6/10, CONTINUE to staging reviewer UI only. Gate H remains BLOCKED.

## Slice 3A Gate C3: exact PDF verified-field lineage (2026-10-08)

Status: parser-backed T2 implementation CI **PASSED**; Gate H **BLOCKED**. Code commit `96931eff6717ebaab81cc3c3d19bde26a43dc943`, GitHub Actions `37845500331` SUCCESS: migrations/seed twice, TypeScript, 19 test files / 143 tests, build and smoke.

- A signed-in organization admin can POST exact reviewed PDF fields (vendor, invoice ID, currency, total, destination) and reason to a bounded endpoint; the service checks each quote/semantic value against independently parsed immutable page text, hashes and cross-page contradictions.
- New migration `0013_pdf_field_lineage.sql` adds composite foreign keys from T2 field evidence to exact PDF parser page-text digests, prevents unsupported promotion and duplicate verified snapshot replay.
- Gate E proposal and execution-bound guards now reject PDF_TEXT T2 records without pinned page-source proof. The existing direct Slice 2 PayPal path is unchanged.
- Real PDF positive and malicious amount/receiver/page substitution/cross-document conflict fixtures pass. Missing independent issuer origin still ESCALATES and yields zero payment requests.
- Self-review: `devpost/reviews/slice-3a-pdf-field-verification-review.md`, CONTINUE to isolated origin/reviewer integration only, not release. Hosted human reviewer, real issuer contact proof, live model ZDR and invoice-derived PayPal payout remain unverified.

## Slice 3A Gate C2: real PDF page-text provenance (2026-10-08)

Status: isolated checkpoint CI **PASSED**; Gate H **BLOCKED**. Commit `7bdb70abf5722c99b5608608f9b136d568b12040`, GitHub Actions `37844738169`: frozen dependency install, migrations/seed twice, TypeScript, 18 test files / 136 tests, Next.js production build and smoke.

- Pinned `pdfjs-dist@6.4.299`, regenerated frozen lockfile and removed the temporary one-time lockfile workflow.
- PDF.js parses actual stored artifact bytes in a memory/time-bounded worker (20 pages max). Encrypted, malformed, textless, overly complex and active-content formats fail closed.
- `invoice_pdf_source_pages` stores append-only per-page normalized PDF text, its SHA-256, exact parent artifact SHA-256 and parser version, scoped by organization. These are **page-text** hashes, not signed raw PDF page-stream hashes.
- A signed-in organization admin may prepare/read PDF source evidence; a typed model candidate may only be assessed against those independently parsed page texts. The service does **not** mark model observations T2, authenticate the supplier, approve a binding, or call PayPal.
- Self-review: `devpost/reviews/slice-3a-pdf-source-review.md`, CONTINUE to isolated parser-backed field verification only (8.6/10). No Slice 3 branch deploy or payout.

## Slice 1

Status: complete and promoted to `main`.

Release commit: `0a21eb46f6a3043929525cebdcd4a3673191fdf3` (`build decision kernel`)
Branch checkpoint: `build/slice-1-ready`

Verified:
- PostgreSQL 18 service healthy
- Better Auth/app migration completed
- demo seed completed
- TypeScript check passed
- Vitest decision suite passed
- Next production build passed
- health endpoint passed
- seeded admin sign-in passed
- ALLOW / ESCALATE / DENY smoke passed
- no payment execution occurred

The Slice 2 CI run later re-ran the shared migration and seed twice successfully, closing the earlier idempotence evidence gap.

## Slice 2

Checklist status: complete.

Merged PR: #1, `wire PayPal Sandbox payout execution`
Main release merge commit: `afab57dc9fca4c87f4f26eee4669e977c6eadbfa`
Staged branch: `build/slice-2-gated`
CI run: `37705824345` — success at repaired branch head `11a577594d7f1949b83bae282995e252312bb68b`

Implemented:
- permanent logical-payment execution record with deterministic PayPal correlation IDs
- atomic execution claim and duplicate-execution protection
- agent-request idempotency key bound to the original request body
- trusted-destination and authority revalidation immediately before the external PayPal call
- stale execution-claim recovery
- safe unknown-outcome retry using the same PayPal IDs inside PayPal's duplicate-protection window
- no automatic retry after the duplicate-protection window; manual reconciliation required
- Sandbox-only PayPal REST client
- OAuth token caching
- `PayPal-Request-Id`, `sender_batch_id`, and `sender_item_id` reuse
- payout batch/item reconciliation and explicit remote-status mapping
- verified-webhook endpoint and asynchronous reconciliation path
- authenticated same-origin admin execution endpoint
- payment detail surface with execution and PayPal identifiers
- configurable Sandbox receiver email without committing account data
- live proof command: `pnpm verify:slice2:sandbox`
- reusable GitHub CI workflow

Mechanically verified on GitHub Actions with Node 24 / pnpm 12 / PostgreSQL 18:
- frozen-lockfile install succeeded
- application migrations ran twice successfully
- demo seed ran twice successfully
- TypeScript check succeeded
- 5 Vitest files / 30 tests passed
- Next.js 16.3.8 production build compiled successfully
- health endpoint returned database ready
- admin sign-in plus ALLOW / ESCALATE / DENY smoke passed with zero payment execution

Separately verified by the pure TypeScript execution harness:
- deterministic IDs
- concurrent execution reaches one payout POST
- lost-response retry reuses the exact same PayPal request/batch/item IDs
- unknown outcome beyond 30 days does not POST again
- trusted-destination mismatch blocks before network use
- authority changed after execution claim blocks before network use
- P0 rejects non-USD payout execution
- OAuth token cache behavior
- payout request carries deterministic correlation IDs
- duplicate-batch HATEOAS recovery resolves the original batch
- production PayPal API host is rejected

Externally verified on Render against PayPal Sandbox:
- a distinct Sandbox Personal receiver was configured; no account address is committed to source control;
- the one-time proof created logical payment `ff515077-bf90-4800-80d7-3ef8f33d6ee2`;
- PayPal returned payout batch `BA7V96FCY8Z64` and item `A3R9LWD8XTX72`;
- the first reconciliation observed `PENDING` / `EXECUTING`;
- a later reconciliation observed PayPal `SUCCESS` and local `PAID`;
- repeated proof execution reused the same request/logical payment and the same PayPal batch/item identifiers;
- the database still reported exactly one execution row and exactly one `PAYPAL_SUBMITTED` event;
- PayPal delivered a live POST to `/api/paypal/webhooks` with HTTP 200;
- the persistent audit trail reported `webhookVerifiedEvents=1`, `reconciledEvents=2`, and `webhookReconcileFailures=0`.
- proof-only Render flags were reset to disabled after verification and the clean service redeployed successfully.

Scope revision:
- APIMatic Context Plugin is now optional/deferred and is no longer a Slice 2 completion requirement.
- The change is recorded in `devpost/spec.md` and `devpost/checklist.md`.
- The revised contract passed formal critical review and Slice 2 is checked complete.

## Slice 3

Status: in progress, not yet accepted. Draft PR #2: `https://github.com/redasgard/mandategate/pull/2`.

Branch: `build/slice-3-invoice-intake`, created from the Slice 2 `main` merge.

First security-boundary implementation:
- agent-authenticated raw-body `POST /api/agent/invoice-artifacts` accepts PDF, JPEG, or PNG and limits both declared length and actually streamed bytes to 10 MiB, without unbounded multipart parsing;
- admission checks magic bytes, rejects trivially truncated PDF envelopes, and bounds image pixel dimensions; admitted data is explicitly `STORED_UNTRUSTED`, not considered parsed or safe;
- PostgreSQL `bytea` `invoice_artifacts` table stores the exact bytes, SHA-256 digest, organization ownership, MIME, status, and timestamps; deduplication is per organization and content hash;
- database trigger rejects mutation of original content/ownership; serialized per-organization quota limits retained storage to 128 MiB and 500 distinct artifacts;
- `GET /api/agent/invoice-artifacts/{id}` returns only metadata, filtered by the machine principal's organization, never invoice bytes;
- internal artifact read re-verifies SHA-256 before analysis;
- strict Zod extraction fields include model confidence and artifact/page/fragment evidence, while ISO dates and decimal amounts are normalized deterministically without floating-point money arithmetic;
- the current extraction assessment never grants payment authority; unsupported evidence, invalid schema, low confidence, missing facts, or destination mismatch escalates;
- admission, store, quota/immutability, and extraction contract tests were committed to the branch;
- GitHub Actions run `37726857849` passed migrations/seed idempotence, typecheck, tests, production build, and smoke on code commit `49fa88fc21f050f8f4b8e0b7edf8fac6bb144abc`;
- an intermediate SQL syntax failure was repaired before this green run; no Slice 3 code has been deployed to the stable Render service.

Checkpoint review: `devpost/reviews/slice-3-admission-checkpoint.md` covers admission/storage only, not full Slice 3 acceptance.

## Slice 3A Gates F/G implementation and Gate H preflight (2026-10-08)

- Gate F: organization-admin exact-tuple review service, protected JSON GET/POST and simple reviewer UI. The reviewer supplies an explicit reason and confirms independent source check; the server enforces active admin membership, current authority tuple, same-origin mutation, immutable decision and replay rejection. `d1fe7941c034c26d29c7d7e7007e37fdfcca42d6` passed CI 37829328199 (121 tests); UI commit `3a77c82c5e88532c480cc2caa8780ac4f892db25` passed CI 37830327662. Self-review devpost/reviews/slice-3a-gate-f-review.md, CONTINUE to adversarial test only.
- Gate G: checked clean baseline event lineage against actual stored value digests, substituted receiver denial, and forged instruction marker ablation with different stored artifact bytes. Commit `7556989eb32e8b7bf085472577868a797103b22a` CI 37830032708 SUCCESS (16 test files/124 tests), no payouts. Self-review devpost/reviews/slice-3a-gate-g-review.md, limited CONTINUE to preflight, not full GLM/source composition proof.
- Gate H: **BLOCK**. Preflight devpost/reviews/slice-3a-gate-h-preflight.md. Independently parsed artifact/page provenance, live authenticated issuer/source, live reviewer/Render principal cutover and verified model ZDR posture are not established. No invoice-derived PayPal payout was attempted; prior Slice 2 payout proof is separate.
- Stable Render web service and `main` remain unchanged. Draft PR #2 cannot merge before this release BLOCK is repaired.

## Slice 3A Gate E exact execution-bound authorization

CI 37824558943 at 44ad41f799b84d3bdf1dd33e08a3ec9ef4c70618: SUCCESS, 11 migrations twice, seed twice, 16 test files/119 tests, typecheck, build/smoke. A server-only proposal takes only verified source/attestation IDs, resolves amount/vendor/destination from current trusted records, hard-denies receiver substitution, and remains ESCALATED pending approval. An explicitly approved single-use binding is atomically consumed into one verified_invoice payment request, with a current-policy/vendor/source/approval guard in PostgresExecutionStore before PayPal dispatch. The direct agent_api payout path remains independent. Review: devpost/reviews/slice-3a-gate-e-review.md, CONTINUE Gate F (9.0/10 self-review).

Major limitations: CI synthesizes independent claims/approval by DB insertion; no actual protected user confirmation or PDF page provenance yet. Revocation concurrent with an already-started remote payout cannot be atomic. No live payout or Render rollout.

## Slice 3A Gate D trusted issuer-channel attestation

CI 37822386898 on code 9d0a12fbf3ed215b9f061980a932163c483f540d SUCCESS: 9 migrations twice, 15 test files / 109 tests, seed twice, typecheck, build and smoke. Enrolled per-vendor origin-channel registry, authenticated organization-admin membership, bounded independent source references, immutable tenant-bound origin attestations, permanent channel revocation and test-only synthetic channel. Review devpost/reviews/slice-3a-gate-d-review.md: CONTINUE to isolated Gate E only, self-review 8.8/10.

A human-entered off-channel record reference is an accountable **human attestation**, not cryptographic vendor identity. There is no admin UI route yet; real independent channel verification and Gate C actual source parsing are still missing. No invoice-derived payout is authorized.

## Slice 3A Gate C semantic evidence verifier

TypeScript error repaired (currency match array type); 10 adversarial tests added. CI run 37821205892 at abc9bcf87a4dfb52946f38467c0ae0a3b2e8d64c: PASS, 14 test files / 103 tests, migrations/seed twice, typecheck, build and smoke. Checks now compare field values against labeled evidence quotes, distinguish totals and subtotals, reject mismatched invoice/PO identifiers, and refuse image self-citations. Self-review devpost/reviews/slice-3a-gate-c-review.md: CONTINUE to Gate D isolated work only (8.6/10).

Critical limit: the page-text context is not yet independently extracted from immutable artifacts. Parsing/provenance and origin are unverified. Gate C may NOT elevate evidence to T2 or authorize any payment until bound parser output is implemented and audited. The separate invoice-derived payment integration BLOCK stands.

## Slice 3A Gate B immutable provenance records

Code checkpoint c708e2a84b175add8dd0bf2a71e944c4a634237c. CI 37813228504: SUCCESS (8 migrations twice, typecheck, seed twice, 14 test files / 93 tests, Next build and smoke). Added five authority/provenance tables, database-enforced tenant and exact artifact SHA-256 relations, append-only source/evidence/trace history, immutable payment tuple, and strict SHA-256 canonical value contracts. Review devpost/reviews/slice-3a-gate-b-review.md: CONTINUE to Gate C (8.8/10 self-review).

Important limitation: these records are non-authorizing storage contracts, NOT real issuer attestation or independently verified claims. DB status strings and hashes alone cannot authorize a PayPal payout. No model data is promoted to source truth, no invoice-to-payment code is wired, and the stable Render service remains untouched.

## Slice 3A Gate A implementation (2026-10-08)

Code checkpoint c870270959facafc8f209e4a14f3dbb4bc806b77. CI 37811225079 SUCCESS: migration/seed idempotence, typecheck, 12 test files / 79 tests, production build, HTTP scope separation smoke, ALLOW/ESCALATE/DENY decisions without payout. Review: devpost/reviews/slice-3a-gate-a-review.md, CONTINUE to Gate B only (self-review 9.1/10).

Invoice scopes: invoice:upload, invoice:analyze, invoice:read. Trusted direct payment scopes: payment:submit, payment:read. Legacy invoice:submit grants no authority. PostgreSQL disallows mixed new scopes; demo seed atomically updates existing principal to invoice-only and creates separately keyed payment principal.

NOT DEPLOYED: the current stable Render Sandbox remains on verified Slice 2 code. A new DEMO_PAYMENT_AGENT_API_KEY is required before cutover; seed fails closed if absent or equal. Post-cutover secret/role verification is still pending. Invoice-derived payment integration remains BLOCKED.

## Slice 3A authority plan review

Planning self-review: CONTINUE (9.1/10), limited strictly to beginning the first isolated implementation gate. Artifact: devpost/reviews/slice-3-authority-plan-review.md. The separate invoice-to-payment integration remains BLOCKED; none of the eight implementation subgates has been checked.

## Slice 3A authority repair PLAN (2026-10-08)

Status: planned, not implemented. Authoritative proposed design: devpost/authority-boundary-plan.md.
Core boundary: document/model-observed values never become payment authority without independently verified field semantics, authenticated issuer/source or valid admin attestation, trusted vendor/destination binding, current policy, and an exact, expiring, single-use authorization tuple.
Implementation order: (A) split invoice/payment principals; (B) immutable source/claim/binding records; (C) source-to-field verifier; (D) source/issuer attestation; (E) internal-only payment bridge; (F) bound admin approval; (G) Urd-style causal/ablation tests; (H) synthetic Sandbox proof and full review.
Current Slice 3 security BLOCK remains. This commit contains PLANNING DOCUMENTS only, with no application code or PayPal execution change.

## Slice 3 authority provenance audit (2026-10-08)

**Decision: BLOCK invoice-to-payment integration**, not the existing isolated image observer or the completed Slice 2 executor. See `devpost/reviews/slice-3-injection-boundary-audit.md`.

Reviewed actual SANS MCP slide deck, DEF CON Urd workshop deck, our prior SANS Find Evil! judging methodology, and the official Find Evil! judge requirements. Prior wording that the implemented system had proven "explicit prompt-injection defenses" was overstated.

High findings:
- Canonical payment-request API and policy do not require a provenance-bound invoice claim, so an invoice-derived automation bridge would permit low-trust field influence unless a new server-side authority check is added.
- For text evidence, source-fragment existence is checked but the actual value is not semantically verified against the fragment. Model-reported quote+amount can contradict each other.

Additional issues: `observed_instructions` is model self-report and optional in Zod, English regex sees only selected quotes; no Urd-style source-to-sink trace/ablation or live adversarial Flash evidence. Current images always escalate due unverified quotes. Do not wire the model observations into canonical payment submission until the ordered repairs pass.

## Slice 3 Flash image extraction checkpoint (in progress)

Hard-pin confirmed against the official Experiential catalog:
- only `glm-5.3-flash` is allowed for invoice images; text-only `glm-5.3` is not an accepted fallback.
- Runtime actually loads and hashes the two repository skills in `skills/mandategate-invoice-observer/` and `skills/mandategate-invoice-evidence/`.
- `src/invoices/vision-json-schema.ts` sends a strict `response_format: json_schema` contract, with runtime Zod validation in `src/invoices/schema.ts`; the prompt requests direct observation with quote evidence and explicitly ignores instructions printed inside the document.
- `src/ai/gateway/experiential-vision.ts` preflights organization ZDR/no-training/capture policy and model route before transmitting invoice bytes, then requests `provider.zdr=true` and checks response serving-model and `x-gateway-zdr` headers. Errors fail closed, without a downgrade.
- `POST /api/agent/invoice-artifacts/{id}/analyze` records a single tenant-scoped model observation and marks document state; `GET .../{id}/analysis` returns the observation only to a machine principal with `payment:read` scope.
- Observations do not update trusted vendor destinations, do not create canonical payment requests, and do not call the PayPal executor. Image quotes are not independently verified and therefore escalate even when model confidence is high.
- The model is not fine-tuned or trained. No training on invoice data by any serving provider is a separate external privacy-policy requirement and must be externally verified.
- GitHub Actions CI run `37730620805` on commit `95b504d88682318358608d8ad854210c56845efa` passed all steps: migrations/seed twice, TypeScript, **10 test files / 61 tests**, Next build, smoke.
- No live Experiential image inference was performed in this checkpoint; a configured API key and verified organization privacy controls are prerequisites. No Slice 3 code has been deployed to the stable Render web service.

## Slice 3 Flash reliability and container validation checkpoint

- Image observation processing now uses 90-second expiring lease claims, UUID fencing, and at most three attempts. Stale PENDING claims can be reclaimed; concurrent contenders cannot both publish an observation.
- Image decoding admission verifies PNG chunk CRC/order, bounded IDAT inflate and scanline length; JPEG is structurally checked for SOF, scan markers and EOI but does **not** yet claim full entropy decode.
- Malformed image data is rejected before Experiential preflight or sending invoice bytes; a previously broken synthetic one-pixel PNG/JPEG fixture was replaced with reproducible correct-CRC/valid encodings.
- CI run `37732011144` succeeded on commit `cf6f8faf7dc58290af08496d256c0926d0420966`: all migration and seed idempotence checks, TypeScript, **11 test files / 72 tests**, production build and smoke passed.
- Full Slice 3 still remains **unchecked**. No live Experiential call, private customer invoice, regular GLM-5.3 inference, PayPal payout, or stable Render deployment was involved.
- The reproducible adversarial prompt regression suite is documented at `devpost/vision-prompt-evaluation.md`. This is a fixture plan, not measured model-quality evidence.
- Self-review artifact: `devpost/reviews/slice-3-flash-reliability-review.md` records the remaining delivery and verification gaps.

Still required for completing Slice 3:
- robust PDF.js parsing, 20-page ceiling, encrypted/malformed PDF failure paths, and bounded page rasterization;
- actual image decoding and scanned PDF vision preparation;
- live Experiential route-capability/ZDR/no-training preflight, strict JSON-schema GLM extraction, gateway metadata and privacy evidence;
- artifact-linked page hashes and provenance from actual parsed content; async analysis lifecycle, rate/resource budgets, fail-closed error handling, and canonical request handoff into the unchanged authority kernel;
- full adversarial fixture suite, one live compliant extraction, hosted verification, and formal Slice 3 critical review.

Do not deploy the in-progress Slice 3 branch over the stable Render Sandbox service or check Slice 3 complete before these gates pass.

## Render Sandbox Deployment

Render workspace: `Yevhen's workspace`.

Created:
- PostgreSQL 18: `mandategate-sandbox-db` (`dpg-db39d5rbc2fs73d1ke70-a`), moved by the user into the existing `MandateGate` project.
- Web service: `mandategate-web` (`srv-db39vmm7bikc73c55nh0`), source branch `build/slice-2-gated`, public URL `https://mandategate-web.onrender.com`.
- `mandategate-web`, `mandategate-sandbox`, and `mandategate-sandbox-db` now share Render environment `evm-db39hoks728c73bpnqd0` inside the existing `MandateGate` project.
- Webhook path once live: `https://mandategate-web.onrender.com/api/paypal/webhooks`.

Render-specific verification:
- private GitHub repository access is working.
- Render Node 24.21.0 is selected from package.json.
- `pnpm install --frozen-lockfile` succeeds.
- Next.js compilation and TypeScript succeed on Render.
- Render database binding is active; migrations, seed, and application startup complete successfully on the live service.
- an earlier disposable service `mandategate-sandbox` was created with an incompatible `corepack enable` build command; do not use it.

Non-secret runtime configuration and generated demo/auth credentials have been set on `mandategate-web`. PayPal credentials and the Render database connection string are intentionally not stored in source control.

## PayPal Sandbox Runtime Check

Verified on Render after runtime variables were added:
- the Render deployment completed with the Sandbox receiver environment present;
- migrations and seed completed;
- the seed switched from the synthetic receiver fixture to a distinct Sandbox Personal receiver;
- commit `61043641766be9caa637f916479080826ad7f43a` removes demo credential material and configured receiver values from seed logs and is live on Render;
- commits `161a8006cbdf8aee649a3ebe40f2d1a0c46766d6` and `60026accad1aa139a5fe49a8b0853a46d586e748` add a guarded one-time Render proof runner and persistent webhook-proof assertions;
- the proof runner is disabled in the normal live deployment after successful verification.

## PayPal MCP

The PayPal MCP connector is now attached and responds to authenticated reporting calls. Its exposed tool inventory currently includes transactions, invoices, disputes, and payment links, but no Payouts operation. The MandateGate payout path therefore remains the direct PayPal Sandbox Payouts REST adapter.

A reporting response surfaced `api.paypal.com` links rather than Sandbox REST links. Treat the MCP environment as unproven for Sandbox mutation and do not use it for the payout proof. It is suitable for read-side inspection only until its environment is independently established.

## Post-review repairs

The blocking findings from the 2026-10-07 re-review were repaired in dependency order:

1. **Credential rotation**
   - the previously logged demo admin credential and demo agent API key were rotated;
   - a guarded rotation verifier proved the previous admin credential is rejected and the new credential is accepted;
   - it likewise proved the previous agent key is rejected and the new key is accepted;
   - temporary previous-credential variables and the rotation flag were cleared after proof;
   - a clean redeploy confirmed credential rotation does not run in normal startup.

2. **Durable webhook acknowledgement**
   - verified payout webhooks are persisted in `paypal_webhook_receipts` before HTTP 200;
   - receipts have explicit RECEIVED / PROCESSING / RETRY / PROCESSED state, attempt count, processing lease, and recovery timestamps;
   - startup recovery scans recoverable verified receipts before the web service starts.

3. **Webhook deduplication and recovery**
   - PayPal `event_id` is the receipt primary key;
   - deterministic audit-event IDs make repeat processing idempotent;
   - database-backed tests prove duplicate receipt/audit insertion collapses to one logical record and an interrupted processing lease can be reclaimed and completed.

4. **Monotonic payout reconciliation**
   - remote status application is serialized with `SELECT ... FOR UPDATE`;
   - terminal states cannot regress to weaker pending/unknown states;
   - explicit post-success RETURNED / REFUNDED / REVERSED transitions remain allowed;
   - tests cover stale PENDING after PAID and valid reversal after PAID.

5. **Duplicate-batch recovery tightening**
   - HATEOAS payout-link recovery is accepted only for PayPal `BATCH_ALREADY_EXISTS`;
   - tests prove an unrelated error containing a payout-shaped link is rejected.

Current repaired-code evidence:
- branch head: `11a577594d7f1949b83bae282995e252312bb68b`;
- GitHub Actions run `37705824345`: migration idempotence, seed idempotence, typecheck, 5 files / 30 tests, production build, and smoke all passed;
- exact-code Render deployment `dep-db3dsurtqb8s73djfehg` proved the third migration and startup webhook-recovery runner;
- live-safe proof deployment `dep-db3duutg1s2s73a29s8g` replayed the existing Sandbox proof without creating a second payout: logical payment, batch and item IDs stayed unchanged, executionRows=1, submittedEvents=1, final local `PAID` / PayPal `SUCCESS`, webhookVerifiedEvents=1, reconciledEvents=2, webhookReconcileFailures=0;
- proof flags were reset to disabled and clean deployment `dep-db3e033tqb8s73djqfqg` of the same commit is live.

The database's external allowlist remains intentionally empty. Hosted Render MCP therefore cannot query the database directly; this is a platform-access limitation, not an application runtime failure.

## Slice 2 Review Gate

Formal review artifact: `devpost/reviews/slice-2-critical-review.md`.

Final repaired-branch review: `CONTINUE`, score 9.4/10, self-review supplemented by deterministic CI and external Render/PayPal Sandbox evidence.

The five ordered repairs from the previous `BLOCK` were implemented and verified to the evidence level recorded in `devpost/reviews/slice-2-critical-review.md`. Final CI passed and PR #1 was squash-merged to `main` at `afab57dc9fca4c87f4f26eee4669e977c6eadbfa`.

Residual non-blocking limitations:
- historical Render logs still contain invalidated credential strings and must remain access-restricted;
- a new real signed PayPal webhook has not yet traversed the post-repair durable-receipt layer; the signature path was proven live before the persistence change and the new receipt/dedupe/recovery layer is database-integration-tested;
- receipt recovery is immediate on normal delivery plus startup/duplicate-delivery recovery; periodic recovery is deferred to the broader background-execution slice.
