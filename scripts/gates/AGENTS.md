# Gate Scripts Agent Guide

Frontend and migration gates. The full gate list is in root `AGENTS.md` → Verification; CI runs it through `scripts/ci/gate.sh`. Whole-issue host checks that bundle these gates: `.claude/skills/issue-wave-conductor/scripts/verify-fe.sh` and `verify-be.sh`.

## Frontend typecheck gate (`pnpm gate:fe-typecheck`)

- `fe-typecheck-gate.mjs` runs `tsc --noEmit` for the frontend and fails only on errors not listed in `frontend-typecheck-baseline.txt` (currently absent, so every error counts). Baseline lines are matched verbatim, line numbers included, so an unrelated edit can shift a baselined error into "new".
- In a fresh worktree, generate the gitignored `apps/frontend/src/routeTree.gen.ts` first (`pnpm gen:routes`). Without it, the gate reports about two dozen new errors that are setup noise, not baseline drift; they must never be added to the baseline. Regenerate it again after adding a route or after a rebase/merge that brought in routes.
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

## Design-system lint (`pnpm lint:design`)

- `@shadcn/lint` on Oxlint (ADR-0062), configured in the root `.oxlintrc.json`. Oxlint runs only the `shadcn/*` rules; Biome still owns formatting and general lint. It lints `apps/frontend/src` and `packages/ui/src`, ignoring tests and `routeTree.gen.ts`.
- Every `shadcn/*` rule is `error` (inside `packages/ui/src/**`, `no-restyle` and `require-static-classes` stay off: components style themselves). `pnpm lint:design` uses `oxlint --max-warnings 0 apps/frontend/src packages/ui/src`; there is no warning budget. `rich-editor` remains allowed by `no-unknown-classes` because the visual harness locates that hook class.
- To see findings for a few files only: `pnpm exec oxlint <paths>`. Messages suggest a variant, scale value, or token; they are hints, not an equivalence oracle (the theme's self-referencing aliases can make the "nearest" size wrong). Check the component API, the computed value, and line-height before applying one.
- `no-restyle` lets screens add layout classes by default. Its named container contract also permits spacing on `Card`, `EmptyState`, `PanelTitleBlock`, `ListToolbar`, and matching content/header/footer/group/panel/list/section-title components. Controls that own their internal spacing (`TabsList`, `ToggleGroup`, `RadioGroup`, `DialogFooter`, `AlertDialogFooter`, `TooltipContent`, `SelectContent`, `DropdownMenuContent`, `DropdownMenuSubContent`, `PopoverContent`, and `HoverCardContent`) have a later contract that permits layout only. Use the control's existing spacing, padding, or size variant; add a variant to the control when a treatment repeats (the #783 pattern, e.g. `PopoverContent padding`, `RadioGroup spacing`); or move the spacing to a wrapper. The last matching contract wins. `DetailPanelHeader`, `ShellHeader`, and `ListToolbar` keep their `h-*`, `min-h-*`, `max-h-*`, and `size-*` denial for the ADR-0020 50px rhythm.
- `no-arbitrary-values` allows layout values in screens and `packages/ui/src/**` (for grid, width, and viewport layout); its `scanAllStrings` setting also checks class strings kept in constants. Other categories must use theme tokens or scales.
- `packages/ui/components.json` exists only to point the linter at `apps/frontend/src/styles.css`; without it, theme utilities such as `h-toolbar` read as unknown classes in `packages/ui`. It is not a shadcn CLI config.
- An intentional exception uses `// oxlint-disable-next-line shadcn/<rule> -- <reason>` immediately above the finding line (JSX children use `{/* ... */}`). Each comment needs a concrete reason tied to that treatment. Review records its path, line, rule, and reason; file-wide or blanket disables are not accepted.

## Migration drift gate (`pnpm gate:db-migration-drift`)

- `db-migration-drift-gate.mjs` needs no database: it forces `DATABASE_URL_MIGRATE` to an unreachable URL, even when your shell exports a real one.
- It fails on any of three conditions: a `.sql` file in `apps/backend/migrations/` missing from `meta/_journal.json` (or a journal entry with no `.sql`, or a duplicate tag); a nonzero `drizzle-kit check` (`pnpm --filter backend db:check`); or `db:generate` run against a throwaway copy of the migrations emitting any new or rewritten file (the TS schema has drifted from the committed history).
- Treat a failure as a real history problem. Migration traps: `.claude/rules/db-migrations.md`; the journal-registration rule: `apps/backend/AGENTS.md`.

## Other per-path allowlists

`apps/frontend/src/lib/api/api-unparsed-allowlist.txt` (`<path> <unparsed apiClient call count>`, checked by `unparsed-endpoints.test.ts`) is separate from the Biome gate. When a screen split moves `apiClient` calls to another file, move its allowlist entry with them.
