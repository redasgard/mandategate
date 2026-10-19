#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
# Isolated Neon test database only; no live app deployment or provider calls.
if [[ "${MANDATEGATE_DISABLE_PAYMENTS:-}" != "1" ]]; then echo CI_BLOCKED_PAYMENTS_NOT_DISABLED >&2; exit 30; fi
if [[ -n "${PAYPAL_CLIENT_ID:-}" || -n "${PAYPAL_CLIENT_SECRET:-}" || -n "${DEMO_PAYPAL_RECEIVER_EMAIL:-}" || -n "${EXPLABS_API_KEY:-}" ]]; then echo CI_BLOCKED_PROVIDER_KEY_PRESENT >&2; exit 31; fi
if [[ -e .env || -e .env.local ]]; then echo CI_BLOCKED_REPO_ENV_FILE >&2; exit 32; fi
node - <<'NODE'
const {DATABASE_URL,CI_NEON_DATABASE,CI_NEON_HOST}=process.env;
let u;try {u=new URL(DATABASE_URL||'')}catch{throw Error('CI_DATABASE_URL_INVALID')}
if(!['postgresql:','postgres:'].includes(u.protocol) ||
   u.pathname!==('/'+CI_NEON_DATABASE) || u.hostname!==CI_NEON_HOST ||
   !u.hostname.endsWith('.neon.tech') ||
   u.searchParams.get('sslmode')!=='require' ||
   !u.username || !u.password)throw Error('CI_WRONG_DATABASE_OR_TLS');
NODE
sha=$(git rev-parse HEAD)
if [[ -z "${CI_EXPECTED_SHA:-}" || "$sha" != "$CI_EXPECTED_SHA" ]]; then echo CI_SHA_MISMATCH >&2; exit 33; fi
if [[ "$(node -v)" != "v24.21.0" ]]; then echo CI_NODE_VERSION_MISMATCH >&2; exit 34; fi
printf 'CI_SOURCE_SHA=%s\n' "$sha"
echo 'CI_TEST_DATABASE=isolated; CI_PROVIDER_CREDENTIALS=absent; CI_PAYMENT_SWITCH=disabled'
step() { echo "CI_STEP=$1"; shift; "$@"; }
step corepack corepack enable
step pin-pnpm corepack prepare pnpm@12.9.1 --activate
step install pnpm install --frozen-lockfile
# Production runtime commands reject unapproved Neon hosts; use direct isolated migrations.
step migrate-first node --import tsx scripts/migrate.ts
step migrate-second node --import tsx scripts/migrate.ts
step seed-first node --import tsx scripts/seed.ts
step seed-second node --import tsx scripts/seed.ts
step judge-harness node scripts/test-judge-smoke-fixture.mjs
step typecheck pnpm typecheck
step full-tests pnpm test
step production-build pnpm build
echo CI_STEP=authenticated-loopback-smoke
node ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000 > /tmp/mg-ci-next.log 2>&1 &
server_pid=$!
cleanup() { kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; }
trap cleanup EXIT
ready=0
for i in $(seq 1 45); do
  if node -e 'fetch("http://127.0.0.1:3000/api/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if [[ "$ready" != "1" ]]; then echo CI_LOOPBACK_HEALTH_FAILED >&2; tail -n 40 /tmp/mg-ci-next.log >&2; exit 35; fi
step signed-in-smoke pnpm smoke
cleanup
trap - EXIT
mkdir -p ci-public
printf '<!doctype html><html lang="en"><meta charset="utf-8"><title>Internal CI</title><body>Internal verification. No code or credentials published.</body></html>\n' > ci-public/index.html
printf 'CI_RESULT=PASS\nCI_SOURCE_SHA=%s\n' "$sha"
