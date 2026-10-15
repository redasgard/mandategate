# Hosted GLM-5.3 Flash checkpoint — 2026-10-15

**Verdict:** external model serving VERIFIED for a fictional invoice; correct invoice extraction NOT YET VERIFIED. Payment execution remains disabled.

## Verified evidence
- Source-only Neon demo; no paid staging or original Render PostgreSQL replacement. `MANDATEGATE_DISABLE_PAYMENTS=1` retained.
- Model catalog action [38787389878](https://github.com/redasgard/mandategate/actions/runs/38787389878) verified opaque canonical `exact-13da8560-5463-4fca-af64-6021144772d5` maps to `glm-5.3-flash`. PR #9 binds the serving response to the provider's current catalog, also checking body model and alias.
- Hosted artificial invoice v2, SHA-256 `9f620a1ccccf878448e0eb34e73f06770365e5778edfb1a04adb5aa21fa98c36`, passed provider-serving receipt in [38792671997](https://github.com/redasgard/mandategate/actions/runs/38792671997): provider `fireworks`, gateway request `request-89b3ae9bdaa2423ea6c066f84689f5e0`. The returned candidate was schema-invalid and escalated with `EXTRACTION_INVALID`, never payable.
- Source-bound synthetic basic invoice v3, SHA-256 `64f7476f98181d9263e9de726b5b10cc89f1f58ed3839743455a4741d1cf1200`, first hosted run [38794259772](https://github.com/redasgard/mandategate/actions/runs/38794259772) stopped at transient Render admin login HTTP 502 before inference. New harness retries only 502-504, never 401/403/429. After stable deployment the second workflow [38795193177](https://github.com/redasgard/mandategate/actions/runs/38795193177) produced a real, syntactically valid GLM observation but content failed exact synthetic source checks:
  - vendor value `NorthstarComponents` rather than `Northstar Components`.
  - total value `He said 125.00` rather than numeric `125.00`.
  - invoice ID, date, currency, and synthetic destination matched. Reasons included `INVALID_AMOUNT`, `IMAGE_EVIDENCE_NOT_VERIFIED`, `SCANNED_PDF_VISUAL_OBSERVATION_UNVERIFIED`, `SYNTHETIC_NON_ZDR_TEST_ONLY`, `DOCUMENT_INSTRUCTIONS_SUSPECTED`.
- Both tests had zero payment executions. Live Neon `payment_executions` count independently verified as 0. Source bytes, fixture hashes, model metadata and observation claims are distinct; the model's answers remain untrusted.
- The temporary non-ZDR synthetic exception was turned off. Render log `INVOICE_AI_CONFIG` at 2026-10-15 19:38:44 UTC verified `syntheticExceptionEnabled:false`. This does NOT establish strict account ZDR; real invoices remain blocked by the provider privacy preflight.

## Repairs implemented
- PR #10, `9a9d72a7`: bounded 90s inference timeout, 180s stale claim lease, 150s route budget; CI passed.
- PR #11, `e835bc6b`: schema failure codes expose only fixed field names, never provider values or attacker keys; CI passed.
- PR #12, `08c18b78`: prompt version v2 requires literal vendor spacing and a plain decimal payable amount; CI passed on its head. The new prompt has **not been validated against an actual serving response** and must not be described as having fixed GLM output.
- Original failed fixture `30be0068ab4fb50c5c544024e3e0c58d5a048fb24398a8b0e2e2f00b2d303335` reached its documented 3/3 attempt cap and must not be retried.

## Next test
If making another live synthetic call, generate a *new* immutable, visibly reviewed fictional PDF with a new SHA-256; run exactly once with explicit admin risk acknowledgement and payments disabled; validate prompt v2, schema, numeric amount, literal vendor, evidence and provenance. Disable the temporary exception immediately afterward. Never silently autocorrect an incorrect amount, treat model output as issuer verification, or enable PayPal due to a successful model result. A PayPal Sandbox payout remains a separately authorized gate.
