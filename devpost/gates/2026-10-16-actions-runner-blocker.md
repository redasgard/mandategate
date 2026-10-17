# MandateGate | GitHub Actions pre-run failure and usage control

**Status:** BLOCKED external CI. This file is a runbook, not a verified diagnosis of GitHub account billing.
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

## Plausible causes, not confirmed

GitHub documentation states that private repositories draw GitHub-hosted Actions minutes from the repository owner's plan; exhausted included minutes without an eligible payment method or capped spending budget can block new execution. The job's blank runner and steps also fit a GitHub runner orchestration/entitlement issue. GitHub's actual account-specific error banner and billing usage are not visible through the connected tools, so **do not assert quota exhaustion as fact**.

Official sources:
- https://docs.github.com/en/billing/concepts/product-billing/github-actions
- https://docs.github.com/en/actions/how-tos/troubleshoot-workflows

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
