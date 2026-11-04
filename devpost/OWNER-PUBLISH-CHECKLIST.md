# OWNER PUBLISH CHECKLIST — MandateGate → Devpost (deadline Nov 12, 12:00 PT)

Everything below is paste-ready. Steps 1–4 are the ship path (Variant B, current final video).
Step 5 is the optional upgrade (Variant A live payout) — only if you want it before the deadline.

Rule basis (saved verbatim in `devpost/rules-extract.md`, fetched 2026-11-03):
- Functional demo = repo setup/run instructions OR hosted URL (we will have both).
- Repo public + open-source license visible in the About panel.
- Video < 3 min, public on YouTube, linked on the form.
- Tools identified with usage explained.

---

## Step 1 — DONE (2026-11-04): deploy pipeline live, zero owner action

Auto-deploy = **on** for `build/slice-3-invoice-intake`, and a Render API key
(`~/.config/mandategate/render.env`, chmod 600) lets Hermes trigger deploys and read build status
directly. Every push now deploys itself; Hermes verifies each deploy via
`GET /v1/services/<id>/deploys/<deployId>` and then the live site (design consistency + `/api/health`
+ dark payments ledger). No manual deploys, ever.

First deploy took the pipeline end-to-end (2026-11-04): build `dep-dblneqom7kps73c3d1a0` → commit `4f487c87` → **live 18:23:06Z**.
Root cause of the long-stale live site: `autoDeploy=yes` but `autoDeployTrigger=checksPass` — GitHub Actions is dead, so
checks never arrived and deploys never fired. Trigger switched to `commit`. Live verification: CSS chunk rotated
(`0n0fa8rgn54lv.css` → `10z7rz1ldz2mt.css`), zero periwinkle (`#8bb5ff`) in the served CSS, sign-in page renders the
charcoal/copper shell (screenshot-verified).

## Step 2 — Make the repository public (2 minutes, you)

Why: submission requires a public repo with the license visible at the top of the page.

1. https://github.com/redasgard/mandategate → Settings → General → Danger zone → "Change visibility" → Public.
2. Confirm the About panel now shows **MIT license** (the LICENSE file is already in the repo and GitHub
   already detects `mit`; making the repo public is the only missing step).
3. Tell me. I will verify: anonymous clone works, About shows the license, README run instructions reachable.

## Step 3 — Upload the video to YouTube (10 minutes, you)

Why: the form requires a public YouTube link.

1. Upload file: `/home/valh4x/.hermes/profiles/product/cache/scratch/mg-audit/final-video/MandateGate_DEMO.mp4`
   (SHA256 `67804bfb…`, 165.75 s, 1440×810, H.264/AAC)
2. Title, description, tags, visibility: copy-paste from `devpost/youtube-description.txt`.
3. Tell me the URL. I will verify: public viewable, duration < 3:00, description intact.

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

**Sponsor prizes to select (if the form asks):** Best Use of AG Grid; Best Use of Render.
**Categories:** PayPal + AI; Agentic Commerce; Business operations/security (choose what the form offers).

**Testing instructions for judges (paste):**
> Run locally (deterministic, no financial transfers): clone the repo, `pnpm install --frozen-lockfile`,
> copy `.env.example` to `.env.local`, configure an isolated PostgreSQL 18 `DATABASE_URL`, a fresh 32+ char
> `BETTER_AUTH_SECRET`, local admin credentials and two local-only agent keys, and set
> `MANDATEGATE_DISABLE_PAYMENTS=1`; then `pnpm db:migrate`, `pnpm demo:seed`, `pnpm dev`. Full runbook
> including the three fictional agent API cases (ALLOW / ESCALATE / DENY) is in
> `devpost/final-judge-instructions.md`. No PayPal credentials, real invoices or production money are
> required or used. The hosted URL is supplementary.

**Honest-evidence note (keep the wording truthful):** the video's PayPal scene shows ARCHIVED Sandbox
evidence, labeled as archived. Do not change it to claim a live invoice-derived payout unless Variant A
is actually recorded (Step 5).

## Step 5 — OPTIONAL upgrade: Variant A (real Sandbox payout on camera)

Only if you want it. Requires: (a) the one-shot Sandbox payout you already authorized for
`MG-SANDBOX-101-2026`, USD 1.01 (see below); (b) create `~/.config/mandategate/live-admin.env` (chmod 600):

    EMAIL=<your live admin email>
    PASSWORD=<your live admin password>

Then tell me and I record the live invoice→payout chain on the deployed site, re-cut scene 07 with the
real footage, and re-run QA. If it doesn't happen, the current cut is already submission-ready.

## Publish-time edits I will do after Steps 1–3

- Update `devpost/final-judge-instructions.md`: repo is now PUBLIC; insert the YouTube URL; refresh the
  hosted-access note.
- Post the final status (live URL + video URL + commit) to PR #73.

## Do NOT change at publish time

- Do not enable production PayPal. Sandbox only.
- Do not paste credentials anywhere public (repo, form, video, description).
- Do not alter the video or description to claim a live payout for the fictional invoice.
