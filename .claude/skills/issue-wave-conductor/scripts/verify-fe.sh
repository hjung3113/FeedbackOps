#!/bin/bash
# verify-fe.sh <worktree> — FE host checks (Node 22): full vitest (+packages/ui if touched), FE typecheck gate, root typecheck,
# boundaries + fixture test, design-system lint cap, backend tsc. Logs in $WAVE_STATE/verify-<basename>/. Prints a summary.
: "${WAVE_STATE:?set WAVE_STATE}"; wt=$1; log=$WAVE_STATE/verify-$(basename "$wt"); mkdir -p "$log"
export PATH=/opt/homebrew/opt/node@22/bin:$PATH; cd "$wt" || exit 2
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
run_check generate-routes "$log/routes.log" node scripts/generate-routes.mjs
run_check vitest "$log/vitest.log" run_vitest apps/frontend
if { git diff --name-only origin/develop...HEAD; git status --porcelain; } | grep -q "packages/ui"; then
  run_check ui-vitest "$log/ui-vitest.log" run_vitest packages/ui; fi
run_check fe-typecheck "$log/fe-typecheck.log" pnpm gate:fe-typecheck
# Root typecheck also builds packages/ui with its tests (gate:fe-typecheck covers only the frontend; #661).
run_check root-typecheck "$log/root-typecheck.log" pnpm -s typecheck
run_check boundaries "$log/boundaries.log" node scripts/check-boundaries.mjs
run_check design-lint "$log/design-lint.log" pnpm -s lint:design
run_check boundaries-test "$log/boundaries-test.log" node scripts/check-boundaries.test.mjs
run_check be-tsc "$log/be-tsc.log" pnpm --filter @fops/backend exec tsc --noEmit
print_summary > "$log/summary.txt"
grep -E "Test Files|Tests " "$log/vitest.log" | tail -2 >> "$log/summary.txt"
grep -E "FAIL " "$log/vitest.log" | sort -u | head -5 >> "$log/summary.txt"
echo "be-tsc errors=$(grep -c 'error TS' "$log/be-tsc.log")" >> "$log/summary.txt"
cat "$log/summary.txt"
exit "$first_failure"
