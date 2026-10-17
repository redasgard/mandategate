# MandateGate | Judge video recording packet (draft)

**Status:** SCRIPT ONLY. No recording, public YouTube URL, signed-in visual QA, repo publication, or Devpost submission is claimed.
**Target duration:** approximately 2:30; actual export must be strictly under 3:00.
**Release goal:** video/public assets on October 28, Devpost submitted by **October 29, 2026, 6 PM Pacific**. The official later deadline does not change the owner's target.
**Evidence boundary:** This packet is based on the development demo observed through October 16 PT; recheck the exact Render code SHA, signed-in paths and live database on recording day. Latest independently verified Render service source while drafting: 1c6d1711218d29faeacebbd45c76b46f96378474. GitHub Actions currently blocks later e2506bd before assigning a runner. No live invoice-derived payment is demonstrated.

## Locked story

A payment-requesting AI agent is not a payment authority. MandateGate stores and interprets invoice material as untrusted evidence, applies deterministic policy to payment requests, and reserves PayPal Payouts access for independently authorized execution. The recording must explicitly separate **three demonstrated paths**, not claim an end-to-end GLM-PDF-to-PayPal transfer:

1. **Actual saved GLM-5.3 Flash observations** of consented, byte-exact fictional invoices, all advisory T1 ESCALATE. These are not full-ZDR evidence or genuine vendor confirmation.
2. **Actual deterministic ALLOW / ESCALATE / DENY** from three **separate synthetic canonical** payment requests. Safe judge replay runs with PayPal execution disabled and creates **zero payouts**.
3. **Archived real PayPal Sandbox proof from an earlier direct trusted-agent request**, with batch/item IDs, verified webhook and reconciled status. This did **not** arise from the GLM PDFs or current Neon demo.

## Recording timeline and exact spoken copy

### 0:00-0:20 | Product and threat

**Screen:** Signed-in /dashboard title and "Invoice intake" panel. Do not show sign-in password, API keys or browser developer tools.

**Narration:**

> Autonomous agents can request a vendor payment. But a convincing invoice, or an AI-generated payee, should never grant access to money. MandateGate is the authority firewall: the agent requests, independent controls decide, and only a protected executor can reach PayPal.

**Overlay:** "Agent proposes ≠ payment authorized"

### 0:20-0:55 | AI observes, authority stops

**Screen:** /demo#demo-ai-observations. Show "What GLM observed in fictional invoices"; open the saved DEMO-GLM-004 Northstar Components observation and follow "Inspect the original document and stored model evidence" to /invoice-artifacts/5b4537c7-3bf7-4884-95b9-fd321015ccf1. Return to /demo. In the currently verified hosted UI, go through the /demo saved-observation card or use the exact source URL. Do **not** rely on the unmerged PR #35 invoice-list hints.

**Narration:**

> Here, GLM-5.3 Flash examined a fictional Northstar invoice and proposed details including 125 dollars. MandateGate keeps that result at ESCALATE. We retain the original source hash and model evidence, but the model cannot authenticate the issuer, change a trusted payment destination, or authorize PayPal. This test uses fictional-only retention consent, not production zero-data-retention clearance.

**Overlay:** "REAL MODEL OBSERVATION · FICTIONAL DOCUMENT · ESCALATE"

### 0:55-1:42 | Three independently enforced decisions

**Screen:** /demo, click **"Load or replay three demo decisions"** only if the preview explicitly indicates PayPal execution is disabled. Show the three scenario cards, actual reason codes and decision-detail links. A repeat click is allowed only if replay remains safe and idempotent.

**Narration:**

> Now, separate synthetic payment requests exercise the deterministic decision engine. A known recipient and normal amount receive ALLOW. An unusual amount receives ESCALATE, with an explicit baseline reason. A substituted destination receives DENY, requiring trust re-verification. These decisions are independently computed; they are not derived from the earlier GLM PDFs. This judge preview creates no PayPal payments.

**Expected reason codes:** WITHIN_TRUSTED_BASELINE; AMOUNT_OUTSIDE_VENDOR_BASELINE; DESTINATION_MISMATCH.

**Overlay:** "ALLOW / ESCALATE / DENY · 0 DEMO PAYOUTS"

### 1:42-2:13 | PayPal proof, honestly separate

