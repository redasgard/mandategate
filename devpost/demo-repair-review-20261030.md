# MandateGate demo repair verification — 2026-10-30

## Final corrected candidate
- **Repaired narrated MP4:** https://mg-review-ci.onrender.com/demo/mandategate-demo-repaired.mp4
- **Storyboard:** https://mg-review-ci.onrender.com/demo/storyboard-repaired.jpg
- **Proof JSON:** https://mg-review-ci.onrender.com/demo/repair-proof.json
- **Original comparison:** https://mg-review-ci.onrender.com/demo/mandategate-demo-final.mp4
- Review branch: `fix/demo-audio-pacing-20261030`, exact source `615686c08dc766f33987faceb8fedf3b02a967dd`.
- Isolated Render CI `mg-review-ci`, deployment `dep-dbick8mtlv9c739g3cd0`, status `live`, completed 2026-10-30 16:52:29 UTC; `CI_RESULT=PASS`.
- Source recording: **119.6 seconds** real browser actions, three canonical decisions submitted through the actual admin UI, a fictional PDF uploaded through the UI and its source-text evidence displayed, earlier archived GLM observation and PayPal Sandbox payout explicitly separate. `CI_DEMO_REAL_INTERACTIONS_PASS source_pdf=1 submitted_decisions=3 payout_posts=0`.
- Narrated H.264/AAC source audio 91.87 seconds. Initial machine QA found 30.62 sec aggregate long silence and 17.77 sec largest gap.
- **Timing repair:** `CI_DEMO_TIMING_REPAIR_PASS output_seconds=99.68 removed_seconds=19.93 max_audio_silence=3.2 payout_posts=0`. Both video and audio are cut together using aligned FFmpeg trim/concat, preserving content and chronological event order; no replaced or AI-fabricated scene. Original retained for comparison.
- Source and output machine QA, test suite, migrations, browser QA and signed-in smoke completed with `CI_RESULT=PASS`. Verified exact rendered repaired storyboard via decoded `CI_REPAIRED_STORYBOARD_###` frames: dashboard, 3 real decisions, PDF evidence, separate archive and return dashboard present.

## Quality gate (self-review)
- **Step:** hackathon demo correction
- **Decision:** CONTINUE for candidate sharing and external playback QA; **BLOCK** for final YouTube/publication until listening and full-resolution playback are independently completed.
- **Standard score:** 9.0/10. **Visual score:** 8.5/10. **Gate score:** 8.5/10.
- **Review independence:** self-review with deterministic Render CI and rendered storyboard; no independent human audio listening.
- **Findings:** Old 139s capture was static and pre-created payments before video; superseded and PR #70 closed. Earlier true v2 capture was technically correct but overly slow; specifically 17.77s silent hold during invoice screen. Repair removed 19.93 seconds of dead air, leaving max 3.2s. Some browser interface text is small in a full 4x4 storyboard; full-resolution video must be viewed before YouTube.
- **Boundaries:** No new PayPal Sandbox payouts, no live GLM inference; historical provider and model evidence are disclosed as separate past tests. Strict invoice-to-payout T2/T3/T4 path remains unverified.
- **Next:** user/external reviewer plays full corrected MP4 with sound; verify natural narration and legibility at full resolution, then upload to public YouTube and update Devpost. Do not represent the old URL as final, do not merge this video-only CI branch into payment production without review.

No user credentials, live provider secrets or real invoices are included in isolated CI assets.
