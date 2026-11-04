#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
# CI-only: true local PostgreSQL 18.4.0, no customer DB or payment credentials.
if [[ "${MANDATEGATE_DISABLE_PAYMENTS:-}" != "1" ]]; then echo CI_PAYMENT_SWITCH_UNSAFE >&2; exit 21; fi
for key in PAYPAL_CLIENT_ID PAYPAL_CLIENT_SECRET DEMO_PAYPAL_RECEIVER_EMAIL EXPLABS_API_KEY JUDGE_DEMO_PASSWORD; do
  if [[ -n "${!key:-}" ]]; then echo "CI_FORBIDDEN_CREDENTIAL_PRESENT=$key" >&2; exit 22; fi
done
if [[ -e .env || -e .env.local ]]; then echo CI_REPOSITORY_ENV_FILE_PRESENT >&2; exit 22; fi
sha="$(git rev-parse HEAD)"
if [[ -z "${CI_EXPECTED_SHA:-}" || "$sha" != "$CI_EXPECTED_SHA" ]]; then echo CI_SHA_MISMATCH >&2; exit 23; fi
if [[ "$(node -v)" != "v24.21.0" ]]; then echo CI_NODE_PIN_MISMATCH >&2; exit 24; fi
if [[ "${CI_VIDEO_INSPECT_ONLY:-}" == "1" ]]; then
  export CI=true
  echo 'CI_MODE=isolated-existing-video-review-no-database'
  CI_VIDEO_TMP="$(mktemp -d /tmp/mandategate-video-XXXXXX)"
  trap 'rm -rf -- "$CI_VIDEO_TMP"' EXIT
  if [[ -x /usr/bin/ffmpeg ]]; then
    export CI_VIDEO_FFMPEG=/usr/bin/ffmpeg
  else
    npm install --prefix "$CI_VIDEO_TMP" --no-save --no-audit --no-fund ffmpeg-static@5.2.0
    export CI_VIDEO_FFMPEG="$CI_VIDEO_TMP/node_modules/ffmpeg-static/ffmpeg"
  fi
  node --check scripts/ci-video-review.mjs
  node --check scripts/ci-video-repair.mjs
  node scripts/ci-video-review.mjs
  node scripts/ci-video-repair.mjs
  printf '<!doctype html><title>MandateGate revised demo</title><h1>MandateGate actual browser demo</h1><p>Timing-only repair of previously recorded synthetic UI. No PayPal payout was initiated.</p><a href="/demo/mandategate-demo-repaired.mp4">Revised narrated demo MP4</a><p><a href="/demo/storyboard-repaired.jpg">Revised storyboard</a> · <a href="/demo/repair-proof.json">Machine-verifiable timing report</a></p><p><a href="/demo/mandategate-demo-final.mp4">Original preserved for comparison</a></p>' > ci-public/index.html
  echo CI_RESULT=VIDEO_REPAIR_PASS
  exit 0
fi

export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55432/mandategate"
export BETTER_AUTH_URL="http://127.0.0.1:3000"
# Render reserves PORT=10000 for hosted services. This is an ephemeral
# loopback-only CI process; bind the app to the same port as BETTER_AUTH_URL.
export PORT="3000"
export BETTER_AUTH_SECRET="ci-only-synthetic-secret-at-least-32-characters"
export DEMO_ADMIN_EMAIL="admin@mandategate.local"
export DEMO_ADMIN_PASSWORD="synthetic-demo-password-2026"
export DEMO_AGENT_API_KEY="mg_demo_ci_only_synthetic_agent_key_2026"
export DEMO_PAYMENT_AGENT_API_KEY="mg_payment_ci_only_synthetic_agent_key_2026"
export MANDATEGATE_RUNTIME_MODE="legacy"
export MANDATEGATE_DISABLE_PAYMENTS="1"
export NEXT_TELEMETRY_DISABLED="1"
export CI="true"
# This flag is only meaningful with the strict database/identity checks in
# verify-dashboard-cross-org-http.ts. Never apply to a deployed application.
export MANDATEGATE_EMBEDDED_POSTGRES_CI="1"
unset NODE_ENV
echo "CI_SOURCE_SHA=$sha"
echo 'CI_MODE=private-build-disposable-local-postgresql18'
step() { echo "CI_STEP=$1"; shift; "$@"; }
step video-recorder-syntax node --check scripts/ci-record-demo.mjs
step video-mux-syntax node --check scripts/ci-mux-demo.mjs
step video-stage-syntax node --check scripts/ci-stage-voiceover.mjs
step video-repair-syntax node --check scripts/ci-video-repair.mjs
step video-output-qa-syntax node --check scripts/ci-qa-demo-output.mjs
step pnpm-version pnpm --version
step frozen-install pnpm install --frozen-lockfile
CI_PG_TEMP="$(mktemp -d /tmp/mandategate-pg.XXXXXX)"
export CI_PG_DATA_DIR="$CI_PG_TEMP/db"
mkdir -p "$CI_PG_DATA_DIR"
pg_pid=''
web_pid=''
cleanup() {
  if [[ -n "$web_pid" ]]; then kill -- "-$web_pid" 2>/dev/null || true; wait "$web_pid" 2>/dev/null || true; fi
  if [[ -n "$pg_pid" ]]; then kill "$pg_pid" 2>/dev/null || true; wait "$pg_pid" 2>/dev/null || true; fi
  if [[ -n "${CI_PG_TEMP:-}" && -d "$CI_PG_TEMP" ]]; then rm -rf -- "$CI_PG_TEMP"; fi
}
trap cleanup EXIT
if [[ -n "${CI_DEMO_VOICEOVER_URL:-}" ]]; then
  export CI_DEMO_VOICEOVER_FILE="$CI_PG_TEMP/voiceover-source.mp3"
  step stage-licensed-voiceover node scripts/ci-stage-voiceover.mjs
