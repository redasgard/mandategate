# MandateGate Design

## Purpose

MandateGate is a zero-trust payment authority layer for companies running autonomous operations agents.

The MVP protects an operations agent that pays vendor invoices. The agent can submit payment requests, but it never receives direct payment authority or PayPal credentials. MandateGate owns the decision and executes approved payments.

## Core model

```text
Operations Agent
    |
    | invoice + metadata
    v
MandateGate API
    |
    +--> Invoice Understanding
    +--> Historical Context
    +--> Risk Analysis
    +--> Policy Engine
           |
           +--> ALLOW ------> PayPal execution
           +--> ESCALATE ---> Admin review
           +--> DENY -------> Stop
```

AI interprets documents and detects context. Deterministic policy grants authority.

## Trust boundaries

1. The operations agent is untrusted.
2. Invoice content is untrusted.
3. AI output is advisory, not authoritative.
4. MandateGate owns payment credentials and enforcement.
5. Payment destination data from invoices is never authoritative.

## Components

### Agent API

Receives invoice documents and request metadata from the operations agent.

### Invoice Analyzer

Extracts:

- vendor
- invoice number
- amount
- currency
- invoice and due dates
- line items
- payment destination
- extraction confidence

### AP Intelligence

Imports broader accounts-payable history, initially through CSV or ERP export.

Builds:

- vendor-specific baselines
- company-wide baselines
- invoice amount ranges
- payment cadence
- department/cost-center patterns
- approval thresholds
- duplicate and similarity context

### Policy Manager

Historical behavior produces proposed rules. An admin reviews and edits rules individually before activation.

```text
PROPOSED -> REVIEWED -> ACTIVE -> DISABLED
```

AI may propose authority. A human grants it.

### Decision Engine

Combines hard policy checks with behavioral risk signals.

Possible outcomes:

- `ALLOW`
- `ESCALATE`
- `DENY`

Primary MVP risk signals:

- near-duplicate invoices
- unusual invoice amount
- unusual cadence
- vendor behavior anomaly
- destination mismatch
- low-confidence extraction
- vendor identity mismatch

### Payment Executor

The only component allowed to execute PayPal payments.

The operations agent never receives PayPal credentials and cannot bypass a MandateGate decision.

## Payment request states

Normal payment:

```text
RECEIVED
-> ANALYZED
-> EVALUATED
-> ALLOWED
-> EXECUTING
-> PAID
```

Escalated payment:

```text
RECEIVED
-> ANALYZED
-> EVALUATED
-> ESCALATED
-> APPROVED
-> EXECUTING
-> PAID
```

Denied payment:

```text
RECEIVED
-> ANALYZED
-> EVALUATED
-> DENIED
```

An escalated payment requires an admin to approve or reject that specific payment. The one-time decision is recorded separately from standing policy.

## Vendor destination trust

Business email compromise is a primary threat.

A payment destination supplied by an invoice must match the independently maintained vendor profile.

```text
TRUSTED
-> CHANGE_DETECTED
-> REVERIFICATION_REQUIRED
-> VERIFIED
-> TRUSTED
```

A changed PayPal account, payment email, beneficiary, or other payment destination cannot become trusted through ordinary payment approval.

For the MVP, vendor re-verification is represented as an explicit, auditable out-of-band verification workflow. The external verification mechanism itself is simulated and clearly labeled.

## Request flow

1. Operations agent submits invoice PDF/image and request metadata.
2. MandateGate stores the original artifact and hashes it.
3. Invoice Analyzer extracts structured invoice facts.
4. Historical Context loads vendor and company baselines.
5. Risk Analysis evaluates anomalies.
6. Policy Engine evaluates active deterministic rules.
7. MandateGate produces a decision with structured reason codes.
8. `ALLOW` executes through PayPal.
9. `ESCALATE` enters the admin review queue.
10. `DENY` stops the request.
11. Result and evidence are returned to the operations agent.
12. Every meaningful state transition is appended to the audit trail.

## Failure behavior

MandateGate fails closed before money moves.

The request must escalate or deny when critical evidence is unavailable or inconsistent, including:

- low-confidence invoice extraction
- vendor cannot be matched reliably
- duplicate detection unavailable
- policy store unavailable
- payment destination mismatch
- malformed or inconsistent model output
- risk analysis timeout
- policy version changes during evaluation

## Idempotency

Retries must not create duplicate payments.

Each logical payment request uses a stable idempotency identity derived from immutable payment-request and invoice identity. Policy version is recorded as evaluation evidence but does not change the payment idempotency key, so reevaluation cannot turn a retry into a second payment.

## Explainability

Decision reasons are structured and machine-verifiable. A model may render a human-readable explanation, but it cannot invent the underlying decision evidence.

Example:

```json
{
  "decision": "ESCALATE",
  "reasons": [
    "amount 42% above vendor baseline",
    "92% similarity to invoice INV-1042 already paid",
    "invoice cadence inconsistent with historical pattern"
  ],
  "hard_policy_violations": [],
  "risk_score": 0.86
}
```

## Demo scenarios

### Case 1: normal invoice

- known vendor
- normal amount
- expected cadence
- trusted destination

Result:

```text
ALLOW -> PayPal sandbox payment succeeds
```

### Case 2: near-duplicate anomaly

- known vendor
- high line-item similarity to a recently paid invoice
- moderately increased amount
- otherwise legitimate-looking document

Result:

```text
ESCALATE -> admin rejects -> no payment
```

This is the primary attack/demo case because it demonstrates historical and behavioral reasoning rather than a trivial static rule.

### Case 3: destination mismatch

- legitimate-looking invoice
- changed payment destination

Result:

```text
DENY / REVERIFICATION_REQUIRED -> payment cannot execute
```

## Testing

### Unit

- policy evaluation
- state transitions
- idempotency
- duplicate similarity thresholds
- destination trust

### Invoice fixtures

- normal invoice
- near duplicate
- inflated amount
- malformed invoice
- low-confidence extraction

### Integration

```text
agent request -> MandateGate decision -> PayPal sandbox execution
```

### Adversarial

- misleading invoice content
- repeated submission
- payment retry
- destination substitution
- policy change during evaluation

## MVP success criteria

- operations agent cannot pay around MandateGate
- legitimate invoice produces a real PayPal sandbox transaction
- anomalous near-duplicate invoice does not
- decisions are explainable from structured evidence
- retries cannot create duplicate payments
- destination changes require vendor re-verification
- meaningful state transitions are auditable

## Non-goals for MVP

- live QuickBooks, NetSuite, or ERP connectors
- email ingestion
- real external vendor identity verification integration
- unrestricted LLM authority over payments
- broad procurement or consumer shopping workflows
- generalized financial SOC platform

## Next design decisions

The implementation plan still needs to choose:

- application stack
- model/provider for document understanding
- exact PayPal API surface
- persistence layer
- AP import schema
- operations-agent authentication
- deployment target
