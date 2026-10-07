---
doc: spec
status: draft
---

# MandateGate — Technical Spec

> Baseline dependency/version check: 2026-10-06. Re-check current official versions and platform support immediately before installing or upgrading any external dependency.

## How This Works, In Plain Language

MandateGate is a TypeScript/Next.js application deployed primarily on Render.

The web application owns the admin UI and the trusted server-side API. PostgreSQL is the authoritative operational database. Render Key Value/Valkey is only a non-authoritative performance layer. Long-running or retryable analysis work runs through Render Workflows instead of building a custom queue stack.

The operations agent never receives PayPal credentials and never directly moves money. It submits an invoice to MandateGate. MandateGate extracts and analyzes the invoice, loads vendor/history context, applies deterministic policy, and returns ALLOW, ESCALATE, or DENY. Only the payment executor may call PayPal.

AI is advisory. It may interpret, infer, explain, summarize, and prepare actions, but it does not become an authority boundary.

Every consequential trail is independently verifiable. Operational records live in PostgreSQL, while the trail subsystem creates hash-linked events, Merkle checkpoints, isolated signatures, immutable archive copies, and externally witnessed commitments.

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
11. Periodic integrity jobs checkpoint trail events, sign the checkpoint, retain an immutable copy, and publish an external commitment.

PRD ref: `prd.md > The Core Journey`.

## Stack

### Application runtime

- Next.js 16.3.8 Active LTS
- React 19.3
- TypeScript 6.0
- Node.js 24 LTS

Reason: one language and one primary application stack for fast hackathon implementation, while remaining on supported stable/LTS releases rather than release-candidate or Current-only branches.

Official docs:
- https://nextjs.org/blog
- https://react.dev/blog/2026/09/09/react-19-3
- https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html
- https://nodejs.org/en/about/previous-releases

### Operational database

- PostgreSQL 18, current minor 18.6 at spec time
- Render Postgres

PostgreSQL is authoritative for mutable operational state: payments, invoices, vendors, policies, confirmations, prepared actions, execution state, and references to evidence/trail entries.

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
- scoped organization API keys for operations agents
- no Magic Link dependency in the POC
- agent API keys never become human sessions
- Valkey may assist with rate limiting or cache validation, but PostgreSQL remains authoritative

Machine and human identity remain separate authority classes. Operations-agent API keys receive only explicit scopes such as `invoice:submit` and `payment:read`; they cannot acquire admin authority through session conversion.

Official docs:
- https://better-auth.com/
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
- every PayPal POST includes `PayPal-Request-Id`
- `sender_batch_id` is deterministically derived from the immutable MandateGate logical payment identity
- `sender_item_id` is deterministically derived from the same logical payment identity at item scope
- retries reuse the same identifiers
- policy version, model result, retry count, and reevaluation state never alter the logical payment identity

Authority boundary:
1. payment request is in authoritative `ALLOW` or admin-`APPROVED` state
2. exact amount/currency/vendor destination are re-read from authoritative state
3. prepared-action/state digest checks pass where applicable
4. current admin/policy/vendor-trust authorization checks pass
5. required trail event obtains an independent witness receipt
6. only then may `PayPalPayoutsClient` issue the payout request

The operations agent, browser, assistant, model providers, and bounded-decision models never receive PayPal credentials or direct access to the payout adapter.

Asynchronous outcome:
- creation of a payout is not treated as payment completion
- PayPal payout IDs are persisted immediately
- authoritative payment state is reconciled from verified PayPal events and API retrieval when required

MandateGate mapping:
- PayPal `PENDING` -> `EXECUTING`
- PayPal `SUCCESS` -> `PAID`
- PayPal `FAILED` -> `PAYMENT_FAILED`
- PayPal `BLOCKED` -> `PAYMENT_BLOCKED`
- PayPal `ONHOLD` -> `PAYMENT_HELD`
- PayPal `UNCLAIMED` -> `PAYMENT_UNCLAIMED`
- PayPal `RETURNED` -> `PAYMENT_RETURNED`
- PayPal `REFUNDED` -> `PAYMENT_REFUNDED`

Webhook handling:
- subscribe only to payout event types required by the product
- item-level events are authoritative for per-invoice payout state where available
- verify every webhook signature through PayPal before changing authoritative state
- webhook processing is idempotent
- handler acknowledges promptly and performs reconciliation asynchronously when necessary
- duplicate, delayed, or out-of-order webhook delivery must not regress payment state

Required payout events include:
- `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`
- `PAYMENT.PAYOUTS-ITEM.FAILED`
- `PAYMENT.PAYOUTS-ITEM.BLOCKED`
- `PAYMENT.PAYOUTS-ITEM.HELD`
- `PAYMENT.PAYOUTS-ITEM.UNCLAIMED`
- `PAYMENT.PAYOUTS-ITEM.RETURNED`
- `PAYMENT.PAYOUTS-ITEM.REFUNDED`

