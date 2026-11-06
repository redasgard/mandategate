# MandateGate — Devpost "Project Story" (final)

## Inspiration

AI agents are rapidly moving from assistants that recommend actions to systems that can take actions on a user's behalf — including making purchases and initiating payments.

That creates a new trust problem:

**What happens when an AI agent is manipulated, misunderstands the user's intent, or attempts a transaction outside the authority it was actually given?**

Traditional payment controls are designed around humans explicitly authorizing transactions. Agentic commerce introduces a new layer between human intent and payment execution.

MandateGate is our answer to that gap.

## What it does

**MandateGate is a zero-trust authorization layer for AI-driven payments.**

It sits between an autonomous AI agent and PayPal and evaluates each proposed financial action against delegated authority before allowing a transaction to proceed.

A mandate bounds an agent's authority: which suppliers it may pay, which trusted destinations are allowed, what amount limits and vendor baselines apply, what source evidence must exist, and when a human must explicitly approve.

MandateGate then evaluates a proposed transaction and records one of three outcomes:

**Allow** — the transaction matches the delegated authority and can proceed.

**Escalate** — the action is ambiguous or requires explicit human confirmation.

**Deny** — the transaction violates the mandate or is inconsistent with trusted records.

Every decision carries persisted reason codes and an audit trail. The goal is simple:

> **Put a firewall between AI agents and your money.**

## Example

Picture the consumer version of this problem. A user tells an AI agent:

> Find me a mechanical keyboard from a reputable merchant for no more than $150 and buy it.

The agent later attempts a $637 transaction containing three keyboards and an additional service after encountering manipulated merchant content. Without an independent authorization boundary, the payment agent may simply execute it. MandateGate compares the proposed payment to the original mandate, detects the authority violation, blocks the transaction, and explains why. A legitimate $129 purchase that satisfies the mandate can then proceed through PayPal.

For this hackathon we built and demonstrated the enterprise face of the same boundary — where the evidence and the money are real: **operations agents and vendor invoices**. An authorized agent submits an invoice; an AI model reads it as an untrusted observation; deterministic checks evaluate the vendor's trust record, the payment destination and the amount against policy; an anomalous amount is escalated to a human who declines it with a written reason; and an approved invoice proceeds to a real PayPal Sandbox payout, reconciled to PAID. All of it is shown on camera in the demo video.

## Why AI matters

This is not just a static spending-limit system. Human instructions are often contextual — "buy something nice around $70", "renew this if the price hasn't changed much". MandateGate's design splits responsibility deliberately: AI interprets unstructured input (documents, descriptions, risk signals), while deterministic policy boundaries remain responsible for the hard financial constraints. The model proposes observations; it never approves payments. This lets the system surface cases that simple numeric rules cannot capture while keeping payment authority explicitly bounded.

## Why PayPal matters

PayPal is the execution layer for the payment flow rather than a checkout button at the end of a demo:

**Human intent → AI agent → authorization mandate → risk evaluation → PayPal transaction**

The shipped integration uses the **PayPal Payouts REST API in Sandbox** end to end — server-side OAuth, durable request idempotency, tracked asynchronous payout state, signed webhook receipts and automated reconciliation. The submission video shows a real invoice-derived payout (USD 1.01, batch `8H4CEWS6ZBVZE`, item `PNMP9YWACK74E`) reaching **PAID**, executed under a single-POST fence after explicit human approval.

## Security model

MandateGate assumes the commerce agent itself may be wrong or compromised, so the authorization layer evaluates the transaction independently rather than trusting the agent's reasoning. The shipped system addresses risks including:

- prompt injection from document or merchant-controlled content (AI observations cannot alter trust records)
- unauthorized amount or recipient changes
- merchant substitution (a changed payment destination is blocked)
- spending-limit and vendor-baseline violations
- excessive delegated authority (scoped agent keys, explicit approval gates)

Every decision is explainable and observable: you can see what was requested, what the agent attempted, and why the payment was allowed, escalated or rejected.

## What we built (during the hackathon window)

One complete, judge-visible flow, end to end:

1. Operations agent submits an invoice (scoped API key) or a structured payment request.
2. The original file is stored with its SHA-256 source hash; an AI model extracts fields as untrusted observations.
3. Deterministic checks evaluate vendor trust, trusted destination, amount baselines, and AP history.
4. Unsafe actions are blocked or escalated — the video shows both a denied destination mismatch and a human decline.
5. A human approves the frozen payment tuple for the one settled case.
6. Exactly one PayPal Sandbox payout executes and reconciles to PAID.
7. Every step lands in one auditable ledger with reason codes (AG Grid).

Evidence: 572 automated tests, typecheck and production-build gates, a visual-QA pipeline with populated-ledger assertions on desktop and mobile, the live settlement above, and the narrated 2:51 demo video.

## Challenges

The hardest part is defining the boundary between AI reasoning and deterministic financial authorization. An AI model is useful for understanding ambiguous human input, but it should never be able to reinterpret its own spending authority. We treat the AI layer strictly as an interpreter and risk signal while hard authorization constraints stay explicit and independently enforceable.

The second challenge is proving the facts, not just reading them: who supplied an invoice, whether its bytes are original, whether the recipient matches the trusted record, and what to do when a payout's outcome is uncertain. The system never retries a payment whose result is unknown — it reconciles read-only and fails closed.

## Where we want to take it

The same model applies well beyond this MVP:

- richer mandate constraints for consumer agents: categories, quantity and price tolerances, recurring-payment permissions, expiration
- enterprise procurement agents and delegated corporate spending
- SaaS subscription management and autonomous contractor payments
- agent-to-agent commerce and machine-to-machine payments

As AI systems gain authority over real financial actions, we believe payment authorization needs to become as explicit and inspectable as permissions in modern computing.

**Agents can reason. MandateGate decides what they are actually allowed to spend.**
