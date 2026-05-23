# cmux Multi-Agent Workflow — Draft v0.1

> Draft from co-design session between ARCHITECT (Claude Opus 4.7) and CODEX (codex exec, gpt-5.5). 3-round negotiation, 2026-05-23.
> Status: **DRAFT** — needs user review + trial run before promotion to `workflow.md`.

## 1. Roles

| Pane | Agent | Authority |
|---|---|---|
| ARCHITECT | Claude Opus | **Sole dispatcher.** Plans, decides scope, writes prompts, makes ALL routing decisions. |
| CODEX | `codex exec` | Implements. Never decides scope. Stops on ambiguity. |
| REVIEWER | Claude Sonnet | Reviews diff against rules. **Never instructs CODEX directly.** Writes findings, ARCHITECT proxies. |
| VERIFIER | Shell / headless | Runs tests, typecheck, `/run`, Playwright. No decisions. |

**Authority rule:** Single source of task authority = ARCHITECT. REVIEWER feedback → ARCHITECT re-prompts CODEX. Prevents contradictory loops.

## 2. Dispatch Prompt Templates

Two tiers — chosen by issue P-class.

### 2.1 MINIMAL (P3 trivial)

```text
Issue: #N <one-line title>
Task: <one sentence, imperative>
Scope: <exact files/dirs allowed; everything else forbidden>
Accept: <one-line acceptance criterion>
Verify: <exact pnpm/test command>
Handoff: write .review/ISSUE-N-PR-DRAFT.md on success
```

### 2.2 FULL (P1 / P2)

```text
Issue: #N <title>
Branch: feature/N-<slug> from develop (create if missing)
Task: <one vertical slice, imperative>
Read first: <exact paths — ADRs, prototype screens, impl docs>
Change: <concrete behavior/UI/API delta>
Scope: allowed = [...]; forbidden = [...]
Constraints:
  - invariants: <list>
  - ADRs locked: <list>
  - copy: verbatim from prototype path X
Accept:
  - <criterion 1>
  - <criterion 2>
Verify: <exact commands, in order>
Commit: yes/no; suggested message: "<...>"
Handoff: .review/ISSUE-N-PR-DRAFT.md
Ambiguity rule: abort, no commit, write .review/ISSUE-N-BLOCKER.md
```

### 2.3 Required fields ARCHITECT must always provide

CODEX cannot infer these from the issue alone:

1. **Priority class** (`P1/P2/P3`) — selects MINIMAL vs FULL template.
2. **Locked boundaries** — allowed files/modules + ADR decisions that must not reopen.
3. **Success contract** — exact acceptance criteria + exact verification commands.

**Default tier:** P3 → MINIMAL unless issue touches product behavior, API/domain rules, shared UI, migrations, permissions, or cross-module contracts → escalate to FULL.

## 3. Handoff Channel

**File-backed, not ephemeral.**

| Artifact | Path | Writer | Reader |
|---|---|---|---|
| PR body draft | `.review/ISSUE-N-PR-DRAFT.md` | CODEX | REVIEWER, ARCHITECT |
| Review findings | `.review/ISSUE-N-REVIEW.md` | REVIEWER | ARCHITECT |
| Blocker report | `.review/ISSUE-N-BLOCKER.md` | CODEX (on abort) | ARCHITECT |

**Why file, not cmux notify / commit trailer:**
- Diffable, survives pane/session loss
- Fits existing `.review/` routing pattern in this repo
- Commit trailers too cramped; notify ephemeral

**PR-DRAFT.md required sections:**
- Commit SHA(s)
- Changed files (list)
- Verification output (paste)
- Known risk
- Intentional deviations from prompt

## 4. Failure Mode (CODEX hits ambiguity)

**Action: abort with no commit + write BLOCKER.md.**

Triggers:
- ADR / product invariant ambiguity
- Prototype vs spec conflict
- Missing dependency
- Failing unrelated baseline
- Scope creep needed to complete task

BLOCKER.md must contain:
- Attempted command(s) + output
- Specific blocker (one paragraph)
- Files touched (if any — should be 0 ideally)
- Recommended ARCHITECT decision (2-3 options)

Why no partial commit: partial commits create review noise + false completion signal. Clean abort > messy progress.

## 5. Review-Reject Loop

```
CODEX commit → REVIEWER reads .review/ISSUE-N-PR-DRAFT.md + git diff
   ├─ pass → notify ARCHITECT → PR create
   └─ fail → write .review/ISSUE-N-REVIEW.md
              → ARCHITECT reads findings
              → ARCHITECT re-prompts CODEX with patch instructions (NOT REVIEWER)
              → CODEX amends/new commit
              → loop
```

REVIEWER never `cmux send`s to CODEX. ARCHITECT is the only voice CODEX hears.

## 6. Parallel Cluster Coordination

3 worktrees in parallel = 3 ARCHITECT/CODEX pairs.

**Rule:** *Parallelize leaf chunks. Serialize shared contracts.*

**Mechanism:** Declared touch sets (not lock files).

- Each CODEX pane declares intended files/dirs in `.review/ISSUE-N-TOUCH.md` **before** editing.
- ARCHITECT detects overlap. Overlapping clusters in:
  - `packages/shared/*`
  - migrations
  - shared UI components
  - shared test fixtures
  - docs with global workflow meaning
- → **serialize** (one cluster at a time)
- Non-overlapping → run parallel.

Worktrees isolate branches but do NOT solve semantic merge conflicts on shared contracts.

## 7. cmux Pane Setup Script (proposal)

```bash
# scripts/cmux-4role.sh <issue-N> <slug>
WS=$(cmux new-workspace --name "issue-$1-$2" \
  --cwd "$(pwd)" | awk '{print $2}')
LEFT=$(cmux list-pane-surfaces --workspace $WS | awk 'NR==1{print $2}')
RIGHT=$(cmux new-split right --workspace $WS --surface $LEFT | awk '{print $2}')
BL=$(cmux new-split down --workspace $WS --surface $LEFT | awk '{print $2}')
BR=$(cmux new-split down --workspace $WS --surface $RIGHT | awk '{print $2}')

cmux rename-tab --workspace $WS --surface $LEFT  "ARCHITECT"
cmux rename-tab --workspace $WS --surface $RIGHT "CODEX"
cmux rename-tab --workspace $WS --surface $BL    "REVIEWER"
cmux rename-tab --workspace $WS --surface $BR    "VERIFIER"

# git worktree per cluster
git worktree add "../wt-$1" -b "feature/$1-$2" develop
```

## 8. Open Questions (for user)

- [ ] Where does `.review/` live — gitignored or committed? (current repo: committed per Slice 3 pattern)
- [ ] REVIEWER pane: same worktree (live diff) or separate worktree on base (atomic snapshot)?
- [ ] Should ARCHITECT also be `cmux send`-driven (master orchestrator pane) or stays interactive?
- [ ] PR creation: ARCHITECT pane or VERIFIER pane after green?
- [ ] Cluster size limit: max N parallel worktrees? (mem/context budget)

## 9. Next Step

1. Pick a P3 cluster (Idempotency: #27 + #30 + #31).
2. Run this workflow end-to-end as trial.
3. Update this draft based on friction observed.
4. Promote to `docs/agents/workflow.md` once validated.

---

**Co-design transcript:** cmux `workspace:11 / surface:75` ("CODEX-discuss" pane). 3 rounds, ~87k tokens codex side.
