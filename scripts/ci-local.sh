#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Run this from an authenticated private MandateGate git checkout.
# Examples: bash scripts/ci-local.sh HEAD
#           bash scripts/ci-local.sh pr:39
root=$(git -C "$(dirname "${BASH_SOURCE[0]}")/.." rev-parse --show-toplevel)
ref=${1:-HEAD}

# Record an auditable, committed harness. Otherwise CI_HARNESS_SHA can
# misleadingly identify HEAD while running locally modified helper scripts.
harness_sha=$(git -C "$root" rev-parse --verify 'HEAD^{commit}')
for path in scripts/ci-local.sh scripts/ci-local-run.sh ci/docker-compose.local.yml; do
  if ! git -C "$root" ls-files --error-unmatch -- "$path" >/dev/null 2>&1 || \
     ! git -C "$root" diff --quiet HEAD -- "$path"; then
    echo "CI_HARNESS_UNCOMMITTED: $path" >&2
    exit 2
  fi
done

for tool in git tar docker; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "CI_MISSING_DEPENDENCY: $tool" >&2
    exit 2
  fi
done
if ! docker compose version >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo 'CI_DOCKER_COMPOSE_OR_DAEMON_UNAVAILABLE' >&2
  exit 2
fi

if [[ "$ref" =~ ^pr:([1-9][0-9]*)$ ]]; then
  number=${BASH_REMATCH[1]}
  ref="refs/remotes/origin/mandategate-ci-pr-${number}"
  git -C "$root" fetch --quiet --no-tags origin \
    "+refs/pull/${number}/head:${ref}"
fi
sha=$(git -C "$root" rev-parse --verify "${ref}^{commit}")
if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'CI_GIT_SHA_INVALID' >&2
  exit 2
fi

if [[ "$(id -u)" == 0 ]]; then
  echo 'CI_USE_NON_ROOT_HOST_USER' >&2
  exit 2
fi
export MANDATEGATE_CI_UID MANDATEGATE_CI_GID
MANDATEGATE_CI_UID=$(id -u)
MANDATEGATE_CI_GID=$(id -g)
project="mandategateci$(date -u +%s)$$"
snapshot=$(mktemp -d "${TMPDIR:-/tmp}/mandategate-ci.XXXXXXXX")
log_dir="${MANDATEGATE_CI_LOG_DIR:-${root}/ci-evidence}"
mkdir -p "$log_dir"
log_file="${log_dir}/ci-${sha:0:12}-$(date -u +%Y%m%dT%H%M%SZ).log"
compose="$snapshot/repo/ci/docker-compose.local.yml"
cleanup() {
  docker compose -p "$project" -f "$compose" down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf -- "$snapshot"
}
trap cleanup EXIT
mkdir -p "$snapshot/repo/ci" "$snapshot/repo/scripts"
# Archive committed code only. Untracked .env.local and host files never enter CI.
git -C "$root" archive --format=tar "$sha" | tar -xf - -C "$snapshot/repo"
# The harness can verify an older PR even before this harness is merged.
cp "$root/ci/docker-compose.local.yml" "$compose"
cp "$root/scripts/ci-local-run.sh" "$snapshot/repo/scripts/ci-local-run.sh"

{
  printf 'CI_SOURCE_SHA=%s\n' "$sha"
  printf 'CI_HARNESS_SHA=%s\n' "$harness_sha"
  printf 'CI_ISOLATED_POSTGRES=18\nCI_NODE=24.21.0\n'
  printf 'CI_REAL_PAYMENT_CREDENTIALS=not_forwarded\n'
  printf 'CI_HOST_ENV_FILES=not_mounted\n'
  docker compose -p "$project" -f "$compose" run --rm verify
} 2>&1 | tee "$log_file"
echo "CI_RESULT=PASS" | tee -a "$log_file"
echo "CI_EVIDENCE_LOG=$log_file"
