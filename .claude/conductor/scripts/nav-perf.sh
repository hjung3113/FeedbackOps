#!/usr/bin/env bash
[ -n "${BASH_VERSION:-}" ] || exec bash "$0" "$@"  # zsh-invoked runs lost BASH_SOURCE (s61, s70)
# nav-perf.sh --base <label>=<url> [--base <label>=<url>] --targets <href,href,...> --out <file.json>
#             [--runs 3] [--start /home] [--personas mock-admin-1,mock-admin-2] [--reset-db <n>]
# Measures in-app navigation in the ego-browser runtime (nav-perf.mjs). Each base gets one warm-up pass, then the
# bases alternate for --runs measured passes, and the per-target medians are compared. Start the previews with
# app-preview.py (one host each) first. Writes JSON to --out (made absolute; its directory is created) and the
# ego-browser output to <out>.log; stdout is nav-perf-summary.py's plain-text table and breach verdict (not JSON;
# read --out for data). ego-browser scripts see no shell environment, so the options are prepended as `const NAV_CONFIG = …`.
# Every <base url><target> and <base url><start> is opened once with curl (--max-time 120, exit status ignored)
# before the browser runs, so a cold vite transform finishes outside the measurement. With --reset-db <n> the
# shared rate-limit bucket is cleared (verify-db.sh reset-rate-limits <n>, output on stderr) immediately before
# every attempt. The browser + summary step is retried once when the summary exits 1 (no result, recorded errors,
# or an inconclusive target); the first attempt's log is kept as <out>.attempt1.log, and the exit code is the
# last summary's.
# Run browser stages one at a time across a wave: nav-perf before the UX reviewer, never together.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bases=() targets='' out='' runs=3 start='/home' personas='' reset_db=''
while [ $# -gt 0 ]; do
  case "$1" in
    --base) bases+=("$2"); shift 2 ;;
    --targets) targets=$2; shift 2 ;;
    --out) out=$2; shift 2 ;;
    --runs) runs=$2; shift 2 ;;
    --start) start=$2; shift 2 ;;
    --personas) personas=$2; shift 2 ;;
    --reset-db) reset_db=$2; shift 2 ;;
    -h|--help) sed -n 3,16p "$0"; exit 0 ;;
    *) echo "nav-perf.sh: unknown argument $1" >&2; exit 2 ;;
  esac
done
[ ${#bases[@]} -gt 0 ] && [ -n "$targets" ] && [ -n "$out" ] || { echo "nav-perf.sh: --base, --targets and --out are required" >&2; exit 2; }
mkdir -p "$(dirname "$out")"
out="$(cd "$(dirname "$out")" && pwd)/$(basename "$out")"
config=$(python3 - "$targets" "$out" "$runs" "$start" "$personas" "${bases[@]}" <<'PY'
import json, sys
targets, out, runs, start, personas, *bases = sys.argv[1:]
pairs = []
for item in bases:
    label, _, url = item.partition('=')
    if not label or not url:
        sys.exit(f'nav-perf.sh: --base must be <label>=<url>, got {item}')
    pairs.append({'label': label, 'url': url.rstrip('/')})
print(json.dumps({'bases': pairs, 'targets': [t.strip() for t in targets.split(',') if t.strip()], 'out': out,
                  'runs': int(runs), 'start': start, 'personas': [p for p in personas.split(',') if p]}))
PY
)
log="$out.log"
[ ! -e "$out" ] || trash "$out"
# A cold vite's first module compile can outlast the page-evaluation timeout; open every page once before measuring.
IFS=',' read -r -a warmup <<< "$targets"
for base in "${bases[@]}"; do
  url=${base#*=}; url=${url%/}
  for href in "${warmup[@]}" "$start"; do
    href=${href#"${href%%[! ]*}"}
    [ -n "$href" ] || continue
    curl --max-time 120 -sS -o /dev/null "$url$href" || true
  done
done
rc=1
for attempt in 1 2; do
  [ -z "$reset_db" ] || bash "$here/verify-db.sh" reset-rate-limits "$reset_db" 1>&2
  if [ "$attempt" -eq 2 ]; then [ ! -e "$out" ] || trash "$out"; fi
  { printf 'const NAV_CONFIG = %s;\n' "$config"; cat "$here/nav-perf.mjs"; } | ego-browser nodejs >"$log" 2>&1 || true
  if python3 "$here/nav-perf-summary.py" "$out" "$log"; then rc=0; else rc=$?; fi
  if [ "$rc" -eq 0 ] || [ "$attempt" -eq 2 ]; then break; fi
  cp "$log" "$out.attempt1.log"
done
exit "$rc"
