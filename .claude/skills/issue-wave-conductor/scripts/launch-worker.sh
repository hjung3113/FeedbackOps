#!/bin/zsh
# launch-worker.sh <issue> <slug> [be] — worktree from origin/develop → branch feature/<issue>-<slug>, copy the brief
# ($WAVE_BRIEFS/<issue>-task.md) + rules templates into .review/, wait for the setup install to finish, close the setup
# shells, generate the route tree, then delegate launch and worker state to the shared worker-ops script.
# WORKER_ROLE defaults to impl; use impl-fallback for the routing table's fallback.
# Optional WORKER_MODEL / WORKER_EFFORT override the shared routing.tsv for this session.
# Needs: WAVE_STATE, WAVE_BRIEFS, FOPS_MAIN (main checkout path).
: "${WAVE_STATE:?}"; : "${WAVE_BRIEFS:?}"; : "${FOPS_MAIN:?}"; set -u
N=$1; SLUG=$2; BE=${3:-}; SKILL=$FOPS_MAIN/.claude/skills/issue-wave-conductor
SHARED_LAUNCH=$HOME/.claude/skills/orca-dispatch-recipes/scripts/worker-launch.sh
[ -f "$SHARED_LAUNCH" ] || { echo "Missing shared launcher: $SHARED_LAUNCH (install orca-dispatch-recipes worker-ops scripts)" >&2; exit 2; }
W=$HOME/orca/workspaces/FeedbackOps/$N-$SLUG; export PATH=/opt/homebrew/opt/node@22/bin:$PATH
orca worktree create --repo path:"$FOPS_MAIN" --name "$N-$SLUG" --base-branch origin/develop --issue "$N" --setup run --json >/dev/null 2>&1 || { echo "worktree create failed"; exit 1; }
cd "$W" || exit 1; git branch -m "feature/$N-$SLUG"; mkdir -p .review
cp "$SKILL/templates/impl-rules.md" .review/00-IMPL-RULES.md
cp "$SKILL/templates/review-rules.md" .review/00-REVIEW-RULES.md
[ -n "$BE" ] && cp "$SKILL/templates/impl-rules-be.md" .review/00-IMPL-RULES-BE.md
RULES=".review/00-IMPL-RULES.md"; [ -n "$BE" ] && RULES="$RULES and .review/00-IMPL-RULES-BE.md"
# The shared launcher reads only the task; include the copied rules without moving its final sentinel.
{ printf 'Read %s first. Node 22 is at /opt/homebrew/opt/node@22/bin.\n\n' "$RULES"; cat "$WAVE_BRIEFS/$N-task.md"; } > ".review/W-$N-TASK.md"
# .pnpm appears early in an install; .modules.yaml is written when it finishes (closing the setup shell earlier kills pnpm).
for i in {1..120}; do [ -f node_modules/.modules.yaml ] && [ -d apps/frontend/node_modules ] && break; sleep 5; done
[ -f node_modules/.modules.yaml ] || { echo "node_modules incomplete: pnpm install --frozen-lockfile (Node 22)"; exit 1; }
for h in $(orca terminal list --worktree path:"$W" --json 2>/dev/null | grep -o 'term_[a-z0-9-]*' | sort -u); do orca terminal close --terminal "$h" >/dev/null 2>&1; done
# A fresh worktree has no gitignored routeTree.gen.ts; without it typecheck/route tests fail with setup noise.
pnpm --filter @fops/frontend build > .review/route-tree-build.log 2>&1 || { echo "frontend build failed (see .review/route-tree-build.log)"; exit 1; }
args=(--role "${WORKER_ROLE:-impl}" --cwd "$W" --task "$W/.review/W-$N-TASK.md"
  --report "$W/.review/W-$N-REPORT.md" --sentinel "<!-- W-$N-DONE -->" --name "W-$N"
  --state-dir "$WAVE_STATE")
[ -n "${WORKER_MODEL:-}" ] && args+=(--model "$WORKER_MODEL")
[ -n "${WORKER_EFFORT:-}" ] && args+=(--effort "$WORKER_EFFORT")
bash "$SHARED_LAUNCH" "${args[@]}"