Batch-level success/denial events may be retained for reconciliation/operations but do not replace item-level state.

Uncertain execution:
- timeout/5xx/connection loss after submission never causes an immediate second payout with new identifiers
- reconcile by existing MandateGate/PayPal identifiers first
- retry only with the same idempotency/correlation identifiers
- if outcome remains uncertain, expose `PAYMENT_UNKNOWN` / reconciliation-required state and do not issue a logically new payment

Official docs:
- https://developer.paypal.com/payouts/
- https://developer.paypal.com/api/payments.payouts-batch/v1/
- https://developer.paypal.com/api/rest/authentication/
- https://developer.paypal.com/api/rest/webhooks/
- https://developer.paypal.com/payouts/webhooks/

### Scheduled integrity work

- Render Cron for periodic checkpoint/anchor triggers if scheduling is required independently of user traffic.

Official docs:
- https://render.com/docs/cronjobs

## Dependency Version and Supply-Chain Policy

The dependency baseline is re-checked against official package/release sources immediately before installation and again before the demo freeze.

Current checked baseline on 2026-10-06:
- Next.js 16.3.8
- React 19.3
- TypeScript 6.0
- Node.js 24 LTS
- PostgreSQL 18.6
- Drizzle ORM 0.45.3
- node-postgres / `pg` 8.23.1
- Better Auth 1.7.7
- Render TypeScript SDK `@renderinc/sdk` 1.1.0

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
- one Render Key Value/Valkey 8 instance
- Render Workflows for async execution
- Render Cron only where periodic work is needed

The final demo must not depend on a fragile local-only environment. Local development remains supported, but the hackathon demo should use the deployed Render path if stable.

Exact start commands and environment variables will be finalized once the remaining object-storage and integrity-witness choices are locked.

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
- `prd.md > Activity and Accountability`

Provides the admin UI and trusted server-side routes.

### Agent API

Implements `prd.md > The Core Journey`.

Receives authenticated invoice/payment requests from operations agents. The caller can request evaluation but cannot directly invoke payment execution.

### Invoice Analysis Pipeline

Implements:
- `prd.md > Payment Detail and Decision Evidence`
- `prd.md > AI Security, Authority, and Traceability`

Extracts canonical invoice facts and marks untrusted document content as data, never instructions.

### Historical / Behavioral Analysis

Implements:
- `prd.md > Payment Detail and Decision Evidence`
- `prd.md > Policy Review`

Builds vendor/company baselines and anomaly evidence from imported AP history.

### Policy and Decision Engine

Implements:
- `prd.md > Policy Review`
- `prd.md > States and Boundaries`

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

For consequential operations, the confirmed-action trail event must obtain the required independent witness receipt before the authority boundary is crossed.

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

Every trail event is submitted to an isolated witness as a compact commitment containing at minimum `stream_id`, `sequence`, `event_hash`, and `previous_event_hash`. The witness returns a durable signed receipt that MandateGate stores by reference.

A consequential operation is not allowed to cross its authority boundary until the trail event that authorizes or records that transition has an independently durable witness receipt. This applies to payment authorization/execution, policy activation/change, vendor-trust changes, blocks/unblocks, and admin approval/decline.

If the witness is unavailable:
- consequential state changes and money movement fail closed
- read-only/non-consequential activity may continue only with an explicit `UNWITNESSED` integrity state and must be witnessed later before being represented as fully verified

### Trail Integrity / Checkpoint Service

Implements `prd.md > AI Security, Authority, and Traceability`.

Checkpoint protocol:
- only witnessed event hashes are eligible
- Merkle leaves are the ordered event hashes for an explicit inclusive sequence range
- checkpoint metadata includes stream ID, start/end sequence, Merkle root, previous-checkpoint hash, creation time, signing-key ID, and protocol version
- checkpoint payload is canonicalized before hashing/signing
- an isolated signer signs the checkpoint digest outside normal application authority
- key rotation is supported through explicit key IDs; old verification keys remain available for historical verification
- the signed checkpoint and the covered event material/receipts are copied to immutable/WORM storage outside the primary application datastore
- the signed checkpoint commitment is periodically published to a public blockchain or equivalent external witness
- sensitive invoice/vendor/payment content is never placed in the external commitment

The synchronous witness receipt closes the newest-event/tail gap. Merkle checkpoints and public anchoring provide efficient batch verification and an additional external timestamped commitment; they are not the first moment at which a consequential event becomes tamper-evident.

MandateGate can verify locally but is never the sole trust anchor.

### Independent Trail Verifier

Recomputes canonical event hashes, sequence/previous-hash continuity, witness receipts, Merkle roots, checkpoint-chain continuity, checkpoint signatures, immutable-archive consistency, and external anchors without trusting the current MandateGate application/database state.

Verifier outcomes are explicit:
- `VERIFIED`
- `UNWITNESSED`
- `INCOMPLETE`
- `BROKEN`

