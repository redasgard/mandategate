# Gate H-G1: GLM privacy and adversarial staging preflight

## Critique gate
**Step:** Produce metadata-derived Experiential Labs privacy receipts and a staging-only exact-SHA synthetic image observation lane.
**Decision:** CONTINUE to staging configuration preflight only; real GLM observation and Gate H release remain BLOCKED.
**Score:** 8.5/10 for code-level safety and readiness.
**Review independence:** self-review with independent GitHub Actions TypeScript/build/DB regression checks.

### Evidence checked
- Commit `aaf75f5fee0b9301fbc3c734e4733266c9c025eb` and GitHub Actions `37856010215`, success: 23 files / 155 tests, typecheck, migration/seed replay, build, health/smoke.
- `src/ai/gateway/experiential-vision.ts` calls actual provider account metadata endpoints and checks ZDR/no-training/capture off/model capability before returning an accurately labeled policy receipt. Its live image serving response guard still checks served model, ZDR header, request ID, ignored request parameters and strict response structure.
- `scripts/verify-experiential-vision-privacy.ts` no longer hardcodes privacy success fields: returns the validated receipt after real API responses, with `servingRouteVerified:false`.
- `app/api/admin/experiential-privacy/route.ts` requires actual admin session; GET only, metadata-only, no image inference.
- `app/api/admin/invoice-artifacts/[id]/adversarial-glm/route.ts` disabled except `MANDATEGATE_STAGING=1` AND `GATE_H_LIVE_GLM_PROOF_ENABLED=1`; requires real admin session + same origin + the exact allowlisted synthetic artifact hash. It creates advisory model observations only, never payment requests.
- `tests/invoice-vision-gateway.test.ts` mock provider controls; API tests verify disabled, anonymous and forged-origin failures. No provider secret or invoice bytes used during CI.

### Artifact scores
| Artifact | Score | Main weakness |
|---|---:|---|
| Account policy preflight receipt | 8.8 | Live account not connected in this environment |
| Model serving route proof | 8.8 | Only mocked to date |
| Staging synthetic SHA allowlist | 8.7 | Requires independently validated synthetic fixture classification |
| Adversarial source-to-authority proof | 7.0 | No real model-to-payment experiment yet |

### Findings
1. **MEDIUM:** Actual Experiential account ZDR/no-training/capture-off metadata and actual model-serving response have not been read. Must execute with real isolated staging key and record authenticated request IDs, provider and ZDR evidence without logging prompts.
2. **MEDIUM:** Synthetic allowlist is operator configured; a human must verify each image contains no real customer data before allowlisting. One hash may only be analyzed once due idempotent worker design.
3. **MEDIUM:** Live actual model adversarial cases and PDF parser-to-model composition are still unverified; the image-only model path must never become source or payment authority.
4. **MEDIUM:** Staging Render service/domain/DB/env not yet created or verified. Exposing this route without staging flags plus exact allowlist would be unsafe.

### Requirement coverage
- VERIFIED: code-level privacy metadata behavior, fail-closed serving-response checks and environment gating; 155 CI tests.
- UNVERIFIED: live provider account privacy settings, real provider served request/response, genuine malicious image, hosted route.
- INCORRECT: claiming live GLM evidence based only on mock CI or code fields.

### Repair order
1. Confirm Render workspace; isolate staging DB/keys before any provider inference.
2. Run admin-only metadata preflight, record org/route checks without secrets.
3. Validate a synthetic, noncustomer image and its SHA-256 before allowlisting, then run one model request; record served model/ZDR headers, request ID, reasons, and zero payment authority.
4. Complete the distinct PayPal negative controls and one 101-cent Sandbox payout only after Gate H prerequisites pass.
