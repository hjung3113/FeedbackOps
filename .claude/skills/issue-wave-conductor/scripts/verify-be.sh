#!/bin/zsh
# verify-be.sh <worktree> <issue> [module-filter...] — BE host checks: backend tsc, root typecheck, boundaries +
# fixture test, migration drift, packages/shared vitest when touched, then backend integration on the throwaway DB
# described by $WAVE_STATE/env.verify.<issue> (fops_app role). Filters narrow the integration run (touched modules).
: "${WAVE_STATE:?set WAVE_STATE}"; W=$1; N=$2; shift 2
L=$WAVE_STATE/vbe-$N; mkdir -p "$L"; export PATH=/opt/homebrew/opt/node@22/bin:$PATH; cd "$W" || exit 2
pnpm --filter @fops/backend exec tsc --noEmit > "$L/be-tsc.log" 2>&1; echo "be-tsc exit=$? errors=$(grep -c 'error TS' "$L/be-tsc.log")"
pnpm -s typecheck > "$L/typecheck.log" 2>&1; echo "typecheck exit=$?"
node scripts/check-boundaries.mjs > "$L/boundaries.log" 2>&1; echo "boundaries exit=$? $(tail -1 "$L/boundaries.log")"
node scripts/check-boundaries.test.mjs > "$L/boundaries-test.log" 2>&1; echo "boundaries-test exit=$?"
pnpm -s gate:db-migration-drift > "$L/drift.log" 2>&1; echo "drift exit=$?"
if { git diff --name-only origin/develop...HEAD; git status --short; } | grep -q "packages/shared"; then
  (cd packages/shared && npx vitest run > "$L/shared.log" 2>&1); echo "shared vitest exit=$? $(grep -E 'Tests ' "$L/shared.log" | tail -1)"; fi
FEEDBACKOPS_ENV_FILE=$WAVE_STATE/env.verify.$N pnpm --filter backend test:integration "$@" > "$L/integration.log" 2>&1; echo "integration exit=$?"
grep -E "Test Files|Tests " "$L/integration.log" | tail -2; grep -E "FAIL " "$L/integration.log" | sort -u | head -15
