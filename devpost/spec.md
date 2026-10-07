---
doc: spec
status: draft
---

# MandateGate — Technical Spec

> Baseline dependency/version check: 2026-10-07. Re-check current official versions and platform support immediately before installing or upgrading any external dependency.

## How This Works, In Plain Language

MandateGate is a TypeScript/Next.js application deployed primarily on Render.

The web application owns the admin UI and the trusted server-side API. PostgreSQL is the authoritative operational database. Render Key Value/Valkey is only a non-authoritative performance layer. Long-running or retryable analysis work runs through Render Workflows instead of building a custom queue stack.

The operations agent never receives PayPal credentials and never directly moves money. It submits an invoice to MandateGate. MandateGate extracts and analyzes the invoice, loads vendor/history context, applies deterministic policy, and returns ALLOW, ESCALATE, or DENY. Only the payment executor may call PayPal.

AI is advisory. It may interpret, infer, explain, summarize, and prepare actions, but it does not become an authority boundary.

Consequential trails are tamper-evident and independently checkable against externally anchored checkpoints. Operational records live in PostgreSQL; the POC uses hash-linked events, Merkle checkpoints, checkpoint signatures, and external timestamp/witness commitments. Independent WORM recoverability is a production hardening recommendation rather than hackathon infrastructure.

PRD refs:
- `prd.md > The Core Journey`
- `prd.md > AI Security, Authority, and Traceability`
- `prd.md > Vendor Trust and Re-verification`

## The Core Journey Through the System

1. Operations agent submits invoice + request metadata to the MandateGate API.
2. API authenticates the caller, creates the canonical payment request, stores the original artifact reference/hash, and appends the intake trail event.
3. Analysis work extracts invoice facts and evaluates behavioral context.
4. The deterministic decision layer evaluates policy, vendor trust, and risk evidence.
5. MandateGate produces ALLOW, ESCALATE, or DENY with structured reason codes and evidence references.
6. ALLOW passes to the payment executor.
7. ESCALATE appears in the admin review surface.
8. DENY stops before money movement.
9. Admin actions and assistant-prepared actions use the same explicit authority boundary.
10. Payment execution result is recorded in operational state and appended to the protected trail.
11. Periodic integrity jobs checkpoint trail events, sign the checkpoint, and publish an external commitment.

PRD ref: `prd.md > The Core Journey`.

## Stack

### Application runtime

- Next.js 16.3.8 Active LTS
- React 19.3
- TypeScript 6.0.3
- Node.js 24 LTS

Reason: one language and one primary application stack for fast hackathon implementation. TypeScript 7.0.2 is the current latest stable release, but this POC intentionally pins the mature 6.0.3 line to avoid an unnecessary compiler-major migration during the hackathon; Next.js/React and the selected sponsor libraries do not require TypeScript 7. The pin is re-evaluated after the demo freeze.

Official docs:
- https://nextjs.org/blog
- https://react.dev/blog/2026/09/09/react-19-3
- https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html
- https://nodejs.org/en/about/previous-releases

### Operational database

- PostgreSQL 18, current minor 18.6 at spec time
- Render Postgres

PostgreSQL is authoritative for mutable operational state: payments, invoices, vendors, policies, confirmations, prepared actions, execution state, POC artifact bodies, and references to evidence/trail entries.

Official docs:
- https://www.postgresql.org/docs/18/
- https://render.com/docs/postgresql

### Cache / ephemeral coordination

- Render Key Value
- Valkey 8

Valkey is non-authoritative. Losing or flushing it may reduce performance but must not change authorization outcomes.

Security configuration is mandatory:
- enable Render internal authentication before application use
- keep external access disabled unless a specific temporary maintenance need is approved
- never store credentials, payment authority, secrets, raw auth headers, or the sole copy of sensitive evidence in Valkey
- use authenticated internal connection URLs only

Allowed uses:
- rate limiting
- hot dashboard data
- short-lived assistant/session context
- duplicate-work suppression hints
- temporary analysis cache
- ephemeral coordination

Forbidden as sole source of truth:
- payment state
- payment idempotency
- policy authority
- vendor trust
- admin confirmation
- prepared-action validity
- audit/trail integrity

Official docs:
- https://render.com/docs/key-value

### Authentication

- Better Auth 1.7.7
- PostgreSQL-backed admin sessions
- email/password enabled for the seeded hackathon admin
- public email/password sign-up disabled with `emailAndPassword.disableSignUp=true`
- no Magic Link, social-login, transactional-email, password-reset, or public-account-registration dependency in the POC
- scoped organization API keys for operations agents
- agent API keys never become human sessions
- Valkey may assist with rate limiting or cache validation, but PostgreSQL remains authoritative

Hackathon admin flow:
- `/sign-in` is the only public human-auth entry point
- `pnpm demo:seed` creates exactly the configured synthetic demo admin if it does not already exist
- hosted demo credentials come from `DEMO_ADMIN_EMAIL` / `DEMO_ADMIN_PASSWORD` Render secrets and may be shared with judges through the submission instructions, never committed
- local seeding may generate a one-time password when those variables are omitted and prints it only to the local terminal
- no self-service sign-up endpoint is exposed by the application UI
- the seeded account is scoped to the synthetic demo organization; production user/role provisioning remains out of POC scope

Machine and human identity remain separate authority classes. Operations-agent API keys receive only explicit scopes such as `invoice:submit` and `payment:read`; they cannot acquire admin authority through session conversion.

Official docs:
- https://better-auth.com/
- https://better-auth.com/docs/authentication/email-password
- https://better-auth.com/docs/reference/options
- https://better-auth.com/docs/plugins/api-key/reference

### Background execution

- Render Workflows
- TypeScript SDK `@renderinc/sdk` 1.1.0, pinned exactly at spec time

Use for retryable/long-running work such as document analysis, model calls, risk-analysis orchestration, and other async jobs where moving the work out of the request path improves reliability.

Render retains task input arguments and return values for 30 days. Therefore workflow state must contain opaque references and non-sensitive metadata only.

Allowed task inputs/outputs include:
- payment_request_id
- invoice_artifact_id
- analysis_job_id
- organization_id
- correlation_id
- status/result code
- hashes and non-sensitive metrics

Forbidden in task arguments or return values:
- raw invoice/document content
- OCR text
- prompts or model responses
- vendor/payment destination details
- credentials, tokens, auth headers, or secrets
- raw evidence bodies
- admin explanations or attachments

Workflow tasks fetch sensitive content from controlled storage at execution time and persist results directly to authoritative storage; the workflow return value carries only an opaque result reference/status.

Do not introduce BullMQ or another queue stack unless Render Workflows proves insufficient. The Render SDK is Early Access, so MandateGate wraps it behind a small workflow adapter and pins the exact SDK version; upgrades are explicit and regression-tested.

Official docs:
- https://render.com/docs/workflows
- https://render.com/docs/workflows-sdk-typescript

### AI model layer

- Experiential Labs OpenAI-compatible gateway: https://api.experientiallabs.ai/v1
- GLM-5.3 Flash: provisional primary generative model
- Qwen3.8 27B: secondary/challenger model for harder or low-confidence cases
- TypeSafe Jev: bounded typed decision layer
- Laya 0.3.28: open-source evaluation alternative, not initially on the critical path

Current catalog check: 2026-10-06. Re-check the live catalog before build/install.

GLM handles the normal assistant, document interpretation, explanation, proposal, and action-drafting path. Qwen is invoked only by explicit routing policy or evaluation when a second opinion is warranted.

Jev contributes bounded judgments such as injection suspicion, provenance consistency, near-duplicate classification, intent/action alignment, confidence, and routing recommendations. Laya is evaluated against the same bounded-decision fixtures.

All model results are advisory evidence. Exact arithmetic, permissions, policy enforcement, payment state, and idempotency remain ordinary deterministic code.

AI safety is monotonic:
- an AI/Jev/Laya result may increase caution, request more analysis, or cause ESCALATE/DENY
- an AI result may never clear a deterministic hard block, trust a payment destination, waive required confirmation, weaken authorization, or downgrade a security finding
- a negative classifier result such as "no prompt injection detected" is absence of detected evidence, not proof of safety
- disagreement between model evidence and authoritative state is resolved in favor of authoritative state and may escalate
- disagreement between independent AI judgments on a consequential path escalates rather than being averaged into an allow
- no model confidence score can substitute for an explicit policy condition

