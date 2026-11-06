# OWNER PUBLISH CHECKLIST — MandateGate → Devpost (deadline Nov 12, 12:00 PT)

Everything below is paste-ready. Steps 1–4 are the ship path; the current final video is **Variant A**
(the live invoice-derived payout cut — Step 5 is DONE, completed 2026-11-06).

Rule basis (saved verbatim in `devpost/rules-extract.md`, fetched 2026-11-03):
- Functional demo = repo setup/run instructions OR hosted URL (we will have both).
- Repo public + open-source license visible in the About panel.
- Video < 3 min, public on YouTube, linked on the form.
- Tools identified with usage explained.

---

## Pre-submission verification (2026-11-05) — all green

- **Cold-clone judge test (the functional-demo gate):** cloned the repo fresh, followed the README verbatim
  (pnpm install --frozen-lockfile -> .env.local -> db:migrate (28 migrations) -> demo:seed -> pnpm dev),
  then ran the three documented agent API cases: ALLOW `WITHIN_TRUSTED_BASELINE`, ESCALATE
  `AMOUNT_OUTSIDE_VENDOR_BASELINE`, DENY `DESTINATION_MISMATCH`, all with `paymentExecuted:false`.
  Browser sign-in + /payments ledger (3 rows, dark themed) verified on the clone.
- **Default branch:** `hackathon` (clean judge-facing name; identical commit tree to the deployment branch `build/slice-3-invoice-intake`, which Render deploys). `main` is a divergent historical line (49 commits never merged); reconciling it properly is post-submission work.
  A judge cloning the repo now gets the real application directly.
- **Docs:** README + judge instructions refreshed to current facts; stale links replaced.
- **Live site:** deploy `f007cec4` (same tree; post-identity-rewrite SHA) live 2026-11-05; `/api/health` OK (free-tier cold start may need one retry).
- **Live settlement (2026-11-06):** the reviewed invoice MG-SANDBOX-101-2026 (USD 1.01) was approved on the
  deployed host and exactly one PayPal Sandbox payout executed and reconciled: batch `8H4CEWS6ZBVZE`,
  item `PNMP9YWACK74E`, execution PAID, provider raw SUCCESS. DB readback: exactly one execution.
  Footage: `~/mandategate-submission/take10/`. Video master: Variant A
  (`1b43fe99…`, 170.76 s) — see `video/QA_REPORT.md`.

## Step 1 — DONE (2026-11-04): deploy pipeline live, zero owner action

Auto-deploy = **on** for `build/slice-3-invoice-intake`, and a Render API key
(`~/.config/mandategate/render.env`, chmod 600) lets the operator trigger deploys and read build status
directly. Every push now deploys itself; each deploy is verified via
`GET /v1/services/<id>/deploys/<deployId>` and then the live site (design consistency + `/api/health`
+ dark payments ledger). No manual deploys, ever.

First deploy took the pipeline end-to-end (2026-11-04): build `dep-dblneqom7kps73c3d1a0` → commit `7b4cb68f` → **live 18:23:06Z**.
Root cause of the long-stale live site: `autoDeploy=yes` but `autoDeployTrigger=checksPass` — GitHub Actions is dead, so
checks never arrived and deploys never fired. Trigger switched to `commit`. Live verification: CSS chunk rotated
(`0n0fa8rgn54lv.css` → `10z7rz1ldz2mt.css`), zero periwinkle (`#8bb5ff`) in the served CSS, sign-in page renders the
charcoal/copper shell (screenshot-verified).

## Step 2 — Make the repository public (2 minutes, you)

Why: submission requires a public repo with the license visible at the top of the page.

1. https://github.com/redasgard/mandategate → Settings → General → Danger zone → "Change visibility" → Public.
2. Confirm the About panel now shows **MIT license** (the LICENSE file is already in the repo and GitHub
   already detects `mit`; making the repo public is the only missing step).
3. Verification then runs: anonymous clone works, About shows the license, README run instructions reachable.

## Step 3 — DONE (2026-11-06): video live on YouTube

URL: https://www.youtube.com/watch?v=7omQ8iUv1Q0 — verified public, 171 s (2:51), description intact
(chapters + links + settlement ids). Original instructions kept for reference:

Why: the form requires a public YouTube link.

1. Upload file: `/home/valh4x/mandategate-submission/video/MandateGate_DEMO.mp4`
   (Variant A — SHA256 `1b43fe99…`, 170.76 s, 1440×810, H.264/AAC — stable master dir, see its README)
