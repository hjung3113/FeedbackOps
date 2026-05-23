# Next-Session Prompt — Multi-Agent Workflow (post-v0.2)

> Paste this as the opening prompt next session. Self-contained resume point. Do NOT merge to `develop` or push without explicit user approval.

## WHERE WE ARE

v0.2 of the cmux multi-agent workflow is **DONE and validated** on branch **`feature/agent-workflow-trial`** (NOT merged — intentional). v0.1 + v0.2 both await a develop merge after the user approves.

**v0.2 delivered (~32 commits on `feature/agent-workflow-trial`, all green):**
- `scripts/verify.sh` — env-load + false-green-proof vitest JSON classifier + baseline-aware `--typecheck` (fails only on NEW errors vs `.review/typecheck-baseline.txt`).
- `scripts/prepare-worktree.sh` — host-side deps+env prep; refuses shared env when ≥1 other worktree prepared unless `--env-profile`/`--allow-shared-env` (case-insensitive high-risk key flagging).
- `scripts/tier-probe.sh` — disallows Trivial on exported-contract / ambiguous-exported-TS changes (advisory; `verify.sh --typecheck` is the oracle).
- `scripts/conductor-rebuild.sh` — reconstructs CONDUCTOR state from `.review/*.json`; per-worktree HEAD + branch-identity check; fallback can only demote, never `verified`.
- `scripts/artifact-fresh.sh` — base_branch-aware staleness, resolves in the artifact's OWN worktree (not caller HEAD); refuses to assume develop.
- `scripts/review-archive.sh` — archive merged issue artifacts to `.review/archive/YYYY-MM/`.
- `scripts/rebase-inflight.sh` — explicit dirty-safe, conflict-aborting, in-progress-op-aware rebase of in-flight worktrees; post-merge hook stays warn-only.
- Schemas: structured `blocker` (reason_code+evidence, no prose `recommended_actions`); `pr_draft` with conditional-required `verify_result` + `worktree_path` + `base_branch`; new `phase_summary` + `heartbeat` (derived-not-truth provenance).
- Docs: `conductor-persona.md`, `visual-reviewer-persona.md`, expanded `multi-agent-workflow.md`, `.review/README.md`.

**Reviews:** every task spec+quality reviewed; 2 codex adversarial rounds (plan R1–R10, shipped-code RF1–RF7). 3 build-time bugs + 7 integration-seam holes found and fixed.

**Trials (in `docs/agents/workflow-trial-log.md`):**
- T1 #33 failure/escalation, T2 #31 happy path, **T3 #30‖#32 parallel two-cluster GREEN** with per-cluster DB isolation.

## OPEN THREADS / TODO (next session)

1. **Cherry-pick the real trial fixes onto develop-based branches → PRs:**
   - `9738f15` on `feature/30-runidempotent-helper` (issue #30, runIdempotent helper) — worktree `../wt-30-runidempotent-helper` kept.
   - `69dd8ee` on `feature/32-ratelimit-ws-key` (issue #32, rate-limit workspace_id key) — worktree `../wt-32-ratelimit-ws-key` kept.
   - `655756a` on `feature/31-idem-audit-assertion` (issue #31, from T2) — still pending from before.
   After cherry-pick, remove the kept worktrees (`git worktree remove --force <wt> && git branch -D <branch>`).
2. **Throwaway DBs** `feedbackops_c30`/`feedbackops_c32` — drop if not already (`dropdb` as superuser; `fops_migrate` lacks CREATEDB).
3. **v0.1 + v0.2 develop merge** — both branches await it after user approval. Decide merge vs PR.
4. **v0.3 candidate (from this session's discussion):** allow loopback DB access inside the codex `workspace-write` sandbox so CODEX can self-verify integration tests — keeping process containment while removing the "VERIFIER must run outside sandbox" friction (T3 finding #11). Investigate codex sandbox config for a localhost/DB allowance.
5. **Pre-existing cleanups (out of scope, flag to user):** dangling `docs/agents/workflow.md` refs in AGENTS.md; `docs/wiki/` untracked; pre-existing `src/cli/storage-bootstrap.ts(54,31) TS2559` (in the typecheck baseline — fix separately + refresh baseline).

## KEY OPERATING FACTS (learned, don't relearn)
- Parallel clusters need **one throwaway DB each** (schema/workspace isolation insufficient: fixed `core`/`permission` schemas + instance-global `pg_locks`). Seed with BOTH `DATABASE_URL` and `DATABASE_URL_MIGRATE` targeted at the new DB.
- codex `workspace-write` sandbox blocks the DB → VERIFIER verifies outside the sandbox; B2 conditional `verify_result` blocks false `ready` claims under sandbox DB-unavailability.
- DB on `localhost:5434/feedbackops`, roles `fops_app`/`fops_migrate` (neither has CREATEDB); superuser `postgres` (pw `postgres` locally). Trial worktrees branch from `feature/agent-workflow-trial` (TRIAL_BASE) so they carry the workflow infra.
- Codex co-design pane: workspace:21 (may be gone next session — respawn a fresh `codex` pane if needed for adversarial review).

## METHOD (continue as before)
- Plans via superpowers:writing-plans; execute via superpowers:subagent-driven-development (fresh implementer per task + spec + code-quality review; human = Release Captain).
- Co-design + adversarially review with a long-lived `codex exec` pane before/after implementing.
- Doc-sync discipline: every script/schema change syncs the playbook + README in the same commit.
- Do NOT merge to develop. Do NOT push/PR without explicit user approval.
