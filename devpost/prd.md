---
doc: prd
status: draft
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

### Locked trail-integrity model

MandateGate will use a layered integrity model for consequential trails:

1. canonical append-only events
2. per-event hash chaining
3. periodic Merkle checkpoints over event batches
4. checkpoint signing by a signer outside the normal application authority boundary
5. independently retained immutable/WORM archive copies
6. periodic anchoring of signed checkpoint commitments to a public blockchain or equivalent external witness

The blockchain/external witness stores only cryptographic commitments and minimal checkpoint metadata, never invoice contents, vendor data, amounts, explanations, or other sensitive business records.

MandateGate may verify its own local chain continuously, but MandateGate is not the sole trust anchor. A verifier must be able to recompute event hashes and Merkle roots and compare them against signed checkpoints and externally witnessed commitments without trusting the current MandateGate application state.

The product must distinguish:

- **integrity**: does the current trail match the committed history?
- **authenticity**: was the checkpoint signed by the expected signer?
- **availability/recoverability**: can the underlying evidence still be recovered from an independent immutable copy?
- **external witness**: does an independently held commitment prove that the checkpoint existed before any later compromise?

A primary-database or application compromise may cause disruption or deletion, but must not permit silent historical rewriting without detectable integrity failure.

Acceptance criteria:
- [ ] Event modification breaks verification.
- [ ] Event deletion or truncation breaks verification.
- [ ] Event reordering or replacement breaks verification.
- [ ] Recomputed Merkle roots can be checked against signed checkpoints.
- [ ] Checkpoint signatures are verifiable independently of the application.
- [ ] At least one immutable copy exists outside the primary application datastore.
- [ ] At least one externally witnessed checkpoint commitment exists outside MandateGate's administrative trust boundary.
- [ ] Trail verification can be performed independently of the current MandateGate UI/backend.
- [ ] Sensitive business data is not published to the external witness.

### Comprehensive logging and tamper-protected trails

Every meaningful control-flow event must be logged, and every consequential trail must be protected against silent modification, not only through the admin UI but against compromise of the application or primary datastore.

The product requirement is stronger than ordinary append-only logging:

- existing trail records cannot be silently edited
- corrections are represented as new events
- deletion, truncation, reordering, or replacement of historical events must be detectable
- compromise of the primary application/database must not be enough to rewrite history without detection
- the product must preserve independent integrity evidence outside the mutable primary trail
- payment, policy, vendor-trust, AI-decision, admin-action, routing, and execution histories are all covered by the same integrity requirement
- a verifier must be able to detect a broken or incomplete chain of custody
- trail integrity status itself must be visible and auditable

The exact cryptographic/storage mechanism belongs in `4-spec`. Acceptable implementation directions may include cryptographic event chaining, signed checkpoints, write-once retention, independently stored integrity proofs, Merkle commitments, or external anchoring. A blockchain may be used as an external integrity anchor, but MandateGate does not require all audit data to live on-chain.

Every meaningful control-flow event must be logged, including:
- every inbound API call
- every assistant request
- every internal service/tool call that affects analysis or control flow
- every decision
- every route taken
- every policy evaluation
- every vendor-trust check
- every anomaly/risk evaluation
- every prepared action
- every admin confirmation or rejection
- every payment execution attempt and result
- every re-verification transition
- every degraded/fallback path
- every authorization failure
- every AI/model invocation relevant to a decision

The product must make it possible to reconstruct the complete path of a payment request from intake through final state.

For each logged event, the product should preserve enough context to answer:
- what happened
- when it happened
- who or what initiated it
- which route/component handled it
- what evidence or inputs were used
- what decision/result was produced
- what state existed before and after
- what downstream action followed

The assistant may summarize these logs, but cannot alter them.

Acceptance criteria:
- [ ] A payment request can be traced end-to-end across all major processing steps.
- [ ] Admin-confirmed and AI-prepared actions are distinguishable.
- [ ] A consequential decision shows its evidence and route history.
- [ ] Internal routing/fallback choices are visible in the activity/audit history.
- [ ] AI/model calls relevant to a decision are traceable to that decision.
- [ ] Failed and denied paths are logged with the same rigor as successful ones.
- [ ] Historical trail edits, deletions, truncation, reordering, or replacement are detectable.
- [ ] Compromise of the primary application/database alone is insufficient to silently rewrite the authoritative trail.
- [ ] Corrections are represented as new events rather than mutations of prior evidence.
- [ ] Trail integrity can be independently verified and its status is visible.

## Activity and Accountability

Source: `scope.md > Platform Boundary`.

Activity is the human-readable record of important state changes.

For consequential actions it records:
- what happened
- who or what initiated it
- who confirmed it where applicable
- why it happened
- when it happened
- evidence or attachment references
- resulting payment/vendor/policy state

Acceptance criteria:
- [ ] An admin can trace an escalation from detection through final disposition.
- [ ] Admin explanations are visible in the resulting history.
- [ ] Assistant-prepared actions remain distinguishable from admin-confirmed actions.
- [ ] Payment execution success or failure is visible.

## States and Boundaries

- **Normal** — no unresolved intervention is required.
- **Escalated** — admin review is required before payment can proceed.
- **Blocked/Denied** — payment is stopped.
- **Scheduled** — an approved payment is queued for later execution.
- **Overdue** — an expected obligation has passed its due point without completion.
- **Re-verification required** — vendor trust must be re-established before the affected destination can be used.
- **Payment failed** — an authorized execution attempt did not complete; failure is visible and not represented as paid.
- **No urgent items** — dashboard still shows balance, spend, upcoming payments, overdue status, and recent activity rather than an empty screen.

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
- Tamper protection is layered: hash-chained events, Merkle checkpoints, isolated checkpoint signatures, immutable independent retention, and periodic external anchoring.
- MandateGate may verify trails locally but is never the sole verifier or trust anchor.

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