**Screen:** /demo#demo-historical-paypal, zoom in on "Recorded earlier PayPal Sandbox payout", archived receipt metadata and its direct link to the original build ledger. Do not call PayPal in the recording.

**Narration:**

> The PayPal execution path was tested separately through a trusted direct-agent request. This archived Sandbox receipt records one actual payout batch and item, a verified webhook, and reconciliation to paid. It is from an earlier environment, and it was not caused by that GLM invoice. Keeping this distinction visible is part of the product's auditability.

**Known archived identifiers:** Batch BA7V96FCY8Z64; item A3R9LWD8XTX72; historical final remote SUCCESS and local PAID. Do not present as a fresh PayPal status query.

**Overlay:** "HISTORICAL PAYPAL SANDBOX · SEPARATE WORKFLOW"

### 2:13-2:30 | Outcome and limits

**Screen:** /demo#demo-payment-boundary. Show "All local payment execution rows in this demo organization: 0" if the number is still verified as zero; otherwise halt recording and investigate.

**Narration:**

> This is MandateGate: AI interprets, deterministic trust controls decide, and PayPal execution remains behind explicit authorization. The complete invoice-derived payment chain is still blocked pending genuine issuer verification, exact approval, and strict provider privacy evidence. The demo shows what is proven, and what is not.

**Overlay:** "No model-created payment authority"

## Operator preflight: record only after all checks pass

- [ ] Verify current Render LIVE commit and source parity; no silent substitution of the unmerged development candidate.
- [ ] Sign in using a restricted demo admin session without displaying credentials, tokens, session cookies, live account identifiers or personal financial data.
- [ ] Confirm /demo is an explicitly fictional Neon preview with MANDATEGATE_DISABLE_PAYMENTS=1; zero local execution records **across all payment-request source types** before and after replay.
- [ ] Confirm exactly three saved consented fictional GLM observations, or update narration and screenshots to observed evidence. The synthetic observation is not strict ZDR.
- [ ] Verify DEMO-GLM-004 has the original artifact link, and its value is a model-proposed USD 125.00, never a T2/T3/T4-authorized invoice.
- [ ] Load/replay all three synthetic cases, capture exact observed decision outcomes and reason codes; stop if any differ, if execution exists, or if replay control disappears.
- [ ] Clearly label the older PayPal Sandbox payout as an **archived direct-agent receipt** from another environment; do not imply the GLM invoice paid it, or that the current viewer queried PayPal.
- [ ] Take genuine screen captures from the working hosted product; never substitute mocks, composited fake PayPal dashboards, or scripted claims that were not observed.
- [ ] Record licensed/permitted voice, graphics and music; use no unauthorized copyrighted material. Avoid password fields and developer secrets.
- [ ] Export one **public** YouTube video shorter than 3:00, ideally 2:25-2:40, watch the exported file end to end, then independently open the public link signed out.
- [ ] Update the evidence matrix with recording date, precise Render SHA, run/visual proof, final video duration, YouTube URL and what remained blocked. Owner approval is required before publication.

## Capture contingency

If GitHub Actions remains blocked or e2506bd/PR #35 is not live, record using **the last verified deployed UI**, not prospective screenshots. If PayPal execution evidence cannot be independently re-queried, keep the archived language above. If the current demo fails the zero-execution or outcome checks, do not record the ALLOW/ESCALATE/DENY segment as successful. If signed-in hosted access is unavailable, mark the video blocked rather than inventing evidence.

## Source pointers

- [Current live judge demo](https://mandategate-web.onrender.com/demo)
- [Northstar saved fictional PDF review](https://mandategate-web.onrender.com/invoice-artifacts/5b4537c7-3bf7-4884-95b9-fd321015ccf1)
- [Judge evidence matrix](judge-evidence-matrix.md)
- [October 29 release plan](october-2026-execution-plan.md)
- [Historical direct Sandbox build ledger](https://github.com/redasgard/mandategate/blob/be8ba53e410ad74160fdc9d8931f2aa16d299e0c/devpost/build-state.md#L255-L265)
- [Historical Slice 2 review](https://github.com/redasgard/mandategate/blob/be8ba53e410ad74160fdc9d8931f2aa16d299e0c/devpost/reviews/slice-2-critical-review.md)

**This is a narration/shot document, not evidence of an actual screen recording or submission.**
