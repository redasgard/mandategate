# MandateGate decision log

## 2026-10-08 — Retire unnecessary paid Render staging

- **Decision:** Use one development/demo environment for the PayPal AI Hackathon. The separate paid Gate H staging PostgreSQL and extra web service are not required.
- **Why:** The existing app is development, not production. Git branch isolation, CI, rollback and PayPal Sandbox sufficiently contain hackathon integration risk.
- **Retired approach:** Extra Render staging service and paid DB with environment-specific host/user gates. Their creation introduced cost and a Corepack build failure without providing judge-visible value.
- **Safety boundary retained:** Sandbox-only Payouts, issuer and human authorization, immutably source-bound invoice fields, exact tuple and idempotency checks, adversarial GLM model observations untrusted, one test Payouts POST maximum.
- **Implementation:** code commit `df9b7608e5b1a7038a4318148eb979e2daa1217d`. `devpost/gate-h-live-runbook.md` now covers the single demo environment.
- **External cleanup:** `srv-db4367u0tbcc73cugar0`, `dpg-db4351rl550s73acup8g-a` deletion **PENDING**. Render connector cannot delete these resources. The paid database accrues charges until deleted in Dashboard.
- **Release state:** Gate H BLOCKED; no Slice 3 PayPal transfer or GLM live model proof.

## 2026-10-08 — Complete the actual human source-review demo path before expanding infra

- **Decision:** Keep the Slice 3 work centered on user-visible untrusted invoice upload, pre-invoice vendor channel registry and sourced manual review in the existing development environment.
- **Delivered branch code:** Admin raw-byte upload, tenant/session checks and transaction revalidation; origin-channel enrollment tied to a pre-existing vendor and immutable SHA-256 digest; signed-in UI for both; real CI HTTP PDF parser and five-field source verifier.
- **Evidence:** `b52ca996b64b3f7bd9a404f7edaaa71fbc837342`, GitHub Actions `37874974336` (SUCCESS, 28 files/172 tests; prod HTTP smoke).
- **Critical distinction:** Human enrollment and synthetic portal-event references are not external issuer verification; PDF T2 verifies document text, not authenticity. Nothing authorizes payment without T3+T4.
- **Unverified:** Hosted user journey, live GLM model serving/ZDR and invoice-originated Sandbox payout/webhook. Gate H BLOCKED.

## 2026-10-11 — Restore scanned PDF and image reviewer path without changing payment authority

- **Approval basis:** Original `scope.md`, `prd.md` and `spec.md` approved. Resume Slice 3 in fast mode.
- **Implementation:** PDF.js/native canvas render in a bounded empty-environment worker, one-page scanned PDF to model-observation-only path, separate source/raster hashes, fail-closed multi-page scan handling, and signed-in PDF/PNG/JPEG UI.
- **Test evidence:** code `2fbbdcd9ef8a284449c6035eae3dae41afe94f8a`, GitHub Actions `38168733595` PASS, 180 tests/30 files, migrations/seed/typecheck/build/smoke. Existing Render dev deploy initiated; live validation is separate.
- **Authority constraint:** model output cannot authorize payment; simulated out-of-band confirmation must remain labeled synthetic, as specified in the approved scope.
- **Incomplete:** live GLM ZDR proof, genuine hosted reviewer verification, payable document end-to-end and real Sandbox payout/webhook. Slice 3 remains unchecked.
- **Cost cleanup:** paid Gate H PostgreSQL deleted; the extra free-tier web resource remains. Neither is needed by the approved one-environment build.

## 2026-10-11 — Deploy tested Slice 3 checkpoint on original Render app

