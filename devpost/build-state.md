---
doc: build-state
updated: 2026-10-07
mode: fast
---

# Build State

## Slice 1

Status: mechanically verified and checkpointed, not promoted to `main` because GitHub ref/PR mutations are currently failing in the connected runtime.

Release commit: `0a21eb46f6a3043929525cebdcd4a3673191fdf3` (`build decision kernel`)
Branch: `build/slice-1-ready`

Observed verification from GitHub Actions:
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

Caveat: the historical successful run executed migration/seed once. The new repository CI workflow intentionally runs each twice, but that workflow has not run on this branch yet.

## Slice 2

Checklist status: intentionally unchecked.

Latest staged commit: `87630d6fc13023ceb5184b6b9eab05892dd3caea`
Latest staged branch: `build/slice-2-sandbox-proof-ready`

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
- reusable GitHub CI workflow for migration/seed idempotence, typecheck, tests, build, health, and smoke

Locally verified with executable pure TypeScript harnesses:
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
1. Full pinned project toolchain on the staged Slice 2 tree: `pnpm install --frozen-lockfile && pnpm db:migrate && pnpm db:migrate && pnpm demo:seed && pnpm demo:seed && pnpm typecheck && pnpm test && pnpm build && pnpm smoke`.
2. One real PayPal Sandbox payout and item reconciliation using `DEMO_PAYPAL_RECEIVER_EMAIL`, `PAYPAL_CLIENT_ID`, and `PAYPAL_CLIENT_SECRET`: `pnpm verify:slice2:sandbox`.
3. Live webhook signature/reconciliation against the configured `PAYPAL_WEBHOOK_ID` on a reachable app URL.
4. APIMatic Context Plugin usage evidence required by the approved checklist. APIMatic is not available in the current connected plugin/tool inventory, so this evidence has not been fabricated.

## Current blocker

The connected GitHub mutation layer can create Git objects and new branches, but attempts to update existing refs or create pull requests are failing internally. Local npm dependency installation is also unavailable in the current execution sandbox, and no PayPal Sandbox credentials are exposed to this runtime.

Do not check Slice 2 or claim a real payment until all four missing verification items above are satisfied.
