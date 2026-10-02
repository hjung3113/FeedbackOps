#!/bin/zsh
# launch-worker.sh <issue> <slug> [be] — worktree from origin/develop → branch feature/<issue>-<slug>, copy the brief
# ($WAVE_BRIEFS/<issue>-task.md) + rules templates into .review/, wait for the setup install to finish, close the setup
# shells, generate the route tree, launch the implementation worker, register the report sentinel in
# $WAVE_STATE/watch-spec.txt.
# WORKER selects the runtime (the session's routing decides; memory `project_model_routing_tiers`):
#   exec (default) — `codex exec` with $WORKER_MODEL (default gpt-6-luna) at max effort, in the background; no Orca terminal.
#   omp            — omp glm-5.3-flash thinking max in an Orca terminal (prompt sent with `terminal send`).
# Needs: WAVE_STATE, WAVE_BRIEFS, FOPS_MAIN (main checkout path).
: "${WAVE_STATE:?}"; : "${WAVE_BRIEFS:?}"; : "${FOPS_MAIN:?}"; set -u
N=$1; SLUG=$2; BE=${3:-}; SKILL=$FOPS_MAIN/.claude/skills/issue-wave-conductor
WORKER=${WORKER:-exec}; WORKER_MODEL=${WORKER_MODEL:-gpt-6-luna}
W=$HOME/orca/workspaces/FeedbackOps/$N-$SLUG; export PATH=/opt/homebrew/opt/node@22/bin:$PATH
orca worktree create --repo path:"$FOPS_MAIN" --name "$N-$SLUG" --base-branch origin/develop --issue "$N" --setup run --json >/dev/null 2>&1 || { echo "worktree create failed"; exit 1; }
cd "$W" || exit 1; git branch -m "feature/$N-$SLUG"; mkdir -p .review
cp "$SKILL/templates/impl-rules.md" .review/00-IMPL-RULES.md
cp "$SKILL/templates/review-rules.md" .review/00-REVIEW-RULES.md
[ -n "$BE" ] && cp "$SKILL/templates/impl-rules-be.md" .review/00-IMPL-RULES-BE.md
cp "$WAVE_BRIEFS/$N-task.md" ".review/W-$N-TASK.md"
# .pnpm appears early in an install; .modules.yaml is written when it finishes (closing the setup shell earlier kills pnpm).
for i in {1..120}; do [ -f node_modules/.modules.yaml ] && [ -d apps/frontend/node_modules ] && break; sleep 5; done
[ -f node_modules/.modules.yaml ] || { echo "node_modules incomplete: pnpm install --frozen-lockfile (Node 22)"; exit 1; }
for h in $(orca terminal list --worktree path:"$W" --json 2>/dev/null | grep -o 'term_[a-z0-9-]*' | sort -u); do orca terminal close --terminal "$h" >/dev/null 2>&1; done
# A fresh worktree has no gitignored routeTree.gen.ts; without it typecheck/route tests fail with setup noise.
pnpm --filter @fops/frontend build > .review/route-tree-build.log 2>&1 || { echo "frontend build failed (see .review/route-tree-build.log)"; exit 1; }
RULES=".review/00-IMPL-RULES.md"; [ -n "$BE" ] && RULES="$RULES and .review/00-IMPL-RULES-BE.md"
# The sentinel is named indirectly: omp's input box drops a typed <!-- … --> comment.
PROMPT="You are the implementation worker for issue #$N, not the conductor: edit files directly, do not dispatch agents, never run git write commands. Read .review/W-$N-TASK.md and $RULES in this worktree and follow them (Node 22 is at /opt/homebrew/opt/node@22/bin). Leave changes uncommitted; write .review/W-$N-REPORT.md (files changed, tests added, checks you ran with results, decisions, anything unverified); its last line must be the HTML-comment sentinel given at the end of the task file."
echo "$N|$W/.review/W-$N-REPORT.md|<!-- W-$N-DONE -->" >> "$WAVE_STATE/watch-spec.txt"
if [ "$WORKER" = omp ]; then
  h=""; for try in 1 2; do h=$(orca terminal create --worktree path:"$W" --title "W-$N" --command "omp --model glm-5.3-flash --thinking max" --json | grep -o 'term_[a-z0-9-]*' | head -1); [ -n "$h" ] && break; sleep 3; done
  [ -n "$h" ] || { echo "terminal create failed"; exit 1; }
  echo "$N $h $N-$SLUG" >> "$WAVE_STATE/handles.txt"
  orca terminal wait --terminal "$h" --for tui-idle --timeout-ms 90000 >/dev/null 2>&1
  orca terminal send --terminal "$h" --text "$PROMPT" --enter --wait-submit 20 2>&1 | tail -1
  # omp stalls silently on its usage limit; the default (stream) read shows only the splash, so read the rendered screen.
  sleep 30; orca terminal read --terminal "$h" --screen 2>/dev/null | grep -E "Usage limit|429" && echo "omp is over its usage limit — ask the user (fallback: WORKER=exec)"
else
  (codex exec -m "$WORKER_MODEL" -c model_reasoning_effort=max -s workspace-write "$PROMPT" < /dev/null > ".review/impl$N.log" 2>&1 &)
  echo "$N launched: codex exec $WORKER_MODEL max (log .review/impl$N.log)"
fi