- **Action:** Manual deploy from existing `mandategate-web`, auto-deploy disabled, branch `build/slice-3-invoice-intake`, exact source SHA `2fbbdcd9ef8a284449c6035eae3dae41afe94f8a`.
- **Evidence:** Render `dep-db5ub9l9fdbs73e58mug` **LIVE**; startup applies 16 migrations, seeds existing admin and runs Next.js. Anonymous redirects and sign-in 200 observed. GitHub Actions `38168733595` SUCCESS, 180/180 tests.
- **Limits:** No real GLM API key/serving ZDR verification, no authenticated hosted reviewer session, no invoice-derived PayPal Sandbox transfer. Startup did not invoke the one-shot Gate H payout test. Full Slice 3 remains open.

## 2026-10-13 — Bound synthetic non-ZDR invoice observation to demo only

- **Decision:** An authenticated demo administrator may explicitly opt into GLM-5.3 Flash observation without ZDR for *exactly allowlisted synthetic fixture bytes*; normal/production invoice analysis retains mandatory ZDR. This implements the user's requested hackathon testing exception, not a production privacy-policy change.
- **Reason:** The Experiential account's strict ZDR preflight blocked the optional AI demonstration. Verified that the user's 3,483-byte test PDF is byte-identical to `04_changed_receiver.pdf` in the synthetic test ZIP, SHA-256 `892d7889152b6d6e6d20310f3b7a59cf25e7c3b73ea5882d9c30de781c3ce181`.
- **Controls:** Opt-in flag plus `MANDATEGATE_DEPLOYMENT_ROLE=demo`, bound Render service ID, PayPal Sandbox host, explicit original-source SHA allowlist, active admin membership, same-origin POST, exact hash and acknowledgement. No-training and disabled prompt capture still required. Actual served ZDR state is recorded; synthetic results force ESCALATE, with no payment authority.
- **Rejected:** Global ZDR bypass, client-side-only test toggle, accepting an arbitrary admin-uploaded PDF merely because a checkbox says 'synthetic', and treating a non-ZDR model response as release-grade privacy evidence.
- **Implementation:** Separate feature branch `build/synthetic-non-zdr-admin-test`; requires CI, security review, dev-branch integration and Render environment opt-in before live availability. The existing Gate H invoice-to-payment release remains BLOCKED.

## 2026-10-14 — October 29 delivery baseline reworked after BLOCK review

- **Decision:** Target a completed, confirmed Devpost submission by October 29 at 6 PM Pacific; October 30-31 are emergency buffer. Keep approved P0/P1/P2 scope, with full-scope commitment conditional on actual named engineering owners, hours, QA/security reviewer and account/license access at G0. No assumed staff capacity, no silent scope cuts.
- **Reason:** The initial 249-line plan received a self-reviewed 7.3/10 **BLOCK**, including unsupported staffing, incomplete `main` release cutover and a one-time Sandbox/judge-replay contradiction. Rework: `devpost/october-2026-execution-plan.md`.
- **Authority:** Separate one-time, expressly operator-approved historical Sandbox payment proof from no-new-payout judge replay. A trusted-origin standing mandate can yield routine ALLOW; a separate safety grant controls the one-shot proof. Models, invoice text, Assistant and sponsor tools never authorize funds.
- **Privacy:** Non-ZDR demo waives ZDR/no-training/capture-off policy *only* for exact allowlisted fictional fixtures with explicit consent and restricted service. The actual provider metadata must be recorded as true/false/unknown; missing Free-tier optional metadata may be handled only after implementation/verification. The strict/default route still fails closed. **That provider fallback and durable preflight receipt are not yet implemented.**
- **Release and dependencies:** Freeze authority/schema by October 23; require independent financial diff review and two hosted scenario replays; complete reviewed draft PR #2 → `main` → tag → clean clone → Render parity before making source public. Current Render dev SHA `be75fecf` does not equal current `main`.
- **Infrastructure:** The free PostgreSQL instance expires November 6; obtain approved durable storage and tested restore by October 21 so judges can test through December 15.
- **Status:** Documentation repair branch is not product Gate H approval. Actual owner hours, model-serving proof, invoice-derived payout, repeatable judge mode, P1/P2 and submission remain unverified. Review artifact: `devpost/reviews/october-2026-plan-v2-review.md`.
