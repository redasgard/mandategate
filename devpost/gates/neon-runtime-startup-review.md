# Reversible runtime startup gate

## Critique gate

Step: Integrate a payment-disabled, non-seeding startup path for the approved fresh-Neon transition.
Decision: CONTINUE
Score: 8.8/10
Review independence: self-review, supplemented by local tests and independently executed GitHub Actions.
Scope: merge the tested repair into the existing development branch and verify its disabled-payment original-database mode. Neon activation and hosted acceptance are separate postconditions, not already complete.

## Evidence checked

- Exact source e91199d44d1437da151e710dbf3a77cd266ba0b9.
- Full CI run 38687472004 SUCCESS, including legacy migration/seed replay, typecheck, unit tests, build and smoke.
- Runtime gate 38687504059 / job 116265619289 SUCCESS at 2026-10-15T05:35:33.946Z. Actual job logs inspected.
- 16 local profile tests passed on Node 22.16.0; the same tests passed on CI Node 24.21.0.
- Render service srv-db39vmm7bikc73c55nh0 currently uses build/slice-3-invoice-intake and startup `pnpm db:migrate && pnpm demo:seed && pnpm start` with checksPass auto-deployment.
- PR #4 base 5fad7c57b265f208cbac1f401f5668e6e102bc23; repair source is a descendant. No separate paid service is required.

## Changes and verification

- The three existing package commands enter one validated runtime selector.
- Absent mode preserves legacy initialization. Unlabelled direct-Neon legacy startup and unknown mode strings fail closed.
- `neon-preview` requires the exact intended Neon endpoint/database, explicit payment kill switch, TLS, and an approved app origin.
- `render-preview` requires the exact original Render database identity and also disables initialization and payments. It is the configuration backout mode.
- Neither preview mode runs migrations, seed, credential rotation, or webhook recovery. Runtime test invoked the actual package commands and compared all 32 public-table row fingerprints before login: unchanged.
- Only an explicit small environment allowlist reaches the Next server. PayPal/GLM credentials, demo keys, proof/rotation flags, NODE_OPTIONS, PGHOST and PGOPTIONS are omitted.
- Runtime verification used an intentionally unusable legacy source URL, the real Neon secret, synthetic provider/rotation tripwires, real HTTP admin login, negative dashboard access, and HTTP machine-scope tests. It ended with zero payment executions and confirmed server termination.
- Original DATABASE_URL remains in the parent Render configuration; the Neon URL is a separate NEON_PREVIEW_DATABASE_URL. Selecting a profile does not mutate the supplied environment.
- No vendor/auth/payment schema or credential-reset operation is added.

## Findings

1. HIGH, resolved for this stage: old Render startup would reseed credentials after a direct URL swap. Tested preview commands now skip without loading a database client.
2. HIGH, resolved for this stage: unclear credential inheritance. Preview server receives only allowlisted settings; actual provider secrets are excluded. Gateway and webhook kill switches remain in PR #4.
3. MEDIUM, bounded: backout selection is tested with fixtures, but host-specific original-database readiness must be observed before Neon activation. Do not call it a verified Render rollback yet.
4. LOW: direct Neon connections are retained for the single-instance, already-tested bootstrap path. Pooling optimization is not silently introduced during this change.

Artifact scores: runtime selector 8.9; startup integration 8.8; verification 8.8. Weighted rubric: correctness 9.0, alignment 9.0, evidence 9.0, safety 9.0, completeness 8.0, simplicity 7.5; rounded score 8.8.

## Authorization preflight

Advisory decision: proceed_to_runtime_gate. Side-effect class: external_side_effect (existing development deployment). Authority granted by this Skill: no.

Operator evidence: user approved autonomous AI development, free Neon and a fresh database, then repeatedly requested continuation. This supports bounded implementation and the reversible development transition, not payments, production money movement, paid resources or destructive cleanup. Connected GitHub/Render identity and targets are observed; connectors retain actual admission control.

Exact targets: redasgard/mandategate PR #4 and its development base; Render srv-db39vmm7bikc73c55nh0 in tea-d27bea6uk2gs73dv4up0; existing Neon floral-hill-01811323/neondb. No unrelated account or resource.

Limits: keep original DATABASE_URL and old database intact; no reset, export requirement, new account, credential rotation, public repo publication, GLM inference or PayPal payout. Preserve signing secret. Set payment-disable mode and prohibit proof/rotation startup. Deploy only the tested source (or an equivalent merge tree). Stop on source drift, failed tests, unexpected target, failed startup or connector denial; do not route around a denial.

Runtime gaps: actual authority/grant validation, approval freshness, target enforcement and tool admission remain connector/runtime responsibilities, not claims proven by this document.

## Next gate

1. Merge PR #4 only with exact-head protection after confirming current source/base and successful tests.
2. Verify deployment and source-tree equivalence.
3. Run the existing service in render-preview mode with payments disabled and no initialization; verify health and webhook denial. This checks the preserved original connection without copying it into chat/source.
4. Only then stage the intended Neon URL separately and activate neon-preview, retaining an immediate render-preview backout.
5. Confirm hosted login, scope separation, zero new payment executions, and safe startup before declaring the switch complete. If an external tool blocks a required step, stop there and report its exact boundary.

Requirement coverage: VERIFIED local/CI startup and isolation behavior; UNVERIFIED host-specific configuration transition until separately observed. Do not describe this gate as a financial-security release or proof of the complete P0 product.
