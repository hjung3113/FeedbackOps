---
name: refactor-wave-pipeline
description: Run a DAG wave from .review/refactor-dag-final.md (or any GitHub-issue-tracked refactor DAG) through a fixed multi-model pipeline — design, implementation, per-commit review, wave-end PR, PR review — using Orca orchestration. Use when the user says "wave 0", "다음 wave", "DAG 실행", or names this pipeline by name.
---

# Refactor wave pipeline

Executes one wave of the FeedbackOps refactor DAG (`.review/refactor-dag-final.md`,
issues `hjung3113/FeedbackOps#452`-`#497`) end to end. One wave = a set of
GitHub issues with no file overlap (per the DAG) that land in **one PR**.

Set 2026-09-23, user decision (this session). This is a **session-specific model
routing override** — it does NOT replace `~/Desktop/2026/feedbackops-workflow`
toolkit's `model-alloc.json` defaults (see `[[project_workflow_toolkit]]`
memory). Re-confirm with the user if reused in a session that didn't set it.

## Model routing (fixed for this pipeline)

| Stage | Model | Runtime | Effort |
|---|---|---|---|
| Design (per issue) | grok-4.7 | `grok` CLI | high |
| Implementation (per issue) | glm-5.3-flash | `omp` CLI | high |
| Mid-review (per commit) | Claude Sonnet 5 | this session (conductor), no subagent | high |
| PR review (wave end, body+diff only) | gpt-6-astra | `codex` CLI | medium |
| Orchestration/conductor | this session | — | — |

Conductor (this session) is READ-ONLY reviewer + git operator (push/PR/merge
gating) — it does not write product code itself; that's a role-bleed per
`toolkit/docs/agents/conductor-persona.md`. Design and implementation are
always dispatched.

## Per-issue loop (repeat for every issue in the wave)

Default: **one shared worktree per wave** (not per issue) on a branch named
`refactor/wave<N>`, base = `main`. Issues in a wave are file-disjoint per the
DAG, so sequential commits in one worktree are safe and avoid merge overhead.
Do not parallelize commits into the *same* branch from multiple terminals —
concurrent `git commit` in one working tree races.

### Parallelizing independent issues

When two or more remaining issues have no dependency on each other (check
each issue's "Depends on" line and any coordinator scope-confirmation
comment) and the user asks for parallelism, run them in **separate
worktrees**, each with its own grok + omp terminal pair, at the same time:

```text
ORCA worktree create --repo id:<repoId> --name refactor-<issue> --no-parent --json
ORCA terminal create --worktree "id:<repoId>::<path>" --title design-grok --command "grok --model grok-4.7 --reasoning-effort high" --json
ORCA terminal create --worktree "id:<repoId>::<path>" --title impl-omp --command "omp --model glm-5.3-flash --thinking high" --json
```

One `worktree create` + two `terminal create` calls per issue, dispatched
back-to-back in the same turn — the terminal `send`s for each issue's design
step can then go out in parallel too, since they're different processes in
different working directories. Do this only for issues that are genuinely
independent; keep dependent issues (e.g. one that imports a symbol another
issue is about to move) sequential in a single worktree, in dependency order.

**Merge before the wave PR.** Each parallel worktree ends with its own
commit(s) on its own branch (`hjung3113/refactor-<issue>`). Before push/PR,
merge or cherry-pick each into the wave's integration branch in the main
worktree:

```text
git -C <wave-worktree-path> cherry-pick <sha-from-parallel-branch>
```

Verify (typecheck/tests) again after each merge — a clean merge of two
file-disjoint diffs is usually a no-op conflict-wise, but re-run the gate
before trusting it.

