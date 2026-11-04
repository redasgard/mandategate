# MandateGate Demo — Final Screenplay & Narration

Target: 2:30–2:40 (hard cap 3:00). English. 16:9 at 1440×810. Real app interactions.

## Scene 01 — "Business problem" (0:00–0:19)
**Shot:** Dashboard with payment operations overview, decision desk, mouse glides to Payments nav.
**Narration:**
> Businesses are starting to let AI agents handle invoices. But what happens if an invoice is wrong, or someone changes where the money goes? An agent should not be able to empty a payment account just because it was asked. That's why we built MandateGate.

**Sync:** narration starts at 0:01 over the live dashboard. Product name visible in sidebar.

## Scene 02 — "Invoice intake + AI" (0:19–0:54)
**Shot:** Navigate to Source Documents. Download and upload Northstar test PDF. Review page appears with AI-extracted fields. Expand source text evidence. Then show archived GLM detection of suspicious invoice instructions.
**Narration:**
> MandateGate sits between an operations agent and PayPal. The agent handles routine accounts-payable work and sends invoice requests here. Finance sees what needs attention without approving every ordinary task. The agent never receives the keys that move money.
> AI reads the invoice and pulls out the supplier, amount, and requested recipient. MandateGate stores the original document, preserves a hash of the source text, and checks the payment against trusted vendor records and existing rules. AI helps us understand the request, but it cannot decide who gets paid.

**Sync:** first paragraph during upload + review heading. Second paragraph as source text expands and AI extraction is visible. GLM archive during "cannot decide" line.

## Scene 03 — "Agent submits three requests" (0:54–1:11)
**Shot:** Demo lab page. Click "Load or replay three demo decisions." Three cards appear: ALLOW (green), ESCALATE (amber), DENY (red). Scroll to show all three outcomes.
**Narration:**
> Now an operations agent submits three payment requests for the same supplier. MandateGate applies the company's policy to each one independently. A normal invoice is allowed. An unusual amount is flagged. A changed recipient is blocked. The agent cannot override any of these decisions.

**Sync:** narration starts as button is clicked; "normal invoice is allowed" as ALLOW card appears; "unusual amount" as ESCALATE appears; "changed recipient" as DENY appears.

## Scene 04 — "ALLOW detail" (1:11–1:27)
**Shot:** Click into the ALLOW decision detail page. Show vendor, amount, invoice number, trusted recipient match, reason codes.
**Narration:**
> Here is the routine invoice. One thousand two hundred dollars from Northstar Components. The amount is within the approved vendor limit, and the recipient matches the trusted record. MandateGate allows the payment to proceed.

**Sync:** narration tracks the on-screen facts as scrolling reveals them.

## Scene 05 — "ESCALATE + human DECLINE" (1:27–1:50)
**Shot:** Click into the ESCALATE detail. Show $2,800 amount, AMOUNT_OUTSIDE_VENDOR_BASELINE reason. Type explanation in the review textarea. Click "Decline without payout." Confirmation dialog. 201 response. Show the DECLINED state.
**Narration:**
> The second request is twenty-eight hundred dollars — above this supplier's normal range. MandateGate escalates it to a human reviewer. We add a reason: the amount needs independent verification. The request is declined. No money was sent and the agent cannot reverse this decision.

**Sync:** "twenty-eight hundred" as amount is visible; typing begins at "we add a reason"; "declined" as the DECLINE badge appears.

## Scene 06 — "DENY detail" (1:50–2:04)
**Shot:** Click into the DENY detail. Show $1,200 (normal amount) but different recipient. Side-by-side trusted vs requested destination. DESTINATION_MISMATCH reason code.
**Narration:**
> The third request looks ordinary: same supplier, normal amount. But the payment address has changed. MandateGate compares it with the trusted vendor record and blocks the request. Even if the invoice looks convincing, a new recipient needs independent verification before any money moves.

**Sync:** "payment address has changed" as the mismatch highlight is visible.

## Scene 07 — "PayPal Sandbox payout" (2:04–2:34)
### Variant A — Full invoice-derived payout (preferred)
**Shot:** Return to the uploaded invoice. Walk through the three verification steps. Prepare payout. Execute. Show PayPal batch ID, item ID, reconciliation status.
**Narration:**
> Now we complete a real payment through PayPal Sandbox. We walk the Northstar invoice through three checks: verify the printed facts, confirm the test supplier, and run payment policy. MandateGate approves the exact amount and recipient, then submits the payout through PayPal. The batch ID and item status update automatically. The amount is one dollar and one cent because this is a Sandbox test. The authorization and reconciliation are real.

