#!/usr/bin/env bash
[ -n "${BASH_VERSION:-}" ] || exec bash "$0" "$@"  # zsh-invoked runs lost BASH_SOURCE (s61, s70)
# ux-prep.sh <n> <worktree> [--baseline <checkout>] [--scale] [--targets <href,href,...>] [--no-perf]
# Quote the --targets list when calling from zsh: hrefs carry '?', which zsh globs before this script runs.
# Background UX/perf prep (run it with run_in_background as soon as the code review launches): creates or reuses
# the issue DB (verify-db.sh), seeds only when the [preview] fixtures are gone (app-preview.py --seed on the
# baseline start, restarting it if live, plus SEED_MODE=scale with --scale), starts or reuses the
# <n>-develop (baseline checkout, default $WAVE_STATE/baseline) and <n>-branch previews, curls targets and probes the
# Ego Lite bridge with one automatic restart, then runs nav-perf.sh --reset-db <n> unless --no-perf. Steps chain
# and stop at the first failure; each logs under $WAVE_STATE/ux-prep-<n>/ and the summary JSON (also written to
# $WAVE_STATE/ux-prep-<n>.json) is the last stdout line. Perf is skipped ("skipped: host busy") while vitest,
# integration tests, ego-browser nodejs or another nav-perf.sh runs, excluding this process and its ancestors.
# The previews are left running for the UX reviewer: stop them with `app-preview.py stop <n>-develop` and
# `app-preview.py stop <n>-branch`, and only then rebase the worktree or refresh the baseline. Needs WAVE_STATE.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_TARGETS='/home,/vocs?view=inbox,/vocs?view=triage,/findings,/tasks?view=board,/surveys/participate'
n='' worktree='' baseline='' scale=no targets="$DEFAULT_TARGETS" want_perf=yes
while [ $# -gt 0 ]; do
  case "$1" in
    --baseline) baseline=$2; shift 2 ;;
    --scale) scale=yes; shift ;;
    --targets) targets=$2; shift 2 ;;
    --no-perf) want_perf=no; shift ;;
    -h|--help) sed -n 3,13p "$0"; exit 0 ;;
    -*) echo "ux-prep.sh: unknown argument $1" >&2; exit 2 ;;
    *)
      if [ -z "$n" ]; then n=$1
      elif [ -z "$worktree" ]; then worktree=$1
      else echo "ux-prep.sh: unexpected argument $1" >&2; exit 2
      fi
      shift
      ;;
  esac
done
if [ -z "$n" ] || [ -z "$worktree" ]; then
  echo "ux-prep.sh: usage: ux-prep.sh <n> <worktree> [--baseline <checkout>] [--scale] [--targets <hrefs>] [--no-perf]" >&2
  exit 2
fi
[ -n "$targets" ] || { echo "ux-prep.sh: --targets must not be empty" >&2; exit 2; }
[ -d "$worktree" ] || { echo "ux-prep.sh: worktree not found: $worktree" >&2; exit 2; }
worktree=$(cd "$worktree" && pwd)
[ -n "${WAVE_STATE:-}" ] || { echo "ux-prep.sh: set WAVE_STATE to the wave scratch directory" >&2; exit 2; }
[ -d "$WAVE_STATE" ] || { echo "ux-prep.sh: WAVE_STATE is not a directory: $WAVE_STATE" >&2; exit 2; }
WAVE_STATE=$(cd "$WAVE_STATE" && pwd)
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
baseline=${baseline:-$WAVE_STATE/baseline}
[ -d "$baseline" ] || { echo "ux-prep.sh: baseline checkout not found: $baseline (refresh it per skill step 7c, or pass --baseline <checkout>)" >&2; exit 2; }
baseline=$(cd "$baseline" && pwd)
env_file=$WAVE_STATE/env.verify.$n
logdir=$WAVE_STATE/ux-prep-$n
state_json=$WAVE_STATE/ux-prep-$n.json
perf_out=$worktree/.review/$n-perf/nav-perf.json
mkdir -p "$logdir"
seeded=false dev_url='' branch_url='' probe='not-probed' seed_needed=''
perf_skipped='' perf_breach='' perf_exit=''

steps_text=''
emitted=0
step() {  # step <name> <function>: log to $logdir/<name>.log; stop the chain at the first failure
  local name=$1 fn=$2 t0=$SECONDS code=0
  "$fn" >"$logdir/$name.log" 2>&1 || code=$?
  steps_text+="$name:$code:$((SECONDS - t0))"$'\n'
  if [ "$code" -ne 0 ]; then emit_json 1; fi
}

