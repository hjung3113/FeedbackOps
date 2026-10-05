#!/usr/bin/env bash
# release-gate.sh <develop-checkout> — verify the develop tip for release, without creating a PR.
set -uo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
MODE=release-gate
CHECK_NAMES=()
CHECK_CODES=()
CHECK_COUNT=0
TESTED_SHA=

usage() {
  cat <<'EOF'
Usage: release-gate.sh <develop-checkout>

Requires WAVE_STATE and a clean checkout at the current origin/develop tip.
Fetches develop and main, starts the verify database, refreshes feedbackops_release,
then runs the release checks. On success it prints the complete gh command with
the tested SHA; it never creates or merges the release PR.
EOF
}

finish() {
  local ok=$1 code=$2 i
  if [[ -n "$TESTED_SHA" ]]; then printf 'Tested develop tip: %s\n' "$TESTED_SHA"; fi
  printf '\n%-28s %s\n' 'Check' 'Exit'
  for ((i = 0; i < CHECK_COUNT; i++)); do
    printf '%-28s %s\n' "${CHECK_NAMES[$i]}" "${CHECK_CODES[$i]}"
  done
  printf '{"ok":%s,"command":"%s","checks":%d,"tested_sha":"%s"}\n' "$ok" "$MODE" "$CHECK_COUNT" "$TESTED_SHA"
  exit "$code"
}

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  finish false "${2:-2}"
}

run_check() {
  local name=$1 log=$2 code
  shift 2
  ("$@") >"$log" 2>&1
  code=$?
  CHECK_NAMES+=("$name")
  CHECK_CODES+=("$code")
  CHECK_COUNT=$((CHECK_COUNT + 1))
  if [[ "$code" != 0 ]]; then
    printf 'FAILED: %s (exit %s)\n' "$name" "$code" >&2
    tail -n 40 "$log" >&2
    finish false "$code"
  fi
  printf 'PASS: %s\n' "$name"
}

prepare_node22() {
  local major=
  if command -v node >/dev/null 2>&1; then
    major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null) || major=
  fi
  if [[ "$major" != 22 && -d /opt/homebrew/opt/node@22/bin ]]; then
    export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
    major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null) || return 1
  fi
  if [[ "$major" != 22 ]]; then
    printf 'ERROR: release gate needs Node 22 on PATH; found major version %s\n' "${major:-unknown}" >&2
    return 1
  fi
}

main() {
  if (( $# == 1 )) && [[ "$1" == --help || "$1" == -h ]]; then
    MODE=help
    usage
    finish true 0
  fi
  (( $# == 1 )) || fail 'usage: release-gate.sh <develop-checkout>' 2
  [[ -n "${WAVE_STATE:-}" ]] || fail 'set WAVE_STATE to the wave scratch directory' 2
  local checkout
  checkout=$(cd -- "$1" 2>/dev/null && pwd) || fail "checkout does not exist: $1" 2
  [[ -d "$checkout/apps/frontend" && -d "$checkout/packages/shared" && -d "$checkout/packages/ui" ]] || fail "not a FeedbackOps checkout: $checkout" 2
  [[ -x "$SCRIPT_DIR/verify-db.sh" && -x "$SCRIPT_DIR/verify-be.sh" && -x "$SCRIPT_DIR/verify-fe.sh" && -x "$SCRIPT_DIR/visual.sh" ]] || fail 'release gate helper scripts are missing or not executable' 2

  git -C "$checkout" fetch origin develop main || fail 'could not refresh origin/develop and origin/main' 1
  local head_sha develop_sha dirty
  head_sha=$(git -C "$checkout" rev-parse HEAD 2>/dev/null) || fail 'could not read checkout HEAD' 1
  develop_sha=$(git -C "$checkout" rev-parse origin/develop 2>/dev/null) || fail 'could not read origin/develop' 1
  [[ "$head_sha" == "$develop_sha" ]] || fail "checkout HEAD $head_sha is not the current origin/develop tip $develop_sha" 1
  dirty=$(git -C "$checkout" status --porcelain --untracked-files=no 2>/dev/null) || fail 'could not inspect checkout status' 1
  [[ -z "$dirty" ]] || fail 'release checkout has tracked worktree changes' 1
  TESTED_SHA=$head_sha

  prepare_node22 || fail 'release gate requires Node 22' 2
  mkdir -p "$WAVE_STATE/release-gate" || fail "cannot create release log directory under $WAVE_STATE" 2
  WAVE_STATE=$(cd -- "$WAVE_STATE" 2>/dev/null && pwd) || fail "cannot resolve WAVE_STATE: $WAVE_STATE" 2
  export WAVE_STATE
  local logdir=$WAVE_STATE/release-gate

  run_check 'verify-db up' "$logdir/db-up.log" env VERIFY_DB_ROOT="$checkout" "$SCRIPT_DIR/verify-db.sh" up
  run_check 'verify-db drop release' "$logdir/db-drop.log" env VERIFY_DB_ROOT="$checkout" "$SCRIPT_DIR/verify-db.sh" drop release
  run_check 'verify-db create release' "$logdir/db-create.log" env VERIFY_DB_ROOT="$checkout" "$SCRIPT_DIR/verify-db.sh" create release --migrate-from "$checkout"
  run_check 'verify-be release' "$logdir/verify-be.log" "$SCRIPT_DIR/verify-be.sh" "$checkout" release
  run_check 'packages/shared vitest' "$logdir/shared-vitest.log" bash -c 'cd "$1" && pnpm --filter @fops/shared exec vitest run' bash "$checkout"
  run_check 'verify-fe' "$logdir/verify-fe.log" "$SCRIPT_DIR/verify-fe.sh" "$checkout"
  run_check 'packages/ui vitest' "$logdir/ui-vitest.log" bash -c 'cd "$1" && pnpm --filter @fops/ui exec vitest run' bash "$checkout"
  run_check 'gate:fe-lint --base origin/main' "$logdir/fe-lint.log" bash -c 'cd "$1" && pnpm -s gate:fe-lint --base origin/main' bash "$checkout"
  run_check 'visual harness' "$logdir/visual.log" env VISUAL_ROOT="$checkout" "$SCRIPT_DIR/visual.sh" run

  printf "Next command: gh pr create --base main --head develop --title 'Release: develop -> main' --body 'Verified develop tip: %s'\n" "$TESTED_SHA"
  finish true 0
}

main "$@"
