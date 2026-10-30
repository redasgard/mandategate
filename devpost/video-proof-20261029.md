# MandateGate | Recorded demo proof, October 29, 2026

## Final media

- **Render URL:** https://mg-review-ci.onrender.com/demo/mandategate-demo-final.mp4
- **File:** `ci-public/demo/mandategate-demo-final.mp4` in the exact deployed isolated Render static CI build
- **Manifest:** https://mg-review-ci.onrender.com/demo/manifest.json
- **Video run source commit:** `874d0cde49bae561f940406403d1c686841940cd`
- **Render service:** `mg-review-ci` / `srv-dbf9evu7bikc73cm3l10`
- **Render deployment:** `dep-dbi1iq61egvs73ekrmdg`, status LIVE, finished 2026-10-30 04:17:59 UTC
- **Media proof:** `CI_DEMO_REAL_BROWSER_CAPTURE_PASS bytes=6424730 seconds=139.3 payment_posts=0`; `CI_DEMO_NARRATED_MP4_PASS bytes=4367262 audio_seconds=91.87 video_seconds=139.3 scene_segments=8 payment_posts=0`.
- **CI:** `CI_RESULT=PASS`, 114 Vitest files and 570 tests, migrations/seed replay, production Next build, authenticated HTTP smoke, 13 Playwright desktop/mobile screenshots, cross-organization access checks.
- **Narration:** one ElevenLabs `eleven_v4` generation (Adam, English), approx 92 seconds, synchronized across eight real-browser scenes. No generated payment-success event.
- **External verification limits:** The final MP4 was encoded successfully by FFmpeg, but its full audio/video were not independently played back through an external client in this session. Public YouTube publication remains unverified.

## What the video actually demonstrates

1. Signed-in dashboard and real payment-operations surface.
2. Agent API submits three canonical **fictional** payment requests in a fresh, disposable PostgreSQL18 environment.
3. The actual policy evaluator records ALLOW / `WITHIN_TRUSTED_BASELINE`, ESCALATE / `AMOUNT_OUTSIDE_VENDOR_BASELINE`, and DENY / `DESTINATION_MISMATCH`.
4. Browser navigates the actual persisted request-detail pages, invoice intake/readiness page and separate archived PayPal Sandbox evidence page.
5. Last scene returns to dashboard with narration explaining the authorization boundary.

**Strict separation:** Model observations are advisory; this CI run did not execute a new GLM call. The displayed archived PayPal SUCCESS belongs to an earlier independent direct-request Sandbox integration, **not** any of these fictional invoice requests. The video is not a claim of a fully verified source-invoice-to-PayPal payment.

## Safety and reproducibility

The exact Render CI build required `MANDATEGATE_DISABLE_PAYMENTS=1`, `MANDATEGATE_RUNTIME_MODE=legacy`, isolated local PostgreSQL18 on `127.0.0.1:55432`, and no PayPal or external AI credentials. The recording submits payment *requests*, not PayPal Payouts API POSTs. The recorder enforces `paymentExecuted===false` for each case and fails if actual policy outcomes differ.

The only browser origin permitted is `http://127.0.0.1:3000`. The one-off login storage state is kept in an ephemeral `/tmp/mandategate-pg.*` file, removed after media recording, and not included in the public static output.

The narrated export was made from the single generated ElevenLabs asset, with a finite, timestamp-normalized FFmpeg H.264/AAC mux. The resulting file and manifest are part of the Render static output.

## Still mandatory before Devpost submission

- Confirm the exported MP4 actually plays with audible, appropriately timed English narration and no sensitive content.
- Upload this or a reviewed final version **publicly to YouTube**, under three minutes, then verify the public link.
- Publish a reviewed, secrets-scanned MIT source repository with the correct tested branch as default.
- Confirm judge access or a clean-clone reproduction path, provide the link, and retain the submitted Devpost entry URL.

This document records successful **video construction**, not completed publication, the current live financial state, or permission to make further PayPal transactions.
