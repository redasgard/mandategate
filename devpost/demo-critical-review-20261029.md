# MandateGate demo rejection and repair audit (October 29, 2026)

**Review independence: self-review**, corroborated with deterministic source inspection and FFmpeg inspection of the actual original hosted MP4. This is an evidence review, not a fresh PayPal payout authorization.

## Original rejected demo

Original URL: https://mg-review-ci.onrender.com/demo/mandategate-demo-final.mp4 (the static site URL is later reused for corrected builds; source-specific old recording identified by `ci-record-demo.mjs` and `ci-mux-demo.mjs` on prior source commit `874d0cde49bae561f940406403d1c686841940cd`).

Original media inspection run: `dep-dbi1srrbc2fs739sa5m0` in isolated Render static CI, source `49bf3b8f0dab841c113ae91892b745ec3164d1be`. The review-only inspection downloaded the old *actual* MP4, extracted a 16-frame storyboard from the decoded H.264 frames at nine-second intervals, inspected its AAC track and measured long silent intervals.

Observed media: H.264, 1280×720, 25fps, AAC mono 44.1kHz, duration **137.16s** (where recorder wall time had been logged at 139.3s). Silence >=1s in audio included **8.34s (6–14s), 9.99s (52–62s), 7.79s (72–80s), 9.77s (88–98s), 4.23s (116–120s)**, approximately 40s total in these five intervals.

Original script submits three fictional canonical requests by raw server-side fetch *before* page video recording starts, then calls `page.goto` and waits for fixed periods. The contact sheet shows static dashboard, payment list, details, empty invoice upload form, archived Sandbox receipt, and dashboard. The mouse never clicks a payment/request action on video; no PDF is uploaded, no genuine GLM observation is shown, no escalation approval action occurs, and no new PayPal Sandbox Payouts API call occurs. Caption overlay occupies lower content area. The archive is correctly historical but does not substitute for the promised end-to-end invoice-derived payout.

## Critique gate: original

- **Step:** Final hackathon demonstration video.
- **Decision:** BLOCK.
- **Standard score:** 4.5/10.
- **Visual score:** 3.5/10.
- **Gate score:** 3.5/10.
- **Visual reference:** approved `devpost/prd.md > The Core Journey` and user request for real working demo.
- **HIGH:** critical product journey not visible, misleading old-flow footage instead of actual invoice interaction and payment outcome.
- **HIGH:** prerecorded static page views rather than visible user/agent actions; 40s dead-air periods violate presentation quality.
- **MEDIUM:** uploaded invoice evidence and model behavior not visible; screenshot captions cover content.
- **MEDIUM:** manual MP4 playback/listening was not independently performed before earlier release claim.

## Repair being implemented

1. Add a strictly local-only, disposable-postgres, **payments-disabled** demonstration permission to the existing `/demo` UI, requiring exact CI identity, loopback auth URL and database, no PayPal or Experiential credentials, and tests that deny every near-miss.
2. Record real authenticated browser actions: click the existing demo button to create three persisted canonical requests, open each decision and reason, upload a genuinely parsed fictional PDF through the actual application form, inspect its source/verification boundary, show clearly separately archived Sandbox receipt, return to dashboard.
3. Require HTTP success and actual persisted outcomes, PDF bytes/parsed text/page provenance, zero payment execution, and no external provider requests. Abort and reject media when a required action fails.
4. Align the existing licensed narration to observed scene timing; reduce dead air, use unobtrusive captions, validate final MP4 codecs/duration and sample real decoded frames for visual review.
5. Compare the corrected output to the original and re-review. Do not claim fully verified source-invoice-to-PayPal settlement; strict T2/T3/T4 origin and authorization gates remain blocked.

## Corrected release criteria

- Each of the three outcomes is visibly created by an on-screen action and inspected in original decision records.
- An original fictional PDF upload is actually processed by the application, with independent parser page evidence; never described as verified supplier authority.
- PayPal historical batch/webhook proof is visibly inspected, clearly marked separate. No new payout is implied.
- No payment/AI credentials in isolated CI; zero PayPal execution.
- Final decoded video is 16:9, under 180s, with materially fewer static holds and no long silent gaps.
- Storyboard inspected and full narration playback separately checked before uploading to YouTube.
- Final user-facing media link references exact tested build and source revision; no deployment or submission claims until separately verified.