fi
echo 'CI_STEP=install-temporary-postgresql18'
npm install --prefix "$CI_PG_TEMP" --no-save --no-audit --no-fund embedded-postgres@18.4.0-beta.17
cp scripts/ci-embedded-postgres.mjs "$CI_PG_TEMP/start.mjs"
node "$CI_PG_TEMP/start.mjs" > "$CI_PG_TEMP/startup.log" 2>&1 &
pg_pid=$!
ready=0
echo 'CI_STEP=start-disposable-postgresql18'
for i in $(seq 1 100); do
  if grep -q "^CI_PG_READY$" "$CI_PG_TEMP/startup.log"; then ready=1; break; fi
  if ! kill -0 "$pg_pid" 2>/dev/null; then break; fi
  sleep 1
done
if [[ "$ready" != "1" ]]; then
  echo CI_EMBEDDED_PG_START_FAILED >&2
  tail -n 24 "$CI_PG_TEMP/startup.log" >&2
  exit 25
fi
node - <<'NODE'
const pg=require('pg');
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
client.connect().then(async()=>{const r=await client.query("select current_setting('server_version_num')::int as version_num,current_database() as name,inet_server_port()::int as port");await client.end();const v=r.rows[0];if(r.rows.length!==1||v.version_num<180000||v.version_num>=190000||v.name!=='mandategate'||v.port!==55432)throw Error('CI_DATABASE_IDENTITY_FAILED '+JSON.stringify(v));console.log('CI_PG18_LOCAL_VERIFIED')}).catch(e=>{console.error('CI_DATABASE_IDENTITY_FAILED',e.message);process.exit(1)});
NODE
step migration-1 pnpm db:migrate
step migration-2 pnpm db:migrate
step seed-1 pnpm demo:seed
step seed-2 pnpm demo:seed
step autonomous-preview pnpm jobs:autopay:preview
step judge-smoke-fixture node scripts/test-judge-smoke-fixture.mjs
step typecheck pnpm typecheck
step complete-unit-and-database-tests pnpm test
# The vitest database suite provisions throwaway organizations and grants the
# demo admin membership in them; membership-scoped screens would otherwise
# capture that test data. Remove foreign memberships before the app starts.
step clean-ci-capture-visibility node scripts/ci-clean-shared-visibility.mjs
step full-production-build pnpm build
if ! command -v setsid >/dev/null 2>&1; then echo CI_SETSID_REQUIRED >&2; exit 27; fi
# Fail fast if anything already owns the loopback port: a stale server would
# pass the health check and silently serve an OLD build to smoke/visual QA.
if ss -ltn 2>/dev/null | grep -qE '[:.]3000[[:space:]]'; then echo CI_PORT_3000_BUSY >&2; exit 31; fi
echo 'CI_STEP=authenticated-loopback-smoke'
# Dedicated process group: kill both pnpm and every Next descendant on reset.
setsid pnpm start > "$CI_PG_TEMP/next.log" 2>&1 &
web_pid=$!
healthy=0
for i in $(seq 1 70); do
  if node -e 'fetch("http://127.0.0.1:3000/api/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then healthy=1; break; fi
  if ! kill -0 "$web_pid" 2>/dev/null; then break; fi
  sleep 1
