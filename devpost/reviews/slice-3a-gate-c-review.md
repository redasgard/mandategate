# Gate C: Source-to-Field Semantic Verification

## Critique gate

**Step:** Repair TypeScript and add adversarial, deterministic source-to-field checks.
**Decision:** CONTINUE to implementing Gate D **in isolation**, not to trusted origin, invoice-derived ALLOW or PayPal integration.
**Score:** 8.6/10 for verifier primitives.
**Review independence:** self-review with GitHub Actions deterministic verification.

### Evidence checked

- src/invoices/semantic-evidence.ts: verifies model-claimed values against specific labeled quotes from a separate page-text source, not simply quote existence.
- src/invoices/schema.ts: enforces required observed_instructions property, enumerates every field, escalates image quotes with null independent text, and retains mismatch/confidence/amount guards.
- tests/invoice-extraction-schema.test.ts: normal fixture, malicious total substitution, subtotal confusion, contradictory totals, PO/invoice-number swaps, source mismatch, date/currency confusion, missing instruction report, page/artifact ID spoofing, image self-citation refusal and destination retargeting.
- CI run 37821205892 on code commit abc9bcf87a4dfb52946f38467c0ae0a3b2e8d64c: success, 8 SQL migrations twice, seed twice, typecheck, 14 test files / 103 tests, Next.js production build and HTTP smoke. No PayPal Payouts POST.

### Artifact scores

| Artifact | Score | Weakness |
| --- | ---: | --- |
| Source/field checks | 8.8 | Conservative, English-label and currency limited; requires independently obtained page text |
| Zod integration | 8.8 | Contract checks cannot authenticate an issuer |
| Adversarial tests | 9.0 | Synthetic deterministic fixtures; no live GLM or full actual PDF parsing |
| Payment authority separation | 9.4 | Image results remain advisory and untrusted |
| End-to-end Gate C completeness | 6.2 | No source parser/page hash from actual artifact wired into a verification service |

### Findings

1. **MEDIUM: Page text is a trusted input to a pure verifier, not independently retrieved in the runtime path.**
   - Evidence: assessUntrustedInvoiceExtraction accepts context.pages from its caller; no PDF.js-based bounded parser or page hash integrity bridge to invoice_artifacts exists.
   - Impact: caller/model-supplied text must never claim SOURCE_CORROBORATED / T2. Passing these pure functions does not authorize payments.
   - Required repair: before Gate E/F authorization, bind verified parser output to exact persisted artifact/page SHA-256, with deterministic resource limits and unsupported-layout escalation. No image quote may be promoted based on self-citation.
   - Verification: real PDF fixtures, corrupted/multi-page/ambiguous input, per-page hash and provenance replay negative tests.

2. **MEDIUM: Semantic patterns deliberately have limited label/language/currency coverage.**
   - Evidence: final-total, invoice ID, dates and currency checks support a narrow strict subset of unambiguous invoice text patterns.
   - Impact: legitimate invoices outside supported form will escalate; expanding loose regexes without negative tests could introduce source misbinding.
   - Required repair: stage additional locale/format support only with explicit false-positive/false-negative adversarial cases.
   - Verification: held-out contradictory source corpus, never silent permissive fallback.

3. **LOW: Prompt-injection string detector is advisory only.**
   - Evidence: observed_instructions is model output; regex scans cited fragments only.
   - Impact: absence of a reported prompt injection proves nothing.
   - Required repair: keep it outside authority, and test instruction-free poisoning at Gate G.
   - Verification: no model flag still cannot authorize unverified receiver or amount.

### Requirement coverage

- VERIFIED: TypeScript compilation fixed; 10 added adversarial checks, strict value-to-quote comparison; visual quotes remain unverified; 103 CI tests passed; no model-origin money authority.
- UNVERIFIED: actual independently parsed PDF page text; image OCR corroboration; out-of-band issuer authentication; source-to-authority bridge; live model quality.
- INCORRECT: claiming full autonomous source verification or payment authorization would exceed evidence.

### Repair order

1. Proceed with Gate D issuer-authenticity contracts under an explicit independent-admin verification channel, without making an ALLOW/payment endpoint.
2. Complete raw-artifact-to-source-parser binding and page hashes before Gate E authorization.
3. Keep suspicious-instruction detection advisory, and exercise Urd-style source-to-sink adversarial tests at Gate G.

### Next gate

**CONTINUE Gate D implementation only.** Invoice-derived payment remains BLOCKED. This review is not independent and does not authorize deployment.