emit_json() {  # emit_json <exit code>: print the summary JSON as the last stdout line, write it, exit
  emitted=1
  local exit_code=$1
  UX_N=$n UX_ENV=$env_file UX_SEEDED=$seeded UX_DEV=$dev_url UX_BRANCH=$branch_url UX_PROBE=$probe \
  UX_PERF_SKIPPED=$perf_skipped UX_PERF_OUT=$perf_out UX_PERF_BREACH=$perf_breach UX_PERF_EXIT=$perf_exit \
  UX_STOP_DEVELOP="app-preview.py stop $n-develop" UX_STOP_BRANCH="app-preview.py stop $n-branch" \
  UX_STEPS=$steps_text UX_STATE_JSON=$state_json python3 - "$exit_code" <<'PY'
import json, os, sys


def value(key):
    v = os.environ.get(key, '')
    return v if v != '' else None


exit_code = int(sys.argv[1])
steps = []
for line in os.environ.get('UX_STEPS', '').splitlines():
    if line:
        name, code, secs = line.rsplit(':', 2)
        steps.append({'name': name, 'ok': code == '0', 'seconds': int(secs)})
skipped = value('UX_PERF_SKIPPED')
perf = skipped if skipped is not None else {
    'out': value('UX_PERF_OUT'),
    'breach': value('UX_PERF_BREACH'),
    'exit': int(os.environ['UX_PERF_EXIT']) if os.environ.get('UX_PERF_EXIT', '') != '' else None,
}
doc = {
    'ok': exit_code == 0,
    'issue': value('UX_N'),
    'env': value('UX_ENV'),
    'seeded': os.environ.get('UX_SEEDED') == 'true',
    'previews': {'develop': value('UX_DEV'), 'branch': value('UX_BRANCH')},
    'probe': value('UX_PROBE'),
    'perf': perf,
    'steps': steps,
    'stop': [os.environ['UX_STOP_DEVELOP'], os.environ['UX_STOP_BRANCH']],
}
line = json.dumps(doc)
print(line)
with open(os.environ['UX_STATE_JSON'], 'w') as f:
    f.write(line + '\n')
PY
  exit "$exit_code"
}

trap 'c=$?; if [ "$c" -ne 0 ] && [ "$emitted" -eq 0 ]; then echo "ux-prep.sh: unexpected failure (exit $c) at line $LINENO" >&2; emit_json "$c"; fi' ERR

step_db() {
  if [ -f "$env_file" ]; then
    echo "reusing issue DB env: $env_file"
    return 0
  fi
  echo "creating issue DB: verify-db.sh create $n --migrate-from $worktree"
  bash "$here/verify-db.sh" create "$n" --migrate-from "$worktree"
}

step_seed_check() {
  local line
  line=$(bash "$here/verify-db.sh" has-preview-fixtures "$n" | tail -n 1) || return 1
  seed_needed=$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print("no" if d.get("fixtures") else "yes")' "$line") || return 1
  echo "has-preview-fixtures: $line"
}

preview_state() {  # prints absent | dead | the preview url
  python3 "$here/app-preview.py" status | python3 -c '
import json, sys
label = sys.argv[1]
for p in json.load(sys.stdin).get("previews", []):
    if p.get("name") == label:
        print(p.get("url", "") if p.get("alive") else "dead")
        break
else:
    print("absent")
' "$1"
}

ensure_preview() {  # ensure_preview <label> <checkout> <seed yes|no>: prints the preview url
  local label=$1 checkout=$2 do_seed=$3 state log
  log=$logdir/preview-$label.log
  state=$(preview_state "$label") || return 1
  if [ "$state" != absent ] && [ "$state" != dead ] && [ "$do_seed" != yes ]; then
    echo "reusing running preview $label at $state" >&2
    printf '%s\n' "$state"
    return 0
  fi
  if [ "$state" != absent ]; then
    echo "stopping preview $label before start (state=$state, seed=$do_seed)" >&2
    python3 "$here/app-preview.py" stop "$label" >>"$log" 2>&1 || return 1
  fi
  set -- start "$checkout" --backend --env "$env_file" --name "$label"
  [ "$do_seed" = yes ] && set -- "$@" --seed
  python3 "$here/app-preview.py" "$@" >>"$log" 2>&1 || return 1
  tail -n 1 "$log" | python3 -c '
import json, sys
d = json.loads(sys.stdin.read())
if not d.get("ok"):
    sys.exit(1)
if sys.argv[1] == "yes" and d.get("fixtures", {}).get("ok") is not True:
    print("seeded preview start did not confirm fixtures.ok:true", file=sys.stderr)
    sys.exit(1)
print(d["url"])
' "$do_seed"
}

