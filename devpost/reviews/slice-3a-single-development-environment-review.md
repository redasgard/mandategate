# Gate H: one development environment architecture simplification

**Step:** Undo staging-resource coupling without weakening the PayPal/AI authority boundary.

**Decision:** CONTINUE to isolated branch CI and existing-development-environment integration. **BLOCK** invoice-derived payout and Gate H release until full live evidence passes. **Deletion remains manual.**

**Review independence:** self-review based on GitHub source diffs, Render service/deploy metadata, and isolated CI (subsequent green run required before completion).

**Score:** 8.7/10 for narrowed code change; infrastructure cleanup incomplete while paid DB exists.

## Evidence checked

- Existing Render development web ID `srv-db39vmm7bikc73c55nh0`, existing free PostgreSQL `dpg-db39d5rbc2fs73d1ke70-a`.
- Extra web `srv-db4367u0tbcc73cugar0` reports two `build_failed` deployments, no successful launch or recorded HTTP request metrics.
- Extra paid DB `dpg-db4351rl550s73acup8g-a` reports `available`, plan `basic_256mb`. Database tables cannot be inspected from the hosted connector due an empty external IP allowlist. Application-generated contents are unlikely but not provably empty; manual access remains possible.
- GitHub commit `df9b7608e5b1a7038a4318148eb979e2daa1217d` removes staging-only guards from migration/seed/startup, and removes paid staging requirements from Gate H bounded Sandbox validation. Exact Sandbox domain, approved payment tuple, remote one-POST fence and synthetic GLM source SHA allowlist remain.
- No service-delete or Postgres-delete action is exposed by the connected Render plugin. Deletion cannot be claimed until the user deletes resources and a subsequent read confirms absence.

## Findings
1. **HIGH (cost and cleanup):** Paid DB is still available and billable. Required repair: operator deletes exactly `dpg-db4351rl550s73acup8g-a` in Render; confirm its absence. Delete extra staging web `srv-db4367u0tbcc73cugar0`, too. Do not alter existing free DB or live development web.
2. **MEDIUM (test confidence):** Changed code must clear frozen-lockfile, TypeScript, tests, migrations, seed, build and smoke CI on the new commit before integration. Staging isolation tests removed intentionally; payout safety tests retained.
3. **HIGH (Gate H):** Existing dev service still tracks `build/slice-2-gated`. Slice 3 code, live GLM privacy, actual issuer attestation, authenticated reviewer, exact Sandbox single POST and webhook were not tested on deployed Slice 3.
4. **MEDIUM (data uncertainty):** Lack of successful web deployments and HTTP traffic does not prove no direct DB writes. Check for user data before manual deletion.

## Requirement coverage
- VERIFIED: extra web never successfully deployed; paid DB resource exists; connected Render lacks delete operations; source changes are scoped to staging coupling, with no live payment execution.
- UNVERIFIED: actual deletion, content of paid DB, hosted Slice 3 integration, real GLM and PayPal outcomes.
- INCORRECT: stating paid DB has been deleted or Gate H is ready for release.

## Repair order
1. User deletes paid DB and extra web with exact IDs in Render; verify disappearance.
2. CI verifies the simplified branch, then review deployment impact.
3. Demonstrate synthetic ALLOW/ESCALATE/DENY against PayPal Sandbox from existing development environment. Keep PR #2 draft until actual source-to-sink Gate H review.

**Next gate:** code CI and explicit Render resource deletion confirmation. Gate H stays BLOCKED.
