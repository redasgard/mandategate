---
doc: build-state
updated: 2026-10-07
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

Checklist status: intentionally unchecked.

Draft PR: #1, `WIP: wire PayPal Sandbox payout execution`
Staged branch: `build/slice-2-gated`
CI run: `37658798924` — success

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
- 4 Vitest files / 22 tests passed
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

Not yet verified, therefore Slice 2 is not complete:
1. One real PayPal Sandbox payout and item reconciliation using `DEMO_PAYPAL_RECEIVER_EMAIL`, `PAYPAL_CLIENT_ID`, and `PAYPAL_CLIENT_SECRET`: `pnpm verify:slice2:sandbox`.
2. Live webhook signature/reconciliation against the configured `PAYPAL_WEBHOOK_ID` on a reachable app URL.
3. APIMatic Context Plugin usage evidence required by the approved checklist. APIMatic is not available in the current connected plugin/tool inventory, so this evidence has not been fabricated.

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
- current Render build stops at page-data collection because `DATABASE_URL` is not yet connected to the Render Postgres instance.
- an earlier disposable service `mandategate-sandbox` was created with an incompatible `corepack enable` build command; do not use it.

Non-secret runtime configuration and generated demo/auth credentials have been set on `mandategate-web`. PayPal credentials and the Render database connection string are intentionally not stored in source control.

## Current blocker

The code/toolchain gate is green. To make the Render service live, connect the database's **Internal Database URL** to `mandategate-web` as `DATABASE_URL`. The current Render connector does not expose that generated credential value or a fromDatabase reference operation, so this one binding must be made in the Render Dashboard. The database's external allowlist is intentionally empty; hosted Render MCP cannot query it externally, which is consistent with keeping the DB private.

After the service is live, add the PayPal Sandbox runtime secrets (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `DEMO_PAYPAL_RECEIVER_EMAIL`), create the PayPal webhook at the URL above, and add `PAYPAL_WEBHOOK_ID`.

APIMatic Context Plugin evidence is still unavailable and must not be fabricated.

Do not check or merge Slice 2 until the real Sandbox payout, live webhook reconciliation, and APIMatic evidence are satisfied.
