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