AI evaluation gate before payment-relevant use:
- run MandateGate fixtures for clean extraction, malformed documents, near duplicates, destination substitution, direct/indirect prompt injection, poisoned history/notes, malicious tool output, prepared-action retargeting, stale action state, provenance loss, and authorization-bypass attempts
- hard failures include following hostile document instructions, fabricating evidence, retargeting an action, bypassing confirmation, or producing a materially wrong amount/destination that survives deterministic validation
- Jev/Laya bounded judgments may influence payment-relevant routing only after their false-negative/false-positive behavior is measured on these fixtures
- a cheaper/faster model cannot compensate for a hard security failure with a better average score

Every model call records task, requested model, actual route/provider, validation outcome, and resulting evidence reference. Generative-provider failover may not silently change the required privacy/security posture.

Experiential data controls are part of the security boundary, not an optional dashboard preference:
- platform prompt/response capture must be disabled: `capture_prompt_content=false`
- provider policy must require zero data retention: `require_zdr=true`
- provider policy must require no training: `require_no_training=true`
- every request also sends the per-request constraint `provider: { "zdr": true }`
- if the account/plan cannot enforce ZDR, MandateGate must not send real/sensitive invoice data through that route; only synthetic fixtures may be used until compliant routing is available
- if no compliant route survives, the model call fails closed instead of silently weakening policy
- provider allowlisting is used only if the selected Experiential plan supports it; lack of allowlisting must not weaken the ZDR/no-training requirements

Before enabling a model route, MandateGate verifies its current Experiential data-policy metadata and disables the route if no compliant ZDR/no-training lane exists.

For every served response, capture and trail the gateway metadata:
- `x-request-id`
- `x-gateway-provider`
- `x-gateway-zdr`
- `x-gateway-route-depth`
- requested model slug
- actual model/provider when exposed

A response missing or contradicting the required ZDR verdict is treated as a failed AI call, not as valid evidence.

For Jev, use the current `jev-latest` alias during exploration and pin the exact model identifier returned by `GET /v1/models` before the build is frozen.

Official references:
- https://platform.experientiallabs.ai/docs
- https://platform.experientiallabs.ai/models/compare?models=glm-5.3
- https://typesafe.ai/
- https://api.typesafe.ai/redoc
- https://github.com/NandhaKishorM/laya/releases

### PayPal payment execution

MandateGate uses the PayPal Payouts REST API v1 for vendor AP disbursement.

Why this surface:
- MandateGate sends money to a vendor after internal authorization; this is a payout/disbursement flow, not buyer checkout
- the TypeScript implementation uses direct server-side REST via native `fetch` behind a narrow `PayPalPayoutsClient` adapter
- no PayPal SDK is required for the POC payment path

Environment:
- Sandbox base URL: `https://api-m.sandbox.paypal.com`
- production base URL is out of scope for the hackathon POC
- Payouts capability must be verified with the actual sandbox app/account before the payment slice is considered unblocked; a successful one-item sandbox payout is the integration gate

Authentication:
- OAuth 2.0 client-credentials flow via `POST /v1/oauth2/token`
- credentials remain server-side only
- access tokens are cached according to the returned `expires_in`; the application never assumes a fixed token lifetime
- `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` are deployment secrets and never enter the trail

Execution:
- one logical invoice payment maps to one Payouts batch containing one item in the POC
- create payout: `POST /v1/payments/payouts`
- reconcile batch: `GET /v1/payments/payouts/{payout_batch_id}`
- reconcile item: `GET /v1/payments/payouts-item/{payout_item_id}`

Idempotency and correlation:
- every accepted agent submission has an immutable `logical_payment_id`
- the agent-facing submit endpoint requires an organization-scoped `Idempotency-Key`; PostgreSQL enforces `UNIQUE (organization_id, idempotency_key)` and replays return the original payment request rather than creating another
- `payment_executions.logical_payment_id` is permanently unique in PostgreSQL; PayPal's own duplicate window is defense in depth, not MandateGate's source of truth
- before any PayPal POST, the executor transactionally creates or claims the single execution row for that `logical_payment_id` and persists `paypal_request_id`, `sender_batch_id`, and `sender_item_id`
- concurrent executors use the same row/identifiers; only the transaction that creates or atomically claims the execution may submit
- `PayPal-Request-Id`, `sender_batch_id`, and `sender_item_id` are deterministic for the immutable logical payment identity and are reused on retry
- PayPal documents duplicate protection for a reused `sender_batch_id` within the preceding 30 days; MandateGate therefore never relies on PayPal to provide lifetime idempotency
- if a submission response is lost, retry with the same identifiers only while the PayPal duplicate-protection window still makes that retry safe; first reconcile any known PayPal identifiers
- if an execution is still outcome-unknown when that safe retry window has expired, mark it `PAYMENT_UNKNOWN_MANUAL_RECONCILIATION` and never POST it again automatically
- an existing execution row is never discarded merely because policy, model results, retry count, or reevaluation state changed
- deleting/recreating a payment request to obtain a fresh payout identity is forbidden; corrections create a new business payment only through an explicit admin-authorized replacement flow with a distinct reason and trail linkage

Authority boundary:
1. payment request is in authoritative `ALLOW` or admin-`APPROVED` state
2. exact amount/currency/vendor destination are re-read from authoritative state
3. prepared-action/state digest checks pass where applicable
4. current admin/policy/vendor-trust authorization checks pass
5. required trail event is committed to the canonical append-only trail
6. only then may `PayPalPayoutsClient` issue the payout request

The operations agent, browser, assistant, model providers, and bounded-decision models never receive PayPal credentials or direct access to the payout adapter.

#### Dashboard balance source

The dashboard's current available balance is sourced from PayPal's Transaction Search balance endpoint:

- `GET /v1/reporting/balances`
- required OAuth scope: `https://uri.paypal.com/services/reporting/balances/read`
- use the balance matching the configured POC operating currency
- display PayPal's balance timestamp/`as_of_time` next to the value because PayPal documents that reporting balances can lag by up to three hours
- cache only as a performance optimization; the displayed timestamp remains visible
- if the reporting scope/endpoint is unavailable, show `Balance unavailable` with an integration warning rather than fabricating a number

A successful Sandbox balance read with the actual hackathon app/account is a demo-readiness gate because the approved PRD requires available balance on the dashboard.

Official docs:
- https://developer.paypal.com/api/transaction-search/v1/balances-get/

Asynchronous outcome:
- creation of a payout is not treated as payment completion
- PayPal payout IDs are persisted immediately
- authoritative payment state is reconciled from verified PayPal events and API retrieval when required

MandateGate pre-execution states:
- `APPROVED` -> immediate execution path
- `SCHEDULED` -> delayed execution waiting for `scheduled_for`
- `SCHEDULE_REVIEW_REQUIRED` -> scheduled authorization became stale/unsafe and requires human review
- `CANCELLED` -> scheduled payment intentionally stopped before execution

MandateGate PayPal mapping:
- PayPal `PENDING` -> `EXECUTING`
- PayPal `SUCCESS` -> `PAID`
- PayPal `FAILED` -> `PAYMENT_FAILED`
- PayPal `BLOCKED` -> `PAYMENT_BLOCKED`
- PayPal `ONHOLD` -> `PAYMENT_HELD`
- PayPal `UNCLAIMED` -> `PAYMENT_UNCLAIMED`
- PayPal `RETURNED` -> `PAYMENT_RETURNED`
- PayPal `REFUNDED` -> `PAYMENT_REFUNDED`
- PayPal `REVERSED` -> `PAYMENT_REVERSED` (defensive mapping; PayPal currently documents this status as specific to web-upload payouts)
- any unrecognized item status -> `PAYMENT_STATUS_UNKNOWN`; persist the raw PayPal status, do not mark paid, and require reconciliation before any further action

Webhook handling:
- subscribe only to payout event types required by the product
- item-level events are authoritative for per-invoice payout state where available
- verify every webhook signature through PayPal before changing authoritative state
- webhook processing is idempotent
- handler acknowledges promptly and performs reconciliation asynchronously when necessary
- duplicate, delayed, or out-of-order webhook delivery must not regress payment state

Required payout events include:
- `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`
- `PAYMENT.PAYOUTS-ITEM.CANCELED`
- `PAYMENT.PAYOUTS-ITEM.FAILED`
- `PAYMENT.PAYOUTS-ITEM.BLOCKED`
- `PAYMENT.PAYOUTS-ITEM.HELD`
- `PAYMENT.PAYOUTS-ITEM.UNCLAIMED`
- `PAYMENT.PAYOUTS-ITEM.RETURNED`
- `PAYMENT.PAYOUTS-ITEM.REFUNDED`

