#!/usr/bin/env bash
# visual.sh — run, update, stabilize, or temporarily capture the visual harness.
set -uo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SCRIPT_ROOT=$(cd -- "$SCRIPT_DIR/../../../.." && pwd)
ROOT=${VISUAL_ROOT:-$SCRIPT_ROOT}
FRONTEND=$ROOT/apps/frontend
TEMPLATE=$SCRIPT_DIR/../templates/capture.visual.spec.ts.tmpl
PLAY_PASSED=0
PLAY_FAILED=0
PLAY_SKIPPED=0
PLAY_EXIT=0
PLAY_PORT=
PLAY_LOG=
PLAY_JSON=
MODE=unknown
TOTAL_PASSED=0
TOTAL_FAILED=0
TOTAL_SKIPPED=0
TOTAL_RUNS=0

usage() {
  cat <<'EOF'
Usage:
  visual.sh run [playwright filter...]
  visual.sh update <filter...>
  visual.sh stable <filter...> [--runs N]
  visual.sh capture <name> --route <url> [--state <label>]...
  visual.sh capture --clean <name>

PW_PORT may select a port; otherwise an available local port is chosen.
Captures use labels for screenshot names. A temporary spec uses the committed
visual helpers and writes screenshots under .review/<name>-shots/.
EOF
}

result() {
  local ok=$1 code=$2 extra=${3:-}
  printf '{"ok":%s,"command":"%s","passed_specs":%d,"failed_specs":%d,"skipped_specs":%d,"runs":%d' \
    "$ok" "$MODE" "$TOTAL_PASSED" "$TOTAL_FAILED" "$TOTAL_SKIPPED" "$TOTAL_RUNS"
  if [[ -n "$extra" ]]; then printf ',"%s":true' "$extra"; fi
  printf '}\n'
  exit "$code"
}

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  result false "${2:-2}" "${3:-}"
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
    printf 'ERROR: visual harness needs Node 22 on PATH; found major version %s\n' "${major:-unknown}" >&2
    return 1
  fi
}

