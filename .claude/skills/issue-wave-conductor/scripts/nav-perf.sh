#!/usr/bin/env bash
# nav-perf.sh --base <label>=<url> [--base <label>=<url>] --targets <href,href,...> --out <file.json>
#             [--runs 3] [--start /home] [--persona mock-admin-1]
# Measures in-app navigation in the ego-browser runtime (nav-perf.mjs). Each base gets one warm-up pass, then the
# bases alternate for --runs measured passes, and the per-target medians are compared. Start the previews with
# app-preview.py (one host each) first. Writes JSON to --out (made absolute; its directory is created) and prints one
# summary line. ego-browser scripts see no shell environment, so the options are prepended as `const NAV_CONFIG = …`.
# Run browser stages one at a time across a wave: nav-perf before the UX reviewer, never together.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bases=() targets='' out='' runs=3 start='/home' persona='mock-admin-1'
while [ $# -gt 0 ]; do
  case "$1" in
    --base) bases+=("$2"); shift 2 ;;
    --targets) targets=$2; shift 2 ;;
    --out) out=$2; shift 2 ;;
    --runs) runs=$2; shift 2 ;;
    --start) start=$2; shift 2 ;;
    --persona) persona=$2; shift 2 ;;
    -h|--help) sed -n 2,8p "$0"; exit 0 ;;
    *) echo "nav-perf.sh: unknown argument $1" >&2; exit 2 ;;
  esac
done
[ ${#bases[@]} -gt 0 ] && [ -n "$targets" ] && [ -n "$out" ] || { echo "nav-perf.sh: --base, --targets and --out are required" >&2; exit 2; }
mkdir -p "$(dirname "$out")"
out="$(cd "$(dirname "$out")" && pwd)/$(basename "$out")"
config=$(python3 - "$targets" "$out" "$runs" "$start" "$persona" "${bases[@]}" <<'PY'
import json, sys
targets, out, runs, start, persona, *bases = sys.argv[1:]
pairs = []
for item in bases:
    label, _, url = item.partition('=')
    if not label or not url:
        sys.exit(f'nav-perf.sh: --base must be <label>=<url>, got {item}')
    pairs.append({'label': label, 'url': url.rstrip('/')})
print(json.dumps({'bases': pairs, 'targets': [t.strip() for t in targets.split(',') if t.strip()], 'out': out,
                  'runs': int(runs), 'start': start, 'persona': persona}))
PY
)
{ printf 'const NAV_CONFIG = %s;\n' "$config"; cat "$here/nav-perf.mjs"; } | ego-browser nodejs
