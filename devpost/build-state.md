---
doc: build-state
updated: 2026-10-08
mode: fast
---

# Build State

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

Draft PR: #1, `wire PayPal Sandbox payout execution`
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

The five ordered repairs from the previous `BLOCK` are implemented and verified to the evidence level recorded in `devpost/reviews/slice-2-critical-review.md`. PR #1 is technically merge-ready once the CI run on this final documentation state is green.

Residual non-blocking limitations:
- historical Render logs still contain invalidated credential strings and must remain access-restricted;
- a new real signed PayPal webhook has not yet traversed the post-repair durable-receipt layer; the signature path was proven live before the persistence change and the new receipt/dedupe/recovery layer is database-integration-tested;
- receipt recovery is immediate on normal delivery plus startup/duplicate-delivery recovery; periodic recovery is deferred to the broader background-execution slice.
