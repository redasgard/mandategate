# MandateGate | Release gate (2026-10-29)

**Decision: BLOCK for final Devpost submission.** This is a bounded submission-packaging assessment, not a claim that the entire development project failed. All tasks below are release-critical; never convert missing proof into a claimed success.

## Official requirement check

Source: https://paypalaihackathon.devpost.com/rules (rechecked October 29, 2026). Official deadline: November 12, 2026 at 12:00 Pacific; internal hard deadline: October 29 at 18:00 Pacific.

| Requirement | Evidence / current status | Gate |
|---|---|---|
| Source repository public | GitHub get_repo returned `visibility=private`; no publication tool available | **BLOCK** |
| Open-source license | `LICENSE` is present and MIT on implementation branch; GitHub About/License detection unverified | PARTIAL |
| Correct default branch | GitHub says `default_branch=main`; comparison to tested `build/slice-3-invoice-intake` is divergent (716 commits ahead / 49 behind as measured October 29) | **BLOCK** |
| Functional build | Render deployed `a78c3100c8d8c2f01f2aa5beb0fe6af9f55bd9d5` live October 26; exact merged SHA isolated CI passed with 114 Vitest files/570 tests, signed-in synthetic smoke, desktop/mobile browser QA. A fresh signed-in live test today was not obtained. | PARTIAL |
| Meaningful PayPal | Historical Slice 2 Sandbox success with batch `BA7V96FCY8Z64`, item `A3R9LWD8XTX72`, verified webhook and reconciliation in recorded review. **Current invoice-derived payment unverified.** | PARTIAL |
| Meaningful AI | 5 saved GLM observations in live demo project, fictional consented documents; GLM outputs advisory and cannot authorize payouts. New live inference today unverified. | PARTIAL |
| Real ALLOW/ESCALATE/DENY | 3 persisted fictional decision rows in connected Neon, no payments; verified by read-only query and prior CI. | PASS for policy only |
| Judge access | Hosted app sign-in exists; current external reviewer credentials/session and free judging access not verified; local README instructions exist | PARTIAL |
| Public real-demo video | No observed public YouTube link; no final video proven | **BLOCK** |
| Accurate Devpost description | Prepared in `devpost/final-submission-copy.md`; must be checked against final deployed source | READY TO REVIEW |
| Completed Devpost submission | No official confirmation URL or final submitted entry observed | **BLOCK** |

## Independent factual checks October 29

- GitHub `get_repo`: private, default main.
- `compare_commits(main, build/slice-3-invoice-intake)`: diverged; 716 ahead and 49 behind.
- Current Render `mandategate-web`: build branch `build/slice-3-invoice-intake`, deployment `a78c310...` marked LIVE, URL https://mandategate-web.onrender.com.
- Neon `floral-hill-01811323` main branch `org_demo`: 5 PDF artifacts, 5 AI observations, 3 decision records, **0** verified claim sets, **0** independently enrolled non-synthetic origin channels, **0** issuer attestations, **0** authorized bindings, **0** invoice-derived payment requests, **0** executions.
- Existing validated historical Sandbox evidence: `devpost/reviews/slice-2-critical-review.md`.
- No credentials, payout approval, external account mutation or database write was used to produce this release review.

## Mandatory repair order before final submission

1. Do a pre-publication **secrets and confidential-data scan** of all pushed history and release tree. Resolve any finding before publication. Publicize only the intended code, never customer data or provider keys.
2. Publish the tested release tree. Do not force-push `main` over divergent history. Use a reviewed merge / new public clean repository with the MIT license, or explicitly select the tested release branch as default through GitHub Settings, after reconciling visibility risks.
3. Independently verify the public repository is reachable without auth and MIT license detection works.
4. Provide restricted judge access through a payment-disabled reviewer role, independently check login/actual navigation, or verify complete clean-clone setup as the primary judge route.
5. Record a real browser demonstration (not a slideshow), final narration, safe synthetic cases and separate truthful PayPal evidence. Confirm duration, upload it PUBLIC on YouTube, and independently open the link.
6. Enter exact text, tools and links into Devpost; inspect the rendered page, submit, then save the official submitted-entry URL / timestamp.
7. Re-run final independent security/functional review on the exact public source and released video. Do not claim verified invoice-to-PayPal execution until a separately authorized, independently audited transaction proves it.

## Scope freeze

As of this release gate, optional scheduling, Elastic, Bryntum, AG Grid sponsor prize claim, Zapier MCP, Base Sepolia anchoring, Qwen/Jev/Laya and proposed free-form Assistant changes are **not asserted complete**. Existing draft PRs are not release evidence. Do not force these into the last-minute public beta.

## Critique gate

Step: last-mile submission assessment. Decision **BLOCK**, score **5.4/10**, review independence **self-review** with deterministic GitHub/Render/Neon corroboration. Missing publication, video and judge-access requirements are HIGH severity. The next safe state is a documented release package followed by owner publication and account steps; no assertion of final submission.
