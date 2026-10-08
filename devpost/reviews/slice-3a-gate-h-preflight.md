# Slice 3A Gate H: Live Sandbox Release Preflight

## Critique gate
**Step:** Three-case synthetic ALLOW/ESCALATE/DENY demonstration and exact live PayPal proof.
**Decision:** BLOCK (live proof unsafe/unsupported from current evidence).
**Score:** 6.0/10 for release readiness.
**Review independence:** self-review using repo source, GitHub CI and prior verified Render/PayPal Slice 2 evidence.

### Evidence checked
- Gate C isolated semantic verifier passed CI, but its page text is caller-supplied and not independently parsed/hashed from the persisted PDF or scanned image.
- Gate D independent origin registry and human report are simulated in test fixtures; there is no externally corroborated real issuer-channel assertion yet.
- Gate E internal prepared/consumed binding and executor guard passed CI with records populated synthetically by tests.
- Gate F human reviewer endpoint and UI passed CI, but have not been deployed or used by a real authenticated reviewer.
- Gate G deterministic substitution/ablation tests passed; no live Flash adversarial fixture or real PayPal POST from the invoice-derived source.
- Current stable Render service still runs Slice 2; distinct production-like `DEMO_PAYMENT_AGENT_API_KEY` cutover not verified, and Experiential org ZDR/no-training/capture-off route not proven on a live synthetic invoice.
- A real Slice 2 Sandbox payout `BA7V96FCY8Z64` was previously verified. It is NOT a Slice 3A invoice-derived payout.

### Artifact scores
| Artifact | Score | Main weakness |
|---|---:|---|
| Existing PayPal exact-once executor | 9.2 | Prior Slice 2 proof only |
| Invoice authorization source proof | 5.5 | No immutable artifact->independent page parse->verified claim chain |
| Live issuer and account policy proof | 5.0 | Not exercised on hosted invoice flow |
| Reviewer/identity live cutover | 6.0 | CI only |
| Three-case end-to-end demo | 4.0 | Not yet executed |

### Findings
1. **HIGH - Actual independent invoice source verification is missing.** The claim records are test-seeded, not derived from a bounded independently parsed image/PDF page. Allowing a synthetic human-proof stand-in to authorize a new live payout would defeat the very authority boundary under review.
   - Required repair: finish bounded PDF preparation/OCR and validated page/hash/field provenance, or use a deliberately controlled externally validated fixture with clearly documented independent source proof and a distinct sandbox deployment.
2. **HIGH - Live account and identity prerequisites remain unmet.** Render Gate A secret cutover and provider ZDR/no-training identity are not established for this code.
   - Required repair: isolated staging deploy with new distinct privileged key, org reviewer membership, route authorization negative tests and verified Experiential Flash privacy posture.
3. **MEDIUM - Full integration adversarial proof is missing.**
   - Required repair: execute all three explicitly synthetic cases in the same deployed code commit, proving exactly one PayPal Sandbox payout for ALLOW and no Payouts POST for ESCALATE and DENY; verify real webhook and audit source-to-sink trace.

### Requirement coverage
- VERIFIED: CI stage gate tests, isolated direct PayPal money path from Slice 2, immutable test record relationships.
- UNVERIFIED: live invoice source provenance, three-case result, actual GLM route privacy, new reviewer workflow deployment, external payment from invoice-approved binding.
- INCORRECT: asserting Slice 3 complete, production-safe or invoice-derived PayPal proof would be unsupported.
### Repair order
1. Implement and verify immutable page-level source extraction and independent field semantics.
2. Validate real authorized issuer/source and human approval workflow on a dedicated Sandbox staging environment.
3. Configure distinct Render principal secrets, model route ZDR/no-training checks and staged deployment with replay-safe PayPal identifiers.
4. Run exactly one explicitly bounded synthetic ALLOW payout, ESCALATE and DENY negative controls and webhook proof; rerun critical review.
### Next gate
BLOCK release and PR #2 merge. No new PayPal payout was attempted by this review.