Batch-level success/denial/processing events may be retained for reconciliation/operations but do not replace item-level state. A `PAYMENT.PAYOUTS-ITEM.CANCELED` webhook triggers item retrieval/reconciliation because the Payouts transaction-status reference represents a canceled unclaimed item as `RETURNED`.

Webhook/event types or item statuses unknown to the current adapter are trailed and quarantined for reconciliation. They never default to success and never regress a terminal state.

Uncertain execution:
- timeout/5xx/connection loss after submission never causes an immediate second payout with new identifiers
- reconcile by existing MandateGate/PayPal identifiers first
- retry only with the same idempotency/correlation identifiers
- if outcome remains uncertain, expose `PAYMENT_UNKNOWN` / reconciliation-required state and do not issue a logically new payment

Permanent payout-idempotency verification before demo freeze:
- two concurrent executor attempts for one `logical_payment_id` produce one execution row and at most one logical PayPal payout
- a lost HTTP response followed by retry reuses the exact same local execution row and PayPal identifiers
- a simulated retry after the documented 30-day PayPal sender-batch duplicate window does not issue a new POST; unresolved state requires manual reconciliation

Official docs:
- https://developer.paypal.com/payouts/
- https://developer.paypal.com/api/payments.payouts-batch/v1/
- https://developer.paypal.com/api/payments.payouts-batch/v1/definitions/sender_batch_header/
- https://developer.paypal.com/api/payments.payouts-batch/v1/definitions/transaction_enum/
- https://developer.paypal.com/api/rest/authentication/
- https://developer.paypal.com/api/rest/webhooks/
- https://developer.paypal.com/payouts/webhooks/

### POC artifact storage

Hackathon artifact storage stays inside PostgreSQL to avoid adding another managed service solely for a small number of invoice and evidence files.

Implementation:
- store uploaded PDF/image/evidence bodies in a dedicated `artifacts` table using PostgreSQL `bytea`
- store SHA-256 digest, MIME type, original filename, byte length, organization, uploader/source, creation time, and lifecycle state alongside the binary
- enforce an application-level maximum of 10 MiB per artifact for the POC
- accept only explicitly supported invoice/evidence MIME types
- stream uploads through bounded memory rather than trusting request-declared size
- compute the digest during ingestion and verify it whenever the artifact is re-read for security-sensitive analysis
- workflow jobs receive only `artifact_id` and fetch the body from PostgreSQL at execution time
- artifact bytes never enter Render Workflow arguments/results, Valkey, or trail events
- trail/evidence records reference the immutable artifact ID + digest rather than duplicating the body

A small `ArtifactStore` interface isolates callers from PostgreSQL-specific storage so production can move binaries to S3/R2 or another object store without changing invoice-analysis, evidence, or trail semantics.

Production recommendation:
- move ordinary artifacts to dedicated encrypted object storage
- apply organization retention/lifecycle policy
- keep the independent WORM trail/archive recommendation separate from ordinary artifact storage

Official docs:
- https://www.postgresql.org/docs/18/datatype-binary.html

### External checkpoint witness

The hackathon POC anchors checkpoint commitments through a tiny append-only registry contract on Base Sepolia instead of storing an arbitrary transaction hash as the canonical witness.

Network:
- Base Sepolia
- chain ID `84532`
- Solidity `0.8.37`
- Foundry `1.8.5` for contract compilation and tests
- `viem` `2.57.2` for TypeScript deployment and registry reads/writes
- dedicated faucet-funded MandateGate testnet EOA as the only writer

`CheckpointRegistry` is deliberately minimal and non-upgradeable:
- immutable writer address
- monotonically increasing checkpoint sequence
- `latestCheckpointHash`
- `checkpointBySequence[sequence] -> checkpoint_hash`
- `anchor(sequence, checkpoint_hash, previous_checkpoint_hash)`
- `CheckpointAnchored(sequence, checkpoint_hash, previous_checkpoint_hash)` event
- reject zero checkpoint hashes
- reject any sequence other than the exact next sequence
- reject a `previous_checkpoint_hash` that does not equal the contract's current `latestCheckpointHash`
- no overwrite, delete, reset, proxy, upgrade, ownership transfer, or arbitrary admin mutation path

The first checkpoint uses a zero previous-checkpoint hash. Once a sequence is anchored, neither the writer nor the MandateGate application can replace that sequence with a different commitment.

Contract build/deploy:
- `contracts/foundry.toml` pins Solidity `0.8.37`
- `forge build` compiles the registry and `forge test` runs sequence/fork/rewrite tests
- deployment is performed by `pnpm anchor:deploy`, a small server-side TypeScript script using viem and `BASE_SEPOLIA_ANCHOR_PRIVATE_KEY`; the private key is read from the environment and is not passed as a Foundry command-line argument
- after successful deployment the script writes `config/integrity/base-sepolia.json` with chain ID, registry address, deployment transaction/block, and deployed-bytecode hash for human review and commit

Root of trust:
- the Base Sepolia chain ID, registry contract address, deployment transaction/block, and expected contract bytecode hash are committed to the repository verifier configuration after deployment
- `integrity_anchors` in PostgreSQL is only an operational cache/index and is not trusted as the canonical source of anchored history
- the verifier queries Base independently from the committed deployment point, reconstructs the registry sequence, and compares it with locally recomputed signed checkpoints
- changing the registry address is an explicit code/configuration change, not a value accepted from the current application database

Anchoring flow:
1. build and sign the next checkpoint
2. verify that its sequence and previous-checkpoint hash match the registry head
3. submit `anchor(...)` from the dedicated testnet EOA
4. require a successful receipt
5. wait until the containing block is at least `safe` according to the Base RPC before representing it as `ANCHORED_VERIFIED`
6. cache transaction/block metadata locally for UI/navigation

If the RPC, wallet, contract call, or safe-head confirmation is unavailable, the checkpoint remains `LOCAL_VERIFIED_PENDING_ANCHOR`.

The contract stores only checkpoint hashes and chain metadata. Invoice contents, vendor data, payment amounts, explanations, and other sensitive business records never go on-chain.

Security property demonstrated by the POC:
- compromise of MandateGate after sequence N is anchored cannot rewrite checkpoint N or an earlier checkpoint without disagreement with the append-only registry
- compromise of the writer key can append malicious future checkpoints but cannot replace historical registry entries
- the testnet registry is tamper-evidence, not an immutable archive and not production recoverability

Verification test before demo freeze:
- anchor checkpoints 0..N
- mutate an already anchored local event/checkpoint and confirm `BROKEN`
- attempt to anchor a competing checkpoint at an already-used sequence and confirm contract revert
- rewrite the local `integrity_anchors` row to a different transaction/commitment and confirm the independent verifier still derives the canonical commitment from the registry
- attempt a wrong previous-checkpoint hash and confirm contract revert

Production recommendation:
- replace the testnet registry with a durable mainnet/public timestamp mechanism appropriate to legal, cost, and retention requirements
- retain the append-only external sequence/continuity property
- keep production WORM recoverability separate from the public commitment layer

Official/current references:
- https://docs.base.org/base-chain/api-reference/ethereum-json-rpc-api/eth_chainId
- https://docs.base.org/cookbook/use-case-guides/finance/access-real-time-asset-data-pyth-price-feeds/
- https://github.com/ethereum/solidity/releases
- https://github.com/foundry-rs/foundry/releases
- https://www.npmjs.com/package/viem

### Scheduled jobs

Render Cron provides the POC's periodic triggers. Render guarantees at most one active run of a given cron job at a time, but MandateGate still treats PostgreSQL/idempotency as the authority because manual runs, retries, and other callers can overlap.

#### Due-payment runner

- cron cadence: every minute in UTC
- command: `pnpm jobs:due-payments`
- delayed admin approval writes `scheduled_for TIMESTAMPTZ` and transitions the payment to `SCHEDULED`
- the confirmed prepared-action digest binds the exact scheduled execution timestamp
- PostgreSQL stores timestamps in UTC; the UI renders them in the organization's configured timezone
- the runner selects only `SCHEDULED` rows with `scheduled_for <= now()`
- due rows are claimed with a PostgreSQL transaction using row locking / atomic state transition so two runners cannot independently create two executions
- the permanent `payment_executions.logical_payment_id` uniqueness boundary remains the final duplicate-payment guard

