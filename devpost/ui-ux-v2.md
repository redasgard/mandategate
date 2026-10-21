# MandateGate product experience, v2 (October 20, 2026)

**Status:** implementation draft in PR #60; not merged and not a claim of finished payment integration.  
**Authority:** approved `devpost/prd.md` (product behavior); `devpost/spec.md` (service and permissions); latest inspected branch (implementation evidence).  
**Theme:** dark charcoal, warm bronze/copper, minimal Scandinavian geometry, high information density without burying decisions.

## Product principle

MandateGate is a **financial authority control plane for automated AP**, not a human PDF uploader. An authenticated operations agent submits invoice evidence or a scoped canonical request. The backend determines ALLOW / ESCALATE / DENY using recorded policy and trusted vendor state. *Under a separately approved current mandate*, routine accepted requests may be executed automatically; anomalies require human intervention. It is never legitimate to ask an administrator to download and re-upload a system-generated USD 1.01 invoice in the normal journey.

The system explicitly distinguishes:
- source document arrival and untrusted AI interpretation;
- policy decision (ALLOW / ESCALATE / DENY);
- exact human authorization or standing-mandate authority;
- PayPal execution and remote status;
- historical AP observations vs scheduled obligations, cash balance or verified liabilities.

Never conflate the above in UI status, button wording or statistics.

## Information architecture

### Global

Consistent left rail on desktop, horizontal overflow-safe product navigation on small screens:

1. **Dashboard**: unresolved decisions first, money position second, recent activity and context third.
2. **Payments**: agent and supporting evidence intake, canonical request ledger with filters for review, denied, declined, allowed, recorded paid and uncertain, and evidence-first detail.
3. **Vendors**: one current trusted destination, trust cases and re-verification.
4. **Policies**: separately distinguish proposed, active and disabled policy authority. Link to bounded standing mandates.
5. **Activity**: chronological consequential operational evidence with links to source records.

Secondary controls: standing mandates, AP horizon, supporting source documents and imported AP evidence. They are *not* replacement top-level products or prerequisites in the normal UX.

No fake global command/search button, no decorative 'online/live' feed whose source is unknown, no chatbot capable of paying. The approved persistent MandateGate Assistant remains deferred until it has an actual read-only evidence retrieval and prepared-action confirmation boundary.

### Dashboard landing

The initial viewport answers **'What requires my attention?'** through an incident queue ordered by authoritative stored decision/provider evidence, and **'What is happening with company money?'** through four clearly qualified tiles: balance (unavailable unless an authenticated feed exists), local recorded PAID, upcoming imported AP, overdue imported AP.

Alert shortcuts must provide destinations that meaningfully filter the case queue, not merely increment badges. A case shows what happened, detecting source, reason codes, identity, amount and an evidence link. No payment-execute button on the dashboard.

Below: recent decision feed labeled by source (agent, reviewed document, synthetic fixture); incoming unverified document observations; historical AP horizon with explicit non-scheduler disclaimer; and authority navigation.

Avoid long paragraphs before decisions, a wall of decorative metrics and any user download/re-upload loops.

### Payment record

Display requested payment versus current trusted vendor destination separately. Show policy decision, current review state and stored provider status as three distinct axes. On an uncertain / submitted state, do **not** suggest retry; a bounded manual Sandbox integration-test control may appear under collapsed diagnostic details only when the server-independent UI preconditions also permit it. API must still enforce its own fresh authorization.

### Vendors, policies and activity

Vendor identity / registered recipient and re-verification cases are first-class, not implied by invoice text. Policy proposals have no effect until independently approved; counts are advisory. Activity is event-driven with timestamps, actor and evidence; never represent unanchored local records as independently WORM/externally anchored history.

## States / accessibility

- Anonymous users redirect to sign-in; judge-only REVIEWER does not enter the admin control room.
- Tenant data is scoped by current active ADMIN membership *inside SQL*; revocation must immediately remove read-side visibility.
- Empty means **no observed records**, not proof of zero debt, no alerts or complete external integration.
- Historical data is explicitly imported and may be incomplete (200-row cap); never imply AP due dates create real PayPal schedules.
- Model-proposed vendor names, invoice numbers and sums are *untrusted observations*, encoded as plain escaped text.
- Keyboard focus visible; skip-to-content; semantic main/section/nav; horizontal mobile nav; no screen-height traps; reduces motion where requested.
- Error messages stay specific without revealing credentials or unsaved trusted destinations.

## Demo priority

A three-minute demo should be navigable in this order: Dashboard → a suspicious invoice's evidence and source → a DENY or ESCALATE review → an allowed routine request with separate authoritative standing policy and provider state → Activity. No administrator file downloads as a necessary part of the main flow. Do not claim a real new invoice-origin PayPal payout until independently verified.

## Verification gates

Code currently implemented in PR #60. Exact-commit isolated PostgreSQL 18 migration/seed, Vitest, TypeScript, Next production build, authenticated multi-tenant HTTP smoke (payment disabled, no provider keys) and desktop/mobile authenticated visual walkthrough are required before merge/deploy. Existing Render static CI provides **build evidence only**, not a hosted interactive SSR screenshot preview. Production remains on the old branch; parent PR #59 remains draft.

## Deferred, not invented

Actual balance feed, complete raw-agent-invoice → AI → authenticated issuer → automatic payout handoff, live invoice-origin PayPal Sandbox acceptance, scheduled payment UX/backend, full persistent assistant, independent Merkle-anchor/WORM proof, sponsor analytics surfaces and public judging publication all require independent work and proof. This UI changes none of those requirements.
