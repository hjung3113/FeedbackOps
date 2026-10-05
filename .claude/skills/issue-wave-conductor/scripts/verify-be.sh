#!/bin/bash
# verify-be.sh <worktree> <issue> [module-filter...] — BE host checks: backend tsc, root typecheck, boundaries +
# fixture test, migration drift, packages/shared vitest when touched, then backend integration on the throwaway DB
# described by $WAVE_STATE/env.verify.<issue> (fops_app role). Filters narrow the integration run (touched modules).
: "${WAVE_STATE:?set WAVE_STATE}"; W=$1; N=$2; shift 2
L=$WAVE_STATE/vbe-$N; mkdir -p "$L"; export PATH=/opt/homebrew/opt/node@22/bin:$PATH; cd "$W" || exit 2
first_failure=0
check_names=(); check_codes=()
run_check() {
  local check_name=$1 check_log=$2 check_code; shift 2
  ("$@") > "$check_log" 2>&1
  check_code=$?
  check_names+=("$check_name"); check_codes+=("$check_code")
  if [ "$check_code" -ne 0 ] && [ "$first_failure" -eq 0 ]; then first_failure=$check_code; fi
}
run_vitest() { (cd "$1" && npx vitest run); }
print_summary() {
  local i
  printf '%-24s %s\n' 'Check' 'Exit'
  for ((i=0; i<${#check_names[@]}; i++)); do
    printf '%-24s %s\n' "${check_names[$i]}" "${check_codes[$i]}"
  done
}
run_check be-tsc "$L/be-tsc.log" pnpm --filter @fops/backend exec tsc --noEmit
run_check typecheck "$L/typecheck.log" pnpm -s typecheck
run_check boundaries "$L/boundaries.log" node scripts/check-boundaries.mjs
run_check boundaries-test "$L/boundaries-test.log" node scripts/check-boundaries.test.mjs
run_check drift "$L/drift.log" pnpm -s gate:db-migration-drift
if { git diff --name-only origin/develop...HEAD; git status --short; } | grep -q "packages/shared"; then
  run_check shared-vitest "$L/shared.log" run_vitest packages/shared; fi
run_check integration "$L/integration.log" env FEEDBACKOPS_ENV_FILE="$WAVE_STATE/env.verify.$N" pnpm --filter backend test:integration "$@"
print_summary > "$L/summary.txt"
echo "be-tsc errors=$(grep -c 'error TS' "$L/be-tsc.log")" >> "$L/summary.txt"
tail -1 "$L/boundaries.log" >> "$L/summary.txt"
if [ -f "$L/shared.log" ]; then grep -E 'Tests ' "$L/shared.log" | tail -1 >> "$L/summary.txt"; fi
grep -E "Test Files|Tests " "$L/integration.log" | tail -2 >> "$L/summary.txt"
grep -E "FAIL " "$L/integration.log" | sort -u | head -15 >> "$L/summary.txt"
cat "$L/summary.txt"
exit "$first_failure"