Immediately before a scheduled payment crosses the PayPal boundary, MandateGate re-runs:
1. payment is still `SCHEDULED` and has not been cancelled/replaced
2. the original approving admin identity remains valid for the authority that was exercised
3. amount, currency, vendor, and destination still match the confirmed action digest
4. vendor destination is still trusted and not in re-verification
5. applicable standing policy has not changed in a way that invalidates the authorization
6. no new hard block exists
7. permanent payment-idempotency claim succeeds
8. the execution trail event is committed

If any authorization/trust/policy check is stale or fails, transition to `SCHEDULE_REVIEW_REQUIRED` and do not call PayPal. A schedule is permission to attempt execution at that time, not permission to ignore state changes that happened meanwhile.

State paths:
- immediate accepted escalation: `ESCALATED -> APPROVED -> EXECUTING -> ...`
- delayed accepted escalation: `ESCALATED -> APPROVED -> SCHEDULED -> EXECUTING -> ...`
- stale scheduled authorization: `SCHEDULED -> SCHEDULE_REVIEW_REQUIRED`
- admin cancellation before execution: `SCHEDULED -> CANCELLED`

Verification before demo freeze:
- schedule a payment and prove it remains non-executed before `scheduled_for`
- restart the web service and prove schedule state survives
- invoke the due runner twice concurrently and prove at most one logical payout execution is created
- change vendor trust/policy after scheduling and prove the due runner moves the request to `SCHEDULE_REVIEW_REQUIRED` without calling PayPal
- cancel a scheduled payment and prove the runner cannot execute it

#### Integrity checkpoint runner

Use a separate Render Cron job for periodic checkpoint/anchor triggers so payment scheduling and trail anchoring have independent run/failure histories.

Official docs:
- https://render.com/docs/cronjobs

### Sponsor integrations

MandateGate uses sponsor tools only where they strengthen an existing product surface. Sponsor integrations are replaceable capabilities; none owns payment authority, policy semantics, vendor trust, or trail truth.

#### Render

Already locked as the primary deployment/runtime platform:
- Next.js web service
- PostgreSQL
- Key Value / Valkey
- Workflows
- Cron where needed

The hackathon participant credit is used before adding unrelated infrastructure.

#### AG Grid / AG Studio

- AG Studio 3.0.0
- AG Grid 36.2.0 compatibility line

Use AG Studio as the primary investigation/dashboard surface for:
- payment and invoice analytics
- escalation/risk views
- vendor behavior
- policy outcomes
- trail/integrity investigation

The MandateGate Assistant may ask AG Studio to build/filter/query dashboard views through the Studio Agent Framework, but Studio receives read-oriented analytical data and never gains authority to execute payments, change trust, activate policy, or confirm prepared actions.

The Studio Agent Framework must call a server-side MandateGate adapter. Provider credentials and Experiential gateway secrets are never shipped to the browser. The adapter exposes only read-oriented dashboard/query tools and routes model requests through the existing AI Gateway security/privacy controls.

Pin `ag-studio` and `ag-studio-react` to the same exact version. Any standalone AG Grid/AG Charts packages must match AG Studio's documented compatibility line.

Official docs:
- https://www.ag-grid.com/studio/react/installation/
- https://www.ag-grid.com/studio/react/compatibility/

#### Elastic

- Elastic Cloud Serverless during the hackathon trial/extension window
- `@elastic/elasticsearch` 9.6.0 if the official client is used

Elastic is a secondary, rebuildable search/analytics index for:
- historical invoice similarity
- vendor behavior/context retrieval
- anomaly investigation
- fast trail search and correlation

PostgreSQL remains authoritative. Elastic results are evidence/search context only and cannot directly authorize ALLOW, clear a block, trust a destination, or change payment state. If Elastic is unavailable, MandateGate degrades to PostgreSQL-backed analysis/search where practical or escalates when required evidence is unavailable.

Only the minimum fields required for retrieval/analytics are indexed. Secrets, raw auth material, and unnecessary sensitive document bodies are excluded.

Official docs:
- https://www.elastic.co/docs/reference/elasticsearch/clients/javascript
- https://www.elastic.co/docs/solutions/search

#### APIMatic

Use the APIMatic Context Plugin for PayPal during implementation and verification of the PayPal integration.

APIMatic is a build-time/developer-context dependency, not a runtime payment authority. The committed implementation and tests remain the source of truth at runtime.

The project should retain reproducible evidence that the Context Plugin was used for the PayPal integration for sponsor-submission purposes.

Hackathon resource:
- https://paypalaihackathon.devpost.com/details/apimatic

#### Postman

Publish a MandateGate API collection/workspace covering:
- agent invoice submission
- payment/evaluation status
- admin-safe test flows
- webhook test fixtures where suitable
- integrity/checkpoint verification endpoints

Never publish secrets, real credentials, or production-like sensitive invoice data. Use environment variables and synthetic fixtures.

Postman is documentation/testing infrastructure, not a runtime dependency.

Official docs:
- https://learning.postman.com/docs/collections/collections-overview/
- https://learning.postman.com/docs/collaborating-in-postman/using-workspaces/public-workspaces/

#### Bryntum Scheduler

- Bryntum Scheduler 7.3.7 via public trial package alias for the hackathon

Use Scheduler for the time-oriented Payments surface:
- upcoming payments
- scheduled approved payments
- overdue obligations
- held/failed/retry-required outcomes
- escalation deadlines

The timeline visualizes authoritative MandateGate state. Drag/drop or editor interactions do not directly mutate payment authority; consequential schedule changes must go through the same prepared-action, authorization, confirmation, and trail path as other consequential actions.

Official docs:
- https://bryntum.com/products/scheduler/docs/
- https://bryntum.com/products/scheduler/changelog/

#### Zapier MCP

Zapier MCP provides one real external operations-agent/integration ingress path. Use **API by Zapier** from Zapier MCP for authenticated calls to MandateGate so the scoped MandateGate API key is stored in a Zapier app connection rather than plaintext tool/webhook fields.

Permitted:
- submit an invoice/payment request to MandateGate
- query request/payment status
- retrieve non-sensitive summaries permitted by the agent principal's scopes

Forbidden:
- direct PayPal execution
- policy activation/change
- vendor-destination trust
- bypassing escalation
- admin confirmation
- direct access to MandateGate secrets

Zapier identities map to ordinary scoped machine principals. Zapier is therefore an integration client of MandateGate, not an authority layer.

Official/current references:
- https://paypalaihackathon.devpost.com/details/zapier
- https://help.zapier.com/hc/en-us/articles/44391646192397-Ways-to-make-API-requests-in-Zapier

#### Sponsor implementation priority

The sponsor set is locked, but it is not one giant critical path.

1. **Core/demo-critical:** Render, AG Studio/AG Grid, Bryntum, PayPal integration built with APIMatic context.
2. **Important but degradable:** Elastic. PostgreSQL remains authoritative and the core payment path must still run if the search projection is unavailable.
3. **Submission/integration surfaces:** Postman and Zapier MCP. They prove API usability and external-agent ingress but cannot block the core ALLOW/ESCALATE/DENY + PayPal demo.

This preserves meaningful sponsor usage without allowing seven integrations to become seven ways to miss the submission deadline.

#### Intentionally excluded sponsors

Channel3, Astropods, and KERNEL are not part of the initial POC because their current capabilities do not materially improve the approved vendor-invoice authorization journey. They may be reconsidered only if implementation exposes a concrete need; sponsor count alone is not a reason to add them.

## Dependency Version and Supply-Chain Policy

The dependency baseline is re-checked against official package/release sources immediately before installation and again before the demo freeze.

Current checked baseline on 2026-10-07:
- pnpm 12.9.1
- Next.js 16.3.8
- React 19.3
- TypeScript 6.0.3
- Node.js 24 LTS
- PostgreSQL 18.6
- Drizzle ORM 0.45.3
- node-postgres / `pg` 8.23.1
- Better Auth 1.7.7
- Render TypeScript SDK `@renderinc/sdk` 1.1.0
- Foundry 1.8.5

Rules:
- security-sensitive and infrastructure dependencies are pinned to exact versions in the package manifest
- the package-manager lockfile is committed
- no caret/range upgrade is accepted implicitly for critical dependencies
- known security advisories are checked before first install, before deployment, and before final demo/submission
- an upgrade that changes auth, DB, workflow, AI-routing, payment, or integrity behavior requires targeted regression tests
- preview/RC/beta releases are not used on the critical path unless a specific capability requires them and the exception is explicitly reviewed

