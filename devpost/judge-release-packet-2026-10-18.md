# MandateGate | Judge recording and submission packet

**Prepared October 18, 2026 Pacific. Status: internal candidate, not recorded, not public, not submitted.**
**Internal deadline: October 29, 2026 at 6:00 PM Pacific.** The official competition deadline is later, November 12 at noon Pacific. The submitted-entry confirmation URL does not yet exist.

## Exactly what the current build demonstrates

The connected Render service **mandategate-web** reports deployment **dep-dbaqifmq1p3s73cn6gm0** LIVE at development SHA **04ed2b8694292aca0a512068b53238658fe2b263**. The runtime uses **neon-sandbox**, with a separately isolated and expressly configured Sandbox-only payout path. This is **not** a globally payments-disabled deployment. No current-Neon $1.01 Sandbox request or payout execution has been observed.

The judge-only **/judge** page exists in the deployed source. It requires a specially scoped, active REVIEWER account with no ADMIN membership. **No REVIEWER account has yet been provisioned or browser-tested.** The page's **Evaluate fictional request** buttons make authenticated GET calls to deterministic policy evaluation, not payment or invoice mutation. It displays previously stored fictional canonical decisions and archived historical PayPal proof. Its sanitized GLM model-observation cards require an independently reviewed source-SHA allowlist. **The current LIVE isolated runtime does not forward that parent allowlist to its Next child**, so those cards can be empty even when configured. Draft PR #51 repairs forwarding and is included in unmerged verification PR #49. Do not claim the restricted judge account can see model evidence until corrected source is deployed and witnessed. It cannot download original invoice PDFs.

The owner-only **/demo** page is different: it requires ADMIN access and its **Load or replay three demo decisions** button creates or reuses canonical synthetic fixtures; this is not the GET-only judge test. Never share existing admin credentials as a judge test account.

Latest connected Neon **read-only** inventory at **October 19 07:04 UTC**:

| Record | Count |
| --- | ---: |
| org_demo synthetic canonical requests | 3 |
| org_demo all-source payment executions | 0 |
| org_paypal_sandbox_demo payment requests | 0 |
| org_paypal_sandbox_demo payment executions | 0 |
| org_demo active REVIEWER memberships | 0 |

The three persisted cases are Normal **ALLOW / WITHIN_TRUSTED_BASELINE**, unusual amount **ESCALATE / AMOUNT_OUTSIDE_VENDOR_BASELINE**, and destination substitution **DENY / DESTINATION_MISMATCH**. They are separate from real saved, consented fictional **GLM-5.3 Flash T1/ESCALATE** observations, and neither path is the earlier PayPal payout. This separation is important.

**Historical PayPal proof:** Earlier direct trusted-agent PayPal Sandbox payout batch **BA7V96FCY8Z64**, item **A3R9LWD8XTX72**, recorded remote SUCCESS/local PAID and a verified webhook in a prior Render environment. This is an **archived** receipt, not a fresh PayPal query, not a payment from the observed GLM invoices, and not current Neon state.

**Still blocked:** Strict account-level ZDR/no-training/capture evidence, authentic supplier issuer T3, independently proven T2-to-T4 payment authority, full GLM-invoice-to-PayPal Gate H, and new live $1.01 Sandbox execution. Source-level protections in draft PRs #47/#48 and their consolidated exact-head draft PR #49 are NOT deployed. New full GitHub Actions runs fail before a runner starts due to exhausted private minutes; passing isolated Node22 tests do not prove full Node24/Postgres18 integration.

## Video: five-screen capture plan, target 2:30

The narrator must use **genuine recorded screens**, not mock receipts. The preferred path is the restricted **/judge** viewer *after* an approved test account and clean-session verification exist. If using owner-only **/demo** for recording, disclose that it is the operator view and do not imply a judge has access. Do not show passwords, browser secrets, account identifiers or unrelated records. No fresh PayPal or model request is necessary for the default script.

### 0:00–0:19 | Problem and promise
**Screen:** Actual signed-in /judge headline, or preflight-verified operator /demo headline.

**Narration:**
> Agents are learning to handle accounts payable. But an invoice can lie, and an AI model's confident answer cannot authorize moving money. MandateGate separates requests from financial authority: independent policy, recipient trust and human review stand between an agent and PayPal.

### 0:19–0:53 | AI observation is not permission
**Screen:** Saved model observations on /judge. Show fictional GLM metadata, proposed invoice amount, source hash prefix and advisory reason. REVIEWER does not get source document bytes.

**Narration:**
> Here a real GLM-5.3 Flash request interpreted a fictional invoice. Its proposed amount and vendor are saved with source-linked provenance, but only as advisory evidence. They remain escalated. A document, even with a correct-looking total, cannot prove its supplier, change the recipient or grant access to PayPal. This fictional test used explicit retention consent, not production zero-data-retention clearance.

### 0:53–1:41 | Three independent decisions
**Screen:** Press **Evaluate fictional request** for normal, unusual amount and changed destination. Then show the separate **Saved outcomes, not just a simulation** ledger, with reason codes. From /demo the corresponding operator action is distinct and writes/reuses only fixed fixtures.

**Narration:**
> These are three different, synthetic payment requests evaluated by MandateGate's deterministic kernel. A known vendor and normal amount return Allow. An unusual amount returns Escalate and explains the baseline. Replacing the payout destination returns Deny. The model did not make these decisions. The saved ledger shows the canonical outcomes, and the judge-only button itself sends no payment or invoice write.

### 1:41–2:13 | PayPal history, explicitly separate
**Screen:** **Recorded earlier PayPal Sandbox payout** panel and archived build-ledger link, without attempting payment.

