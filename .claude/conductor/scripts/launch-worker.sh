#!/bin/zsh
# launch-worker.sh <issue> <slug> [be] — worktree from origin/develop → branch feature/<issue>-<slug>, copy the brief
# ($WAVE_BRIEFS/<issue>-task.md) + rules templates into .review/, wait for the setup install to finish, close the setup
# shells, generate the route tree, then delegate launch and worker state to the shared worker-ops script.
# WORKER_ROLE defaults to impl; impl-mid, impl-complex and impl-fallback select the routing table rows of those names.
# Optional WORKER_MODEL / WORKER_EFFORT override the shared routing.tsv for this session.
# Optional PRE_ADD='<pnpm filter> <pkg@exact> [...]' installs dependencies before the worker starts (workers have no
# network; s70). pnpm may reformat package.json arrays: check the diff before committing.
# With `be` it also gives the worker its own throwaway issue database: verify-db.sh create <issue> (the shared
# container must be up: verify-db.sh up), copied to <worktree>/.review/env.verify, and the task names the exact
# integration command. An existing $WAVE_STATE/env.verify.<issue> is reused.
# Needs: WAVE_STATE, WAVE_BRIEFS, FOPS_MAIN (main checkout path).
: "${WAVE_STATE:?}"; : "${WAVE_BRIEFS:?}"; : "${FOPS_MAIN:?}"; set -u
N=$1; SLUG=$2; BE=${3:-}; CONDUCTOR=$FOPS_MAIN/.claude/conductor
# The script cds into the new worktree, so a relative brief dir would silently resolve there (Slice 46: three
# workers launched with an empty task). Resolve the dirs first and refuse a missing brief.
WAVE_BRIEFS=${WAVE_BRIEFS:A}; WAVE_STATE=${WAVE_STATE:A}
[ -f "$WAVE_BRIEFS/$N-task.md" ] || { echo "Missing brief: $WAVE_BRIEFS/$N-task.md" >&2; exit 2; }
SHARED_LAUNCH=$HOME/.claude/skills/orca-dispatch-recipes/scripts/worker-launch.sh
[ -f "$SHARED_LAUNCH" ] || { echo "Missing shared launcher: $SHARED_LAUNCH (install orca-dispatch-recipes worker-ops scripts)" >&2; exit 2; }
W=$HOME/orca/workspaces/FeedbackOps/$N-$SLUG; export PATH=/opt/homebrew/opt/node@22/bin:$PATH
orca worktree create --repo path:"$FOPS_MAIN" --name "$N-$SLUG" --base-branch origin/develop --issue "$N" --setup run --json >/dev/null 2>&1 || { echo "worktree create failed"; exit 1; }
cd "$W" || exit 1; git branch -m "feature/$N-$SLUG"; mkdir -p .review
cp "$CONDUCTOR/templates/impl-rules.md" .review/00-IMPL-RULES.md
cp "$CONDUCTOR/templates/review-rules.md" .review/00-REVIEW-RULES.md
cp "$CONDUCTOR/templates/review-rules-perf.md" .review/00-REVIEW-RULES-PERF.md
[ -n "$BE" ] && cp "$CONDUCTOR/templates/impl-rules-be.md" .review/00-IMPL-RULES-BE.md
RULES=".review/00-IMPL-RULES.md"; [ -n "$BE" ] && RULES="$RULES and .review/00-IMPL-RULES-BE.md"
# .pnpm appears early in an install; .modules.yaml is written when it finishes (closing the setup shell earlier kills pnpm).
for i in {1..120}; do [ -f node_modules/.modules.yaml ] && [ -d apps/frontend/node_modules ] && break; sleep 5; done
[ -f node_modules/.modules.yaml ] || { echo "node_modules incomplete: pnpm install --frozen-lockfile (Node 22)"; exit 1; }
for h in $(orca terminal list --worktree path:"$W" --json 2>/dev/null | grep -o 'term_[a-z0-9-]*' | sort -u); do orca terminal close --terminal "$h" >/dev/null 2>&1; done
if [ -n "${PRE_ADD:-}" ]; then
  pa=(${=PRE_ADD})
  pnpm --filter "${pa[1]}" add --save-exact --config.confirmModulesPurge=false "${(@)pa[2,-1]}" < /dev/null > .review/pre-add.log 2>&1 \
    || { echo "PRE_ADD failed (see $W/.review/pre-add.log)"; exit 1; }
fi
# A fresh worktree has no gitignored routeTree.gen.ts; without it typecheck/route tests fail with setup noise.
pnpm --filter @fops/frontend build > .review/route-tree-build.log 2>&1 || { echo "frontend build failed (see .review/route-tree-build.log)"; exit 1; }
DBLINE=''
if [ -n "$BE" ]; then
  if [ ! -f "$WAVE_STATE/env.verify.$N" ]; then
    bash "$CONDUCTOR/scripts/verify-db.sh" create "$N" --migrate-from "$W" > .review/verify-db-create.log 2>&1 \
      || { echo "issue DB create failed (see $W/.review/verify-db-create.log; is verify-db.sh up running?)"; exit 1; }
  fi
  cp "$WAVE_STATE/env.verify.$N" .review/env.verify
  # pnpm --filter runs the script from apps/backend, so the env path must be absolute.
  DBLINE=$(printf 'Your own throwaway database (port 5439, never 5434): run only the integration files you added or touched, from the repo root, with\n`FEEDBACKOPS_ENV_FILE=%s pnpm --filter backend test:integration <paths relative to apps/backend>`.\n' "$W/.review/env.verify")
fi
# The shared launcher reads only the task; include the copied rules without moving its final sentinel.
{ printf 'Read %s first. Node 22 is at /opt/homebrew/opt/node@22/bin.\n' "$RULES"; [ -n "$DBLINE" ] && printf '%s\n' "$DBLINE"; printf '\n'; cat "$WAVE_BRIEFS/$N-task.md"; } > ".review/W-$N-TASK.md"
args=(--role "${WORKER_ROLE:-impl}" --cwd "$W" --task "$W/.review/W-$N-TASK.md"
  --report "$W/.review/W-$N-REPORT.md" --sentinel "<!-- W-$N-DONE -->" --name "W-$N"
  --state-dir "$WAVE_STATE")
[ -n "${WORKER_MODEL:-}" ] && args+=(--model "$WORKER_MODEL")
[ -n "${WORKER_EFFORT:-}" ] && args+=(--effort "$WORKER_EFFORT")
bash "$SHARED_LAUNCH" "${args[@]}"