## Where It Runs and How Someone Tries It

Primary deployment target: Render.

Planned services:
- one Next.js web service
- one Render Postgres 18 database
- one Render Key Value / Valkey 8 instance
- Render Workflows for async analysis
- one Render Cron job for due payments
- one separate Render Cron job for integrity checkpoints/anchors

Package manager:
- pnpm 12.9.1, pinned through `packageManager: "pnpm@12.9.1"`
- committed `pnpm-lock.yaml`
- Node.js 24 LTS
- do not use an unpinned globally installed package-manager version for CI/deploy

### Local start

Prerequisites:
- Node.js 24 LTS
- pnpm 12.9.1
- PostgreSQL 18
- optional local Valkey/Redis-compatible instance for cache-path testing

Commands from repository root:

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm db:migrate
pnpm demo:seed
pnpm dev
```

Open:
- `http://localhost:3000`
- `http://localhost:3000/sign-in` for admin login
- `http://localhost:3000/dashboard` for the primary admin surface after authentication
- API health/readiness endpoint: `http://localhost:3000/api/health`

`pnpm demo:seed` creates only synthetic hackathon fixtures: the demo organization, trusted vendors, historical AP rows, active/proposed policies, the three canonical invoice scenarios, a local demo admin, and a scoped operations-agent API principal. It must be idempotent. Generated admin/API credentials are printed once or explicitly supplied through local-only seed variables; credentials are never committed.

Contract verification/deployment when working on the witness:

```bash
cd contracts && forge build && forge test && cd ..
pnpm anchor:deploy
```

`pnpm anchor:deploy` is only required when creating/replacing the hackathon Base Sepolia registry deployment. Normal local startup does not deploy contracts.

The core application can run locally with external anchoring disabled. In that mode integrity remains `LOCAL_VERIFIED_PENDING_ANCHOR`; the application must not claim external verification. Full anchor writes require a developer-supplied Base Sepolia test wallet and the committed registry deployment configuration.

### Render deploy contract

Web service:
- build: `pnpm install --frozen-lockfile && pnpm build`
- pre-deploy migration: `pnpm db:migrate`
- start: `pnpm start`
- health check: `/api/health`

Cron:
- due payments: `pnpm jobs:due-payments`, every minute UTC
- checkpoints/anchors: `pnpm jobs:checkpoint`, cadence selected for the demo but independent of the due-payment runner

Workflow:
- deployed from the same repository/runtime version
- task arguments/results remain limited to the opaque/non-sensitive contract already defined in this spec

The hackathon demo should use the deployed Render path once stable. Local startup remains reproducible for reviewers, while the hosted demo is the path that demonstrates PayPal Sandbox execution, sponsor integrations, and Base Sepolia anchoring without publishing payment or wallet credentials.

### Environment-variable contract

Required application/database/auth:
- `DATABASE_URL` — PostgreSQL connection URL
- `BETTER_AUTH_SECRET` — high-entropy Better Auth secret, minimum 32 characters
- `BETTER_AUTH_URL` — canonical app origin; `http://localhost:3000` locally, deployed Render origin in demo
- `DEMO_ADMIN_EMAIL` — hosted synthetic demo-admin login
- `DEMO_ADMIN_PASSWORD` — hosted synthetic demo-admin password; secret, minimum 16 characters
- `REDIS_URL` — authenticated Render Key Value internal URL in deployed environments; optional locally because Valkey is non-authoritative

