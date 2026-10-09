# Slice 3: admin invoice intake + origin registry, source-to-T2 HTTP verification

## Critique gate
**Step:** Build a judge-usable, signed-in PDF/image invoice intake and vendor-channel registration without trusting unstructured content as payment authority.
**Decision:** **CONTINUE** to existing-development-environment hosted verification. **BLOCK** Gate H/live payout/PR merge.
**Score:** **8.7/10** for code-level source-review integration, NOT release readiness.
**Review independence:** **self-review** with deterministic GitHub Actions and live Next.js HTTP smoke. No independent human browser tester or live supplier.

### Evidence checked
- Commit `b52ca996b64b3f7bd9a404f7edaaa71fbc837342`, workflow `37874974336` SUCCESS: PostgreSQL 18 migrations and seed each run twice, TypeScript, 28 test files / 172 tests, Next production build and `pnpm smoke`.
- `app/api/admin/invoice-artifacts/route.ts`, `src/artifacts/postgres-store.ts`, `app/invoice-artifacts/upload-form.tsx`: admin-only raw source upload, per-tenant membership re-check in DB transaction, exact bytes/SHA, file bounds and quota, zero monetary authority.
- `app/api/admin/vendor-origin-channels/route.ts`, `src/authority/origin-channel-enrollment.ts`, `drizzle/0014_origin_channel_enrollment_unique.sql`, `app/vendor-origin-channels/*`: pre-invoice known-channel enrollment, actor+vendor+org digest, DB timestamp, idempotent replay and separate human assertion label.
- `next.config.ts`: `pdfjs-dist` kept external to Next server chunks to fix observed live HTTP PDF_PARSE_FAILED. `app/api/admin/invoice-artifacts/[id]/pdf-pages/route.ts`: accepts empty framework POST, refuses nonempty bodies.
- `scripts/smoke.ts` tests real Better Auth session and Same Origin, channel registration **with synthetic fixture evidence**, original PDF SHA/source read, page parse, five T2 values, mutated receiver 422, absent T3 causal ESCALATE, zero payouts. The earlier CI failure from missing pdf.worker.mjs was actually resolved in the green run.

### Artifact scores
| Artifact | Score | Main weakness |
|---|---:|---|
| Admin upload and exact source storage | 9.0 | No hosted Render browser verification |
| Pre-invoice vendor source enrollment | 8.4 | Human assertion is not an externally authenticated supplier record |
| Next.js PDF parser and T2 integration | 9.0 | CI verifies one bundled runtime, not Render build packaging |
| Financial authority negative controls | 8.8 | Source-only scenario is blocked, but no authenticated T4 + live Payouts evidence |

### Findings
1. **MEDIUM — Human-attested source channel cannot be equated with real issuer identity.** The UI accepts a user-supplied reference, typed outside the invoice; CI supplies a fake portal event. Require a real independent ERP/portal/callback record before treating a live invoice as issuer-authenticated. No code may self-promote human prose into a verified external fact.
2. **MEDIUM — Hosted UI and deployment were not exercised.** Test same-origin cookies, PDF.js worker resolution and actual reviewer flow on existing development service after controlled branch cutover. CI production Next server is necessary but not identical to Render.
3. **MEDIUM — Remaining source-to-payout path unverified.** The smoke intentionally stops at missing T3 and proves zero payments. Separate exact T3/T4 actor actions, live GLM privacy checks, one authorized Sandbox Payouts POST and webhook reconciliation must be independently observed before Gate H passes.
4. **LOW — Stored source is a bounded dev-demo document store, not a general production ingestion pipeline.** Enforced 10 MiB file limit, per-org byte/count quota and tenant checks fit hackathon scope. Do not silently relax limits for scanned PDFs.

### Requirement coverage
- **VERIFIED:** signed-in HTTP admin upload; real independent PDF text preparation in Next production build; T2 five critical fields; source hash and tenant checks; invalid receiver rejected; absent issuer escalated; no payout; CI typecheck/migrations/tests/build/smoke.
- **UNVERIFIED:** real issuer callback, interactive hosted reviewer, GLM actual serving route/ZDR, PayPal Sandbox invoice payment, remote webhook/reconciliation.
- **INCORRECT:** “Gate H passed”, “independently verified supplier” or “Slice 3 deployed”.

### Repair order
1. Deploy exact reviewed branch to existing dev app only after confirming credentials/DB and rollback, then exercise signed-in reviewer through browser/HTTP.
2. Obtain verifiable independent issuer evidence and check actual Experiential policy/served model metadata using synthetic fixtures.
3. Run three-case ALLOW/ESCALATE/DENY end-to-end, single-authorized Sandbox payout and verified webhook, then independent release review.

**Next gate:** CI remains green; **CONTINUE** bounded dev integration. **BLOCK** payout until all external evidence.


## Subsequent Gate F / T4 HTTP proof addendum (2026-10-08 PT)

**Evidence:** `1f6712d0a33476b2319ec84e70f696fc293031e3`, [Actions run 37875399344](https://github.com/redasgard/mandategate/actions/runs/37875399344), 28 files / 172 tests, all migration/seed/type/build/smoke checks SUCCESS. The same Next.js production HTTP test now covers simulated source-channel enrollment **before** invoice ingestion, signed-in T2 proof, missing-T3 escalation, admin T3 attestation, freeze and T4 exact-tuple approval, stale digest and approval-replay denial. Zero PayPal executions.

**Review finding:** This is a **synthetic demonstration of the internal human assertion mechanism**, not real issuer authentication; a forged reference could pass if an authenticated admin lies or is compromised, so an external record must be checked before claiming genuine authorization. The caller is a seeded CI admin, not an independent real operator. We do not turn the T4 simulation into a payout test merely because it generated an AUTHORIZED state.

**Decision:** CONTINUE to single-existing-development-environment hosted proof; **BLOCK** external PayPal execution and PR merge pending real issuer, Experiential serving-ZDR, human validation and full three-case remote evidence.
