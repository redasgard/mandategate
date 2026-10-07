---
doc: prd
status: approved
---

# MandateGate — Product Requirements

One line: a zero-trust payment control platform for companies running autonomous operations agents.
Source: `scope.md > The Unique Kernel`, `scope.md > Who It's For`.

## The Core Journey

Source: `scope.md > The Core Loop`, `scope.md > What "Working" Looks Like`.

1. An operations agent submits a real vendor invoice to MandateGate.
2. MandateGate analyzes the invoice, vendor history, payment behavior, trusted destination, and active policy.
3. MandateGate produces one of three outcomes:
   - ALLOW
   - ESCALATE
   - DENY
4. Allowed payments move into execution.
5. Escalated payments appear prominently for admin review.
6. Blocked/denied payments remain stopped and show why.
7. The admin can inspect the evidence, detection source, and reasoning behind any consequential decision.
8. For an escalation, the admin accepts or declines it, supplies a required explanation, and may attach supporting evidence.
9. An accepted escalation executes immediately by default, but the admin can schedule it for later before confirming.
10. Every consequential action is recorded in the activity history.
11. The admin can use the MandateGate Assistant to investigate the system or prepare actions for explicit confirmation.

Success is visible when the same platform:
- pays a normal invoice,
- escalates a subtle anomalous invoice without paying it,
- blocks a destination mismatch,
- and makes every decision understandable and auditable.

## Screens and Layout

Source: `scope.md > The POC Boundary`, `scope.md > Platform Boundary`.

### Dashboard

The first screen after sign-in.

It answers two questions immediately:

1. What is happening with company money?
2. What requires my attention right now?

The dashboard shows:
- current available balance
- total spent for the current period
- upcoming payments
- overdue payments
- escalations awaiting review
- blocked payments
- recent payment activity

Escalations and blocks are visually prioritized over routine activity.

### Payments

The operational view of payment requests and invoices.

It shows payment records across relevant states such as:
- pending
- scheduled
- paid
- overdue
- escalated
- blocked
- declined

The user can open an individual record to inspect its invoice, evidence, decision, and history.

A time-oriented view may expose upcoming and overdue obligations as long as it serves the same Payments surface rather than becoming a separate product area.

### Vendors

The trusted vendor directory.

Each vendor view shows:
- identity
- trusted payment destination
- verification state
- normal payment behavior
- normal amount range
- normal cadence
- recent invoices and payments
- anomalies
- re-verification status

A changed destination must be visible as a trust event, not silently merged into the vendor profile.

### Policies

The control surface for standing payment authority.

It shows:
- inferred rules awaiting review
- active rules
- disabled rules
- vendor-specific rules
- company-level rules and thresholds

Admins can review and edit proposed rules before activation.

### Activity

A chronological audit view of meaningful events, including:
- agent payment requests
- invoice analysis
- detections
- policy decisions
- escalations
- admin decisions
- explanations
- attachments
- vendor trust changes
- payment execution outcomes

### MandateGate Assistant

A persistent assistant available across the primary product surfaces rather than a separate top-level destination.

It can:
- answer questions about payments, vendors, policies, and activity
- explain why a payment was allowed, escalated, or denied
- summarize current escalations or spend
- compare current behavior with historical behavior
- find relevant payments, vendors, or policy events
- prepare administrative actions for confirmation

It cannot silently commit consequential actions.

## Look and Feel

Source: `scope.md > Inspiration & Identity`.

MandateGate should feel like a serious financial-security control rather than a generic AI dashboard.

Established visual direction:
- warm, minimal, Norse-inspired identity
- dark charcoal foundation
- amber and muted gold/copper accents
- subtle Scandinavian geometry
- restrained, direct, explainable presentation
- urgent events visible without turning the interface into a wall of alarm colors

Avoid:
- neon cyberpunk styling
- generic purple AI gradients
- excessive cards with vanity metrics
- chatbot-first layouts that hide the actual control surface

## Dashboard Behavior

Source: `scope.md > The Core Loop`.

The dashboard prioritizes unresolved risk.

- Escalations awaiting action are clearly visible.
- Blocked payments are clearly visible.
- Financial summary shows balance, spend, upcoming payments, and overdue items.
- Recent activity provides enough context to understand what just changed.
- Clicking an escalation or block opens its detailed decision view.

Acceptance criteria:
- [ ] An admin can identify pending escalations without navigating away from the dashboard.
- [ ] An admin can identify blocked payments without navigating away from the dashboard.
- [ ] Balance, spend, upcoming payments, and overdue obligations are visible at a glance.
- [ ] A consequential notification links directly to the affected payment or vendor context.

## Payment Detail and Decision Evidence

Source: `scope.md > What "Working" Looks Like`, `scope.md > Platform Boundary`.

Every escalation or block detail view must show:
- short title
- detailed explanation
- decision reason
- how the issue was found
- who or what found it
- evidence used
- resulting action

Detection attribution should distinguish meaningful sources such as:
- invoice analysis
- behavioral analysis
- policy evaluation
- vendor trust check
- admin action

The explanation must make it possible to reconstruct why MandateGate reached the outcome instead of presenting an unexplained score.

