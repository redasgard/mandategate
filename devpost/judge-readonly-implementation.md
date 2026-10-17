# Judge-only access | draft implementation and release gate

**Status:** ISOLATED CODE ONLY. No account has been created, no Render change, no GitHub/Devpost publication, no actual judge session and no full CI pass.

## Security boundary

- The existing `organization_admin_memberships` schema already allows `REVIEWER`. A judge account receives only active `REVIEWER` membership in `org_demo`, **never `ADMIN`**. No schema migration or public sign-up is needed.
- `/judge` and `GET /api/judge/scenario?case=normal|anomaly|substitution` require a Better Auth session, exact payments-disabled Neon preview host/profile, and current active role `REVIEWER`. Missing/revoked membership fails closed.
- The endpoint runs the real deterministic policy function on **three fixed synthetic scenarios**. It accepts no amount, vendor, recipient, payment instruction or external model text from the request. It makes no canonical payment request, payment-domain write, PayPal call or model request. Better Auth can refresh a login session; this is **not** a guarantee of zero database writes. The three outcomes are a **policy simulation**.
- Before each policy response and at page render, read the **all-source demo organization execution count**. A nonzero/malformed count blocks replay. This is a read-side safety check, not a transaction-serialization guarantee.
- The judge page may show previously saved T1 model observations only when **all** conditions hold: explicit organization-bound, source-SHA-bound non-ZDR synthetic consent; model disposition `ESCALATE`; no observation error; and the original artifact SHA appears in the separate operator-reviewed `JUDGE_SYNTHETIC_SOURCE_SHAS` allowlist. The default allowlist is empty. It does not download or expose original document bytes.
- The PayPal panel contains **archived historical direct-agent Sandbox proof** and explicitly says it did not originate from those GLM documents and has not been freshly reconciled in this view.
- All existing payment and authority admin routes continue to require `ADMIN` membership or call organization-scoped services that enforce it. This statement requires final route-by-route integration/security review before publication; isolated source inspection is not proof of all paths.

## Provisioning (NOT executed)

An operator must separately approve account creation and run the one-time script in a reviewed, payments-disabled demo environment after full CI/security acceptance. The environment requires:

- `JUDGE_ACCOUNT_PROVISION_APPROVED=YES`: explicit one-time operator gate
- `JUDGE_DEMO_EMAIL`: distinct fictional judge login, not development admin
- `JUDGE_DEMO_PASSWORD`: secret at least 24 characters, **never committed, echoed or included in CI**
- Existing Better Auth/Neon demo environment, with `MANDATEGATE_DISABLE_PAYMENTS=1`, `MANDATEGATE_RUNTIME_MODE=neon-preview`, and the exact approved Neon database endpoint

The post-login return URL is restricted to `/judge` and `/dashboard`; the judge login handoff uses `/sign-in?returnTo=%2Fjudge`. A byte-identical locally tested redirect helper passed 13/13 cases (duplicate parameters and off-origin targets rejected), plus strict TypeScript syntax. That is **not** a Next.js browser/integration test. A local smoke runner `scripts/verify-judge-hosted.mjs` is prepared for once the instance and account are approved and deployed, and will not submit any payment.

The script is `scripts/provision-judge.ts` and is **not invoked by migration, startup or demo seed**. If the user already exists, it fails rather than promoting/demoting roles or resetting their password. The account receives no direct payout, model-provider or machine API key.

Separately, after inspecting each exact original fictional source document, the operator may configure up to three comma-separated SHA-256 values in `JUDGE_SYNTHETIC_SOURCE_SHAS`. Empty value means **no model observations** in judge view, not a privacy bypass. No SHA should be allowlisted solely because a user checked `synthetic` in the app.

## Mandatory pre-release evidence

1. Exact-sha lint, TypeScript, Vitest (including `tests/judge-readonly.test.ts` and `tests/judge-scenario-route.test.ts`), Next build, migrations/seed, authenticated smoke, no payment calls.
2. Independent security review of every authenticated `/api/admin` route and underlying membership check, particularly payout submission, escalation approval, source downloads and provider inference; confirm a `REVIEWER` is rejected even if it directly calls their URLs.
3. Run the reviewed read-only HTTP acceptance script after authorized account provisioning, then witness two independent clean-browser sessions with the dedicated judge credentials: `/judge` visible; `/dashboard`, `/payments/:id`, invoice download, privileged APIs and action routes inaccessible or non-disclosing; session revocation makes subsequent `/judge` reads fail.
4. Exact three policy outcomes with real reason codes and no **payment-domain** database mutations or Payouts POSTs. Zero execution rows before and after; induce a nonzero/malformed-count fixture to prove fail-closed behavior.
5. Verify each AI observation on the judge page against consented byte-exact, reviewed fictional source and non-ZDR disclosure. No personal documents.
6. Verify Render SHA parity and stable uptime/recovery through the December judging period.
7. Share credentials only through authorized Devpost testing instructions after publication review, **never** in source/video/logs.

**Gate:** Reviewer-only code is not a substitute for strict invoice-to-PayPal Gate H. Strict ZDR, real issuer authentication, money authorization, public release and Devpost submission remain separately BLOCKED.
