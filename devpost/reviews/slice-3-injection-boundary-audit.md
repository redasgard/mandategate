# Slice 3: Prompt Injection and Cross-Boundary Authority Audit

## Critique gate

**Step:** Compare MandateGate invoice model defenses against SANS "MCP Under Attack", DEF CON 34 Urd "Breaking MCP Trust Boundaries", and the SANS Find Evil! judging standard.
**Decision:** BLOCK (invoice-to-payment authority integration; isolated image-observer experimentation may continue)
**Score:** 5.2/10 for the *claim of robust prompt-injection defense*, not a score for the already-verified Slice 2 PayPal executor.
**Review independence:** self-review using actual talk material, current GitHub source, existing CI, and official SANS judges' criteria.

### Review basis and sources

- SANS talk, slide 5: "CONTENT FILTERING / CONTROL-FLOW INTEGRITY / AUTHORIZATION > INTERPRETATION"; slides 6–7: external policy, strict schemas, treat MCP like SSH. Source: https://docs.google.com/presentation/d/1UGckrAIgTPuIArdBsQaUQ-jXSm5MCkfWee1RFfJFg7k/edit
- DEF CON 34 Urd workshop, sequences 3–12: low-trust weather tool result becomes high-privilege `admin.delete_records(labels[0])` parameter; a benign baseline shows no finding; source/sink raw trace establishes exact value-flow; stripping friendly markers preserves the finding; approval that omits value origin is insufficient. Source: https://docs.google.com/document/d/1JzhbyKXHuwci5ZsobZ8UGqPeYO3MvoWjm6vwpesVdYE/edit
- SANS Find Evil! official rubric: Constraint Implementation explicitly distinguishes *architectural versus prompt-based guardrails* and tests bypasses; Audit Trail Quality requires a finding to trace to a specific tool execution; IR Accuracy requires hallucinations to be distinguished from confirmed evidence. Source: https://findevil.devpost.com/
- SANS outcome report: Mulder used an adversarial challenge phase and evidence gates; TRUDI refuted planted indicators after tools contradicted the briefing; others tested destructive-tool refusal and hashed evidence. Source: https://www.sans.org/press/announcements/sans-names-the-five-winners-of-find-evil-2026
- Current implementation on draft PR #2, code revision `361601b1a18b042a6478e05e39b5bd39b22143b6`.

### Artifacts reviewed

| Artifact | Score | Weakness |
|---|---:|---|
| Skills and literal "ignore injection" prompt text | 3.5 | Model behavior is requested, not enforced |
| Untrusted structured extraction and source evidence | 5.0 | Text quote existence is not value-to-quote verification |
| Isolated image-analysis route and no model-side PayPal tools | 8.5 | Good current isolation, not a complete transitive guarantee |
| Canonical payment submission as future invoice sink | 5.0 | Does not require invoice origin, source hash, or verified field lineage |
| Cross-boundary provenance and approval context | 3.0 | No persisted source-to-sink causality or approval tuple binding |
| Adversarial model attack evidence | 2.0 | CI uses mocked responses; no live Flash attack/evasion validation |

### Findings

1. **HIGH: No invoice-provenance authority gate on canonical payment submission**
   - Evidence: `app/api/agent/payment-requests/route.ts:5-13,16-35` accepts `vendorId`, `invoiceNumber`, `amountCents`, `currency`, and `paymentDestination` from an authenticated `invoice:submit` principal. No `artifactId`, verified invoice claim, source-event ID, or per-field provenance reference is part of the request contract.
   - Evidence: `src/payments/submit.ts:62-105` resolves organization/vendor/destination/policy and invokes `evaluatePayment`, but never binds the submitted fields to a document or an independent authorized mandate. `src/policy/decision.ts:25-83` validates destination equality and amount thresholds only.
   - Impact: once an upstream autonomous agent is allowed to turn a document observation into these fields, low-trust invoice content can select a privileged payment target or parameters within permitted policy bounds, even if the image model was "instructed" not to do so. This is the Urd value-selection/authority-laundering failure mode. **The current image-analysis route is NOT wired to the payment-request API, so no exploitable image-to-payout chain has been established yet.** Existing direct agent-submission behavior is an earlier explicit feature and must be distinguished from new invoice-derived admission.
   - Required repair: introduce a typed, independently validated invoice-to-canonical bridge and distinct provenance-bound invoice-origin authorization. For any invoice-derived payment, require immutable artifact hash, organization, vendor binding from trusted records, field-level source/verification, decision version and trust tier. Reject any authorization attempt without that bridge, even if destination matches and amount is small.
   - Verification: demonstrably tamper each invoice-derived vendor, amount, currency and destination value and show no `ALLOW` or PayPal invocation; replay stale/mixed-tenant provenance and refuse it. Bind human approval to the exact payment tuple and show a change invalidates approval.

2. **HIGH: Model-controlled evidence quotes can support unrelated model-controlled values**
   - Evidence: `src/invoices/schema.ts:119-143` verifies that `source_fragment` occurs on the claimed page but does not prove that `field.value` was obtained from or agrees with that quote. A model can assert `total_amount_decimal.value = "999.00"` while citing "Total Due 1.01"; if that exact source fragment is present, the code does not flag a value-to-quote mismatch.
   - Impact: source attribution is being mistaken for field validation. A model influenced by hostile document text can return a well-formed plausible value and an unrelated real quote. This defeats future trust promotion for text PDFs, even when JSON strictness, confidence, and page text substring validation all pass.
   - Required repair: validate source *semantics* and field binding, not just quote existence. For financial amounts use deterministic, source-grounded amount-location parsing or independent verification; compare quoted amount, normalization, totals, currency, and field labels. For image-only evidence, require independently verified OCR or human review; self-reported quotes never count as verified.
   - Verification: contradictory-amount/quote, PO-versus-invoice-number, currency/date confusion and contradictory remittance unit tests must all ESCALATE; source and value hashes must remain attached to their originating page.

