# Gate H: one-development-environment PayPal Sandbox verification

**Current decision (October 8, 2026):** No separate Render staging environment is required for the hackathon. Develop against the existing MandateGate app and existing free Render database, with PayPal **Sandbox only**, controlled synthetic invoices, and explicit authorization/replay controls. This replaces the former Gate H live *staging* runbook; its old version remains in Git history.

**Release status:** Gate H remains **BLOCKED** until real end-to-end behavior has been witnessed. The GLM model, human review, invoice-origin verification, and Payouts execution cannot be declared live-verified based on isolated CI.

## 1. Existing hackathon environment

- **Existing MandateGate app:** `mandategate-web` (`srv-db39vmm7bikc73c55nh0`), Render workspace `tea-d27bea6uk2gs73dv4up0`. It tracks `build/slice-3-invoice-intake` as of 2026-10-16; draft PR #2 targets the wider Slice 3 release and remains unmerged.
- **Existing free Postgres:** `mandategate-sandbox-db` (`dpg-db39d5rbc2fs73d1ke70-a`). The app and Postgres are the **development/demo** environment, not a production payment platform.
- **PayPal:** `PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com`, Sandbox Business sender/API credentials and Sandbox Personal test recipient. No production credentials or real transfers.
- **AI:** Experiential/GLM-5.3 Flash uses the existing connected account and actual policy checks when explicitly enabled; model output is untrusted.
- The single environment need not demonstrate real customer data or a production vendor. A synthetic issuer/channel must be honestly labeled; synthetic fixtures do not prove a real-world supplier was contacted.

## 2. Remove the unnecessary paid infrastructure

These two **extra** resources are approved for retirement, and must not be confused with the existing app/DB:

- Extra web: `mandategate-gate-h-staging` (`srv-db4367u0tbcc73cugar0`): https://dashboard.render.com/web/srv-db4367u0tbcc73cugar0
- Extra paid Postgres: `mandategate-gate-h-staging-db` (`dpg-db4351rl550s73acup8g-a`), `basic_256mb` paid: https://dashboard.render.com/d/dpg-db4351rl550s73acup8g-a

The two extra web deployments both failed during their builds, before application startup. No HTTP requests were recorded for this web service. It is therefore reasonable to expect **no app-generated staging data**, but the DB could not be queried due to no external connection allowlist; manual connections are not ruled out. Confirm any manually created data is unneeded before deletion.

**Deletion status (verified 2026-10-11):** The paid PostgreSQL resource `dpg-db4351rl550s73acup8g-a` is absent from Render's current resource listing and has been deleted. The extra free-tier web service `srv-db4367u0tbcc73cugar0` still exists; its deletion is optional cleanup. Neither service is needed by the Slice 3 code. The original free database and development web remain present. The connected Render app has no delete-service action.

## Latest source-to-review CI checkpoint (2026-10-08)

- Code `b52ca996b64b3f7bd9a404f7edaaa71fbc837342`; GitHub Actions `37874974336` SUCCESS with 28 test files, 172 tests, migration/seed replay, Next build, and real Better Auth admin HTTP smoke.
- Reviewer first visits `/vendor-origin-channels` to enroll an **independently checked** known vendor source using a pre-invoice human assertion, then `/invoice-artifacts` to upload actual original PDF/PNG/JPEG bytes. The UI never trusts an invoice-printed bank account or contact as the registered vendor source.
- In the authenticated PDF reviewer, use original PDF+PDF.js page text, enter all five labeled exact field values and their page/quote evidence, verify T2, and independently attest issuer T3 before proposing any frozen payment tuple.
- **Follow-up signed-in positive authority simulation:** `1f6712d0a33476b2319ec84e70f696fc293031e3` / GitHub Actions `37875399344` SUCCESS. Using a clearly fake CI vendor portal record, the authentic admin session records T3 as a human assertion, creates a server-owned frozen binding, proves stale tuple digest rejection, approves the exact tuple (T4), and rejects second approval. **Zero payments are executed.** This does not replace independently verified external supplier evidence, a live served GLM receipt, an approved Sandbox grant or a reconciled PayPal payout.
- CI has **actually exercised** the missing-origin scenario end-to-end: original PDF bytes -> persisted hash -> real Next page parser -> authenticated T2 field verification -> missing T3 -> ESCALATE; altered receiver -> 422; zero payout. Its “portal event” reference is a SIMULATED CI value and is NOT real external issuer evidence.
- Next gates remain hosted dev reviewer UI, real GLM served policy check and a single authorized Sandbox Payouts proof. CI is not external payment evidence.

## Slice 3 live vision checkpoint (2026-10-11)

