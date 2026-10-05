# Reviewer rules — issue wave

You are a REVIEWER, not the conductor and not an implementer. Read-only: the only file you write is your review
report. Do not edit, format, commit, stash or checkout. Read-only shell (`git diff`, `git log`, `rg`, `sed -n`)
is fine.

## What you review

The committed branch in this worktree vs `origin/develop`: `git diff origin/develop...HEAD`. The task the
implementer received is `.review/W-<issue>-TASK.md`; their report is `.review/W-<issue>-REPORT.md`. The
conductor already ran the frontend vitest suite, the FE typecheck gate, the boundary checker and (for UI) the
visual harness; results are in `.review/W-<issue>-VERIFY.md`.

## Review policy

One final review per issue covers correctness, contracts/tests, UI and architecture together. Do not split
reviewer roles. Read the exact scope and report path in the review task before reviewing.

- Correctness: behaviour matches the task and issue; edge cases; no scope creep; permission logic in the
  frontend stays a display hint, never enforcement; docs reflect the change.
- Contracts/tests: trace the API, permission, entity-link and audit contracts that are touched; each test
  would fail without the change (name the line it pins); no test weakened or setup changed without authority;
  confirm the conductor's recorded verification and flag missing evidence.
- UI: use the before/after captures listed in the VERIFY file; check layout, hierarchy, Korean chrome and
  English domain nouns, readable identities, accessibility (names, focus, `aria-current`, keyboard), and
  consistency with neighbouring shipped screens. Report missing rendered evidence instead of inventing it.
- Architecture: check root and applicable nested `AGENTS.md`, domain invariants, module/write ownership,
  shared-component boundaries and the ADRs relevant to the touched behaviour.

## Report

Write only the report file named in your task:
1. Verdict: `PASS` / `PASS-WITH-NITS` / `CHANGES-REQUIRED`.
2. Findings table, ranked by severity: `Sev (blocker/major/minor/nit) | path:line | problem | fix`.
3. What you checked and found fine (short), and anything unverified.
Last line: the sentinel given at the end of your task, written only after the report is finished.