**Narration:**
> We also tested the protected PayPal Payouts path separately, using an earlier trusted-agent request. The archived Sandbox record contains a successful batch, payout item, verified webhook and reconciliation. That payment was not triggered by the GLM invoice. We distinguish evidence from inference, including inside our own demonstration.

### 2:13–2:30 | Value and truthful limit
**Screen:** Judge policy outputs and their **No payout or payment-state mutation** labels. The numeric zero-execution count must be independently queried, not invented as an on-screen widget.

**Narration:**
> MandateGate turns AI proposals into reviewable, bounded decisions, not blank checks. Full invoice-derived payments still require genuine issuer proof and exact approval. The current safe demo shows why that boundary matters.

**Pre-recording stop tests:** Verify exact hosted SHA, intended role and that the corrected isolated runtime actually forwards only reviewed fictional source SHAs to the Next child. Witness a consented fictional GLM observation card on the restricted account, the expected three decisions, zero execution records before/after, historical PayPal label, and no session or key leakage. If any mismatch occurs, stop recording rather than simulate success. Export and visually inspect the *actual* YouTube video strictly under 3:00, then independently test its public link while signed out. Video does not exist yet.

## Devpost field copy: internal source-bound draft

**Title:** MandateGate

**Tagline:** The authority firewall between autonomous agents and your money.

**Short description:** MandateGate is an AI-assisted accounts-payable authorization boundary. Agents can propose vendor payments and supply invoice documents, but deterministic company policy, independently trusted recipients, and exact human review determine whether a request is allowed, escalated or denied. A protected PayPal Payouts executor handles the separately authorized money boundary.

**Inspiration:** Businesses want to automate accounts payable, but invoice fraud, business email compromise and recipient substitution are especially dangerous when automation is trusted to move money. An LLM can read or summarize a document without proving its issuer or payment authority.

**What we built:** Next.js and TypeScript with PostgreSQL/Neon, Drizzle, Better Auth, PDF.js, and Render hosting. Original invoices receive SHA-256 lineage, bounded source handling and manual review. Experiential Labs GLM-5.3 Flash was exercised on consented fictional material, with observed output limited to advisory escalation. A tenant-bound deterministic decision kernel supports the separate synthetic Allow, Escalate and Deny cases with explicit evidence codes. Payment execution uses PayPal Payouts REST Sandbox, server-side credentials, logical-payment idempotency, verified webhooks and reconciliation. Its previously completed Sandbox payout is archived evidence from an earlier direct-agent test, not a result of the observed GLM invoices.

**Security distinction:** The current public-facing reviewer design performs only GET-based policy evaluation, with signed-in REVIEWER scope. The separate owner-only Sandbox payout lab is configured but current Neon has no payment request/execution for it. Source code for stronger stale-authority revalidation is in draft review and is not represented as deployed. The full model-to-issuer-to-exact-payment pipeline remains a goal, not a completed production transaction.

**Challenge and learning:** A quoted PDF value, model output, account login or earlier approval is not enough to authorize financial action. Trust decisions must bind current issuer evidence, recipient, amount, policy and human review. Retention/privacy disclosures and historical-versus-current payment proof must be unambiguous.

**Next:** Complete independent issuer verification, end-to-end signed-in financial boundary tests, documented recovery, full account-level privacy entitlement, and advanced investigation, scheduling and integrity features. These are roadmap items, not finished sponsor integrations.

**Technology labels:** PayPal Payouts Sandbox, Experiential Labs GLM-5.3 Flash, Next.js, TypeScript, PostgreSQL/Neon, Drizzle, Better Auth, PDF.js, Render. Do not claim sponsor prizes for technologies merely named in a spec.

## Judge instructions (not yet distributable)

Once a dedicated REVIEWER account is safely provisioned and approved, judges may sign in at **https://mandategate-web.onrender.com/judge**. They can inspect sanitized saved fictional model hints, press the three **Evaluate fictional request** buttons, inspect persisted canonical decisions separately, and view the distinctly labeled historical PayPal receipt. The original PDFs and owner-only admin routes are not available to REVIEWER. Do not give the development ADMIN credentials or claim a newly completed payout.

Actual reviewer creation requires verified PR #48 safeguards, a separate explicit owner grant, a one-time **payments-disabled Neon preview** process and recorded account scope. Sign-in, logout, revoked-role denial and two clean reviewer sessions must pass before sharing this instruction. The hosted site may remain in Sandbox-only payment-capable mode because the REVIEWER path itself has zero money authority. Verify the service is available through December 1–15; free-tier uptime is not guaranteed.

## Publication and acceptance gates

- [ ] Full exact-head Node24 / PostgreSQL18 / pnpm integration, TypeScript, tests, production build and authenticated smoke; independent money-boundary review.
- [ ] Reviewer account with no active ADMIN role created with explicit approval; two clean-session tests passed, all sensitive/admin endpoints inaccessible.
- [ ] Render SHA parity and repeatable real signed-in video behavior; zero demo-org payment executions before and after.
- [ ] Recovery/restore to an isolated environment and December availability policy verified.
- [ ] Source clean-secret scan, MIT license, public default-branch/tag parity and clean-clone instructions verified after separate publication approval.
- [ ] Actual public YouTube video strictly less than three minutes; script and video match.
- [ ] Devpost entry fields and validated source/demo/video links submitted by October 29 6 PM PT; copy the **actual submitted-entry confirmation URL**.
- [ ] Final Critical Review release decision CONTINUE, not a draft-only self-review.

**No current data, code, model observation or earlier PayPal receipt authorizes a new transfer. This document is a draft deliverable, not confirmation of release or contest submission.**