The bounded scanned-PDF/image reviewer is implemented, tested and linked from the signed-in document list. Existing Render development app deployed exact code SHA `2fbbdcd9ef8a284449c6035eae3dae41afe94f8a` as **LIVE** via `dep-db5ub9l9fdbs73e58mug`; bootstrap logs confirm 16 migrations and demo seed, and provider request logs confirm login page 200 and anonymous redirects. Full authenticated reviewer navigation and live GLM remain unverified. CI run `38168733595` passed 180 tests across 30 files, including actual local PDF.js rasterization, first-page PNG integrity, renderer-to-original dual hash binding, rejected multi-page scans, and logged-in HTTP reviewer smoke. Both worker environments are empty and the server bundle excludes native canvas.

A **live** GLM-5.3 Flash serving-route request (including ZDR response header and resolved model) is **not** proven. The external `EXPLABS_API_KEY` is not verified here. The document cannot be upgraded to payment authority merely because its model output is persuasive. This does not alter the need for explicit one-time Sandbox payout consent.

The approved `scope.md > Hackathon Release Boundary` allows a clearly labeled **simulated** vendor re-verification for the demo and explicitly cuts a live external vendor verification provider. Do not present the simulated portal event as a real supplier callback. The existing Gate H evidence-review requirement must be evaluated against this approved scope rather than silently redefining the product.

### Strict GLM proof versus synthetic exception (2026-10-16)

A Gate H payout **must not** accept a synthetic non-ZDR model observation as proof of the strict GLM serving route, even if the provider's response header reported `gateway_zdr=true`. The Gate H receipt reader fails closed if the observation has `SYNTHETIC_NON_ZDR_TEST_ONLY` in its reason codes **or** any matching append-only synthetic-test consent record. It also requires a SHA-bound original source, non-error advisory result, strict model identity, original request ID, saved prompt hash and provider metadata. Checking the current provider privacy settings does **not** retroactively convert an earlier synthetic exception into a compliant invocation.

CI fixture receipts prove only this metadata/persistence guard; they are not independently validated provider statements. A newly executed, non-synthetic strict `/observe` call under verified ZDR/no-training controls remains required for Gate H live evidence. No PayPal payout is authorized by this guard.

## 3. The single-environment validation path

1. Keep code on `build/slice-3-invoice-intake` until frozen-lockfile CI, TypeScript, migration/seed replay, 3-case unit tests, production build and smoke checks are green. Do not treat the branch as deployed yet.
2. Confirm the current Render development service is backed by its existing free DB and has a known-good backup/seed path. A deliberate dev migration may modify the dev DB; it is not protected production data.
3. Update/deploy the existing development app to an accepted Slice 3 SHA, without changing PayPal's host from **Sandbox**. Do not deploy until the reviewer/auth/issuer proof implementation passes review.
4. Use **synthetic PDFs and images only**. Check exact original artifact SHA-256, independent PDF page-text digests, immutable T2 field evidence, an appropriately categorized pre-enrolled origin channel, and admin authenticated exact tuple approval. A string referencing a phone call is not evidence that a call occurred.
5. Run a real authenticated reviewer session: admin allowed; anonymous/other-organization access denied; stale hash, altered receiver and contradictory amount refused. Record the actual user/action IDs.
6. Check actual Experiential account privacy with `pnpm verify:vision:privacy`. If supported, explicitly enable `GATE_H_LIVE_GLM_PROOF_ENABLED=1` while PayPal host remains Sandbox, with an allowlist of exact synthetic image SHA-256 digests. Test one actual adversarial model observation; store only request ID, policy/serving metadata and digests, never credentials or sensitive prompts. Disable after.
7. Set the canonical distinct **ALLOW**, **ESCALATE** and **DENY** fixture IDs. The latter two must produce their intended causal reason and **zero** payment requests, not merely fail due to missing data.
8. Run `pnpm gate-h:sandbox preflight` (no payout); when the user's distinct single-test authorization is present and all proof checks pass, use `pnpm gate-h:sandbox submit` **once**. The script requires `GATE_H_PAYPAL_SINGLE_POST_GRANT=SUBMIT_SINGLE_101_CENT_SANDBOX_PAYOUT`, external issuer-proof review evidence and a live GLM receipt. It pins USD **$1.01**, the exact preapproved Sandbox receiver, artifact/tuple SHA, authenticated approval and at most one physical Payouts POST through the test client.
9. Run `pnpm gate-h:sandbox verify` for actual PayPal batch/item evidence plus verified webhook and reconciliation. Distinguish remote API acceptance from final settlement.
10. Apply a separate release security review before calling Gate H passed or merging PR #2.

