#!/bin/bash
# verify-fe.sh <worktree> — FE host checks (Node 22): full vitest (+packages/ui if touched), FE typecheck gate,
# boundaries + fixture test, backend tsc. Logs in $WAVE_STATE/verify-<basename>/. Prints a summary.
: "${WAVE_STATE:?set WAVE_STATE}"; wt=$1; log=$WAVE_STATE/verify-$(basename "$wt"); mkdir -p "$log"
export PATH=/opt/homebrew/opt/node@22/bin:$PATH; cd "$wt" || exit 2
node scripts/generate-routes.mjs >/dev/null 2>&1
(cd apps/frontend && npx vitest run > "$log/vitest.log" 2>&1); echo "vitest exit=$?" > "$log/summary.txt"
grep -E "Test Files|Tests " "$log/vitest.log" | tail -2 >> "$log/summary.txt"
grep -E "FAIL " "$log/vitest.log" | sort -u | head -5 >> "$log/summary.txt"
if { git diff --name-only origin/develop...HEAD; git status --porcelain; } | grep -q "packages/ui"; then
  (cd packages/ui && npx vitest run > "$log/ui-vitest.log" 2>&1); echo "ui vitest exit=$?" >> "$log/summary.txt"; fi
pnpm gate:fe-typecheck > "$log/fe-typecheck.log" 2>&1; echo "fe-typecheck exit=$?" >> "$log/summary.txt"
node scripts/check-boundaries.mjs > "$log/boundaries.log" 2>&1; echo "boundaries exit=$?" >> "$log/summary.txt"
node scripts/check-boundaries.test.mjs > "$log/boundaries-test.log" 2>&1; echo "boundaries-test exit=$?" >> "$log/summary.txt"
pnpm --filter @fops/backend exec tsc --noEmit > "$log/be-tsc.log" 2>&1; echo "be-tsc exit=$? errors=$(grep -c 'error TS' "$log/be-tsc.log")" >> "$log/summary.txt"
cat "$log/summary.txt"
