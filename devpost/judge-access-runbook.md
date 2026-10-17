# MandateGate | Judge access and demo safety handoff

**Status:** DRAFT ONLY. No externally tested judge credentials, authorization grant, screenshot, recovery drill or December availability guarantee exists yet.

**Official contest rule (verified October 16, 2026):** Judges must have functional testing access. For a private hosted site, testing instructions must include usable credentials. The application must remain free to test through the December 1-15, 2026 judging period. Source: https://paypalaihackathon.devpost.com/rules

## What exists today

- Hosted development URL: https://mandategate-web.onrender.com/demo
- Better Auth browser login at `/sign-in` has public account creation **disabled** (`src/auth/auth.ts`).
- `/demo` and original invoice evidence require a valid, **active** `ADMIN` membership for `org_demo`; a randomly registered user cannot enter.
- The protected demo route requires `MANDATEGATE_RUNTIME_MODE=neon-preview`, `MANDATEGATE_DISABLE_PAYMENTS=1`, and the explicitly allowlisted demo Neon database host. Without these conditions it is unavailable.
- The scenario-replay control calls `/api/admin/demo-scenarios`. It creates/reuses three **fictional canonical decisions** and is not a PayPal payout.
- Current seeded login uses a preexisting development admin whose password is deliberately absent from Git. Current auth model has **no independent read-only judge role**. An `ADMIN` can reach other admin controls, so do not assert that sharing this login is harmless simply because outbound payouts are disabled.
- The Northstar USD 125.00 / `DEMO-GLM-004` is a saved fictional AI suggestion, not a verified payable invoice.
- The historical PayPal payout panel links to a prior environment. The current judge demo must report zero local payout executions.

## Minimum safe access policy

**Preferred:** Provision a dedicated, revocable account for judges with a narrowly authorized demo-only capability and an isolated fixture organization. That currently requires a reviewed auth/tenant change and full CI. Do not create the account by manipulating the production/shared demo database manually.

**Conditional fallback:** With explicit owner approval, an isolated payments-disabled demo account may temporarily have ADMIN membership. Treat the login as capable of changing local demo data, not as read-only. Do not reuse any real human credential, payment agent key, Experiential Labs provider key or actual PayPal credentials. Use synthetic data only, bound to the demo service, with reset/restore controls and audit review. Distribute it through appropriately scoped Devpost testing instructions, after checking whether those fields may be public. Assume any credentials shown on a public page will be exposed to the internet.

**Forbidden:** Publish `DEMO_ADMIN_PASSWORD`, `BETTER_AUTH_SECRET`, payment-agent API keys, PayPal client secret, private DB connection strings, or bearer/session cookies in README, Git history, Devpost description, YouTube or screenshots. Do not turn on public sign-up or disable tenant membership checks as a shortcut.

## End-to-end readiness test (must be witnessed on exact hosted SHA)

1. Verify Render LIVE commit equals the reviewed candidate and that its startup succeeded with the intended payments-disabled Neon service. Never treat a green premerge PR from another SHA as deployed.
2. From a clean, private browser session, open the public `/demo` URL without credentials. Verify it redirects to `/sign-in` and exposes no invoice, gateway or payout metadata.
3. Sign in with the newly provisioned **judge-only** synthetic account, verifying the account's intended organization and scope. Capture successful dashboard, invoice list and `/demo`; ensure no system/configuration secrets appear in HTML or browser logs.
4. Check model-observation cards correspond to **saved consented fictional** receipts, with original source links; verify every displayed model result stays advisory ESCALATE. Do not trigger external inference during browsing.
5. Re-run ALLOW, ESCALATE and DENY synthetic scenarios twice, inspect real reason codes and payment details. Abort if any expected outcome changes, any payout/execution row exists, or the UI reports inconsistent/blocked state.
6. Confirm payment integrations are **disabled** and no PayPal Payouts POST, balance mutation or unknown financial state occurs. Verify the local org-wide execution count before and after, not just `source='verified_invoice'`.
7. Use a second clean session for access tests. Confirm expired/revoked account and foreign org membership cannot access the protected view. Check logout and session revocation.
8. Verify three possible presentation links: direct `/demo`; saved Northstar `DEMO-GLM-004` artifact detail; archived PayPal build ledger. Compare on-screen state with the 2:30 recording packet.
9. Save **only nonsecret evidence**: timestamp, exact Render SHA/deploy ID, expected outcomes, sanitized screenshot list, DB count and signed-off reviewer. No passwords, cookies or sensitive content in public review logs.
10. Perform a backup/restore drill into a separate isolated environment. Verify the synthetic ALLOW/ESCALATE/DENY replay and consented observation card survive with intact SHAs. This drill is still **UNVERIFIED**.
11. Define an accountable owner and calendar check for service health/access during December 1-15. A free-tier service may sleep or exhaust capacity. Availability must be verified rather than promised.

## No-hosted-access fallback (not yet accepted)

The official rules allow a fully reproducible clean-clone setup instead of a hosted demo. But this application's `/demo` is explicitly bound to the allowlisted payments-disabled Neon environment, so local `pnpm dev` **does not currently reproduce the same judge lab**. The current README supports a local signed-in `/dashboard`, `/invoice-artifacts`, and `/ap-history` workflow. Do not tell judges local setup is equivalent until the exact seeded fixture/replay can be recreated and independently checked without secrets or paid services.

## Final owner actions, batched not scattered

- Confirm ownership/authorization of public source and who acts as the Devpost representative.
- Approve a scoped judge-account mechanism or release a pre-reviewed restricted synthetic account after auth/tenant review.
- Confirm the service/data availability policy and any **nonzero** spending limits explicitly. Do not silently upgrade hosting or GitHub billing.
- Review the final video and public repo release commit.
- Submit the Devpost entry using the verified code/video/demo links and retain the confirmation URL by **October 29 at 6 PM Pacific**.

**Status verdict:** Judge access NOT VERIFIED. The app's current synthetic hosted demo is evidence of a working internal control surface, not proof that external judges can log in safely.
