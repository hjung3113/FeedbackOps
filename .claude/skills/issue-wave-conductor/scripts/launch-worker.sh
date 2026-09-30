#!/bin/zsh
# launch-worker.sh <issue> <slug> [be] — worktree from origin/develop → branch feature/<issue>-<slug>, copy the brief
# ($WAVE_BRIEFS/<issue>-task.md) + rules templates into .review/, close setup shells once node_modules exists, launch a
# luna max codex worker, create + inject the task, register the report sentinel in $WAVE_STATE/watch-spec.txt.
# Needs: WAVE_STATE (with run.txt containing RUN=<orca run id>), WAVE_BRIEFS, FOPS_MAIN (main checkout path).
: "${WAVE_STATE:?}"; : "${WAVE_BRIEFS:?}"; : "${FOPS_MAIN:?}"; set -u
N=$1; SLUG=$2; BE=${3:-}; SKILL=$FOPS_MAIN/.claude/skills/issue-wave-conductor
W=$HOME/orca/workspaces/FeedbackOps/$N-$SLUG; source "$WAVE_STATE/run.txt"
orca worktree create --repo path:"$FOPS_MAIN" --name "$N-$SLUG" --base-branch origin/develop --issue "$N" --setup run --json >/dev/null 2>&1 || { echo "worktree create failed"; exit 1; }
cd "$W" || exit 1; git branch -m "feature/$N-$SLUG"; mkdir -p .review
cp "$SKILL/templates/impl-rules.md" .review/00-IMPL-RULES.md
[ -n "$BE" ] && cp "$SKILL/templates/impl-rules-be.md" .review/00-IMPL-RULES-BE.md
cp "$WAVE_BRIEFS/$N-task.md" ".review/W-$N-TASK.md"
for i in {1..60}; do [ -d node_modules/.pnpm ] && break; sleep 5; done
[ -d node_modules/.pnpm ] || { echo "node_modules missing: pnpm install --frozen-lockfile (Node 22)"; exit 1; }
for h in $(orca terminal list --worktree path:"$W" --json 2>/dev/null | grep -o 'term_[a-z0-9-]*' | sort -u); do orca terminal close --terminal "$h" >/dev/null 2>&1; done
h=""; for try in 1 2; do h=$(orca terminal create --worktree path:"$W" --title "W-$N" --command "codex --model gpt-6-luna -c model_reasoning_effort=max -s workspace-write -a never" --json | grep -o 'term_[a-z0-9-]*' | head -1); [ -n "$h" ] && break; sleep 3; done
[ -n "$h" ] || { echo "terminal create failed"; exit 1; }
echo "$N $h $N-$SLUG" >> "$WAVE_STATE/handles.txt"
orca terminal wait --terminal "$h" --for tui-idle --timeout-ms 90000 >/dev/null 2>&1
RULES=".review/00-IMPL-RULES.md"; [ -n "$BE" ] && RULES="$RULES and .review/00-IMPL-RULES-BE.md"
T=$(orca orchestration task-create --run "$RUN" --spec "You are the implementation worker for issue #$N, not the conductor: edit files directly, do not dispatch agents. Read .review/W-$N-TASK.md and $RULES in this worktree and follow them. Leave changes uncommitted; write .review/W-$N-REPORT.md (files changed, tests added, checks you ran with results, decisions, anything unverified) with last line <!-- W-$N-DONE -->." --json | python3 -c "import json,sys;print(json.load(sys.stdin)['result']['task']['id'])")
orca orchestration dispatch --task "$T" --to "$h" --run "$RUN" --inject --json 2>&1 | grep -o '"ok": *[a-z]*' | head -1
echo "$N|$W/.review/W-$N-REPORT.md|<!-- W-$N-DONE -->" >> "$WAVE_STATE/watch-spec.txt"
sleep 20; echo "$N working=$(orca terminal read --terminal "$h" | grep -c Working)"
