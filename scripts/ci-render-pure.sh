#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
# Render static-site build: no database service, no provider accounts, no payouts.
if [[ "${MANDATEGATE_DISABLE_PAYMENTS:-}" != "1" ]]; then echo CI_PAYMENT_SWITCH_UNSAFE >&2; exit 21; fi
if [[ -n "${PAYPAL_CLIENT_ID:-}" || -n "${PAYPAL_CLIENT_SECRET:-}" ||
      -n "${EXPLABS_API_KEY:-}" || -n "${DEMO_PAYPAL_RECEIVER_EMAIL:-}" ]]; then
  echo CI_PROVIDER_KEY_PRESENT >&2; exit 22
fi
sha=$(git rev-parse HEAD)
if [[ -z "${CI_EXPECTED_SHA:-}" || "$sha" != "$CI_EXPECTED_SHA" ]]; then echo CI_SHA_MISMATCH >&2; exit 23; fi
if [[ "$(node -v)" != "v24.21.0" ]]; then echo CI_NODE_PIN_MISMATCH >&2; exit 24; fi
printf 'CI_SOURCE_SHA=%s\n' "$sha"
echo 'CI_MODE=private-repo-build-no-real-database-no-provider-keys'
step() { echo "CI_STEP=$1"; shift; "$@"; }
step pnpm-pin pnpm --version
step install pnpm install --frozen-lockfile
step static-types pnpm typecheck
step auth-harness node scripts/test-judge-smoke-fixture.mjs
step runtime-profile node --test scripts/check-runtime-profile.mjs
step payment-and-judge-units pnpm exec vitest run tests/payment-executor.test.ts tests/judge-provision-gate.test.ts
step production-build pnpm build
mkdir -p ci-public
printf '<!doctype html><html lang="en"><meta charset="utf-8"><title>Internal CI</title><body>Internal verification only. No source, credentials or payment operations published.</body></html>\n' > ci-public/index.html
printf 'CI_RESULT=PASS\nCI_SOURCE_SHA=%s\n' "$sha"
