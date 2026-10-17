# #1106 Evidence inventory verification

Worker scope: backend inventory/detail reads and additive shared schemas from
ADR-0065 54-2. The screen and approved-excerpt picker are separate issues.

## Reader and migration

`0065_evidence_inventory_batch.sql` was generated as a custom migration through
`pnpm --filter @fops/backend db:generate --custom --name=evidence_inventory_batch`.
Drizzle generated the journal entry and snapshot; the function has no schema-table
change. Conductor renumbers if another branch uses this ordinal.

The new Survey-owned definer reuses the #739 evidence-reader owner and its existing
column privileges. It adds only narrow app EXECUTE, revokes PUBLIC, fixes
`search_path=pg_catalog`, and retains private-table/raw-link/audit denial. Apply after
#739/#740 with their existing owner-role prerequisites. No bootstrap role or general
app table grant is added. Existing nested reader remains unchanged.

Inventory scans at most 100 local candidates per hydration transaction. Canonical
point authorization applies to each distinct parent scope before the candidate SQL;
source-owned projections and literal matching apply before an item contributes to the
public page or continuation. Each batch holds its complete response lock set in UUID
order and releases it before another batch, preventing cross-batch lock inversions.
No per-row transaction or nested HTTP fan-out occurs. Sparse/no-match searches can
scan the whole authorized candidate set: memory and per-transaction hydration are
bounded, total request work is not capped. Measure this cost before release; do not
claim constant-time search or a frozen permission snapshot.

## Conductor-only execution

Use the throwaway DB recipe in `apps/backend/AGENTS.md`, real `fops_app` for routes,
and `fops_migrate` for migration/fixture/history observation. Never use dev port 5434.
The integration wrapper resets its target database. Workers must not execute these
commands or treat typecheck as runtime evidence.

Run the whole touched modules via the integration wrapper, including the existing
Survey/DB regressions named by the brief-check:

```sh
PATH=/opt/homebrew/opt/node@22/bin:$PATH \
FEEDBACKOPS_ENV_FILE=<throwaway-env-path> \
pnpm --filter backend test:integration --maxWorkers=2 --minWorkers=1 \
  src/modules/findings src/modules/surveys src/db/__tests__
```

Both extended Findings suites include route-level inventory tests. The Survey suite
uses the existing `pg_locks` barrier for list/detail versus exact-approval revoke,
both read-first and revoke-first. The DB suite pins new owner/ACL/search-path/batch
bounds while preserving old raw-access assertions. Reads snapshot audits after login
and setup; rate-limit bookkeeping is not a domain mutation.

## Plans and timing artifact

The `measures stable bounded Evidence pagination` test reuses the existing ordinary
scale helper: at least 5,000 VOCs, 5,000 Tasks, 30 Findings and 3,000 note highlights.
It logs app-role `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` first/continuation
candidate plans, workload,
first/continuation-page milliseconds and exact duplicate-free 30-page traversal.
Fixtures are removed in FK order; Task scale rows are removed before shared cleanup.

The `measures cross-Finding Survey batch hydration` test seeds four Surveys/responses,
four independently authorized scopes/Findings and 300 attached approved highlights.
It logs the app-role Survey definer Function Scan plan, first/continuation timings
and stable duplicate-free three-page traversal.
Approval fixtures use migrate; commands/routes run as app. Each sensitive creation
uses its own Actor. Existing below-threshold and exact approval-loss tests remain
separate from picker suppression.

Record both outputs in a conductor artifact with machine/runtime information and
cold/warm repetitions. No numerical latency threshold was invented by this issue.
While those fixture IDs exist, also inspect:

- Candidate continuation SQL with the emitted cursor's exact timestamp/local ID
  tuple and the same workspace/authorized target-scope array; compare buffer work
  against first-page SQL from the test. Preserve microseconds.
- `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM
  survey.read_inventory_highlight_evidence($1::uuid,$2::uuid[])` as app for an empty,
  single-parent and cross-parent batch of at most 100 authorized local highlight IDs.
  The external Function Scan does not reveal its internal statement plan; inspect
  internal lookup plans through the existing controlled operator/reader-owner path,
  without changing grants. Do not copy private bindings into public artifacts.
- Selective and no-match searches across the 150 denied-source candidates exercised
  by `inventory searches projected content across hidden-source batches`, plus
  high/low visible-source ratios at representative fan-out. Compare membership,
  `has_more` and cursor with a control containing no hidden-text match.

Retain measured plans/workload/timings and any follow-up index justification. No
index migration is proposed before that inspection. Runtime SQL/ACLs, migration
execution, lock ordering, pagination under permissions changed between pages, and
performance remain unverified until the conductor records passing execution.