Required PayPal Sandbox:
- `PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com`
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_WEBHOOK_ID`
- `PAYPAL_BALANCE_CURRENCY=USD` for the initial POC
- the connected PayPal app/account must expose both Payouts capability and the reporting-balances scope before the corresponding demo paths are considered ready

Required generative/decision providers when AI analysis is enabled:
- `EXPLABS_API_KEY`
- Experiential organization ID is discovered at runtime with `GET /api/whoami`; it is not a second secret/config value
- `TYPESAFE_API_KEY` — Bearer credential for Jev/System One
- provider configuration is validated at startup/preflight; sensitive document analysis remains disabled if the required ZDR/no-training policy cannot be proven

POC checkpoint signing:
- algorithm: Ed25519 using Node.js `node:crypto`
- `CHECKPOINT_SIGNING_KEY_ID`
- `CHECKPOINT_SIGNING_PRIVATE_KEY_B64` — PKCS#8 DER key bytes, Base64-encoded, server-side secret only
- corresponding SPKI public key is committed under `config/integrity/keys/<key-id>.pem`
- the verifier selects the public key by the checkpoint's explicit key ID
- `pnpm demo:keys` may generate a local-only pair; private material is never committed

Base Sepolia anchor writer:
- `BASE_SEPOLIA_RPC_URL`
- `BASE_SEPOLIA_ANCHOR_PRIVATE_KEY` — dedicated faucet-funded testnet EOA only, never exposed client-side
- registry chain ID, address, deployment block/transaction, and expected bytecode hash are **not** accepted from mutable database state; they are committed in `config/integrity/base-sepolia.json`
- `ENABLE_EXTERNAL_ANCHOR=false` is allowed for local development only; the hosted demo uses `true`

Optional/degradable sponsor services:
- `ELASTICSEARCH_URL`
- `ELASTICSEARCH_API_KEY`
- missing Elastic configuration disables the rebuildable search projection and must not disable authoritative payment controls
- `NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY` — optional hackathon trial/deployment licence value; AG Studio's official browser integration passes this licence value to `AgStudioProvider`, so it is client-visible licence material, not an authority credential
- Bryntum Scheduler uses the public trial packages for the hackathon (`@bryntum/scheduler@npm:@bryntum/scheduler-trial@7.3.7` plus `@bryntum/scheduler-react@7.3.7`), so no Bryntum package-registry secret is required

No secrets may enter:
- `.env.example`
- browser bundles
- trail events
- Render Workflow task inputs/outputs
- Postman public environments
- Git history

Official/current docs:
- https://pnpm.io/installation/
- https://github.com/pnpm/pnpm/releases
- https://better-auth.com/docs/reference/options
- https://render.com/docs/configure-environment-variables
- https://render.com/docs/key-value
- https://nodejs.org/docs/latest-v24.x/api/crypto.html
- https://platform.experientiallabs.ai/docs/authentication
- https://platform.experientiallabs.ai/docs/data-controls
- https://api.typesafe.ai/redoc
- https://www.ag-grid.com/studio/react/licence-install/
- https://www.bryntum.com/products/scheduler/docs/guide/Scheduler/quick-start/nextjs

## Look and Feel

Implements `prd.md > Look and Feel`.

- dark charcoal foundation
- warm amber / muted gold / copper accents
- subtle Scandinavian/Norse geometry
- restrained security-control aesthetic
- no generic purple AI gradients
- escalations and blocks visually dominant over routine activity
- dense enough for investigation, but not a SOC-wall parody

## Components

### Next.js Admin Application

Implements:
- `prd.md > Dashboard Behavior`
- `prd.md > Payment Detail and Decision Evidence`
- `prd.md > Escalation Review`
- `prd.md > Policy Review`
- `prd.md > MandateGate Assistant Behavior`
- `prd.md > Activity`

Provides the admin UI and trusted server-side routes.

### Agent API

Implements `prd.md > The Core Journey`.

Receives authenticated invoice/payment requests from operations agents. The caller can request evaluation but cannot directly invoke payment execution.

### Artifact Store

Implements:
- `prd.md > The Core Journey`
- `prd.md > Payment Detail and Decision Evidence`
- `prd.md > AI Security, Authority, and Traceability`

Stores POC invoice/evidence artifacts in PostgreSQL `bytea` behind a small provider-neutral interface. It enforces file-size/type limits, computes/validates SHA-256 digests, and returns opaque artifact references to the rest of the system.

### Invoice Analysis Pipeline

Implements:
- `prd.md > Payment Detail and Decision Evidence`
- `prd.md > AI Security, Authority, and Traceability`

The invoice path is explicit because document interpretation sits directly upstream of money movement.

Dependencies at the current baseline:
- `pdfjs-dist` 6.4.299 for local PDF parsing/text extraction and page rendering
- `@napi-rs/canvas` 1.0.10 for bounded server-side PDF page rasterization where needed
- Zod 4.6.5
- csv-parse 7.0.3 for the canonical extraction contract
- GLM-5.3 Flash through Experiential for the primary text/image interpretation path

File admission:
- accept only allowlisted PDF/JPEG/PNG invoice/evidence MIME types and verify magic bytes instead of trusting filename/Content-Type alone
- existing 10 MiB artifact cap applies
- POC maximum 20 PDF pages per invoice
- reject encrypted/password-protected PDFs, malformed parse results, decompression/pathological rendering failures, and unsupported formats
- parsing/rendering runs in the async analysis task with explicit timeout/memory/page limits; failure produces structured extraction failure evidence rather than partial authority

Document preparation:
- for text-bearing PDFs, PDF.js extracts page-separated text locally; page boundaries and artifact/page hashes are retained
- for scanned/image-heavy PDFs, PDF.js renders bounded page images and the vision path receives only the required pages
- JPEG/PNG invoices enter the same vision path after dimension/decoder validation
- GLM-5.3 Flash is currently documented by Experiential as accepting text and image input; direct PDF input is not assumed
- raw document instructions, QR-code text, notes, and embedded prose remain untrusted content

Canonical extraction contract:
- `vendor_name`
- `invoice_number`
- `invoice_date`
- `due_date`
- `currency`
- `total_amount_decimal` as a decimal string, never a JavaScript floating-point amount
- `line_items[]` with description, quantity/value strings when available
- `invoice_payment_destination` as untrusted observed data
- field-level `confidence`
- field-level evidence references containing artifact ID, page number, and source fragment/reference

The model does not receive authority-bearing tools. Extraction uses Experiential Chat Completions structured output with `response_format.type=json_schema`, `strict: true`, and `additionalProperties: false`; the returned JSON must match the canonical invoice schema and is still validated again with Zod. Experiential documents that unsupported structured-output capabilities are refused rather than silently downgraded. Model/route capability is preflighted from live metadata; if the selected route cannot honor required structured-output, image-input, or ZDR requirements, that route is disabled.

Validation after every model response:
1. parse the returned structured JSON with Zod; reject unknown fields
2. normalize dates/currency/decimal strings deterministically
3. never use binary floating point for the amount
4. resolve vendor identity only against authoritative MandateGate vendor records
5. treat the invoice payment destination only as an observed claim for comparison with the trusted vendor destination
6. for text-bearing documents, verify quoted evidence fragments exist on the referenced page where practical; a mismatch lowers trust and escalates
7. preserve the exact model/provider route metadata and the original artifact/page references in evidence

Failure behavior:
- malformed/invalid schema output -> one bounded repair/retry on the same immutable artifact; if still invalid, `ESCALATE` with `EXTRACTION_INVALID`
- missing or ambiguous amount/currency/vendor -> `ESCALATE`
- low confidence on any payment-critical field -> `ESCALATE`
- amount/destination conflict between independent analysis and authoritative state -> deterministic controls win; never average the disagreement into ALLOW
- prompt-injection suspicion or document instructions aimed at changing policy/tools/authority -> retain as evidence and raise risk; never execute them
- image/vision route unavailable -> do not invent OCR output; mark extraction unavailable and escalate

Verification fixtures before payment-relevant enablement:
- normal text PDF
- scanned PDF
- JPEG/PNG invoice
- malformed/truncated PDF
- password-protected PDF
- >20-page and >10 MiB rejection
- missing/ambiguous amount
- ambiguous vendor
- destination substitution
- direct and indirect prompt injection inside invoice text/image
- model output with extra fields/wrong types
- model output amount not supported by the source evidence
- same artifact re-analysis produces provenance linked to the same immutable artifact hash

Official/current references:
- https://github.com/mozilla/pdf.js/releases
- https://github.com/mozilla/pdf.js/wiki/Setup-pdf.js-in-a-website
- https://www.npmjs.com/package/@napi-rs/canvas
- https://github.com/colinhacks/zod/releases
- https://platform.experientiallabs.ai/models/glm-5.3-flash
- https://platform.experientiallabs.ai/docs/openai-compatibility
- https://platform.experientiallabs.ai/docs/models

### Historical / Behavioral Analysis

Implements:
- `prd.md > Payment Detail and Decision Evidence`
- `prd.md > Policy Review`

Builds vendor/company baselines and anomaly evidence from imported AP history.

#### AP history CSV import

Dependency:
- `csv-parse` 7.0.3. Versions below 7.0.2 are forbidden because of the 2026 prototype-replacement advisory affecting a columns path.

The POC accepts an RFC-4180-style UTF-8 CSV/ERP export through an authenticated admin import flow. The raw CSV is stored as an artifact and hashed before parsing.

Canonical columns:
- required: `vendor_name`, `invoice_number`, `invoice_date`, `amount_decimal`, `currency`, `status`
- optional: `due_date`, `paid_at`, `payment_destination`, `department`, `cost_center`

Import rules:
- header names are mapped through an explicit allowlist; unknown columns may be retained as ignored metadata but never become SQL identifiers
- duplicate header names are rejected
- formula-like cell content is treated as plain data and never evaluated
- amounts remain decimal strings through validation/normalization; no binary floating-point arithmetic
- currency is normalized to upper-case ISO-style three-letter codes and unsupported currencies are rejected from payment baselines
- dates are parsed under one documented ISO-date contract; ambiguous locale dates are rejected rather than guessed
- each row receives deterministic normalized content hash + source row number
- exact duplicate normalized rows within an import are collapsed/reported
- a row failing schema validation is quarantined with a reason; it does not silently contribute to behavioral baselines
- import runs are immutable/versioned by `ap_import_id`; rebuilding a baseline records which import versions contributed
- vendor resolution never trusts the CSV row to overwrite an authoritative vendor destination

Minimum baseline inputs:
- amount distribution by vendor
- invoice/payment cadence
- invoice-number and normalized-content duplicate/similarity context
- optional department/cost-center context
- historical destination observations as non-authoritative evidence

Verification:
- valid history import builds expected vendor/company baselines
- duplicate headers and malformed rows are rejected/quarantined
- CSV cells containing spreadsheet formulas are inert strings
- repeated import of the same file does not duplicate historical observations
- changing an import creates a new version and provenance, rather than rewriting the previous import

Official/current references:
- https://www.npmjs.com/package/csv-parse
- https://github.com/adaltas/node-csv/security/advisories/GHSA-8cw4-87c7-c6xx

### Policy and Decision Engine

Implements:
- `prd.md > Policy Review`
- `prd.md > The Core Journey`

Deterministically combines active policy, vendor trust, extraction confidence, and risk evidence into ALLOW, ESCALATE, or DENY.

AI output never directly grants authority.

### Vendor Trust Service

Implements `prd.md > Vendor Trust and Re-verification`.

Owns trusted payment destinations and re-verification state. Invoice-supplied destination changes cannot become trusted through ordinary payment approval.

### Payment Executor

Implements:
- `prd.md > The Core Journey`
- `prd.md > Escalation Review`

The only component allowed to hold/use PayPal payment credentials.

Implementation:
- wraps the PayPal Payouts REST API v1 behind `PayPalPayoutsClient`
- performs the final authoritative-state, destination, amount/currency, idempotency, and witness checks immediately before the external call
- uses stable `PayPal-Request-Id`, `sender_batch_id`, and `sender_item_id`
- persists PayPal batch/item IDs and never equates payout creation with completion
- reconciles asynchronous outcomes from verified webhooks and direct retrieval
- never retries an uncertain payment under a new logical identity
- uses PostgreSQL uniqueness/transactional claiming as the permanent idempotency boundary; PayPal's sender-batch duplicate window is only an additional remote safeguard

### AI Gateway

Implements:
- `prd.md > MandateGate Assistant Behavior`
- `prd.md > AI Security, Authority, and Traceability`

Owns the provider-neutral generative-model interface, Experiential routing constraints, route metadata capture, output validation, and fail-closed privacy checks. Provider-native agent/MCP execution never owns consequential tool execution.

### System One Decision Layer

Implements `prd.md > AI Security, Authority, and Traceability`.

Wraps Jev bounded judgments and the Laya evaluation adapter. Outputs are typed advisory evidence only, always with `authority: NONE`, and are subject to the monotonic-safety rules above.

### MandateGate Assistant

Implements `prd.md > MandateGate Assistant Behavior`.

Read-oriented by default. It may prepare explicit action objects, but consequential actions require normal authorization and confirmation.

Every consequential prepared action is an immutable proposal containing at minimum:
- `action_id`
- initiating actor/principal
- proposed action type
- exact target type/id
- exact parameters/value set
- organization/tenant
- relevant authoritative-state version/hash
- policy version
- evidence references
- originating model invocation/reference when AI-prepared
- creation time
- expiry
- canonical `action_digest`

The `action_digest` is SHA-256 over an RFC 8785 canonical representation with a MandateGate action-domain separator.

Admin confirmation binds to the exact `action_id` + `action_digest` and records the authenticated admin, required explanation when applicable, and confirmation time. Conversational text such as "yes" is never sufficient by itself to authorize a mutated or newly resolved action.

Immediately before commit/execution MandateGate re-evaluates:
- admin authorization
- target identity
- exact parameters
- current authoritative-state/version hash
- policy version where relevant
- action expiry
- vendor-trust/payment state
- integrity/witness preconditions

Any mismatch marks the proposal `STALE` and requires a newly prepared action and fresh confirmation. No target/value retargeting is permitted after confirmation.

For consequential operations, the confirmed-action trail event must be committed to the canonical append-only trail before the authority boundary is crossed. External anchoring follows on the checkpoint schedule.

### Trail Writer

Implements `prd.md > AI Security, Authority, and Traceability`.

Writes canonical append-only events for:
- every inbound API request
- every outbound external-service call
- every model/decision-model invocation
- every tool or integration call
- every routing, fallback, and degraded-path choice
- every policy/risk/vendor-trust decision
- every prepared/confirmed/rejected action
- every consequential state transition
- every payment attempt/result
- every integrity/witness/checkpoint operation

Canonical event envelope:
- `protocol_version`
- `event_id` (UUIDv7)
- `stream_id` / organization
- `sequence`
- `event_type`
- `occurred_at` and `recorded_at`
- actor/principal type + stable ID
- component/service identity
- route/operation name
- request ID
- correlation ID
- causation event ID
- trust class of material inputs
- authority class of the actor/component
- relevant domain-object references such as payment/action/vendor/policy IDs
- input evidence references + cryptographic hashes
- output/result references + cryptographic hashes
- decision code and structured reason codes when applicable
- before-state and after-state references/hashes for state transitions
- requested model, actual provider/model/route metadata for AI calls
- status/error class
- `previous_event_hash`
- `event_hash`

The trail never stores credentials, API keys, cookies, raw Authorization headers, private signing material, or other secrets. Sensitive invoice/model/attachment bodies are not duplicated merely for logging; the event stores an evidence/artifact reference plus digest and only the minimum non-sensitive metadata required to reconstruct provenance.

Canonicalization and chaining:
- canonical serialization: RFC 8785 JSON Canonicalization Scheme
- event hash: SHA-256 with a MandateGate event-domain separator
- each organization has an independent ordered trail stream
- each event carries a monotonically increasing sequence number and previous-event hash
- corrections are new events and never mutations
- sequence gaps, duplicate sequence numbers, broken previous hashes, forks, and reordered events are integrity failures

Append serialization and transactional consistency:
- PostgreSQL owns one `trail_stream_heads` row per organization/stream containing the current sequence and head hash
- appending an event locks that stream-head row with `SELECT ... FOR UPDATE`, derives `sequence = head.sequence + 1` and `previous_event_hash = head.event_hash`, inserts the immutable event, then advances the stream head in the same transaction
- database constraints enforce `UNIQUE (stream_id, sequence)` and `UNIQUE (stream_id, event_hash)`
- ordinary application code has no UPDATE/DELETE path for `trail_events`; corrections are append-only successor events
- consequential local state changes such as admin decisions, policy activation, vendor-trust transitions, and scheduling are written in the same PostgreSQL transaction as their corresponding trail event where both are local database effects
- external PayPal execution is split deliberately: the durable execution claim + pre-call trail event commit first, the network call happens after commit, then the observed response/reconciliation result is appended as a new event
- failure after the pre-call commit is represented as an uncertain/reconciliation state rather than rewriting or deleting the pre-call event

Concurrency verification:
- parallel event writers for one organization must produce a single contiguous sequence with no forks
- forced transaction rollback must leave neither the business-state mutation nor its paired trail event committed
- process failure after a payment pre-call commit must preserve enough evidence/idempotency state to reconcile without minting a new payment identity

The POC does not require a synchronous external witness receipt for every event. Consequential events are committed to the canonical local trail before the corresponding state transition or external payment call.

Events newer than the latest externally anchored checkpoint are explicitly marked as pending external anchoring. They must never be presented as externally verified.

### Trail Integrity / Checkpoint Service

Implements `prd.md > AI Security, Authority, and Traceability`.

POC checkpoint protocol:
- Merkle leaves are the ordered event hashes for an explicit inclusive sequence range
- checkpoint metadata includes stream ID, start/end sequence, Merkle root, previous-checkpoint hash, creation time, signing-key ID, and protocol version
- checkpoint payload is canonicalized before hashing/signing
- the POC signs the checkpoint digest with an Ed25519 key using Node.js `node:crypto`
- the private signing key is a server-side Render secret; the corresponding SPKI public key is committed by explicit `signing-key ID`
- key rotation is supported through explicit key IDs; old public verification keys remain available for historical verification
- the signed checkpoint commitment is periodically appended to the Base Sepolia `CheckpointRegistry`; registry sequence and previous-checkpoint continuity are part of verification
- sensitive invoice/vendor/payment content is never placed in the external commitment

External anchoring closes the history up to the anchored checkpoint. The verifier and UI must distinguish the anchored range from the newer unanchored tail.

Production hardening recommendation:
- copy canonical events, evidence manifests, and checkpoint material to a separately administered WORM archive using S3-compatible Object Lock `COMPLIANCE` mode or equivalent
- move the signing key outside normal application authority
- optionally require synchronous external receipts for consequential events when near-zero unanchored-tail exposure is required

The POC demonstrates tamper evidence and independent external anchoring; it does not claim production-grade independent recoverability.

### Independent Trail Verifier

Recomputes canonical event hashes, sequence/previous-hash continuity, Merkle roots, checkpoint-chain continuity, checkpoint signatures, and Base Sepolia registry history without trusting the current MandateGate UI/backend or its `integrity_anchors` rows. The committed chain ID, registry address, deployment block, and bytecode hash are the POC witness root configuration.

Verifier outcomes are explicit:
- `ANCHORED_VERIFIED`
- `LOCAL_VERIFIED_PENDING_ANCHOR`
- `INCOMPLETE`
- `BROKEN`

Any mutation, deletion, insertion, reordering, truncation, fork, invalid signature, checkpoint mismatch, or external-anchor mismatch must prevent an `ANCHORED_VERIFIED` result.

## Data Model

### Data access layer

- Drizzle ORM 0.45.3 stable
- node-postgres 8.23.1
- explicit SQL migrations committed to the repository

Drizzle is used as a thin typed data-access layer rather than as a substitute for PostgreSQL semantics. Security-sensitive invariants, transactional payment-state transitions, uniqueness/idempotency constraints, append-only trail constraints, and integrity-related database rules remain explicit and inspectable.

Dynamic SQL identifiers or aliases must never be constructed directly from request-derived input. Any dynamic sort/column/alias selection must map through a static allowlist before reaching Drizzle APIs such as `sql.identifier()` or `.as()`.

Official docs:
- https://orm.drizzle.team/
- https://node-postgres.com/

The authoritative model will include at minimum:

- organizations
- actors / API principals
- vendors
- vendor destinations
- invoices
- AP import runs / normalized AP history rows
- payment requests
  - `scheduled_for TIMESTAMPTZ` when delayed execution is selected
  - explicit `SCHEDULED`, `SCHEDULE_REVIEW_REQUIRED`, and `CANCELLED` states in addition to ordinary evaluation states
- payment decisions
- payment executions
  - permanent unique `logical_payment_id`
  - deterministic PayPal correlation IDs
  - submission/reconciliation timestamps and outcome state
- policies
- policy versions
- prepared actions
- admin decisions
- artifacts
- evidence references
- trail stream heads
- trail events
  - unique `(stream_id, sequence)`
  - unique `(stream_id, event_hash)`
- integrity checkpoints
- integrity anchors

Operational tables are mutable according to application rules. Trail events are append-only by contract and cryptographically linked.

## File Structure

Provisional structure, refined only if implementation proves a listed boundary insufficient:

```text
mandategate/
├── app/                         # Next.js routes and UI
│   ├── sign-in/
│   ├── dashboard/
│   ├── payments/
│   ├── vendors/
│   ├── policies/
│   ├── activity/
│   └── api/
├── src/
│   ├── auth/                    # human sessions + scoped machine principals
│   ├── db/                      # schema, migrations, repositories
│   ├── artifacts/               # PostgreSQL bytea POC artifact store + interface
│   ├── invoices/
│   │   ├── schema.ts            # Zod canonical invoice extraction contract
│   │   ├── pdf.ts               # bounded PDF.js text/raster preparation
│   │   ├── extract.ts           # strict JSON-schema GLM extraction + validation
│   │   └── normalize.ts         # deterministic amount/date/currency normalization
│   ├── imports/
│   │   └── ap-csv.ts            # allowlisted/versioned AP history import
│   ├── risk/                    # behavioral analysis
│   ├── policy/                  # deterministic policy engine
│   ├── vendors/                 # trust + re-verification
│   ├── payments/
│   │   ├── executor/            # payment state machine + authority/idempotency checks
│   │   └── paypal/              # Payouts REST adapter + webhook/reconciliation
│   ├── ai/
│   │   ├── gateway/             # Experiential/provider-neutral generative interface
│   │   ├── decisions/           # Jev/Laya bounded judgments
│   │   └── evals/               # adversarial model fixtures + scoring
│   ├── assistant/               # chat + prepared actions
│   ├── analytics/
│   │   ├── ag-studio/           # dashboard/investigation adapter
│   │   └── elastic/             # rebuildable search/analytics projection
│   ├── integrations/
│   │   └── zapier/              # scoped external-agent ingress
│   ├── scheduling/
│   │   ├── due-payments.ts      # due-payment claim + execution-time revalidation
│   │   └── bryntum/             # payment/deadline timeline adapter
│   ├── trail/                   # serialized append-only events + hashing
│   ├── integrity/
│   │   ├── checkpoint/          # Merkle + Ed25519 checkpoint signing
│   │   ├── anchor/              # Base Sepolia registry client
│   │   └── verify/              # independent local + on-chain verification
│   ├── workflows/               # Render Workflow task definitions
│   └── shared/
├── contracts/
│   ├── foundry.toml             # Solidity 0.8.37 / Foundry 1.8.5 config
│   ├── src/
│   │   └── CheckpointRegistry.sol
│   └── test/
│       └── CheckpointRegistry.t.sol
├── scripts/
│   └── deploy-checkpoint-registry.ts  # viem deployment + root-config output
├── config/
│   └── integrity/
│       ├── base-sepolia.json    # committed chain/address/deployment/bytecode root
│       └── keys/                # committed checkpoint-signing public keys only
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── adversarial/
│   └── fixtures/
├── devpost/
│   ├── scope.md
│   ├── prd.md
│   └── spec.md
├── docs/
├── .env.example
├── LICENSE
├── package.json
└── pnpm-lock.yaml
```

## External Services and Dependencies

Locked:
- Base Sepolia `CheckpointRegistry` as the POC external checkpoint witness
- PostgreSQL `bytea` for POC artifact storage behind an `ArtifactStore` abstraction
- 10 MiB per-artifact POC limit with MIME allowlisting and SHA-256 integrity checks
- PayPal Payouts REST API v1 for vendor disbursement
- direct server-side TypeScript REST integration via native fetch
- OAuth client credentials, stable payout idempotency identifiers, verified payout webhooks, and reconciliation
- Render Web Service
- Render Postgres
- Render Key Value / Valkey
- Render Workflows
- Render Cron for the due-payment runner and integrity checkpoint runner

Locked sponsor integrations:
- AG Studio / AG Grid
- Elastic
- APIMatic Context Plugin for PayPal
- Postman
- Bryntum Scheduler
- Zapier MCP

Intentionally excluded initially:
- Channel3
- Astropods
- KERNEL

Every dependency/service must be rechecked against current official documentation before installation or implementation.

## Important Failure Modes

- **AI/model unavailable, malformed output, or privacy-policy mismatch** -> deterministic controls remain authoritative; requests that require missing evidence fail closed into escalation/denial. A model response that does not prove the required Experiential ZDR route is rejected as evidence.
- **Valkey unavailable** -> bypass cache and continue against authoritative state; never relax authorization.
- **PostgreSQL unavailable** -> do not move money.
- **Due-payment Cron delayed/unavailable** -> keep payment in `SCHEDULED`; never infer that it executed. A later run may claim it only after full execution-time revalidation.
- **Scheduled authorization became stale** -> transition to `SCHEDULE_REVIEW_REQUIRED`; do not execute under the old approval.
- **Render Workflow failure** -> retry according to bounded policy; surface degraded state rather than pretending completion. Workflow task state must never contain sensitive invoice/model payloads because Render retains task inputs/outputs for 30 days.
- **Trail verification mismatch** -> raise a first-class integrity incident and stop claiming affected trail history is verified. Mutation, deletion, insertion, reorder, truncation, fork, invalid signature, or anchor mismatch all fail verification.
- **External anchor unavailable** -> continue local append-only operation but mark new history `LOCAL_VERIFIED_PENDING_ANCHOR`; do not represent it as externally verified.
- **PayPal execution uncertainty** -> persist the uncertain state and reconcile using existing MandateGate/PayPal identifiers before any retry. Never mint a new logical payout identity merely because the network response was lost. If the remote duplicate-protection window expires while outcome remains unknown, transition to `PAYMENT_UNKNOWN_MANUAL_RECONCILIATION` and prohibit automatic resubmission.
- **PayPal webhook invalid/duplicate/out-of-order** -> reject invalid signatures; process valid events idempotently; do not allow stale events to regress authoritative payment state.

## What Was Simplified and Why

- One TypeScript/Next.js codebase instead of early microservices: fastest route to a coherent hackathon POC.
- Render Workflows instead of BullMQ + custom worker/queue plumbing.
- Valkey remains cache-only instead of becoming a second operational datastore.
- Real external vendor re-verification provider remains simulated, as approved in the PRD.
- Live Payouts enablement/production approval is outside the hackathon POC; the demo uses PayPal Sandbox only.
- The security kernel, PayPal execution boundary, AI authority boundary, hash-chained trail, Merkle verification, and external checkpoint anchoring are real in the POC.
- Independent WORM recoverability and isolated external signing are deferred to production hardening because they add compliance infrastructure without improving the hackathon demonstration enough to justify the cost/complexity.
- POC invoice/evidence artifacts stay in PostgreSQL `bytea` behind an `ArtifactStore` interface; production should move binaries to dedicated object storage.

## Decisions and Open Issues

Locked:
- MIT License
- PayPal Payouts REST API v1 as the payment execution surface
- direct TypeScript REST adapter, OAuth client credentials, stable dual idempotency/correlation IDs, verified payout webhooks, and reconciliation-first retry behavior
- TypeScript/Next.js-centric architecture
- Drizzle ORM 0.45.3 stable + node-postgres 8.23.1 for data access
- Better Auth 1.7.7 for admin sessions and scoped organization API keys
- Node.js 24 LTS baseline
- PostgreSQL 18 authoritative operational database
- Render-centric deployment
- Render Key Value/Valkey 8 as non-authoritative cache
- Render Workflows for async/retryable work
- no BullMQ initially
- trail integrity is hash-chained and externally checkpointed in the POC
- externally anchored checkpoints are the independent POC trust reference
- independent WORM archive + isolated signer are production hardening recommendations
- Experiential Labs as the initial generative-model gateway
- GLM-5.3 Flash as the provisional primary generative model
- Qwen3.8 27B as the secondary/challenger model
- Jev as the bounded decision/security layer
- Laya 0.3.28 as the evaluated open-source alternative
- Experiential ZDR/no-training controls enforced fail-closed for any sensitive model call
- PostgreSQL-backed POC artifact storage with a provider-neutral `ArtifactStore` abstraction
- Base Sepolia (chain ID 84532) append-only `CheckpointRegistry` as the POC external checkpoint witness; the committed registry deployment is the verifier root rather than a local transaction pointer
- AG Studio / AG Grid for dashboard and investigation
- Elastic as a non-authoritative searchable/analytical projection
- APIMatic Context Plugin for PayPal build-time integration context
- Postman for public/testable API documentation
- Bryntum Scheduler for payment timelines and deadlines
- Zapier MCP as a scoped external operations-agent ingress

Current useful uncertainty:
- the earlier question about who verifies Merkle history is resolved: the verifier recomputes local history and validates signed checkpoints against Base Sepolia commitments. Production WORM recoverability remains intentionally out of POC scope.

Open before approval:
- final integrated consistency/security review

Submission-time obligation:
- make the GitHub repository public before Devpost submission; MIT `LICENSE` is already committed