Acceptance criteria:
- [ ] An admin can see the primary reason for the decision.
- [ ] The detail view identifies the detecting source.
- [ ] The detail view explains how the finding was produced.
- [ ] Evidence supporting the finding is visible or linked.
- [ ] The action taken by MandateGate is explicit.

## Escalation Review

Source: `scope.md > The Core Loop`.

An admin can:
- Accept
- Decline

For both outcomes:
- explanation is required
- file attachment is optional

If accepted:
- execute immediately is the default
- the admin may instead choose a later execution date/time before confirmation

The final confirmation clearly shows the action that will occur.

Acceptance criteria:
- [ ] Accept cannot complete without an explanation.
- [ ] Decline cannot complete without an explanation.
- [ ] An attachment can be included but is not required.
- [ ] Immediate execution is selected by default after acceptance.
- [ ] The admin can choose delayed/scheduled execution before confirming.
- [ ] The final decision, explanation, attachment reference, admin identity, timestamp, and execution choice appear in Activity.

## Vendor Trust and Re-verification

Source: `scope.md > What "Working" Looks Like`.

Invoice-supplied payment destination data does not automatically change trusted vendor information.

If a destination differs from the trusted profile:
- the payment is stopped
- the difference is clearly explained
- the vendor enters re-verification-required state
- ordinary payment approval cannot make the new destination trusted

The POC may represent the external verification step explicitly without pretending it is a real third-party verification service.

Acceptance criteria:
- [ ] A destination mismatch is visible as a vendor-trust issue.
- [ ] The associated payment cannot execute through ordinary escalation approval.
- [ ] The vendor shows re-verification-required status.
- [ ] A verified destination change is recorded in Activity.

## Policy Review

Source: `scope.md > The Core Loop`, `scope.md > The POC Boundary`.

Historical behavior can produce proposed standing rules.

Admins can:
- inspect a proposed rule
- understand what historical behavior led to it
- edit the rule
- activate it
- disable an active rule

A proposal has no authority until an admin activates it.

Acceptance criteria:
- [ ] Proposed and active rules are visibly different states.
- [ ] A proposed rule shows why it was suggested.
- [ ] An admin can modify a proposed rule before activation.
- [ ] No proposed rule affects payment authority before activation.

## MandateGate Assistant Behavior

Source: `scope.md > Platform Boundary`.

The assistant is a conversational interface over MandateGate's authoritative data and controls.

It can answer questions such as:
- Why was this invoice escalated?
- Show blocked payments caused by destination changes.
- What changed with this vendor?
- How much are we expected to spend next week?
- Which vendors have overdue invoices?
- Summarize today's escalations.

It can also prepare actions such as:
- approve or decline an escalation
- schedule an accepted payment
- prepare a policy edit
- prepare a vendor-state change
- prepare a block

Prepared actions must show what will change before confirmation.

The assistant may not directly commit a consequential action.

For consequential actions, the normal confirmation flow applies and an explanation is required where the action changes payment authority, vendor trust, payment outcome, or standing policy.

Non-consequential actions such as navigation, filtering, summarization, and ordinary queries do not require an explanation.

Acceptance criteria:
- [ ] The assistant can explain a decision using MandateGate evidence.
- [ ] The assistant can prepare at least one consequential action.
- [ ] A prepared consequential action does not take effect before explicit admin confirmation.
- [ ] The confirmation shows the proposed effect.
- [ ] Required explanation rules remain enforced when the action originated in chat.


## AI Security, Authority, and Traceability

AI security is a cross-cutting product requirement, not a chatbot-only concern.

MandateGate treats all AI-mediated inputs and outputs as untrusted until validated against authoritative product state.

### Authority boundary

AI may:
- observe
- interpret
- infer
- explain
- summarize
- recommend
- prepare actions

AI may not itself:
- approve or decline payments
- change standing policy
- trust a new vendor destination
- bypass a block
- execute or schedule a consequential payment action
- alter authoritative audit history

A consequential action is committed only through MandateGate's normal confirmation and authorization flow.

### Prompt-injection and untrusted-content boundary

The following are treated as data, never as authority:
- chat input
- invoice text
- OCR output
- attachments
- imported AP history
- vendor notes
- retrieved records
- sponsor-tool output
- externally fetched content

Instructions embedded inside untrusted content must not override MandateGate policy, system authority, or confirmation requirements.

### Prepared-action boundary

Assistant-prepared actions must be explicit objects with:
- proposed action
- target
- current state
- evidence consulted
- policy/risk context
- expected resulting state
- whether explanation is required
- whether explicit confirmation is required

If relevant state changes before confirmation, the prepared action becomes stale and must be regenerated before it can be confirmed.

### Provenance and explanation

The product distinguishes:
- observed facts
- inferred findings
- policy results
- AI-generated explanations
- human decisions

A human-readable explanation may be regenerated, but original reason codes, evidence references, policy context, and decision inputs remain attached to the event that produced the decision.

### POC trail-integrity model

MandateGate will demonstrate tamper-evident consequential trails without turning the hackathon into a storage-compliance procurement exercise.

