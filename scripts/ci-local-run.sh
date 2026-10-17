#!/usr/bin/env bash
set -Eeuo pipefail

# This process runs inside disposable Node 24 and PostgreSQL 18 containers.
# Only synthetic test credentials are supplied. No host .env file is mounted.
if [[ ! -f pnpm-lock.yaml || ! -f package.json ]]; then
  echo 'CI_SOURCE_SNAPSHOT_INCOMPLETE' >&2
  exit 2
fi

run() {
  printf '\nCI_STEP: %s\n' "$1"
  shift
  "$@"
}

run pnpm-version corepack pnpm --version
run install corepack pnpm install --frozen-lockfile
run migrate-1 corepack pnpm db:migrate
run migrate-2 corepack pnpm db:migrate
run seed-1 corepack pnpm demo:seed
run seed-2 corepack pnpm demo:seed
run typecheck corepack pnpm typecheck
run tests corepack pnpm test
run production-build corepack pnpm build

printf '\nCI_STEP: authenticated-smoke\n'
corepack pnpm start > /tmp/mandategate-ci-server.log 2>&1 &
server_pid=$!
cleanup_server() {
  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
}
trap cleanup_server EXIT
ready=0
for attempt in $(seq 1 45); do
  if node -e 'fetch("http://127.0.0.1:3000/api/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" != 1 ]]; then
  echo 'CI_HEALTH_CHECK_FAILED' >&2
  tail -n 120 /tmp/mandategate-ci-server.log >&2 || true
  exit 1
fi
run smoke corepack pnpm smoke
printf '\nCI_LOCAL_PASS: migration x2, seed x2, typecheck, tests, build, smoke\n'
