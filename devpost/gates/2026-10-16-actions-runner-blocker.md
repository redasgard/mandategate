# MandateGate | GitHub Actions pre-run failure and usage control

**Status:** GitHub-hosted Actions quota EXHAUSTED, owner-confirmed October 16 PT; the connected API corroborates failure before runner assignment. The available tools do not expose the account billing ledger. No paid minutes authorized.
**Observed:** 2026-10-16 PT / 2026-10-17 UTC.
**Repo:** private redasgard/mandategate.
**Development head:** e2506bd42633baa86dd1c845f098d074be525448.
**Last verified Render LIVE:** 1c6d1711218d29faeacebbd45c76b46f96378474 at mandategate-web.onrender.com. Render is configured to deploy the development branch only after checks pass.

## Direct GitHub evidence

- Push Actions run [38994299004](https://github.com/redasgard/mandategate/actions/runs/38994299004), exact head e2506bd, failed before any runner steps; one failed-job retry also failed. GitHub job records show empty steps and a blank runner name; attempted log download returned BlobNotFound, not an application stack trace.
- PR Actions run [38994301931](https://github.com/redasgard/mandategate/actions/runs/38994301931), same exact SHA, likewise failed before runner assignment.
- GitHub timing reported 0 ms billable Ubuntu execution for the failed push job attempts. This observation does not prove that the GitHub account has remaining minutes.
- Separate draft [PR #35](https://github.com/redasgard/mandategate/pull/35) failed push and PR checks the same way, before source tests could execute. Therefore **neither application tests nor invoice-list UI are known to be broken from these failed runs**.
- The immediately preceding integrated commit 1c6d171 passed both push and PR CI, migration/seed replay, TypeScript, tests, production build and smoke, and was reported LIVE by Render.
- Exact-tree PR #34 premerge CI succeeded (head 12024fe51) and its squash-merge e2506bd contains the same Git tree. This supports expected code equivalence but does **not** replace required postmerge CI or production deployment checks.

## Confirmed by owner: private Actions minutes exhausted

The owner confirmed on October 16 PT that GitHub Actions is outside the free tier. GitHub documentation confirms private GitHub-hosted jobs consume a quota, while self-hosted runner jobs do not. Blank runner and zero executed steps are consistent with the owner's diagnosis, but exact account billing details are not exposed by the connected API. No billing change or repo-publication shortcut is authorized.

Official sources:
- https://docs.github.com/en/billing/concepts/product-billing/github-actions
- https://docs.github.com/en/actions/how-tos/troubleshoot-workflows

## Immediate no-billing CI workaround (prepared, NOT yet executed)

Draft PR #37 now includes `scripts/ci-local.sh`, `scripts/ci-local-run.sh`, and `ci/docker-compose.local.yml`. They archive an **exact committed Git SHA**, exclude untracked host `.env.local`, mount only a disposable source snapshot, and use ephemeral PostgreSQL 18 + Node 24.21.0 with synthetic CI-only secrets. The complete checks remain: lockfile install, migrations x2, demo seeds x2, typecheck, Vitest, Next build, authenticated HTTP smoke. No real PayPal/AI/Neon credentials are forwarded. The wrapper preserves `ci-evidence/` privately, returns nonzero on any failure and cleans up containers and DB even after a failed run.

First run from a private, authenticated local git clone (Docker Engine + Compose v2 and Git already installed):

```sh
git fetch origin refs/pull/37/head:ci-local-fallback
git switch ci-local-fallback
bash scripts/ci-local.sh pr:39
```

The wrapper fetches PR #39 without merging, then executes the **exact PR head** in an archived snapshot. To test current development, run `git fetch origin build/slice-3-invoice-intake && bash scripts/ci-local.sh origin/build/slice-3-invoice-intake`. Logs are ignored by Git and include the source SHA. All execution is **local to the user's machine**, not a GitHub check, Render deployment or payment authorization. Full Docker-backed execution remains UNVERIFIED here because the available tool container has no Docker daemon or private Git checkout; only static shell syntax and Compose YAML parsing were completed.

### Future automatic zero-extra-minute route

GitHub's current billing docs say repository-scoped **self-hosted Actions runners are free** even when private GitHub-hosted free minutes are exhausted. The announced $0.002/min self-hosted platform charge was postponed. A runner VM still incurs the owner's own machine/power costs.

Provision a **dedicated isolated Linux VM** (not the everyday personal machine, and not an unrestricted Docker socket host) and register a repo-scoped runner through GitHub's **Settings → Actions → Runners → New self-hosted runner**. Select GitHub's current install commands and a custom label `mandategate-ci`; never paste its short-lived registration token into chat or a PR. When the runner is **online**, change the existing CI job's `runs-on` to `[self-hosted, linux, x64, mandategate-ci]`, preserving all verification steps. Allow PR CI **only from trusted same-repository branches**, not untrusted forks. Keep the current GitHub-hosted job disabled after migration or its failed checks will continue to block Render. Verify exact-head CI and actual Render `checksPass` deployment before declaring a fix.

Do not switch workflow labels before the runner exists. Do not move the private repo to public just to recover minutes; publication requires a separate secrets and intellectual-property review. At the authorized public release, standard GitHub-hosted Ubuntu Actions are free again. Sources: https://docs.github.com/en/billing/concepts/product-billing/github-actions ; https://docs.github.com/en/actions/concepts/runners/self-hosted-runners ; https://github.com/resources/insights/2026-pricing-changes-for-github-actions .

**Render guard remains intact:** service `srv-db39vmm7bikc73c55nh0` has `autoDeployTrigger=checksPass`. A passing **local** log does not create a GitHub check and therefore does not auto-deploy. Render's manual deploy of a **specific SHA** is an exceptional R2 action requiring full local tests, independent financial review and explicit owner deployment approval. Do not change Render auto-deploy to `commit` to work around CI.

## One necessary account-owner check

1. In GitHub, open **Settings → Billing and licensing → Usage** and **Budgets and alerts** for the repository owner's account. Look at GitHub Actions minutes/spend, any $0/stop-usage budget, payment method warnings or account hold. Do not increase spending or add a card without explicit owner approval.
2. If billing looks healthy, inspect **redasgard/mandategate → Settings → Actions → General**, the failed-run page banner, and any runner-service alerts. If none explains it, contact GitHub Support with run IDs 38994299004 and 38994301931 and blank-step/BlobNotFound evidence.
3. After the issue is resolved, rerun **one** failed exact-head CI run. Do not trigger batches of redundant retries before the account-level condition changes.
4. Require a complete job with migration/seed idempotence, TypeScript, Vitest, production build and smoke SUCCESS for e2506bd; then verify Render's deployed SHA is e2506bd and service health remains normal. Review draft PR #35 against current code and rerun its exact-head CI before any merge.
5. Only after stable CI is confirmed should the trigger-deduplication change in this PR be considered for integration. It reduces future consumption; it does not fix a depleted allowance or backend runner restriction.

## CI budget mitigation proposed in this PR

Old workflow: unconditional push and pull_request across all branches. A feature-branch commit with an open PR creates redundant CI jobs; development branch commits with the open PR #2 also create two runs.

Proposed:
- Keep push CI for main and build/slice-3-invoice-intake, preserving Render checksPass deployment and integration verification.
- Run feature-branch CI via the pull_request event instead of every unreviewed push.
- Permit explicit workflow_dispatch for isolated pre-PR testing **only after** this workflow is merged into the default main branch. GitHub requires the dispatch trigger in the default branch; it is not an immediate unblock for the current private development branch.
- Cancel superseded same-event/same-ref CI attempts to avoid burning minutes on stale commits. Do not cancel a push check merely because a PR check for the same commit exists.
- Keep the exact same verify job, PostgreSQL 18 service, migrations, seed twice, typecheck, tests, production build and smoke. No reduced test coverage is proposed.

**Limits:** YAML structural review is not a real GitHub runner test. Never interpret the trigger policy as a security/release approval or as proof the existing e2506bd integration is deployed. Financial Gate H, independent issuer/auth verification, public repository release and PayPal payout remain separately BLOCKED.