done
if [[ "$healthy" != "1" ]]; then echo CI_APP_HEALTH_FAILED >&2; tail -n 24 "$CI_PG_TEMP/next.log" >&2; exit 26; fi
# Browser signs in first on a fresh isolated app. After screenshots we
# restart that app and run HTTP smoke in a separate fresh process so normal
# Better Auth per-IP rate limiting remains enforced for both test phases.
# Real desktop/mobile browser capture happens while this synthetic local
# database and signed-in Next server are still alive. No provider keys exist.
# Browser package and Chromium shell are installed only in disposable CI temp.
echo 'CI_STEP=install-visual-browser'
mkdir -p "$CI_PG_TEMP/visual-browser" "$CI_PG_TEMP/playwright-browsers"
step visual-browser-package npm install --prefix "$CI_PG_TEMP/visual-browser" --no-save --no-audit --no-fund playwright@1.56.1
step visual-browser-shell env PLAYWRIGHT_BROWSERS_PATH="$CI_PG_TEMP/playwright-browsers" "$CI_PG_TEMP/visual-browser/node_modules/.bin/playwright" install chromium-headless-shell
export CI_VISUAL_BROWSER_ROOT="$CI_PG_TEMP/visual-browser"
export CI_CAPTURE_AUTH_STATE="$CI_PG_TEMP/visual-auth-state.json"
step visual-browser-qa env PLAYWRIGHT_BROWSERS_PATH="$CI_PG_TEMP/playwright-browsers" node scripts/ci-visual-qa.mjs
echo 'CI_STEP=reset-local-next-auth-rate-limiter'
kill -- "-$web_pid" 2>/dev/null || true
wait "$web_pid" 2>/dev/null || true
web_pid=''
closed=0
for i in $(seq 1 40); do
  if ! node -e 'fetch("http://127.0.0.1:3000/api/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then closed=1; break; fi
  sleep 1
done
if [[ "$closed" != "1" ]]; then echo CI_WEB_NOT_STOPPED >&2; exit 28; fi
setsid pnpm start > "$CI_PG_TEMP/next-smoke.log" 2>&1 &
web_pid=$!
healthy=0
for i in $(seq 1 70); do
  if node -e 'fetch("http://127.0.0.1:3000/api/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then healthy=1; break; fi
  if ! kill -0 "$web_pid" 2>/dev/null; then break; fi
  sleep 1
done
if [[ "$healthy" != "1" ]]; then echo CI_APP_RESTART_HEALTH_FAILED >&2; tail -n 24 "$CI_PG_TEMP/next-smoke.log" >&2; exit 29; fi
# Capture the canonical clean seed before the smoke suite adds history and trust cases.
# This recorder creates only synthetic decision requests and has no PayPal secrets.
step browser-demo-footage env PLAYWRIGHT_BROWSERS_PATH="$CI_PG_TEMP/playwright-browsers" node scripts/ci-record-demo.mjs
if [[ -n "${CI_DEMO_VOICEOVER_URL:-}" ]]; then
  echo "CI_STEP=prepare-licensed-audio-mux"
  if [[ -x /usr/bin/ffmpeg ]]; then
    export CI_DEMO_FFMPEG=/usr/bin/ffmpeg
  else
    npm install --prefix "$CI_PG_TEMP/media" --no-save --no-audit --no-fund ffmpeg-static@5.2.0
    export CI_DEMO_FFMPEG="$CI_PG_TEMP/media/node_modules/ffmpeg-static/ffmpeg"
    if [[ ! -x "$CI_DEMO_FFMPEG" ]]; then echo CI_DEMO_FFMPEG_NOT_FOUND >&2; exit 30; fi
  fi
  step narrated-demo-mp4 node scripts/ci-mux-demo.mjs
  step final-media-machine-qa node scripts/ci-qa-demo-output.mjs
  cp ci-public/demo/mandategate-demo-final.mp4 ci-public/demo/mandategate-explained.mp4
  step narrated-demo-frame-and-audio-review node scripts/ci-qa-demo-output.mjs
fi
rm -f -- "$CI_CAPTURE_AUTH_STATE"
step signed-in-http-smoke pnpm smoke
echo "CI_RESULT=PASS"
echo "CI_SOURCE_SHA=$sha"
echo 'CI_DB=POSTGRESQL18_ISOLATED'
mkdir -p ci-public
printf '<!doctype html><html lang="en"><meta charset="utf-8"><title>MandateGate v2 CI</title><body><h1>Isolated UI verification</h1><p>PostgreSQL 18, synthetic data and payments disabled. This is NOT the live app.</p><p><a href="/visual/">Review desktop and mobile captures</a></p><p><a href="demo/mandategate-real-browser-demo.webm">Play recorded real UI demo</a>. <a href="demo/mandategate-explained.mp4">EXPLANATORY REAL UI DEMO (MP4)</a> · <a href="demo/mandategate-demo-final.mp4">Same recording with standard name</a>. See CI logs for validated SHA and test results.</p></body></html>\n' > ci-public/index.html