choose_port() {
  if [[ -n "${PW_PORT:-}" ]]; then
    if [[ ! "$PW_PORT" =~ ^[0-9]+$ || ${#PW_PORT} -gt 5 ]]; then
      printf 'ERROR: PW_PORT must be a TCP port from 1 to 65535\n' >&2
      return 1
    fi
    local requested_port=$((10#$PW_PORT))
    if (( requested_port < 1 || requested_port > 65535 )); then
      printf 'ERROR: PW_PORT must be a TCP port from 1 to 65535\n' >&2
      return 1
    fi
    PLAY_PORT=$requested_port
  else
    PLAY_PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()') || return 1
  fi
}

parse_playwright_report() {
  python3 - "$1" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as stream:
    report = json.load(stream)

passed = failed = skipped = 0

def visit(suites):
    global passed, failed, skipped
    for suite in suites or []:
        for spec in suite.get("specs", []):
            statuses = [test.get("status", "") for test in spec.get("tests", [])]
            if not statuses:
                continue
            if any(status in ("unexpected", "timedOut", "interrupted") for status in statuses):
                failed += 1
            elif all(status == "skipped" for status in statuses):
                skipped += 1
            else:
                passed += 1
        visit(suite.get("suites", []))

visit(report.get("suites", []))
print(passed, failed, skipped)
PY
}

run_playwright() {
  local update=$1
  shift
  PLAY_EXIT=2
  PLAY_PASSED=0
  PLAY_FAILED=0
  PLAY_SKIPPED=0
  PLAY_PORT=
  PLAY_LOG=
  PLAY_JSON=
  prepare_node22 || return 2
  choose_port || return 2
  mkdir -p "$FRONTEND/test-results" || return 2

  local report=$FRONTEND/test-results/visual-results.json
  local saved_report summary_json
  saved_report=$(mktemp) || return 2
  summary_json=$(mktemp) || { rm -f "$saved_report"; return 2; }
  PLAY_LOG=$(mktemp) || { rm -f "$saved_report" "$summary_json"; return 2; }
  local had_report=0
  if [[ -f "$report" ]]; then
    cp -p "$report" "$saved_report" || { rm -f "$saved_report" "$summary_json" "$PLAY_LOG"; return 2; }
    had_report=1
  fi
  rm -f "$report"

  if [[ "$update" == 1 ]]; then
    (cd "$FRONTEND" && PW_PORT="$PLAY_PORT" env -u NODE_OPTIONS npx playwright test -c playwright.config.ts --update-snapshots=all "$@") >"$PLAY_LOG" 2>&1
    PLAY_EXIT=$?
  else
    (cd "$FRONTEND" && PW_PORT="$PLAY_PORT" env -u NODE_OPTIONS npx playwright test -c playwright.config.ts "$@") >"$PLAY_LOG" 2>&1
    PLAY_EXIT=$?
  fi

  if [[ -f "$report" ]]; then cp "$report" "$summary_json"; fi
  if [[ "$had_report" == 1 ]]; then cp -p "$saved_report" "$report"; fi
  rm -f "$saved_report"

  PLAY_PASSED=0
  PLAY_FAILED=0
  PLAY_SKIPPED=0
  if [[ -s "$summary_json" ]]; then
    local parsed
    parsed=$(parse_playwright_report "$summary_json") || PLAY_EXIT=1
    if [[ -n "$parsed" ]]; then
      read -r PLAY_PASSED PLAY_FAILED PLAY_SKIPPED <<< "$parsed"
    fi
  elif [[ "$PLAY_EXIT" == 0 ]]; then
    printf 'ERROR: Playwright did not write its JSON report\n' >&2
    PLAY_EXIT=1
  fi
  if (( PLAY_FAILED > 0 && PLAY_EXIT == 0 )); then PLAY_EXIT=1; fi
  PLAY_JSON=$summary_json
  return "$PLAY_EXIT"
}

print_playwright_summary() {
  printf '%s port=%s passed_specs=%s failed_specs=%s skipped_specs=%s exit=%s\n' \
    "$1" "$PLAY_PORT" "$PLAY_PASSED" "$PLAY_FAILED" "$PLAY_SKIPPED" "$PLAY_EXIT"
  TOTAL_PASSED=$((TOTAL_PASSED + PLAY_PASSED))
  TOTAL_FAILED=$((TOTAL_FAILED + PLAY_FAILED))
  TOTAL_SKIPPED=$((TOTAL_SKIPPED + PLAY_SKIPPED))
  TOTAL_RUNS=$((TOTAL_RUNS + 1))
}

show_failure_log() {
  if [[ -n "$PLAY_LOG" && -f "$PLAY_LOG" ]]; then
    tail -n 40 "$PLAY_LOG" >&2
  fi
}

clean_playwright_temps() {
  [[ -n "$PLAY_LOG" ]] && rm -f "$PLAY_LOG"
  [[ -n "$PLAY_JSON" ]] && rm -f "$PLAY_JSON"
}

safe_name() {
  [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9_-]*$ ]]
}

capture_clean() {
  local name=$1 spec=$FRONTEND/tests/visual/zz-$1.visual.spec.ts
  if ! safe_name "$name"; then fail 'capture name must use letters, digits, underscore, or hyphen' 2; fi
  if [[ ! -f "$spec" ]]; then fail "temporary spec does not exist: $spec" 2; fi
  if command -v trash >/dev/null 2>&1; then
    if trash "$spec"; then
      printf 'Moved temporary spec to Trash: %s\n' "$spec"
      result true 0 cleaned
    else
      fail "trash failed for $spec" 1
    fi
  fi
  printf 'Remove this temporary spec: %s\n' "$spec"
  result true 0 manual_cleanup
}

generate_capture_spec() {
  local name=$1 route=$2 shots_dir=$3 spec=$4
  shift 4
  python3 - "$TEMPLATE" "$spec" "$name" "$route" "$shots_dir" "$@" <<'PY'
import json
import pathlib
import sys

template_path, output_path, name, route, shots_dir, *states = sys.argv[1:]
if not states:
    states = ["default"]
template = pathlib.Path(template_path).read_text(encoding="utf-8")
values = {
    "__CAPTURE_NAME__": json.dumps(name, ensure_ascii=False),
    "__ROUTE__": json.dumps(route, ensure_ascii=False),
    "__STATES__": json.dumps(states, ensure_ascii=False),
    "__SHOTS_DIR__": json.dumps(shots_dir, ensure_ascii=False),
}
for marker, value in values.items():
    template = template.replace(marker, value)
pathlib.Path(output_path).write_text(template, encoding="utf-8")
PY
}

print_capture_paths() {
  local name=$1 shots_dir=$2
  shift 2
  local index=0 state safe
  if (( $# == 0 )); then set -- default; fi
  printf 'Screenshots:\n'
  for state in "$@"; do
    index=$((index + 1))
    safe=$(python3 -c 'import re,sys; value=re.sub(r"[^A-Za-z0-9_-]+", "-", sys.argv[1]).strip("-"); print(value or "state")' "$state") || safe=state
    printf '%s/%02d-%s.png\n' "$shots_dir" "$index" "$safe"
  done
}

main() {
  if (( $# == 0 )); then
    MODE=help
    usage
    result true 0
  fi
  if [[ "$1" == --help || "$1" == -h ]]; then
    MODE=help
    usage
    result true 0
  fi
  MODE=$1
  shift
  [[ -d "$ROOT" ]] || fail "visual root does not exist: $ROOT" 2
  case "$MODE" in
    run)
      if [[ "${1:-}" == --help || "${1:-}" == -h ]]; then MODE=help; usage; result true 0; fi
      if run_playwright 0 "$@"; then
        print_playwright_summary run
        clean_playwright_temps
        result true 0
      else
        print_playwright_summary run
        show_failure_log
        clean_playwright_temps
        result false 1
      fi
      ;;
    update)
      local filters=()
      while (( $# )); do
        case "$1" in
          --update-snapshots|--update-snapshots=*) fail 'update owns the --update-snapshots flag' 2 ;;
          *) filters+=("$1"); shift ;;
        esac
      done
      (( ${#filters[@]} > 0 )) || fail 'update requires at least one Playwright filter' 2
      local run_status=0
      run_playwright 1 "${filters[@]}" || run_status=$?
      print_playwright_summary update
      local baseline_log
      baseline_log=$(mktemp) || fail 'could not create baseline report log' 2
      if python3 "$SCRIPT_DIR/baseline-keep.py" --report --output-dir "$ROOT/.review/baseline-keep-crops" >"$baseline_log" 2>&1; then
        cat "$baseline_log"
      else
        cat "$baseline_log" >&2
        run_status=1
      fi
      rm -f "$baseline_log"
      if (( run_status != 0 )); then show_failure_log; fi
      clean_playwright_temps
      if (( run_status == 0 )); then result true 0; else result false 1; fi
      ;;
    stable)
      local runs=3 filters=()
      while (( $# )); do
        case "$1" in
          --runs)
            (( $# >= 2 )) || fail '--runs needs a positive integer' 2
            runs=$2
            shift 2
            ;;
          --runs=*)
            runs=${1#*=}
            shift
            ;;
          --update-snapshots|--update-snapshots=*) fail 'stable never updates snapshots' 2 ;;
          *) filters+=("$1"); shift ;;
        esac
      done
      [[ "$runs" =~ ^[0-9]+$ ]] || fail '--runs needs a positive integer' 2
      runs=$((10#$runs))
      (( runs > 0 )) || fail '--runs needs a positive integer' 2
      (( ${#filters[@]} > 0 )) || fail 'stable requires at least one Playwright filter' 2
      local run_number status=0
      for ((run_number = 1; run_number <= runs; run_number++)); do
        local this_status=0
        run_playwright 0 "${filters[@]}" || this_status=$?
        print_playwright_summary "run $run_number/$runs"
        if (( this_status != 0 )); then
          status=1
          show_failure_log
          clean_playwright_temps
          break
        fi
        clean_playwright_temps
      done
      if (( status == 0 )); then result true 0; else result false 1; fi
      ;;
    capture)
      if [[ "${1:-}" == --clean ]]; then
        (( $# == 2 )) || fail 'usage: capture --clean <name>' 2
        capture_clean "$2"
      fi
      (( $# >= 1 )) || fail 'usage: capture <name> --route <url> [--state <label>]...' 2
      local name=$1
      shift
      safe_name "$name" || fail 'capture name must use letters, digits, underscore, or hyphen' 2
      local route= states=() spec shots_dir
      while (( $# )); do
        case "$1" in
          --route)
            (( $# >= 2 )) || fail '--route needs a URL' 2
            [[ -z "$route" ]] || fail 'capture accepts one --route' 2
            route=$2
            shift 2
            ;;
          --state)
            (( $# >= 2 )) || fail '--state needs a label' 2
            states+=("$2")
            shift 2
            ;;
          *) fail "unknown capture option: $1" 2 ;;
        esac
      done
      [[ -n "$route" ]] || fail 'capture requires --route <url>' 2
      spec=$FRONTEND/tests/visual/zz-$name.visual.spec.ts
      shots_dir=$ROOT/.review/$name-shots
      [[ ! -e "$spec" ]] || fail "temporary spec already exists: $spec" 2
      [[ -f "$TEMPLATE" ]] || fail "capture template is missing: $TEMPLATE" 2
      mkdir -p "$shots_dir" || fail "could not create screenshot directory: $shots_dir" 2
      generate_capture_spec "$name" "$route" "$shots_dir" "$spec" "${states[@]}" || fail 'could not generate capture spec' 1
      local capture_filter=zz-$name.visual.spec.ts run_status=0
      run_playwright 0 "$capture_filter" || run_status=$?
      print_playwright_summary capture
      print_capture_paths "$name" "$shots_dir" "${states[@]}"
      if (( run_status != 0 )); then show_failure_log; fi
      clean_playwright_temps
      if (( run_status == 0 )); then result true 0; else result false 1; fi
      ;;
    --help|-h)
      MODE=help
      usage
      result true 0
      ;;
    *)
      usage >&2
      fail "unknown command: $MODE" 2
      ;;
  esac
}

main "$@"