The synthetic demo can show the issuer-authentication control operating with a **controlled test channel**, but must not claim independent real-supplier contact or real invoice authenticity without actual evidence.

## 4. Cleanup, retention, and limits

- Delete the **extra** Render web+paid DB, not the original free DB or the existing `mandategate-web`.
- Keep provider keys and PayPal Sandbox credentials out of Git, review notes and chat.
- Keep adversarial GLM inference disabled by default; clear temporary image hash allowlists after the test.
- Do not create another paid environment or another real PayPal Business account for this hackathon.
- Preserve immutable test evidence and identify precisely which external requests and reviewer actions happened. A passing isolated CI run is not proof a payout occurred.

## 5. Synthetic non-ZDR demo observation (separate from Gate H proof)

This mode is **not** proof of ZDR compliance or Gate H completion. It is for the existing Render development/demo web service and byte-identical fictional fixtures only. It never changes the standard `/observe` route. Real invoice/customer content remains prohibited.

**Server-side opt-in (all required):**

- `MANDATEGATE_DEPLOYMENT_ROLE=demo`
- `MANDATEGATE_SYNTHETIC_NON_ZDR_TEST=1`
- `PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com` (already the required Sandbox host)
- `RENDER_SERVICE_ID=srv-db39vmm7bikc73c55nh0` from Render's service metadata (or local development at `http://127.0.0.1:3000` with a non-production Node environment)
- `MANDATEGATE_SYNTHETIC_NON_ZDR_SOURCE_SHA256_ALLOWLIST` set to comma-separated, *exact original-file* SHA-256 values for the approved synthetic pack. Never allowlist arbitrary customer uploads.

**Verified synthetic test PDF allowlist** (SHA-256 computed from `MandateGate_Synthetic_Test_Pack.zip`, `MandateGate_Test_Pack/`):

| Fixture | SHA-256 |
| --- | --- |
| `01_regular_invoice.pdf` | `588932f4953178492e10f50b6eb4dcacada6617307c9a1e99779fe8a95fc6cb4` |
| `02_paid_invoice_replay.pdf` | `4aed9d7799617dbb0e951f5b05c73b9b5570782cdb9f361201dfce865274dcf3` |
| `03_unusual_amount.pdf` | `ea4d793c5e9fa592a64a964d624532aa6ff2410eeb074b3c82115b9fb5290636` |
| `04_changed_receiver.pdf` | `892d7889152b6d6e6d20310f3b7a59cf25e7c3b73ea5882d9c30de781c3ce181` |

**Admin journey:** Sign in, open an uploaded allowlisted PDF's reviewer, read the retention warning, explicitly tick the consent checkbox, then click **Run synthetic test without ZDR**. The server independently checks membership, exact original bytes, SHA, configured demo identity, Sandbox host and live provider privacy metadata (recorded truthfully, not required to pass on the synthetic route) before sending an image. The response must say `SYNTHETIC_NON_ZDR_TEST`, `paymentAuthorized:false`, `paymentExecuted:false`, and observation `ESCALATE` with reason `SYNTHETIC_NON_ZDR_TEST_ONLY`. An image already analyzed is not silently re-run.

**Consent audit:** Every synthetic non-ZDR attempt with accepted acknowledgement must insert an append-only `invoice_synthetic_non_zdr_test_consents` event with the active admin user ID and exact original SHA before external inference. If the database insert fails or the membership is revoked, no model call is made. This event records permission to attempt inference, not proof that a model call succeeded.

**Security regression:** Standard `/observe` and `/api/admin/experiential-privacy` remain strict ZDR-only. The synthetic path still rejects a mismatched model, ignored strict-schema fields, unallowlisted SHA, unauthenticated/foreign-origin calls, missing consent and non-demo/production deployments. A provider may still refuse inference because its own account policy requires ZDR; this exception cannot override provider-side enforcement.

**Release state:** No inference, payment, or provider compliance is implied by code CI. Confirm live deployment SHA, non-ZDR route reachability, and a real authenticated synthetic observation separately. Disable the opt-in flag and remove the allowlist after the demo.

### Free-tier demo exception (2026-10-13)

On the bound demo service only, ZDR, provider `require_no_training`, and provider `capture_prompt_content=false` are **optional** for byte-identical, server-allowlisted fictional fixtures after authenticated admin consent. The preflight still retrieves and records their **actual** boolean values, including false. This does not imply the provider will honor a no-training or no-retention guarantee. The UI explicitly warns that the provider may retain, log, or train on the fictional test content under its terms. Normal `/observe` and `/api/admin/experiential-privacy` remain fail-closed for all three controls. This demo path is not Gate H production privacy evidence.
