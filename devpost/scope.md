---
doc: scope
status: approved
---

# MandateGate

One line: a zero-trust payment authority layer for companies running autonomous operations agents.

## The Unique Kernel

MandateGate separates AI reasoning from financial authority. Operations agents can request payments, but MandateGate independently evaluates invoice context, behavioral risk, and approved policy before it can move money.

AI may interpret and propose. Deterministic policy decides. MandateGate alone executes the PayPal payment.

## Who It's For

Companies using autonomous operations agents to process and pay vendor invoices.

The operations agent handles normal AP work, but the company still needs a trustworthy boundary between machine-generated payment intent and actual money movement.

## The Core Loop

An operations agent submits a real vendor invoice to MandateGate.

MandateGate extracts the invoice, compares it with historical AP behavior and active policy, evaluates risk, and returns one of three outcomes:

- ALLOW -> execute the PayPal payment
- ESCALATE -> require one-time admin approval or rejection
- DENY -> stop the payment

Admins also review inferred policy rules before activating them.

## Inspiration & Identity

The product should feel like a security control rather than another finance dashboard: restrained, direct, and explainable.

Visual direction: warm, minimal, Norse-inspired design with dark charcoal, amber, muted gold/copper, and subtle Scandinavian geometry.

The core message is: **the firewall between AI agents and your money.**

## Why This Matters to the Learner

The project sits at the intersection of AI security, authorization, and real financial action. The interesting problem is not teaching an agent how to pay. It is enforcing what the agent is actually allowed to pay when the agent, invoice, or surrounding context may be wrong or manipulated.

## What "Working" Looks Like

A real operations agent submits a real invoice document through the MandateGate API.

The PayPal AI Hackathon application must prove these real, inspectable outcomes:

1. a normal known-vendor invoice is analyzed, allowed, and paid through PayPal Sandbox;
2. a subtle near-duplicate or unusual-amount invoice is detected from historical context, escalated, and rejected without payment;
3. a changed payment destination is denied and placed into vendor re-verification rather than being approved as an ordinary exception.

The compelling moment is seeing an invoice that looks legitimate get stopped because MandateGate recognizes that it does not fit the company's established payment behavior.

## Hackathon Release Boundary

The PayPal AI Hackathon is the **current primary product and shipping milestone**. A production or enterprise-readiness track is not in scope. Complete AI invoice analysis, policy decisions, a real PayPal Sandbox payout and verified webhook reconciliation before treating the core implementation as finished.

P0, P1, and P2 are all in scope for the November hackathon release. The tiers control build order and emergency cut priority only. Nothing in P1 or P2 may destabilize P0.

### P0 — release blockers

- operations-agent API submission of PDF/image invoices
- invoice extraction and structured facts
- AP history import from CSV/ERP export
- vendor-specific and company-wide behavioral context
- deterministic ALLOW / ESCALATE / DENY decisions
- near-duplicate and unusual-amount detection
- trusted vendor payment-destination enforcement
- simulated out-of-band vendor re-verification workflow
- one complete admin escalation accept/decline path
- permanent payment idempotency
- real PayPal Sandbox payment execution
- structured reason/evidence trail
- coherent invoice → AI → decision → PayPal execution experience
- three risk-policy cases with real reason codes; each only pays when separately authorized

### P1 — planned hackathon features

- persistent MandateGate Assistant
- inferred policy review/edit/activation
- scheduled payments
- Base Sepolia checkpoint witness and independent verification
- AG Studio / AG Grid investigation surface
- Bryntum payment timeline

### P2 — planned integrations and differentiation

- Elastic search, similarity, and trail investigation
- Zapier MCP external operations-agent path
- Postman public collection/workspace
- Qwen challenger routing
- Jev bounded-decision/security evaluation
- Laya comparison
- sponsor evidence and integration polish


## Platform Boundary

MandateGate is the product, not a thin orchestrator over sponsor services.

MandateGate owns the domain semantics that create durable value:

- payment mandate and authority model
- vendor trust and destination state
- policy lifecycle and admin approval
- invoice normalization and canonical payment request
- decision semantics and reason codes
- ALLOW / ESCALATE / DENY enforcement
- idempotency and payment execution boundary
- audit/event model and decision provenance

Sponsor tools should provide replaceable capabilities around that core. They may supply storage, search, UI, deployment, scheduling, integrations, agent runtime, or developer tooling, but they must not own the meaning of a MandateGate decision or the authority to bypass it.

A useful rule for the architecture: **replacing a sponsor tool may change implementation, performance, or UX, but it should not change what MandateGate means or who is allowed to move money.**

## Sponsor Strategy

Use as many sponsor tools as make the product better or materially reduce implementation work, without creating fake features solely for prize eligibility.

Likely fits:

- AG Grid for the admin investigation and policy/risk surface
- Elastic for invoice similarity, history, anomaly context, and audit search if it proves useful
- Render for backend, workers, and deployment if it remains the best runtime fit
- APIMatic for PayPal integration tooling
- Bryntum for due-date, review, and payment-risk timelines if the calendar view adds real operational value
- Zapier as one external operations-agent/integration path
- Postman for the public/testable MandateGate API
- Astropods only if it materially improves the external agent runtime

Sponsor integrations remain subordinate to the core MandateGate authorization and payment-control model.

## Post-Hackathon Product Roadmap

These remain part of the broader MandateGate product direction but are not targeted for the November release:

- live QuickBooks, NetSuite, or ERP integrations
- email ingestion
- real external vendor identity/re-verification integrations
- richer anomaly models
- multiple payment rails
- broader procurement and agent-to-agent commerce
- organization-wide finance/security observability
- production-grade WORM recoverability and isolated signing infrastructure

## Explicitly Cut

- consumer shopping-agent workflows, because the MVP is enterprise AP
- direct payment authority for the operations agent, because it defeats the trust boundary
- unrestricted LLM payment decisions, because AI output is advisory rather than authoritative
- live accounting-system connectors, because CSV/ERP export proves the historical-policy concept with far less integration cost
- real external vendor verification providers, because the simulated workflow proves the trust-state transition for the hackathon release
- email ingestion, because API-submitted invoice documents keep the primary path focused
