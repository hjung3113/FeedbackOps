#!/usr/bin/env bash
# visual.sh — run, update, stabilize, or temporarily capture the visual harness.
set -uo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT=${VISUAL_ROOT:-}
FRONTEND=
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
  visual.sh capture <name> --route <url> [--from <visual-spec>] [--state <label>]...
  visual.sh capture --clean <name>

Run from the checkout under test; VISUAL_ROOT may override that checkout.
PW_PORT may select a port; otherwise an available local port is chosen.
Capture reuses a matching existing spec's installMockApi setup. Pass --from when
route inference is ambiguous; routes that call APIs need a matching spec setup.
--state values are screenshot labels only. Captures use the committed visual
helpers and write screenshots under .review/<name>-shots/.
EOF
}

result() {
  local ok=$1 code=$2 extra=${3:-}
  python3 - "$ok" "$MODE" "$TOTAL_PASSED" "$TOTAL_FAILED" "$TOTAL_SKIPPED" "$TOTAL_RUNS" "$ROOT" "$extra" <<'PY'
import json
import sys

ok, command, passed, failed, skipped, runs, root, extra = sys.argv[1:]
result = {
    "ok": ok == "true",
    "command": command,
    "passed_specs": int(passed),
    "failed_specs": int(failed),
    "skipped_specs": int(skipped),
    "runs": int(runs),
    "root": root,
}
if extra:
    result[extra] = True
print(json.dumps(result, separators=(",", ":")))
PY
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
  printf '%s root=%s port=%s passed_specs=%s failed_specs=%s skipped_specs=%s exit=%s\n' \
    "$1" "$ROOT" "$PLAY_PORT" "$PLAY_PASSED" "$PLAY_FAILED" "$PLAY_SKIPPED" "$PLAY_EXIT"
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
  local name=$1 route=$2 shots_dir=$3 spec=$4 from_spec=$5
  shift 4
  shift
  python3 - "$TEMPLATE" "$spec" "$name" "$route" "$shots_dir" "$FRONTEND/tests/visual" "$from_spec" "$@" <<'PY'
import fnmatch
import json
import pathlib
import re
import sys
from urllib.parse import urlsplit

template_path, output_path, name, route, shots_dir, visual_dir, from_spec, *states = sys.argv[1:]
if not states:
    states = ["default"]

visual_root = pathlib.Path(visual_dir).resolve()
candidates = sorted(
    path for path in visual_root.glob("*.visual.spec.ts")
    if not path.name.startswith("zz-")
)

def route_path(value):
    value = re.sub(r"\$\{[^}]+\}", "*", value)
    return urlsplit(value).path or "/"

requested_path = route_path(route)
requested_query = urlsplit(route).query

def goto_routes(source):
    pattern = re.compile(r"page\.goto\s*\(\s*(['\"`])((?:\\.|.)*?)\1", re.DOTALL)
    for match in pattern.finditer(source):
        target = match.group(2).replace("\\/", "/")
        yield match.start(), route_path(target), urlsplit(target).query

def matching_specs():
    matched = []
    for candidate in candidates:
        text = candidate.read_text(encoding="utf-8")
        if any(
            path == requested_path or fnmatch.fnmatchcase(requested_path, path)
            for _, path, _ in goto_routes(text)
        ):
            matched.append(candidate)
    return matched

route_matches = matching_specs()
source_path = None
if from_spec:
    requested_source = pathlib.Path(from_spec)
    if not requested_source.is_absolute():
        requested_source = visual_root / requested_source
    try:
        source_path = requested_source.resolve(strict=True)
        source_path.relative_to(visual_root)
    except (OSError, ValueError):
        source_path = None
    if source_path not in candidates:
        print(f"ERROR: --from must name an existing visual spec under {visual_root}: {from_spec}", file=sys.stderr)
        print("Candidate specs:", file=sys.stderr)
        for candidate in candidates:
            print(f"  --from {candidate.name}", file=sys.stderr)
        raise SystemExit(2)
    source_text = source_path.read_text(encoding="utf-8") if source_path else ""
    source_routes = list(goto_routes(source_text))
    if source_path not in route_matches and source_routes:
        print(f"ERROR: {source_path.name} has no page.goto route matching {route!r}.", file=sys.stderr)
        print("Candidate specs:", file=sys.stderr)
        for candidate in route_matches or candidates:
            print(f"  --from {candidate.name}", file=sys.stderr)
        raise SystemExit(2)
else:
    if not route_matches:
        print(f"ERROR: no existing visual spec matches route {route!r}; routes that call APIs require --from <visual-spec>.", file=sys.stderr)
        print("Candidate specs:", file=sys.stderr)
        for candidate in candidates:
            print(f"  --from {candidate.name}", file=sys.stderr)
        raise SystemExit(2)
    route_name = requested_path.rstrip("/").rsplit("/", 1)[-1]
    preferred = [candidate for candidate in route_matches if candidate.name == f"{route_name}.visual.spec.ts"]
    if len(preferred) == 1:
        source_path = preferred[0]
    elif len(route_matches) == 1:
        source_path = route_matches[0]
    else:
        print(f"ERROR: route {route!r} matches multiple specs; pass --from <visual-spec>.", file=sys.stderr)
        print("Candidate specs:", file=sys.stderr)
        for candidate in route_matches:
            print(f"  --from {candidate.name}", file=sys.stderr)
        raise SystemExit(2)

source_text = source_path.read_text(encoding="utf-8")

def matching_close(text, opening):
    pairs = {"(": ")", "[": "]", "{": "}"}
    stack = []
    quote = None
    line_comment = block_comment = False
    index = opening
    while index < len(text):
        char = text[index]
        following = text[index + 1] if index + 1 < len(text) else ""
        if line_comment:
            if char == "\n":
                line_comment = False
        elif block_comment:
            if char == "*" and following == "/":
                block_comment = False
                index += 1
        elif quote:
            if char == "\\":
                index += 1
            elif char == quote:
                quote = None
        elif char == "/" and following == "/":
            line_comment = True
            index += 1
        elif char == "/" and following == "*":
            block_comment = True
            index += 1
        elif char in "'\"`":
            quote = char
        elif char in pairs:
            stack.append(pairs[char])
        elif stack and char == stack[-1]:
            stack.pop()
            if not stack:
                return index
        index += 1
    return None

def split_arguments(text):
    pieces = []
    start = 0
    stack = []
    quote = None
    line_comment = block_comment = False
    pairs = {"(": ")", "[": "]", "{": "}"}
    index = 0
    while index < len(text):
        char = text[index]
        following = text[index + 1] if index + 1 < len(text) else ""
        if line_comment:
            if char == "\n": line_comment = False
        elif block_comment:
            if char == "*" and following == "/": block_comment = False; index += 1
        elif quote:
            if char == "\\": index += 1
            elif char == quote: quote = None
        elif char == "/" and following == "/": line_comment = True; index += 1
        elif char == "/" and following == "*": block_comment = True; index += 1
        elif char in "'\"`": quote = char
        elif char in pairs: stack.append(pairs[char])
        elif stack and char == stack[-1]: stack.pop()
        elif char == "," and not stack:
            pieces.append(text[start:index].strip())
            start = index + 1
        index += 1
    pieces.append(text[start:].strip())
    return pieces

calls = []
for match in re.finditer(r"installMockApi\s*\(\s*page\b", source_text):
    opening = source_text.find("(", match.start())
    closing = matching_close(source_text, opening)
    if closing is None:
        continue
    args = split_arguments(source_text[opening + 1:closing])
    calls.append((match.start(), closing + 1, args))

selected_setup = None
selected_call = None
matching_gotos = [
    entry for entry in goto_routes(source_text)
    if entry[1] == requested_path or fnmatch.fnmatchcase(requested_path, entry[1])
]
preferred_query = [entry for entry in matching_gotos if entry[2] == requested_query]
preferred_base = [entry for entry in matching_gotos if not entry[2]]
if preferred_query:
    matching_gotos = preferred_query
elif not requested_query and preferred_base:
    matching_gotos = preferred_base

for goto_start, path, _ in matching_gotos:
    preceding = [call for call in calls if call[1] <= goto_start]
    if not preceding:
        continue
    selected_call = max(preceding, key=lambda item: item[1])
    break

if selected_call is None and from_spec and not list(goto_routes(source_text)) and calls:
    selected_call = calls[0]

if selected_call is not None:
    options = selected_call[2][1] if len(selected_call[2]) > 1 else None
    setup_prefixes = []
    if options:
        loop_pattern = re.compile(r"for\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s+of\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\)")
        for loop in loop_pattern.finditer(source_text):
            variable = loop.group(1)
            if loop.start() < selected_call[0] and re.search(rf"\b{re.escape(variable)}\b", options):
                setup_prefixes.append(f"const {variable} = {loop.group(2)}[0];")
    setup_prefix = "\n".join(setup_prefixes)
    setup_call = "await installMockApi(page" + (f", {options}" if options else "") + ");"
    selected_setup = (setup_prefix + "\n" if setup_prefix else "") + setup_call

if selected_setup is None:
    print(f"ERROR: {source_path.name} has no installMockApi setup before a matching page.goto for {route!r}.", file=sys.stderr)
    print("Candidate specs with reusable API setup:", file=sys.stderr)
    for candidate in route_matches or candidates:
        candidate_text = candidate.read_text(encoding="utf-8")
        if "installMockApi" in candidate_text:
            print(f"  --from {candidate.name}", file=sys.stderr)
    raise SystemExit(2)

imports = []
for match in re.finditer(r"(?m)^import\b[\s\S]*?;\s*", source_text):
    statement = match.group(0)
    module_match = re.search(r"from\s+(['\"])([^'\"]+)\1", statement)
    if module_match and module_match.group(2) in {
        "@playwright/test", "./support/visual-test", "./support/mock-api", "./support/screenshot"
    }:
        continue
    imports.append(statement.rstrip())

template = pathlib.Path(template_path).read_text(encoding="utf-8")
values = {
    "__CAPTURE_NAME__": json.dumps(name, ensure_ascii=False),
    "__ROUTE__": json.dumps(route, ensure_ascii=False),
    "__STATES__": json.dumps(states, ensure_ascii=False),
    "__SHOTS_DIR__": json.dumps(shots_dir, ensure_ascii=False),
    "__FIXTURE_IMPORTS__": "\n".join(imports),
    "__MOCK_SETUP__": selected_setup,
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
  if [[ -n "${VISUAL_ROOT:-}" ]]; then
    ROOT=$(cd -- "$VISUAL_ROOT" 2>/dev/null && pwd) || fail "visual root does not exist: $VISUAL_ROOT" 2
  else
    ROOT=$(git -C "$PWD" rev-parse --show-toplevel 2>/dev/null) || fail 'run visual.sh from inside the repository or set VISUAL_ROOT' 2
  fi
  FRONTEND=$ROOT/apps/frontend
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
      local filter_count=0
      for filter in "${filters[@]+"${filters[@]}"}"; do filter_count=$((filter_count + 1)); done
      (( filter_count > 0 )) || fail 'update requires at least one Playwright filter' 2
      local run_status=0
      run_playwright 1 "${filters[@]+"${filters[@]}"}" || run_status=$?
      print_playwright_summary update
      local baseline_log
      baseline_log=$(mktemp) || fail 'could not create baseline report log' 2
      if python3 "$SCRIPT_DIR/baseline-keep.py" --report --root "$ROOT" --output-dir "$ROOT/.review/baseline-keep-crops" >"$baseline_log" 2>&1; then
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
      local filter_count=0
      for filter in "${filters[@]+"${filters[@]}"}"; do filter_count=$((filter_count + 1)); done
      (( filter_count > 0 )) || fail 'stable requires at least one Playwright filter' 2
      local run_number status=0
      for ((run_number = 1; run_number <= runs; run_number++)); do
        local this_status=0
        run_playwright 0 "${filters[@]+"${filters[@]}"}" || this_status=$?
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
      (( $# >= 1 )) || fail 'usage: capture <name> --route <url> [--from <visual-spec>] [--state <label>]...' 2
      local name=$1
      shift
      safe_name "$name" || fail 'capture name must use letters, digits, underscore, or hyphen' 2
      local route= from_spec= states=() spec shots_dir
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
          --from)
            (( $# >= 2 )) || fail '--from needs an existing visual spec' 2
            [[ -z "$from_spec" ]] || fail 'capture accepts one --from' 2
            from_spec=$2
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
      if ! generate_capture_spec "$name" "$route" "$shots_dir" "$spec" "$from_spec" "${states[@]+"${states[@]}"}"; then
        fail 'could not generate capture spec; see the listed source specs and --from guidance' 2
      fi
      local capture_filter=zz-$name.visual.spec.ts run_status=0
      run_playwright 0 "$capture_filter" || run_status=$?
      print_playwright_summary capture
      print_capture_paths "$name" "$shots_dir" "${states[@]+"${states[@]}"}"
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
