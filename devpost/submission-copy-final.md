# MandateGate | Devpost submission copy (November 2026)

**Title:** MandateGate

**Tagline:** The payment firewall for autonomous AI agents.

**Project URL:** https://mandategate-web.onrender.com

**Source repository:** https://github.com/redasgard/mandategate (set to PUBLIC with MIT license before submission)

**Video:** [YouTube URL — to be inserted after upload and owner approval]

**Primary categories:** PayPal + AI, agentic commerce, business operations and security.
**Sponsor tools:** AG Grid (the payment-decision ledger), Render (hosting).

## Inspiration

An AI agent can read an invoice and recommend that it be paid. The dangerous part is letting that recommendation become permission to move money.

Businesses need to delegate routine accounts-payable work without giving every automation the keys to the payment account. A suspicious amount, an altered recipient or an unreliable document should stop at a boundary the model cannot talk its way past.

## What it does

MandateGate sits between operations agents and PayPal. An authorized agent can submit an invoice artifact or a structured payment request, but cannot directly invoke PayPal or change a vendor's trusted destination.

The application stores original invoice evidence with SHA-256 source hashes, uses GLM-5.3 Flash to generate **untrusted invoice observations** (extraction suggestions that cannot grant payment authority), and evaluates requests against independent vendor trust records, destination verification and amount-policy checks. The policy engine records three outcomes:

- **ALLOW** for routine requests within trusted vendor limits
- **ESCALATE** for anomalies requiring human review (with mandatory explanation)
- **DENY** for destination mismatches or trust violations

Each decision includes reason codes, supporting evidence, and a full audit trail.

The server-side PayPal Payouts Sandbox integration enforces durable request idempotency, tracks asynchronous payout state and handles signed webhook receipts for automated reconciliation.

## How we built it

Next.js, React, TypeScript, PostgreSQL (Neon), Drizzle ORM and Better Auth power the application. The payment adapter uses PayPal's REST Payouts API with server-side OAuth, stable logical-payment identifiers and webhook verification. AI observations come from GLM-5.3 Flash via Experiential Labs.

The service runs on Render. Automated CI covers isolated PostgreSQL 18 migrations, 572 unit/database/integration tests, authenticated browser flows (Playwright), mobile and desktop visual QA, and a full Next.js production build with 8-scene interactive demo recording.

## Hackathon progress

Built during the hackathon window:
- Invoice-derived payment lane: PDF upload → AI extraction → three-step verification (facts, supplier, policy) → PayPal Sandbox payout
- Unified operations shell with fixed sidebar across all pages
- Professional narrated demo video (2:46, US English neural TTS, captioned scenes)
- Human escalation review with mandatory decline explanation and database-proven zero-payout enforcement
- Payment-decision ledger (AG Grid Community): sortable, quick-filterable and paginated investigation surface, themed to the product shell
- Visual QA pipeline (13 viewport captures, desktop + mobile, overflow detection, populated-ledger assertion)
- 572 automated tests, typecheck, production build gate

## Challenges

The hard part was not generating invoice fields. It was proving who supplied an invoice, preserving its original bytes, preventing recipient substitution, rechecking authority immediately before execution, and dealing with payment states that can change after the initial API response. We deliberately keep an unresolved or unverified document from becoming a payment instruction.

## Accomplishments

- Deterministic ALLOW, ESCALATE and DENY decisions with persisted reason codes
- Scoped agent intake and original-invoice hashing
- Human investigation and vendor destination review controls
- PayPal Sandbox integration with idempotency and signed webhook/reconciliation
- Model-assisted invoice observations that cannot bypass the payment boundary
- Authenticated, responsive operational dashboard with isolated browser-tested demo paths
- Complete CI pipeline: 572 tests, visual QA, interactive demo recording

## What we learned

An agent's ability to interpret an invoice is not the same as authority to pay it. The critical design choice is to keep identities, destinations, monetary limits and execution privileges outside the language model.

## What's next

Complete independently established invoice-origin evidence, improve provider privacy assurances, and finish automatic execution under previously granted, bounded standing mandates.

## Tools used

- **PayPal Payouts REST API / Sandbox**: payout adapter, idempotency, remote status, verified webhooks and automated reconciliation
- **GLM-5.3 Flash (Experiential Labs)**: invoice-content observations and extraction suggestions; advisory only, cannot grant payment authority
- **AG Grid (Community, MIT)**: the payment-decision ledger on the investigation surface — sortable columns, quick filtering and pagination over the administrator's scoped records (themed to the product shell)
- **Render**: hosts Next.js application
- **Neon PostgreSQL**: persisted payment-request, decision, invoice, policy and authority records
- **Next.js / React / TypeScript / Better Auth / Drizzle**: application and authentication stack
- **Microsoft Edge neural TTS**: narrated demo voice-over (US English); ElevenLabs used for voice auditions, final cut rendered with a Microsoft Edge neural voice
- **Playwright**: automated browser testing and demo recording