3. **MEDIUM: Detector is a self-report and a narrow regex, not an injection barrier**
   - Evidence: `src/invoices/schema.ts:25` makes `observed_instructions` optional even though the requested JSON Schema requires it. `schema.ts:82,140-141` trusts the model to report suspicious instructions or scans only the *model-selected* evidence fragments. `schema.ts:58-59` is a tiny English phrase pattern.
   - Impact: a successfully redirected model may omit both the attack from its quote and its incident report. More importantly, many attacks require no jailbreak wording: merely asserting a different invoice recipient, vendor or payable amount is enough to influence a privileged selector.
   - Required repair: document instruction detectors as *advisory telemetry* with no authority over the trust tier. Align the Zod field with required JSON schema, validate untrusted content independently where possible, and never allow absence of a detection flag to elevate confidence or bypass downstream policy.
   - Verification: model intentionally omits `observed_instructions` and returns a clean-looking object with a substituted payment selector; the authorization gate still refuses.

4. **MEDIUM: Source-to-sink traces and provenance-aware approvals are not implemented**
   - Evidence: current observation records model/provider, prompt hash, artifact hash and request IDs (`src/invoices/image-analysis.ts`) but no stable value-level origin edges across image text, extracted field, canonical request, policy decision, human approval and PayPal execution. `src/payments/submit.ts` does not consume such lineage.
   - Impact: cannot reproduce Urd's source/sink exact-value trace, conduct marker-independent ablation, or show an approver why a money-moving parameter came from an untrusted invoice.
   - Required repair: persist field-level origin and trust labels across each transform with source event IDs, selected-value hashes, independent verification verdicts, decision policy revisions, and approval-bound parameters. Show source and action side-by-side at approval.
   - Verification: benign baseline yields no boundary-crossing finding; compositional retarget produces a reproducible blocked sink; stripping friendly provenance annotations does not disable the boundary or prevent forensic reconstruction where recorded actual values allow it.

5. **MEDIUM: "72 tests passed" does not prove prompt-injection resistance**
   - Evidence: `tests/invoice-extraction-schema.test.ts` checks a few canned direct input patterns; `tests/invoice-vision-gateway.test.ts` mocks Experiential and has assertions about included skill text and schema; `tests/invoice-image-analysis.test.ts` mocks visual response. No actual adversarial GLM-5.3 Flash image-output behavior, hidden/indirect instructions, cross-handoff retargeting or independent grounded reproduction has been recorded.
   - Impact: test quantity is being substituted for adversarial assurance, contrary to the exact SANS Find Evil! standard used to judge autonomous DFIR entries.
   - Required repair: use a controlled adversarial image/PDF corpus with ground-truth truth tables, one baseline and multiple attack variants, paraphrased and multilingual instructions, instruction-free data poisoning, plausible unrelated source quotes, false-human-approval hints, and source/sink trace diffing. Include explicit held-out cases and model drift measures. **Never transmit sensitive content without confirmed ZDR/no-training.**
   - Verification: one real Flash route test with actual grounded outputs, independently rerun assertions, recorded false positive/negative rates and verified zero unauthorized payout across variants.

### What currently protects the product

- The image observer has **no payment tool surface** and returns `paymentAuthorized: false`.
- Image quotes are intentionally passed as unverified (`pages:[{text:null}]`) and therefore escalate.
- The established PayPal executor checks existing authorization and revalidates trusted destination before money movement.
- These are actual architectural boundaries, unlike "ignore injected instructions" prompt wording. They protect the current isolated checkpoint, not the missing invoice-to-canonical integration.

### Requirement coverage

- **VERIFIED:** actual talks emphasize external policy, source-to-sink value flow, provenance, marker ablation; SANS rubric explicitly scores architectural enforcement and traceable evidence; model has no direct payout tool; present image route escalates unverified visual quotes; basic trusted destination and amount limits exist; CI mocked test suite runs.
- **SUPPORTED:** the design can retain secure isolation while allowing a carefully authorized invoice-to-payment bridge.
- **UNVERIFIED:** live prompt-injection resistance, full cross-handoff provenance, byte/page/field-level verified derivation, independently tested human approval, adversarial zero-unauthorized-payment results.
- **INCORRECT:** previous broad description of these prompts as "explicit prompt-injection defenses" implied a level of protection and test coverage that is not evidenced.

### Repair order

1. Define/enforce authorization at the invoice-derived payment sink. Require trust-labeled and tamper-evident field provenance and explicit authority, not model compliance. Keep existing independent agent_api payment semantics separately documented.
2. Make source-to-field verification rigorous and make detector output purely advisory. Use an independent evidence source for image quotes; add negative and falsification controls.
3. Propagate and audit source-to-sink parameter lineage and approval binding. Add Urd-style baseline, compositional and provenance-ablation tests.
4. Exercise live Flash against synthetic hostile invoice fixtures, measure unsupported outputs and bypasses, then execute independent deterministic pay/no-pay probes in Sandbox.
5. Re-run critical review before connecting invoice analysis to existing canonical submission/PayPal execution or merging PR #2.

### Next gate

**BLOCK** the invoice-to-payment authority bridge and any claim that prompt-injection defenses have been proved. Isolated artifact intake/Flash observer work can continue with explicit untrusted status. Re-review after architectural and empirical repairs.