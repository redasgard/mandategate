# MandateGate | Devpost submission copy (October 29, 2026)

**Title:** MandateGate

**Tagline:** The payment firewall for autonomous AI agents.

**Project URL:** https://mandategate-web.onrender.com

**Source repository:** https://github.com/redasgard/mandategate (currently PRIVATE; publish and set the correct default branch before submitting)

**Video:** NOT UPLOADED. A public YouTube URL is required and must not be fabricated.

**Primary categories:** PayPal + AI, agentic commerce, business operations and security.
**Implemented sponsor infrastructure:** Render. Do not select additional sponsor prizes without checking a completed, demonstrated integration and the prize-specific rules.

## Inspiration

An AI agent can read an invoice and recommend that it be paid. The dangerous part is letting that recommendation become permission to move money.

Businesses need a way to delegate routine accounts-payable work without giving every automation the keys to the payment account. A suspicious amount, an altered recipient or an unreliable document should stop at a boundary the model cannot talk its way past.

## What it does

MandateGate sits between operations agents and PayPal. An authorized agent can submit an invoice artifact or a structured payment request, but cannot directly invoke PayPal or change the vendor's trusted destination.

The application stores original invoice evidence, uses GLM-5.3 Flash to generate **untrusted invoice observations**, and evaluates requests against independent vendor, destination and amount-policy checks. The policy engine records three outcomes: ALLOW for routine requests, ESCALATE for anomalies requiring human review, and DENY for destination mismatches. Decisions include reason codes and supporting evidence.

The server-side PayPal Payouts Sandbox integration enforces durable request idempotency, tracks asynchronous payout state and handles signed webhook receipts. A separately documented earlier Sandbox payout reached SUCCESS and was reconciled. That historical payout is **not** evidence that one of the currently displayed AI-reviewed PDFs was paid.

For judging, the running app shows real persisted synthetic decision records, document review, trust controls and payment evidence. No production money or real supplier documents are required.

## How we built it

Next.js, React, TypeScript, PostgreSQL, Drizzle and Better Auth power the application. The payment adapter uses PayPal's REST Payouts API with server-side OAuth, stable logical-payment identifiers and webhook verification. AI observations come from GLM-5.3 Flash via Experiential Labs, but the model cannot grant payment authority.

The service runs on Render and the operational database is on Neon PostgreSQL. Automated CI covers isolated PostgreSQL migrations, policy/authorization and integration tests, authenticated browser flows, mobile and desktop layouts, and the Next.js production build.

## Challenges

The hard part was not generating invoice fields. It was proving who supplied an invoice, preserving its original bytes, preventing recipient substitution, rechecking authority immediately before execution and dealing with payment states that can change after the initial API response. We deliberately keep an unresolved or unverified document from becoming a payment instruction.

## Accomplishments

- Deterministic ALLOW, ESCALATE and DENY decisions with persisted reason codes.
- Scoped agent intake and original-invoice hashing.
- Human investigation and vendor destination review controls.
- PayPal Sandbox integration with idempotency and signed webhook/reconciliation paths.
- Model-assisted invoice observations that cannot bypass the payment boundary.
- An authenticated, responsive operational dashboard and isolated browser-tested demo paths.

## What we learned

An agent's ability to interpret an invoice is not the same as authority to pay it. The critical design choice is to keep identities, destinations, monetary limits and execution privileges outside the language model.

## What's next

Complete independently established invoice-origin evidence and the verified PDF-to-Sandbox payout chain, improve provider privacy assurances, and finish automatic execution under previously granted, bounded standing mandates. Optional search, scheduling and external trail anchoring remain future work, not demonstrated hackathon functionality.

## Required honesty note for judges

This is a working security-focused beta, not a claim of completed unattended invoice settlement. The hosted synthetic ALLOW/ESCALATE/DENY cases are **separate** from both the saved GLM document observations and the earlier successful PayPal Sandbox transaction. The current invoice-derived T2/T3/T4 authorization path and full end-to-end payment proof are not yet verified. A fictional test issuer or synthetic consent is never represented as an authenticated real supplier. See `devpost/final-release-gate-20261029.md`.

## Tools to list on Devpost

- **PayPal Payouts REST API / Sandbox**: payout adapter, idempotency, remote status, verified webhooks. Earlier independently verified Sandbox success; new invoice-derived payout pending.
- **GLM-5.3 Flash (Experiential Labs)**: invoice-content observations and extraction suggestions; advisory only.
- **Render**: hosts Next.js app and isolated validation services.
- **Neon PostgreSQL**: persisted payment-request, decision, invoice, policy and authority records.
- **Next.js / React / TypeScript / Better Auth / Drizzle**: application and authentication stack.

Do not list Qwen, Jev, Laya, Base Sepolia anchoring, Bryntum, Elastic, Zapier MCP or AG Grid as functional completed sponsor integrations until independently validated in the submitted build.
