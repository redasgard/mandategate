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
- TypeScript SDK `@renderinc/sdk` ^1.0 or later supported line at spec time

Use for retryable/long-running work such as document analysis, model calls, risk-analysis orchestration, and other async jobs where moving the work out of the request path improves reliability.

Do not introduce BullMQ or another queue stack unless Render Workflows proves insufficient.

Official docs:
- https://render.com/docs/workflows
- https://render.com/docs/workflows-sdk-typescript

### Scheduled integrity work

- Render Cron for periodic checkpoint/anchor triggers if scheduling is required independently of user traffic.

Official docs:
- https://render.com/docs/cronjobs

## Where It Runs and How Someone Tries It

Primary deployment target: Render.

Planned services:
- one Next.js web service
- one Render Postgres 18 database
- one Render Key Value/Valkey 8 instance
- Render Workflows for async execution
- Render Cron only where periodic work is needed

The final demo must not depend on a fragile local-only environment. Local development remains supported, but the hackathon demo should use the deployed Render path if stable.

Exact start commands and environment variables will be finalized once ORM, authentication, AI provider, PayPal surface, and file storage are locked.

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

The only component allowed to hold/use PayPal payment credentials. It executes only from an authoritative ALLOW/approved state and enforces stable idempotency independent of policy reevaluation.

### MandateGate Assistant

Implements `prd.md > MandateGate Assistant Behavior`.

Read-oriented by default. It may prepare explicit action objects, but consequential actions require normal authorization and confirmation. Prepared actions become stale when relevant authoritative state changes.

### Trail Writer

Implements `prd.md > AI Security, Authority, and Traceability`.

Writes canonical append-only events for meaningful calls, routes, decisions, evidence, actions, and execution outcomes.

### Trail Integrity / Checkpoint Service

Implements `prd.md > AI Security, Authority, and Traceability`.

Builds per-event hash links and periodic Merkle checkpoints, then sends checkpoint commitments across an isolated signing/storage boundary.

MandateGate can verify locally but is not the sole trust anchor.

### Independent Trail Verifier

Recomputes event hashes and Merkle roots and checks checkpoint signatures and externally witnessed commitments without trusting current application state.

## Data Model

### Data access layer

- Drizzle ORM 0.44.7 stable
- node-postgres
- explicit SQL migrations committed to the repository

Drizzle is used as a thin typed data-access layer rather than as a substitute for PostgreSQL semantics. Security-sensitive invariants, transactional payment-state transitions, uniqueness/idempotency constraints, append-only trail constraints, and integrity-related database rules remain explicit and inspectable.

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
- integrity checkpoints

Operational tables are mutable according to application rules. Trail events are append-only by contract and cryptographically linked.

## File Structure

Provisional structure, refined after ORM/auth/AI/PayPal choices are locked:

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
│   ├── payments/                # state machine + executor
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
- Render Web Service
- Render Postgres
- Render Key Value / Valkey
- Render Workflows
- Render Cron where required

Still to lock before implementation:
- AI/model provider and document-analysis path
- exact PayPal API/SDK surface
- invoice/object storage
- signer/KMS boundary
- immutable archive target
- public/external checkpoint witness
- sponsor-tool integrations beyond Render

Every dependency must be rechecked against current official documentation before installation or implementation.

## Important Failure Modes

- **AI/model unavailable or malformed output** -> deterministic controls remain authoritative; requests that require missing evidence fail closed into escalation/denial.
- **Valkey unavailable** -> bypass cache and continue against authoritative state; never relax authorization.
- **PostgreSQL unavailable** -> do not move money.
- **Render Workflow failure** -> retry according to bounded policy; surface degraded state rather than pretending completion.
- **Trail verification mismatch** -> raise a first-class integrity incident and stop claiming affected trail history is verified.
- **PayPal execution uncertainty** -> reconcile using authoritative payment/idempotency identifiers before any retry.

## What Was Simplified and Why

- One TypeScript/Next.js codebase instead of early microservices: fastest route to a coherent hackathon POC.
- Render Workflows instead of BullMQ + custom worker/queue plumbing.
- Valkey remains cache-only instead of becoming a second operational datastore.
- Real external vendor re-verification provider remains simulated, as approved in the PRD.
- The security kernel, PayPal execution boundary, AI authority boundary, and trail-integrity model are not simulated.

## Decisions and Open Issues

Locked:
- TypeScript/Next.js-centric architecture
- Drizzle ORM 0.44.7 stable + node-postgres for data access
- Better Auth 1.7.7 for admin sessions and scoped organization API keys
- Node.js 24 LTS baseline
- PostgreSQL 18 authoritative operational database
- Render-centric deployment
- Render Key Value/Valkey 8 as non-authoritative cache
- Render Workflows for async/retryable work
- no BullMQ initially
- trail integrity separated from operational state
- MandateGate is not the sole verifier/trust anchor

Current useful uncertainty:
- the exact trust-boundary implementation for isolated checkpoint signing, immutable retention, and external witnessing remains deliberately unresolved until the specific services are selected and validated.

Open before approval:
- AI/model/document path
- PayPal surface
- object storage
- integrity signer/archive/witness
- remaining sponsor integrations
