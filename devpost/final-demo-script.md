# MandateGate | Demo script and capture plan

**Format:** English narration over REAL browser footage of the working app, 16:9, target duration 2:20–2:40; YouTube public and **under 3:00**. No slides pretending to be the product. Use actual recorded interactions, not a fictional paid-invoice animation.

**Recording environment:** current tested Next.js build on a local isolated PostgreSQL 18 with synthetic data and payments globally disabled, or a verified hosted read-only judge account. Never show credentials, session tokens or provider keys. Avoid displaying personal or production vendor data.

## Shot plan (recorded UI, not static presentation)

**00:00–00:20 | The problem:** Open the signed-in MandateGate dashboard. Point to the attention queue, evidence and payment controls. Show that agents can submit requests while financial authority remains server-side.

**00:20–00:50 | ALLOW:** Open Payments and the saved fictional normal vendor invoice decision. Show `ALLOW`, `WITHIN_TRUSTED_BASELINE` and evidence. Say this is a policy outcome, **not** a payout from this invoice.

**00:50–01:15 | ESCALATE:** Open the anomalous amount decision, show `ESCALATE` and reason `AMOUNT_OUTSIDE_VENDOR_BASELINE`. Show human review needed; no PayPal request.

**01:15–01:40 | DENY:** Open substituted destination, show `DENY` and `DESTINATION_MISMATCH`. Explain that the invoice cannot rewrite trusted recipient state.

**01:40–02:00 | AI evidence:** Open invoice intake/review and any saved GLM observation. Show suggestions marked unverified, and the T2/T3/T4 proof checklist. Never portray model text as supplier verification or payment authorization.

**02:00–02:20 | Real PayPal evidence, with explicit separation:** Show the existing project's historical PayPal Sandbox receipt panel or the documented verified provider receipt. Read the recorded batch/item and webhook/reconciliation statuses. On-screen caption: **“Separate earlier PayPal Sandbox transaction; not caused by these demo invoices.”** Do not claim the current video executes or settles a new payout.

**02:20–02:35 | Close:** Return to the dashboard. State the boundary: models may propose, policy authorizes, and only the trusted server-side executor can contact PayPal.

## Narration (natural, ~270 words)

“An AI agent can read an invoice. But should that give it permission to send money?

MandateGate is the control layer between autonomous operations agents and PayPal. Agents can submit invoices and payment requests. They never get payment credentials or the power to approve their own work.

Here’s the ordinary case. A known vendor requests an amount within the configured limits, using the trusted recipient. The deterministic policy records ALLOW, with an explanation we can inspect. That decision is not itself proof of payment.

Now an invoice comes in above the vendor’s usual amount. The result is ESCALATE. It stays in the review queue rather than becoming an automatic payment.

Third, a document asks for a different recipient. The system denies it. A text field in a PDF cannot silently rewrite where the company sends money.

GLM helps interpret the document. But the extracted values are suggestions, not verified source facts. Before a payment can move, MandateGate needs independent origin, recipient and exact approval evidence. Here’s where the app shows what’s still missing.

We also integrated PayPal’s Sandbox Payouts API with persistent idempotency and verified asynchronous webhook handling. This archived receipt shows an earlier successful Sandbox transaction. It is separate from the fictional invoice cases you just saw.

The important part is not making an AI system say ‘approved.’ It’s making sure the system can’t pay unless the authorization holds up even when the model is wrong.

MandateGate lets agents work, without handing them the keys to the money.”

## Video acceptance

- Exact actual browser footage inspected end-to-end, not only screenshots or logs.
- The screen demonstrates live user input/navigation, persisted decision changes or API evaluation, and an honest PayPal evidence trail.
- Narrration claims match the displayed state; no recycled transaction shown as freshly paid.
- No real secrets or personal data. Any AI-generated voice or music must be licensed. Prefer a human-recorded narration.
- Video is < 180 seconds by media metadata, playable, audio audible, public on YouTube, and pasted into Devpost.
- If the actual screen or separate receipt cannot be recorded, disclose the limit rather than fabricating an end-to-end payment flow.
