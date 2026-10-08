# Slice 3A Gate C2: Bounded PDF Source Provenance Review

## Critique gate
**Step:** Parse the immutable PDF artifact in a bounded worker and persist exact page-text evidence.
**Decision:** CONTINUE to isolated, authenticated PDF field verification ONLY. Gate H and PR #2 remain BLOCKED for release.
**Score:** 8.6/10 for PDF-text source preparation.
**Review independence:** self-review with independently executed GitHub Actions/PostgreSQL regression tests.

### Evidence checked
- Commit `7bdb70abf5722c99b5608608f9b136d568b12040` and CI run `37844738169`, SUCCESS: frozen-lockfile install; migrations twice; seed twice; TypeScript; 18 test files / 136 tests; production build; HTTP smoke.
- `src/invoices/pdf-text-worker.mjs`: PDF.js text-only parse, 20-page limit, item/page/total text caps, active/embedded-content rejection; worker heap/stack bounds and 15-second deadline.
- `src/invoices/pdf-text.ts`: independently re-hashes admitted raw bytes, checks optional expected source digest, maps failures closed, validates worker-returned page order/text, computes page text SHA-256.
- `drizzle/0012_pdf_page_sources.sql` and `src/invoices/pdf-source-store.ts`: append-only, tenant-scoped, immutable parser-version/page-text records tied by FK to the exact source-artifact SHA-256. Replay and conflict checks reject inconsistent rows.
- `app/api/admin/invoice-artifacts/[id]/pdf-pages/route.ts`: Better Auth admin-only GET/POST, same-origin POST, no money movement, no model authority.
- `tests/pdf-page-source.test.ts`: real xref PDF streams; multi-page and digest checks; malformed, encrypted, >20-page, textless failures; append-only evidence; tenant isolation; clean/poisoned typed-field observations; zero payment requests.
- Previous test failures were reproduced and corrected: a document fixture placed the receiver beyond the PDF page edge. The resolver properly rejected the incomplete quote before fixing layout.

### Artifact scores
| Artifact | Score | Main weakness |
|---|---:|---|
| PDF.js bounded text worker | 8.6 | OCR, rasterized appearance and full visual equivalence are outside this checkpoint |
| Immutable page-text source store | 9.0 | Trust is in app-controlled parser and append-only DB, not external signatures |
| Authenticated admin preparation surface | 8.5 | Hosted login, deployment and manual UI review have not been tested |
| Adversarial source-to-field regression | 8.7 | Tests provide synthetic values, not live GLM output |

### Findings
1. **MEDIUM — Source corroboration does not yet create a verified payment-eligible claim.**
   - Evidence: source pages and `assessStoredPdfObservation` are advisory; no `invoice_verified_claim_sets` T2 record is created.
   - Impact: Gate H remains blocked and current CI cannot prove a real source-verified invoice can reach the approval tuple.
   - Required repair: admin-authenticated PDF field verification must compare exact amount/vendor/receiver/identity quote against persisted parser page text and hashes; capture explicit actor and reason in immutable records. Keep issuer validation separate.
   - Verification: real PDF positive case and altered/inconsistent source negative tests with zero Payouts calls.
2. **MEDIUM — Text extraction is not OCR or rendering equivalence.**
   - Evidence: the worker deliberately rejects pages without extractable text; image/scan and unsupported visual overlays cannot be promoted by text extraction.
   - Impact: scanned invoices remain ESCALATE and require the later independent image/visual corroboration design.
   - Required repair: bounded decode/raster/OCR or an explicitly witnessed, non-model independent visual review path, with a distinct proof type.
   - Verification: actual scanned page, visually hidden or clipped text, altered image, encrypted and malformed fixture matrix.
3. **MEDIUM — Render packaging of the filesystem-based worker path is not proven.**
   - Evidence: CI runs from the repository source tree. No Slice 3 staging deployment exists.
   - Impact: the worker path must be rechecked against the final Render build/run image, not assumed from CI success.
   - Required repair: isolated staging smoke under exact Render startup commands and artifact paths.
   - Verification: prepare one synthetic PDF on deployed staging, inspect page digests, show no PayPal POST.

### Requirement coverage
- VERIFIED: isolated bounded PDF parsing from real raw bytes; parser-produced page-text hashes; immutable tenant/source lineage; source quote mismatch stays ESCALATE; 136 CI tests green.
- UNVERIFIED: independent field approval against source pages; live external issuer identity; real GLM composition, scanned-PDF OCR/raster, Render worker deployment, invoice-derived PayPal Sandbox payout.
- INCORRECT: calling text extraction an issuer signature, an OCR proof, or a complete authorization path would overstate this evidence.

### Repair order
1. Bind admin-approved exact field facts to stored PDF parser source/page digests, with duplicate and cross-page contradiction checks.
2. Run source/issuer + reviewer tests against distinct synthetic and externally attested fixtures.
3. Separately complete GLM privacy route and Render staging proof before the three-case Gate H Sandbox demo.

### Next gate
CONTINUE to isolated parser-backed invoice field verification. Do NOT merge PR #2, deploy to stable Render, or initiate invoice-derived payout.
