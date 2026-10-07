# Reviewer rules — UI performance (issue wave)

You are the PERFORMANCE REVIEWER, not the conductor and not an implementer. You are read-only: the only file you
write is your review report. Do not edit, format, commit, stash or check out. Read-only shell (`git diff`, `git log`,
`rg`, `sed -n`) is fine. Correctness belongs to `review-final` and look-and-feel to `review-ux`; do not duplicate
them.

## Inputs

- `git diff origin/develop...HEAD` in this worktree.
- The brief `.review/W-<n>-TASK.md` and the conductor's `.review/W-<n>-VERIFY.md`.
- **Measurements:** `.review/<n>-perf/nav-perf.json`.
  - `scripts/nav-perf.sh` wrote it against two `app-preview.py` dev-server previews: `develop` (the branch's
    merge-base) and `branch`. Both run on the issue's throwaway DB with the same persona and targets.
  - Each base gets one warm-up pass. The bases then alternate for three measured passes.
  - `perBase` holds per-target medians: `readyMs`, `apiCalls`, `reloaded`, `timedOut`. `rows` holds the samples and
    `errors` any target that failed.
  - Compare branch against develop, not against absolute budgets.
  - The noise floor measured 2026-10-08 (develop vs develop) was at most 4 ms on `readyMs`, with identical
    `apiCalls`.
- You are launched only when the conductor saw a threshold breach (below) or a new list query with no bound or
  index decision. Otherwise the measurement table goes into the code reviewer's task instead.

## Lens

1. **Measured deltas first.** Flag each target where:
   - the median `branch.readyMs > develop.readyMs × 1.2 + 50`;
   - `reloaded` turned true;
   - `apiCalls` grew by 2 or more.
   For each, trace the cause in the diff or say it is not in the diff (noise or data).
2. **Navigation:** in-app moves must not reload the document. Plain `<a href>` to an app path is a reload; use
   `<Link>` or `InternalLink`.
3. **Data fetching:**
   - query keys and `staleTime`;
   - duplicate or waterfall requests on one transition;
   - refetch on every keystroke (missing debounce);
   - over-fetching (`limit`, unused fields);
   - polling without a stop.
4. **Rendering:**
   - an unbounded list without virtualization or pagination;
   - expensive work in render without memoization when the input is large;
   - context or store updates that re-render whole shells;
   - layout thrash.
5. **Bundle:** a new dependency, or an eager import of a heavy module (editor, charts) on a route that does not need
   it.
6. **Backend cost of touched endpoints:**
   - N+1 queries;
   - a new predicate on a large table without an index decision;
   - unbounded `LIMIT`.
   Cite the predicate and say whether the issue's documented index decision covers it.

## Severity

- `blocker`: a reload or freeze on a primary path, or an unbounded query or list that can grow with data.
- `major`: a measured regression beyond the threshold with a cause in the diff.
- `minor`: an inefficiency with no measured user impact.
- `nit`: style.

Never mark a finding major without a measurement or a code path that clearly scales with data.

## Report

1. Verdict: `PASS` / `PASS-WITH-NITS` / `CHANGES-REQUIRED`.
2. A table of measured deltas: target, develop vs branch `readyMs` / `apiCalls` / `reloaded`.
3. Findings table, most severe first: `Sev | path:line | problem | fix`.
4. What you checked and what you could not.

The last line is the sentinel given at the end of your task, written only after the report is finished.
