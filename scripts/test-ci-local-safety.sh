#!/usr/bin/env bash
set -Eeuo pipefail

# Synthetic git/Docker fixture. No real Docker daemon, network, DB or payout.
# Run from the repository: bash scripts/test-ci-local-safety.sh
source_root=$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)
fixture=$(mktemp -d /tmp/mandategate-ci-safety.XXXXXXXX)
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/repo/scripts" "$fixture/repo/ci" "$fixture/bin"
cp "$source_root/scripts/ci-local.sh" "$fixture/repo/scripts/ci-local.sh"
printf 'echo synthetic runner\n' > "$fixture/repo/scripts/ci-local-run.sh"
printf 'services: {}\n' > "$fixture/repo/ci/docker-compose.local.yml"
cat > "$fixture/bin/docker" <<'MOCK_DOCKER'
#!/usr/bin/env bash
case "$*" in
  'compose version'|'info') exit 0;;
  *'run --rm verify') printf 'MOCK_DOCKER_RUN_OK\n';exit 0;;
  *'down --volumes --remove-orphans') exit 0;;
  *) echo "UNEXPECTED_DOCKER_ARGS:$*" >&2;exit 42;;
esac
MOCK_DOCKER
chmod +x "$fixture/bin/docker"
cd "$fixture/repo"
git init -q -b harness
git config user.name 'MandateGate CI Safety Fixture'
git config user.email ci@example.invalid
git add .
git commit -qm 'committed clean harness'
export PATH="$fixture/bin:$PATH"
export MANDATEGATE_CI_LOG_DIR="$fixture/logs"

bash scripts/ci-local.sh HEAD > "$fixture/clean.log" 2>&1
grep -q '^CI_RESULT=PASS$' "$fixture/clean.log"
printf 'PASS clean committed harness\n'

git switch -q -c symlink-archive
printf 'SENTINEL_UNCHANGED\n' > "$fixture/sentinel"
rm scripts/ci-local-run.sh
ln -s "$fixture/sentinel" scripts/ci-local-run.sh
git add -A
git commit -qm 'simulate malicious archived helper symlink'
git switch -q harness
set +e
bash scripts/ci-local.sh symlink-archive > "$fixture/symlink.log" 2>&1
code=$?
set -e
[[ "$code" == 2 ]]
grep -q '^CI_ARCHIVE_UNSAFE_HELPER_SYMLINK$' "$fixture/symlink.log"
grep -qx 'SENTINEL_UNCHANGED' "$fixture/sentinel"
! grep -q 'CI_RESULT=PASS' "$fixture/symlink.log"
printf 'PASS archived symlink rejected before host copy\n'

printf 'dirty\n' >> scripts/ci-local-run.sh
set +e
bash scripts/ci-local.sh HEAD > "$fixture/dirty.log" 2>&1
code=$?
set -e
[[ "$code" == 2 ]]
grep -q '^CI_HARNESS_UNCOMMITTED: scripts/ci-local-run.sh$' "$fixture/dirty.log"
! grep -q 'CI_RESULT=PASS' "$fixture/dirty.log"
printf 'PASS uncommitted helper rejected\n'

printf 'CI_LOCAL_SAFETY_PASS\n'