1. **Design** — dispatch `grok` with the issue body (title, target files,
   "Depends on" line). Ask for: exact files touched, the split/move plan,
   and any risk callouts. grok/omp do not support `worker-start`'s
   `--model`/`--effort` launch preference (confirmed session42) — use the
   low-level topology:
   ```text
   ORCA terminal create --worktree id:<repoId>::<wavePath> --title "design-<issue>" \
     --command "grok --model grok-4.7 --reasoning-effort high" --json
   ORCA terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json
   ORCA terminal send --terminal <handle> --text "<issue body + design ask>" --enter --json
   ```
   **Instruct the design prompt itself to end by writing its output to
   `.review/design-<issue>.md`** — grok's TUI folds/collapses long responses
   in scrollback, so `terminal read` cannot reliably recover a full design
   after the fact (observed session43, issue #456). Read the file, not the
   terminal, for the actual design content; `terminal read` is only for
   liveness/progress checks. Keep the terminal open and reuse it for the next
   issue's design (same model, avoids relaunch cost).
2. **Implementation** — same low-level pattern with
   `omp --model glm-5.3-flash --thinking high`, prompt = design output + explicit
   instruction: **implement, then `git add` + `git commit`** with message
   `refactor(#<issue>): <short title>` (issue number in the subject line is the
   only linkage GitHub issues give us — no native sub-issue/DAG link). Omp
   cannot verify (`[[feedback_workers_cannot_verify]]`) — no test/typecheck
   claims from it are trusted.
3. **Mid-review** — conductor (this session) runs `git show <sha>` /
   `git diff` on the fresh commit directly (no subagent — Sonnet 5 high is
   this session). Check: matches the design's file list, matches the issue's
   scope (no drive-by edits), no placeholder/TODO, doc-sync if the issue
   touches docs (`[[feedback_doc_sync]]`). Pass → next issue. Fail → send the
   specific defect back to the same omp terminal for a fix-up commit
   (`refactor(#<issue>): fixup <what>`), re-review; do not `git commit --amend`
   across a review boundary.
4. Update the GitHub issue: comment with the commit SHA, do not close yet
   (closes at wave-end PR merge, per `[[project_feedbackops_slices]]` —
   issues need manual close).

## Wave end

1. Run the target's real gates before pushing — mid-review is a read/diff
   check, not a substitute for `[[feedback_typecheck_is_separate_gate]]` /
   `[[feedback_fe_verify_gates]]`. Backend: `verify.sh` equivalent /
   `target-verify.sh`. Frontend: `scripts/gates/` (3 required groups).
2. `git push -u origin refactor/wave<N>`, open PR **against `develop`**
   (`[[project_feedbackops_slices]]`, `[[project_automerge_policy]]` — release
   is PR-only), body = the wave's issue list with `Closes #N` for each so
   merge auto-closes them.
3. **PR review** — dispatch `codex --model gpt-6-astra -c model_reasoning_effort="medium"`
   with **only the PR body and diff** (`gh pr diff <n>`), not repo access —
   this is a scoped diff review, not another implementation pass. Post its
   findings as a PR comment or relay to the user; conductor decides whether a
   finding blocks merge.
4. Auto-merge only under the session-scoped authorization in
   `[[project_automerge_policy]]` — re-ask if not already granted this
   session.

## Orca mechanics recap

- `ORCA orchestration run-create` once per wave (or once per session, reused
  across waves) to get a bound Run for `check --wait` bookkeeping of anything
  dispatched via `worker-start` (codex/claude workers, if used for review
  fan-out). grok/omp go through low-level `dispatch --inject`, which is
  unsupervised — track their completion by reading the terminal, not by
  `check --wait`.
- One worktree, one branch, reused terminals for the whole wave — do not spin
  a new worktree per issue; that's for full-handoff work, not a supervised
  wave.
- `[[feedback_codex_exec_backgrounding]]`, `[[feedback_orca_dispatch_model_versions]]`
  (grok is 4.7, not 4.6), `[[feedback_agent_workflow_dispatch_mechanics]]` apply
  if this pipeline is later run through `agent-workflow.sh` instead of raw
  Orca CLI.

## Source documents

- `.review/HANDOFF-2026-09-22-session42.md` — how the 42 issues were derived.
- `.review/refactor-dag-final.md` — the DAG, wave membership, dependencies.
- Issue depends-on edges are text (`Depends on #N`) in each issue body — no
  native GitHub DAG; read the body before dispatching a dependent issue.
