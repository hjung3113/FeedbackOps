---
name: refactor-wave-pipeline
description: Run a DAG wave from .review/refactor-dag-final.md (or any GitHub-issue-tracked refactor DAG) through a fixed multi-model pipeline — design, implementation, per-commit review, wave-end PR, PR review — using Orca orchestration. Use when the user says "wave 0", "다음 wave", "DAG 실행", or names this pipeline by name.
---

# Refactor wave pipeline

Executes one wave of the FeedbackOps refactor DAG (`.review/refactor-dag-final.md`,
issues `hjung3113/FeedbackOps#452`-`#497`) end to end. One wave = a set of
GitHub issues with no file overlap (per the DAG) that land in **one PR**.

Set 2026-09-23, user decision (this session). Revised same day (second
decision, after wave2/wave3) — design/implementation/mid-review/PR-review
models all changed; see table below. This is a **session-specific model
routing override** — it does NOT replace `~/Desktop/2026/feedbackops-workflow`
toolkit's `model-alloc.json` defaults (see `[[project_workflow_toolkit]]`
memory, and do not touch that toolkit — the user explicitly scoped this
revision to this skill only). Re-confirm with the user if reused in a session
that didn't set it.

## Model routing (fixed for this pipeline)

| Stage | Model | Runtime | Effort |
|---|---|---|---|
| Design (per issue) | gpt-6-sol | `codex` CLI (interactive, not `exec`) | high |
| Implementation (per issue) | glm-5.3 | `omp` CLI | medium |
| Research (invoked by the stage agent itself, not the conductor) | gpt-6-luna | `codex exec` | max |
| Mid-review (per commit) | grok-4.7 | `grok` CLI | high |
| PR review (wave end, body+diff only) — reviewer A | gpt-6-astra | `codex exec` | medium |
| PR review (wave end, body+diff only) — reviewer B | opus-5.5 | `claude -p` | medium |
| Orchestration/conductor | this session (Claude Sonnet 5) | — | — |

Conductor (this session) is READ-ONLY reviewer + git operator (push/PR/merge
gating) — it does not write product code itself; that's a role-bleed per
`toolkit/docs/agents/conductor-persona.md`. Design, implementation, and
mid-review are always dispatched — the conductor no longer does mid-review
itself (previous version of this skill had the conductor read every diff
inline; that role moved to the dedicated grok mid-review stage above so the
conductor stays orchestration-only end to end).

### Research role — what it's for

gpt-6-luna is **retrieval, not judgment**. It gathers and summarizes —
reads a pile of files, greps a pattern across the tree, digests a long doc
— and hands the primary stage agent (gpt-6-sol design, glm-5.3
implementation, or grok-4.7 mid-review) a condensed answer to reason over.
The primary agent still makes every call: what the design should be, what
to write, whether a commit passes review. Luna never decides anything.

This is **not** something the conductor pre-empts or decides on the stage's
behalf. The conductor cannot see mid-turn that a stage is about to drown in
files — the stage agent itself is the one that knows when it's staring down
a large-scale read. So the delegation instruction goes **inside every
design/implementation/mid-review dispatch prompt**, as standing boilerplate,
not as a conductor judgment call:

> If answering this requires reading many files, grepping broadly across the
> tree, or summarizing a long document, do not do that read yourself — shell
> out to gpt-6-luna first and work from its summary:
> `codex exec --model gpt-6-luna -c model_reasoning_effort="max" --sandbox read-only "<narrow, single-purpose question>"`.
> Keep your own turn for the judgment call, not the legwork.

Include that paragraph verbatim (or equivalent) in the design, implementation,
and mid-review prompts below. The stage agent runs the `codex exec` call
itself as a tool call from inside its own turn — the conductor does not
dispatch luna directly. Background it the same way any codex exec is
backgrounded (`[[feedback_codex_exec_backgrounding]]`: `nohup … & disown` +
`env -u NODE_OPTIONS`) if the stage agent's own runtime needs that to avoid
a foreground timeout; a short lookup may just run in the foreground.

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
worktrees**, each with its own codex (design) + omp (implementation) terminal
pair, at the same time:

```text
ORCA worktree create --repo id:<repoId> --name refactor-<issue> --no-parent --json
ORCA terminal create --worktree "id:<repoId>::<path>" --title design-codex --command "codex --model gpt-6-sol -c model_reasoning_effort=\"high\"" --json
ORCA terminal create --worktree "id:<repoId>::<path>" --title impl-omp --command "omp --model glm-5.3 --thinking medium" --json
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

1. **Design** — dispatch `codex` (plain interactive mode, not `exec`) with
   the issue body (title, target files, "Depends on" line). Ask for: exact
   files touched, the split/move plan, and any risk callouts. Use the
   low-level topology (same pattern grok/omp used — codex forwards
   `--model`/`-c` the same way in interactive mode as in `exec`):
   ```text
   ORCA terminal create --worktree id:<repoId>::<wavePath> --title "design-<issue>" \
     --command "codex --model gpt-6-sol -c model_reasoning_effort=\"high\"" --json
   ORCA terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json
   ORCA terminal send --terminal <handle> --text "<issue body + design ask>" --enter --json
   ```
   **Instruct the design prompt itself to end by writing its output to
   `.review/design-<issue>.md`** — TUI scrollback folds/collapses long
   responses (observed with grok in session43, issue #456; treat codex's TUI
   the same way until proven otherwise), so `terminal read` cannot reliably
   recover a full design after the fact. Read the file, not the terminal, for
   the actual design content; `terminal read` is only for liveness/progress
   checks. Keep the terminal open and reuse it for the next issue's design
   (same model, avoids relaunch cost). **Include the Research delegation
   paragraph (above) in the design prompt** — gpt-6-sol should offload broad
   file reads to gpt-6-luna and keep its own turn for the split/move
   judgment.
2. **Implementation** — same low-level pattern with
   `omp --model glm-5.3 --thinking medium`, prompt = design output + explicit
   instruction: **implement, then `git add` + `git commit`** with message
   `refactor(#<issue>): <short title>` (issue number in the subject line is the
   only linkage GitHub issues give us — no native sub-issue/DAG link). Omp
   cannot verify (`[[feedback_workers_cannot_verify]]`) — no test/typecheck
   claims from it are trusted. **Explicitly instruct it to run
   `./node_modules/.bin/biome check --write <touched files>` before
   committing** — omitting this from the dispatch prompt caused 32 new biome
   violations in wave2 (`[[feedback_formatter_pin]]`); including it dropped
   that to 4 in wave3. **Include the Research delegation paragraph** — glm-5.3
   should offload "what does the sibling file look like" / "grep every
   caller" reads to gpt-6-luna rather than reading them all itself.
3. **Mid-review** — dispatch `grok` (freed up from the design role by this
   revision) with the fresh commit's diff (`git show <sha>`) plus the design
   doc content. Reuse one grok terminal across the whole wave, same as the
   old design terminal was reused:
   ```text
   ORCA terminal create --worktree id:<repoId>::<wavePath> --title "midreview" \
     --command "grok --model grok-4.7 --reasoning-effort high" --json
   ORCA terminal send --terminal <handle> --text "<commit diff + design doc + verdict ask>" --enter --json
   ```
   **Include the Research delegation paragraph** — grok should offload
   verifying "does this symbol still exist elsewhere" or scanning several
   related files to gpt-6-luna rather than doing the wide read itself, and
   keep its own turn for the pass/fail judgment. Ask for a pass/fail verdict
   against: matches the design's file list,
   matches the issue's scope (no drive-by edits), no placeholder/TODO,
   doc-sync if the issue touches docs (`[[feedback_doc_sync]]`). **Instruct it
   to write the verdict to `.review/midreview-<issue>.md`** — same scrollback
   caveat as design. Conductor reads that file, not the terminal, to decide.
   Pass → next issue. Fail → send the specific defect back to the omp
   implementation terminal for a fix-up commit (`refactor(#<issue>): fixup
   <what>`), re-dispatch to grok for re-review; do not `git commit --amend`
   across a review boundary. The conductor never re-derives the verdict
   itself from the diff — that would be the old inline-review role bleeding
   back in.
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
3. **PR review — two independent reviewers, same scope, same isolation.**
   Assemble a scratch directory (outside the git worktree) with the PR body
   (`gh pr view <n> --json body -q .body`), the diff (`gh pr diff <n>`), and
   every wave issue's `.review/design-<issue>.md` — the design docs are not
   optional; a prior wave's reviewer without them produced 2 false positives
   out of 3 findings (`[[feedback_pr_review_needs_design_docs]]`). Neither
   reviewer gets repo access — this is a scoped diff review, not another
   implementation pass.
   - **Reviewer A**: `env -u NODE_OPTIONS nohup codex exec --model gpt-6-astra
     -c model_reasoning_effort="medium" --sandbox read-only
     --skip-git-repo-check --cd <scratch-dir> "<review prompt>" >
     <scratch>/codex-review.log 2>&1 & disown`. A read-only sandbox means it
     cannot write a result file — read its verdict from the log, not from a
     polled output file (`[[feedback_codex_exec_backgrounding]]`).
   - **Reviewer B**: `claude --model opus -p "<same review prompt>" --output-format
     text < /dev/null > <scratch>/opus-review.log 2>&1` run with cwd set to
     the scratch dir only (not the worktree), so it has no repo access either
     — `-p` already skips the workspace-trust dialog for non-interactive runs,
     no extra flag needed. Background the same way if it runs long.
   - Both reviewers get the identical prompt and identical input bundle —
     "동일한 방식으로" per the user's routing decision. Combine both verdicts
     into one PR comment; conductor decides whether either reviewer's finding
     blocks merge. If either dispatch produces no output, treat it as a
     failed dispatch and retry — silence is not a passing review.
4. Auto-merge only under the session-scoped authorization in
   `[[project_automerge_policy]]` — re-ask if not already granted this
   session.

## Orca mechanics recap

- `ORCA orchestration run-create` once per wave (or once per session, reused
  across waves) to get a bound Run for `check --wait` bookkeeping of anything
  dispatched via `worker-start`. Design (codex), implementation (omp), and
  mid-review (grok) all go through the low-level `terminal create` +
  `terminal send` topology, not `worker-start` — none of the three support
  its `--model`/`--effort` launch preference (confirmed session42 for
  grok/omp; treat codex's interactive mode the same until proven otherwise).
  This is unsupervised — track completion by reading the terminal (or the
  output file it was told to write), not by `check --wait`.
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