The POC implements:

1. canonical append-only events
2. per-event hash chaining
3. periodic Merkle checkpoints over explicit event ranges
4. checkpoint signatures using a dedicated MandateGate signing key
5. periodic anchoring of checkpoint commitments to an external public timestamp/witness
6. an independent verifier that can recompute event hashes, chain continuity, Merkle roots, checkpoint signatures, and external anchors

The external witness stores only cryptographic commitments and minimal checkpoint metadata, never invoice contents, vendor data, amounts, explanations, or other sensitive business records.

The POC explicitly distinguishes:

- **local integrity**: does the current trail match its internal hash chain and checkpoint?
- **anchored integrity**: does the checkpoint match a commitment outside MandateGate?
- **recoverability**: can deleted underlying evidence be restored independently?

The POC proves the first two. It does **not** claim production-grade independent recoverability before a separate immutable archive is deployed.

A primary-database/application compromise after an external checkpoint is anchored must not permit silent rewriting of the anchored history. Events newer than the latest external anchor are an acknowledged POC limitation and are shown as pending external anchoring rather than falsely represented as fully externally verified.

#### Production hardening recommendation

A real deployment should add an independent WORM archive using S3-compatible Object Lock `COMPLIANCE` mode or equivalent immutable retention, with credentials and administrative ownership separated from the MandateGate application.

For stronger malicious-admin resistance, production should also move checkpoint signing outside the normal application authority boundary and optionally obtain synchronous external receipts for consequential events so the unanchored-tail window approaches zero.

Those controls are recommended production architecture, not mandatory hackathon infrastructure.

Acceptance criteria:
- [ ] Event modification breaks verification.
- [ ] Event deletion or truncation breaks local verification.
- [ ] Event reordering or replacement breaks verification.
- [ ] Recomputed Merkle roots can be checked against signed checkpoints.
- [ ] At least one checkpoint commitment is independently anchored outside MandateGate's application datastore.
- [ ] Trail verification can be performed independently of the current MandateGate UI/backend.
- [ ] The UI/verifier distinguishes locally verified, externally anchored, pending-anchor, incomplete, and broken history.
- [ ] Sensitive business data is not published to the external witness.
- [ ] The documentation clearly states that independent WORM recoverability is a production hardening recommendation, not a POC claim.

## Product Decisions

- Dashboard is the landing surface because admins need money position and urgent intervention state immediately.
- Escalations and blocks take visual priority over routine payments.
- Dashboard financial summary includes spend, balance, future payments, and overdue obligations.
- Escalation/block detail must show what happened, why, how it was found, and who/what detected it.
- Escalation review supports Accept and Decline.
- Explanation is mandatory for both escalation outcomes; attachment is optional.
- Accepted escalations execute immediately by default but can be scheduled by the admin.
- Primary navigation is Dashboard, Payments, Vendors, Policies, and Activity.
- AI assistance is persistent across the product rather than replacing the product with a chatbot.
- The assistant can prepare actions, but an authenticated admin must explicitly confirm consequential actions.
- Explanations are required only for consequential actions.
- POC tamper evidence is layered: hash-chained events, Merkle checkpoints, checkpoint signatures, and periodic external anchoring. Independent WORM retention and isolated signing are production hardening recommendations.
- MandateGate can verify trails locally, while externally anchored checkpoints provide the POC's independent trust reference.

## What We're Building

The POC must provide:
- dashboard with financial summary and urgent notifications
- payments view
- payment/escalation detail
- vendor trust view
- policy review and activation
- activity/audit view
- persistent MandateGate Assistant
- escalation accept/decline flow with mandatory explanation
- optional evidence attachment
- immediate or scheduled execution choice after acceptance
- destination-mismatch/re-verification experience
- visible normal-payment success path
- visible anomaly escalation path
- visible blocked destination-change path

## Deferred From the POC

- production-grade independent WORM archive / immutable recoverability
- isolated external checkpoint signer and synchronous per-event witness receipts

- full accounting or ERP product features
- live QuickBooks/NetSuite integrations
- full user/role administration suite
- complete reporting/BI module
- real third-party vendor identity verification
- email ingestion
- multiple payment rails
- autonomous assistant execution without explicit confirmation

## Possible Later Enhancements

- richer spend forecasting
- department and cost-center views
- configurable multi-person approval chains
- policy simulation before activation
- external accounting integrations
- richer assistant actions with scoped delegated authority
- organization-wide finance/security analytics

## Non-Goals

Source: `scope.md > Explicitly Cut`.

- Consumer shopping workflows.
- Direct payment authority for external operations agents.
- Unrestricted LLM authority over payments or policy.
- Live accounting-system integration in the POC.
- Real external vendor-verification provider integration.
- Email-based invoice ingestion.
- Rebuilding commodity infrastructure that a suitable sponsor tool can provide, as long as MandateGate retains its own authorization semantics and control model.

## Open Questions

No remaining product-defining question currently blocks `4-spec`.

Implementation choices, sponsor-tool mapping, persistence, model/provider choices, exact PayPal API surface, authentication, and deployment belong in `4-spec`.
