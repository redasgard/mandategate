# Slice 3: GLM-5.3 Flash Vision and Skill Checkpoint

## Critique gate

**Step:** Versioned invoice-observation skills, Flash-only image gateway, tenant-scoped advisory persistence
**Decision:** CONTINUE (development only; NOT a Slice 3 acceptance or release)
**Score:** 8.8/10
**Review independence:** self-review, supplemented by GitHub Actions deterministic checks

### Evidence checked

- Draft PR #2 on branch build/slice-3-invoice-intake.
- Exact image model hard-pinned in src/ai/gateway/experiential-vision.ts: glm-5.3-flash. Serving-model and ZDR headers are verified before accepting results; no fallback to glm-5.3.
- Repository-owned runtime-loaded skills: skills/mandategate-invoice-observer/SKILL.md and skills/mandategate-invoice-evidence/SKILL.md. Prompt version/hash recorded by src/invoices/prompts.ts.
- Strict JSON schema: src/invoices/vision-json-schema.ts. Zod validation, suspicious document instructions, money/date normalization, and conservative page evidence assessment in src/invoices/schema.ts.
- Preflight requires enabled non-partial account-wide ZDR, require_zdr, require_no_training, disabled prompt capture, and model route ZDR capability before sending image bytes; inference requests provider.zdr=true.
- Agent-authenticated routes POST /api/agent/invoice-artifacts/{id}/analyze and GET /api/agent/invoice-artifacts/{id}/analysis persist/return advisory observations and never invoke PayPal.
- Database migration drizzle/0004_invoice_vision.sql and src/invoices/image-analysis.ts: one observation per original artifact, organization-scoped and bound to source hash.
- GitHub Actions CI run 37730620805 on code commit 95b504d88682318358608d8ad854210c56845efa: 5 application migrations twice, seed idempotence, TypeScript, 10 test files/61 tests, production build and smoke all passed.
- GitHub Actions run 37730921102 on documentation/prompt evaluation head fcb94bdd0ed52df84d137d94ba7ed449b53bcca9: success.
- Prompt evaluation plan: devpost/vision-prompt-evaluation.md. Its live model-quality targets have not been measured.

### Artifact scores

| Artifact | Score | Main weakness |
|---|---:|---|
| Versioned skills/prompts | 9.3 | Live OCR and adversarial-response quality unmeasured |
| Exact Flash-only gateway | 9.2 | Provider account and live model capability not yet exercised |
| Provider privacy gate | 9.1 | External policy preflight tested with mocked provider responses only |
| SQL-backed advisory observation | 8.5 | Request-bound processing has no crash-recovery lease yet |
| Extraction schema and safety | 9.0 | Visual quotes are model claims pending independent verification |
| Overall Slice 3 acceptance | 6.0 | PDF prep, async jobs, full fixture suite and live proof still missing |

### Findings

1. **MEDIUM - Interrupted image analysis can strand an artifact in PENDING**
   - Evidence: src/invoices/image-analysis.ts atomically changes artifact state to PENDING, then performs external inference inside the HTTP request. Catch handlers cover ordinary exceptions, but process death after the claim bypasses those handlers; there is no lease expiry/recovery transition yet.
   - Impact: a user may need an operator reset after an interrupted request, and repeated operator requests cannot self-heal.
   - Required repair: before hosted Slice 3 deployment, introduce a bounded processing lease, attempt cap, and recovery path or a durable async worker with a fencing claim.
   - Verification: simulate crash after claim, then reclaim stale work without duplicate terminal observations.

2. **MEDIUM - No live compliant Experiential inference evidence**
   - Evidence: CI gateway responses are mocked; current branch has not been deployed to the stable Render service and no EXPLABS_API_KEY or organization posture was verified in this review.
   - Impact: the exact Flash route may lack strict-schema+ZDR capability for the user's account despite the provider catalog listing image input. Actual invoice quality and provider costs are unknown.
   - Required repair: use a synthetic one-page PNG/JPEG with an Experiential organization verified ZDR/capture-off/no-training, validate all response headers, schema and audit proof. Do not use real customer invoices first.
   - Verification: captured request id/provider/model/ZDR proof; Zod valid fields, realistic quotes; one persisted observation, no payment authority.

3. **MEDIUM - Media admission is not full decoder validation**
   - Evidence: src/artifacts/admission.ts checks magic/header size and image dimensions, not full JPEG/PNG compressed data integrity.
   - Impact: malformed but header-shaped images may reach the model and cause errors; still no policy/payments bypass.
   - Required repair: add full bounded decoder validation and denial fixtures before using images from untrusted external sources in live service.
   - Verification: malformed/truncated/corrupt/oversized image fixtures produce deterministic refusal before model transmission.

4. **LOW - Image-only quotes remain unverified external evidence**
   - Evidence: src/invoices/image-analysis.ts supplies pages:[{text:null}] to assessUntrustedInvoiceExtraction; no independently validated OCR text exists to corroborate a model's cited fragment.
   - Impact: even apparently correct, high-confidence image extractions escalate. This is intentional safety, but prevents automatic ALLOW for image-only documents.
   - Required repair: specify and test independent page evidence verification or human review before promoting image observations into the canonical payment decision kernel.
   - Verification: stale or hallucinated image quotes never become authorization.

### Requirement coverage

- **VERIFIED at this checkpoint:** runtime skill loading/hash, exact Flash request slug, multimodal data URL request construction, strict JSON output declaration and Zod gate, account ZDR/no-training/capture-on rejection in mocked preflight, serving-model mismatch rejection, provider ZDR-response rejection, immutable tenant-scoped image source, advisory observation persistence and deduplication, 61 passing tests and clean build.
- **SUPPORTED:** actual provider docs list Flash as text/image/video-capable and regular GLM-5.3 as text-only; a live route still needs capability verification for this organization.
- **UNVERIFIED:** account posture/API key, real ZDR Flash strict structured completion, real field precision/recall, full image decode, PDF OCR/preparation, crash recovery, independent visual quote corroboration, end-to-end canonical kernel handoff.
- **INCORRECT:** full Slice 3 completion would be unsupported; no such completion claim is made.

### Repair order

1. Make PENDING claims durable and recoverable, with bounded attempts and fencing.
2. Add real image decode validation and hostile media fixtures.
3. Execute one compliant live synthetic GLM-5.3 Flash extraction and inspect privacy/model/quote evidence.
4. Complete PDF.js/text and scanned-PDF rasterization, async analysis, and verified canonical request handoff.
5. Run full Slice 3 critical review before merging PR #2.

### Next gate

**CONTINUE** to the crash-recovery and decoder work while the stable Slice 2 Render service remains untouched. This step is a non-release checkpoint only.