run_scale_seed() {  # SEED_MODE=scale from the baseline backend, after --seed has returned
  local log=$logdir/scale-seed.log
  echo "scale seed (SEED_MODE=scale) from $baseline/apps/backend"
  (
    set -a
    . "$env_file"
    set +a
    case "${DATABASE_URL:-}" in
      *:5434/*) echo 'refusing scale seed: DATABASE_URL targets the development DB on 5434' >&2; exit 2 ;;
    esac
    cd "$baseline/apps/backend" || exit 2
    SEED_MODE=scale npx tsx src/seed/index.ts
  ) >>"$log" 2>&1
}

step_previews() {
  local do_seed=no
  if [ "$seed_needed" = yes ]; then
    do_seed=yes
    echo 'seeding: the baseline start runs the personas seed and the [preview] fixtures'
  else
    echo 'not seeding: the [preview] fixtures are already present'
  fi
  dev_url=$(ensure_preview "$n-develop" "$baseline" "$do_seed") || return 1
  echo "develop preview: $dev_url"
  if [ "$do_seed" = yes ] && [ "$scale" = yes ]; then
    run_scale_seed || return 1
  fi
  if [ "$do_seed" = yes ]; then seeded=true; fi
  branch_url=$(ensure_preview "$n-branch" "$worktree" no) || return 1
  echo "branch preview: $branch_url"
}

step_warmup() {
  local url href
  IFS=',' read -r -a warmup_targets <<< "$targets"
  for url in "$dev_url" "$branch_url"; do
    for href in "${warmup_targets[@]}"; do
      href=${href#"${href%%[! ]*}"}
      [ -n "$href" ] || continue
      echo "warm-up: curl $url$href"
      curl --max-time 120 -sS -o /dev/null "$url$href" || true
    done
  done
}

probe_once() {
  perl -e 'alarm 30; exec @ARGV' ego-browser nodejs -e 'console.log(1)'
}

step_probe() {
  if probe_once; then
    probe=ok
    return 0
  fi
  echo 'bridge probe failed; restarting Ego Lite once' >&2
  local pids pid i
  pids=$(ps -axo pid=,command= | awk '{
    pid = $1
    sub(/^[[:space:]]*[0-9]+[[:space:]]+/, "")
    if (index($0, "/Applications/ego lite.app/Contents/MacOS/ego lite") == 1) print pid
  }') || return 1
  while read -r pid; do
    [ -n "$pid" ] || continue
    kill -TERM "$pid" 2>/dev/null || true
  done <<< "$pids"
  open "/Applications/ego lite.app"
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    if probe_once; then
      probe=restarted
      return 0
    fi
    sleep 2
  done
  probe=failed
  return 1
}

host_busy() {
  local ancestor=$PPID ancestors=" $$ $PPID " parent pid pids
  while [ "$ancestor" -gt 1 ]; do
    parent=$(ps -o ppid= -p "$ancestor" | tr -d '[:space:]') || break
    case "$parent" in ''|*[!0-9]*|0) break ;; esac
    case "$ancestors" in *" $parent "*) break ;; esac
    ancestors+="$parent "
    ancestor=$parent
  done
  pids=$(pgrep -f 'vitest|test:integration|ego-browser nodejs|nav-perf\.sh' || true)
  while read -r pid; do
    [ -n "$pid" ] || continue
    case "$ancestors" in *" $pid "*) continue ;; esac
    return 0
  done <<< "$pids"
  return 1
}

step_perf() {
  if [ "$want_perf" = no ]; then
    perf_skipped='skipped: --no-perf'
    echo 'perf skipped (--no-perf)'
    return 0
  fi
  if host_busy; then
    perf_skipped='skipped: host busy'
    echo 'perf skipped: the host is busy (vitest, integration, ego-browser or another nav-perf)'
    return 0
  fi
  echo "nav-perf: develop=$dev_url branch=$branch_url out=$perf_out reset-db=$n"
  if bash "$here/nav-perf.sh" --base "develop=$dev_url" --base "branch=$branch_url" \
      --targets "$targets" --out "$perf_out" --reset-db "$n"; then
    perf_exit=0
  else
    perf_exit=$?
  fi
  perf_breach=$(grep '^breach:' "$logdir/perf.log" | tail -n 1 | sed 's/^breach: //' || true)
  perf_breach=${perf_breach#"${perf_breach%%[! ]*}"}
  return "$perf_exit"
}

step db step_db
step seed-check step_seed_check
step previews step_previews
step warmup step_warmup
step probe step_probe
step perf step_perf
emit_json 0
