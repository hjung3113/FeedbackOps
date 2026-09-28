# Gate Scripts Agent Guide

Frontend and migration gates. The full gate list is in root `AGENTS.md` → Verification. `verify.sh` (agent-workflow toolkit) is backend-only; frontend verification runs from `frontend-verify-profile.json` here.

## Frontend typecheck gate (`pnpm gate:fe-typecheck`)

- `fe-typecheck-gate.mjs` runs `tsc --noEmit` for the frontend and fails only on errors not listed in `frontend-typecheck-baseline.txt` (currently absent, so every error counts). Baseline lines are matched verbatim, line numbers included, so an unrelated edit can shift a baselined error into "new".
- In a fresh worktree, generate the gitignored `apps/frontend/src/routeTree.gen.ts` first (`pnpm --filter frontend build`, or start dev). Without it, the gate reports about two dozen new errors that are setup noise, not baseline drift; they must never be added to the baseline. Regenerate it again after adding a route or after a rebase/merge that brought in routes.
- vitest green does not mean type-green; run this gate separately.

## Frontend Biome gate (`pnpm gate:fe-lint`)

- `fe-biome-gate.mjs` checks only files changed between `merge-base(HEAD, <base>)` and `HEAD`. Biome errors fail the gate; warnings do not.
- Always pass `--base origin/develop` (`pnpm gate:fe-lint --base origin/develop`), after `git fetch origin develop` if unsure. The default base is the local `develop` ref, which can be stale in a worktree and then scans unrelated commits. Symptom: diagnostics on files you never touched, or "no biome-checkable files changed" when you did change `.ts`/`.tsx` files — compare `git rev-parse develop` with `git rev-parse origin/develop`.
- It diffs committed history, not the working tree. Commit first, then run it; before a commit it reports a false pass.
- For release verification (`develop` → `main`) use `--base origin/main`; the default base makes the gate a no-op there.
- Read its exit code directly. `node … | tail; echo $?` prints `tail`'s status; redirect to a file instead (`> log 2>&1; echo $?`).
- To prove a reported "NEW" identity already exists on `develop`, check `develop`'s content at the real path (swap the file in with `git show origin/develop:<path>`, run `biome check --reporter=json --max-diagnostics=500 <path>`, swap back). A copy under a different filename under-reports lint diagnostics.
- Update `frontend-typecheck-baseline.txt`, or add a line to `frontend-biome-allowlist.txt`, only when the existing diagnostic is intentionally accepted and documented in review. An allowlist line is `<repo-relative-path> <biome-category> -- <reason>`. Each path carries its own lines; a split file needs a new line for each category.
- Biome is not part of `pnpm typecheck` or any other gate, and a whole-repo `biome check` count is not a usable oracle. When fixing only import order in an existing file, use `biome check --write --formatter-enabled=false --linter-enabled=false <file>` so nothing else is reformatted.

## Other per-path allowlists

`apps/frontend/src/lib/api/api-unparsed-allowlist.txt` (`<path> <unparsed apiClient call count>`, checked by `unparsed-endpoints.test.ts`) is separate from the Biome gate. When a screen split moves `apiClient` calls to another file, move its allowlist entry with them.