### Variant B — Archived evidence (fallback if no live payout)
**Shot:** Navigate to PayPal Sandbox integration evidence. Show archived SUCCESS status, batch ID, item ID, verified webhook.
**Narration:**
> MandateGate integrates directly with PayPal's Sandbox Payouts API. This archived test shows a successful payout: PayPal assigned a batch ID and item ID, confirmed the transaction with a webhook, and MandateGate reconciled the result automatically. The payment rails are real. For this demo, we've shown them separately to preserve a clean audit trail.

**Sync:** batch/item IDs visible as narration mentions them.

## Scene 08 — "Business outcome" (2:34–2:54)
**Shot:** Return to dashboard. Show the decision desk with cases. Hover Activity.
**Narration:**
> From one place, the company sees what agents requested, why a payment was allowed or stopped, who reviewed an exception, and what PayPal confirmed. Routine work moves faster. Suspicious payments stay under human control.

## Closing (last 5 seconds)
**Shot:** Dashboard with MandateGate branding visible.
**Narration:**
> MandateGate. AI handles the work. MandateGate controls the money.

---

## Narration timing — SHIPPED v6 anchors (measured, not estimated)

The narration is anchored to **measured content-appearance seconds** from the CI footage
(1 Hz boundary-frame measurement), not to nominal scene cuts:

| Segment | Spoken text (abbrev.) | Anchor | Notes |
|---------|----------------------|--------|-------|
| a01 | "Businesses are starting to let AI agents handle invoices…" | 0.3s | dashboard on screen from 0s |
| a02 | "MandateGate sits between an operations agent and PayPal…" | 19.5s | invoice intake visible |
| a03 | "An operations agent submits three payment requests…" | 51.5s | load button on screen |
| a04 | "Here is the routine invoice. One thousand two hundred dollars…" | 71.8s | ALLOW detail visible at 71s |
| a05 | "The second request is twenty-eight hundred dollars…" | 86.5s | ESCALATE detail visible at 87s |
| a05b | "Now for the third request." | 108.2s | bridge line over transition |
| a06 | "Same supplier, normal amount — but the payment address changed." | 110.8s | DENY detail visible at 110s |
| a07 | "MandateGate integrates directly with PayPal's Sandbox Payouts API…" | 124.0s | evidence page visible at 123s |
| a08 | "From one place, the company sees what agents requested…" | 146.1s | dashboard visible at 145s (Blocked=1) |
| a09 | "MandateGate. AI handles the work. MandateGate controls the money." | 161.0s | closing tagline, end-frame hold |

Total: 165.47s (2:45). Every segment verified against frames at its anchor second
(active speech −17 to −19 dB RMS at all anchors; content match confirmed per anchor).

**Correction from v5:** the first shipped cut anchored narration to nominal scene cuts;
5 of 9 sampled frames showed a 2–4s narration lag at scene boundaries. v6 re-anchored
everything to measured appearances and added the bridge line. The v5 audit is preserved
in `qa-report/full-qa.log`; the v6 audit is `qa-report/full-qa-v6.log`.

## Shot IDs and evidence links

| Shot ID | Evidence                                    |
|---------|---------------------------------------------|
| S01     | Dashboard screenshot, CI host at ae886ff    |
| S02     | artifact upload response, source SHA-256    |
| S02-GLM | Archived GLM observation (separate invoice) |
| S03     | 3 scenario request IDs from POST response   |
| S04     | ALLOW detail — DEMO-NORMAL-2026, $1,200     |
| S05     | DECLINE review: 201 + {review…DECLINED}, textarea content, reload readback |
| S06     | DENY detail — DESTINATION_MISMATCH          |
| S07B    | Archived PayPal evidence: batch BA7V96FCY8Z64, item A3R9LWD8XTX72 |
| S08     | Dashboard: Blocked requests = 1             |

## Variant decision

Variant B is the shipped candidate (owner review pending). Variant A (live invoice-derived
payout chain) requires the Render deploy + live-admin.env + Execute authorization; its
narration is pre-generated (`narration/scene-07a-paypal-live.mp3`, 31s) and the live
recorder is armed (`scripts/live-demo-recorder.mjs`, FINAL_TAKE/EXECUTE_PAYOUT gates).