Any mutation, deletion, insertion, reordering, truncation, fork, invalid receipt, invalid signature, checkpoint mismatch, or external-anchor mismatch must prevent a `VERIFIED` result.

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
- payment requests
- payment decisions
- payment executions
- policies
- policy versions
- prepared actions
- admin decisions
- evidence references
- trail events
- trail witness receipts
- integrity checkpoints
- integrity anchors

Operational tables are mutable according to application rules. Trail events are append-only by contract and cryptographically linked.

## File Structure

Provisional structure, refined after the remaining PayPal/storage/integrity choices are locked:

```text
mandategate/
├── app/                         # Next.js routes and UI
│   ├── dashboard/
│   ├── payments/
│   ├── vendors/
│   ├── policies/
│   ├── activity/
│   └── api/
├── src/
│   ├── auth/                    # principal/session checks
│   ├── db/                      # schema, migrations, repositories
│   ├── invoices/                # normalization/extraction
│   ├── risk/                    # behavioral analysis
│   ├── policy/                  # deterministic policy engine
│   ├── vendors/                 # trust + re-verification
│   ├── payments/
│   │   ├── executor/            # payment state machine + authority checks
│   │   └── paypal/              # Payouts REST adapter + webhook reconciliation
│   ├── ai/
│   │   ├── gateway/             # Experiential/provider-neutral generative interface
│   │   ├── decisions/           # Jev/Laya bounded judgments
│   │   └── evals/               # adversarial model fixtures + scoring
│   ├── assistant/               # chat + prepared actions
│   ├── trail/                   # event canonicalization + hashing
│   ├── integrity/               # Merkle/sign/checkpoint/verify
│   ├── workflows/               # Render Workflow task definitions
│   └── shared/
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
└── package.json
```

## External Services and Dependencies

Locked:
- PayPal Payouts REST API v1 for vendor disbursement
- direct server-side TypeScript REST integration via native fetch
- OAuth client credentials, stable payout idempotency identifiers, verified payout webhooks, and reconciliation
- Render Web Service
- Render Postgres
- Render Key Value / Valkey
- Render Workflows
- Render Cron where required

Still to lock before implementation:
- invoice/object storage
- signer/KMS boundary
- immutable archive target
- public/external checkpoint witness
- sponsor-tool integrations beyond Render

Every dependency must be rechecked against current official documentation before installation or implementation.

## Important Failure Modes

- **AI/model unavailable, malformed output, or privacy-policy mismatch** -> deterministic controls remain authoritative; requests that require missing evidence fail closed into escalation/denial. A model response that does not prove the required Experiential ZDR route is rejected as evidence.
- **Valkey unavailable** -> bypass cache and continue against authoritative state; never relax authorization.
- **PostgreSQL unavailable** -> do not move money.
- **Render Workflow failure** -> retry according to bounded policy; surface degraded state rather than pretending completion. Workflow task state must never contain sensitive invoice/model payloads because Render retains task inputs/outputs for 30 days.
- **Trail witness unavailable** -> fail closed for payment execution, policy changes, vendor-trust changes, blocks/unblocks, and admin consequential decisions; read-only work may continue only as UNWITNESSED.
- **Trail verification mismatch** -> raise a first-class integrity incident and stop claiming affected trail history is verified. Mutation, deletion, insertion, reorder, truncation, fork, invalid receipt/signature, or anchor mismatch all fail verification.
- **PayPal execution uncertainty** -> persist the uncertain state and reconcile using existing MandateGate/PayPal identifiers before any retry. Never mint a new logical payout identity merely because the network response was lost.
- **PayPal webhook invalid/duplicate/out-of-order** -> reject invalid signatures; process valid events idempotently; do not allow stale events to regress authoritative payment state.

## What Was Simplified and Why

- One TypeScript/Next.js codebase instead of early microservices: fastest route to a coherent hackathon POC.
- Render Workflows instead of BullMQ + custom worker/queue plumbing.
- Valkey remains cache-only instead of becoming a second operational datastore.
- Real external vendor re-verification provider remains simulated, as approved in the PRD.
- The security kernel, PayPal execution boundary, AI authority boundary, and trail-integrity model are not simulated.

## Decisions and Open Issues

Locked:
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
- trail integrity separated from operational state
- MandateGate is not the sole verifier/trust anchor
- Experiential Labs as the initial generative-model gateway
- GLM-5.3 Flash as the provisional primary generative model
- Qwen3.8 27B as the secondary/challenger model
- Jev as the bounded decision/security layer
- Laya 0.3.28 as the evaluated open-source alternative
- Experiential ZDR/no-training controls enforced fail-closed for any sensitive model call

Current useful uncertainty:
- the exact trust-boundary implementation for isolated checkpoint signing, immutable retention, and external witnessing remains deliberately unresolved until the specific services are selected and validated.

Open before approval:
- PayPal surface
- object storage
- integrity signer/archive/witness
- remaining sponsor integrations