2. Title, description, tags, visibility: copy-paste from `devpost/youtube-description.txt`.
3. Verification then runs: public viewable, duration < 3:00, description intact.

## Step 4 — Submit on Devpost (15 minutes, you + the paste blocks below)

Form: https://paypalaihackathon.devpost.com/ → "Submit project"

**Project title:** MandateGate

**Elevator pitch / tagline:** The payment firewall for autonomous AI agents.

**Project URL (Try it out):** https://mandategate-web.onrender.com
**Repository:** https://github.com/redasgard/mandategate
**Video:** (YouTube URL from Step 3)

**Full description:** copy everything from `devpost/submission-copy-final.md` (sections
Inspiration → What's next), then the Tools section below.

**Tools used (name + how each was used):**
- **PayPal Payouts REST API (Sandbox):** the payment adapter — server-side OAuth, durable idempotency,
  remote payout status, signed webhook receipts and automated reconciliation.
- **GLM-5.3 Flash (Experiential Labs):** advisory invoice-content observations and extraction suggestions;
  the model cannot grant payment authority.
- **AG Grid (Community, MIT):** the payment-decision ledger on the investigation surface — sortable
  columns, quick filtering, pagination over scoped records; themed to the product shell.
- **Render:** hosts the Next.js application (the deployment the repo deploys to).
- **Neon PostgreSQL:** persistence for payment requests, decisions, invoices, policy and authority records.
- **Next.js / React / TypeScript / Better Auth / Drizzle:** application + auth stack.
- **Edge neural TTS:** the demo's narrated voice-over (US English).
- **Playwright:** automated browser testing + the demo recording pipeline.

**Sponsor prizes to select (if the form asks): ALL sponsor prizes offered** (owner decision 2026-11-06).
Known sponsor prizes: Best Use of AG Grid; Best Use of Render.
**Categories:** PayPal + AI; Agentic Commerce; Business operations/security (choose what the form offers).

**Testing instructions for judges (paste):**
> Run locally (deterministic, no financial transfers): clone the repo, `pnpm install --frozen-lockfile`,
> copy `.env.example` to `.env.local`, configure an isolated PostgreSQL 18 `DATABASE_URL`, a fresh 32+ char
> `BETTER_AUTH_SECRET`, local admin credentials and two local-only agent keys, and set
> `MANDATEGATE_DISABLE_PAYMENTS=1`; then `pnpm db:migrate`, `pnpm demo:seed`, `pnpm dev`. Full runbook
> including the three fictional agent API cases (ALLOW / ESCALATE / DENY) is in
> `devpost/final-judge-instructions.md`. No PayPal credentials, real invoices or production money are
> required or used. The hosted URL is supplementary.

**Honest-evidence note (keep the wording truthful):** the video's PayPal scene shows the REAL live
invoice-derived Sandbox payout (batch `8H4CEWS6ZBVZE`, item `PNMP9YWACK74E`, reconciled to PAID/SUCCESS),
captured on the deployed host under the single-POST fence. It is a bounded $1.01 sandbox test on the
reviewed invoice — do not alter the video or description to claim anything beyond that (no production
PayPal, no real supplier).

## Step 5 — DONE (2026-11-06): Variant A recorded (real Sandbox payout on camera)

Completed. The authorized one-shot payout for `MG-SANDBOX-101-2026` (USD 1.01) was executed on the
deployed host and reconciled; the recut (Variant A master) replaces the archived-evidence scene with
that live chain and passed the full QA battery (see `video/QA_REPORT.md`). Original instructions kept
for reference: required (a) the one-shot Sandbox payout for `MG-SANDBOX-101-2026`, USD 1.01;
(b) `~/.config/mandategate/live-admin.env` (chmod 600):

    EMAIL=<your live admin email>
    PASSWORD=<your live admin password>

The live invoice→payout chain was then recorded on the deployed site, scene 07 was re-cut with the
real footage, and QA was re-run.

## Publish-time edits after Steps 1–3

- `devpost/final-judge-instructions.md`: repo is now PUBLIC; YouTube URL inserted; hosted-access note refreshed.
- Post the final status (live URL + video URL + commit) to PR #73.

## Do NOT change at publish time

- Do not enable production PayPal. Sandbox only.
- Do not paste credentials anywhere public (repo, form, video, description).
- Do not alter the video or description to claim a live payout for the fictional invoice.
