# MandateGate | Final demo narration and shot ledger (October 29, 2026)

**Actual output:** https://mg-review-ci.onrender.com/demo/mandategate-demo-final.mp4

This 139.3-second recording was generated from real Playwright browser interactions with the actual Next.js app, isolated PostgreSQL18 and payments disabled. The H.264/AAC MP4 was built by Render CI at commit `874d0cde49bae561f940406403d1c686841940cd` and deployed as `dep-dbi1iq61egvs73ekrmdg`. Recording and mux proof is in [video-proof-20261029.md](video-proof-20261029.md). Public YouTube upload and external manual playback QA remain outstanding.

## Recorded scenes and on-screen captions

| Time | Actual browser page | Main factual message |
| --- | --- | --- |
| 00:00–00:14 | Signed-in /dashboard | Agent requests reach MandateGate; credentials and policy authority stay server-side |
| 00:14–00:26 | /payments | Three fictional requests entered through the genuine scoped agent API |
| 00:26–00:44 | /payments/{normal-id} | Deterministic ALLOW and baseline reason, **no payout** |
| 00:44–01:02 | /payments/{anomaly-id} | ESCALATE on abnormal amount |
| 01:02–01:20 | /payments/{changed-recipient-id} | DENY on payment-destination mismatch |
| 01:20–01:38 | /invoice-artifacts | GLM evidence is non-authorizing; T2/T3/T4 proof readiness is distinct |
| 01:38–02:00 | /sandbox-evidence | Explicitly separate earlier archived PayPal Sandbox SUCCESS and webhook proof |
| 02:00–02:19 | /dashboard | Summary: model proposes, deterministic policy owns authority, trusted executor handles PayPal |

The browser recording is roughly 139.3 seconds. The original single-take ElevenLabs `eleven_v4` narration lasts 91.87 seconds and is segmented across the eight scenes with deliberate pauses. Timings indicate scene windows, not literal spoken-word time codes.

## Narration actually generated

An AI agent can read an invoice. But should that give it permission to send money?

MandateGate sits between autonomous operations agents and PayPal. Agents can submit payment requests, but they never get payment credentials or the authority to approve themselves.

Here is a normal request from a known vendor. The destination matches our trusted record, and the amount is inside policy limits. The system records ALLOW, with reasons you can inspect. That does not mean a payment was sent.

Now the invoice amount is unusually high. MandateGate escalates the request for human review. No automatic payout.

And here is an attempted recipient change. The system denies it. A field inside an invoice cannot silently change where the company sends money.

GLM can extract and explain invoice content, but its suggestions remain untrusted. Independent document and issuer checks are required before any invoice-derived payment can move.

The PayPal Sandbox integration has also processed a separate earlier payment with a recorded successful batch, item status and verified webhook. That historical transaction was not caused by the fictional invoices shown here.

That is the idea behind MandateGate: AI can propose. Deterministic policy controls authority. The trusted payment executor alone can contact PayPal.

## Final publication criteria

- Actual video contains real application browser footage; **no fabricated PayPal payouts or issuer proofs**.
- Inspect complete H.264/AAC MP4 visually and audibly; the automated build PASS alone is not independent media review.
- Public YouTube link under 3 minutes, no secret/PII display, no unlicensed music or imagery.
- Update Devpost with exact public YouTube URL and verified source-repository link.
- This video shows a working beta with separate historical PayPal and advisory GLM evidence, **not** the unverified invoice-derived strict Gate H settlement chain.
