# Dashboard coverage — open choice C (editable cutoffs)

## Status

Research from 2026-09-26 for issue #513. #513 shipped D (the high-severity unlinked predicate fix), B (per-Managed-System breakdown), and A (the Coverage page). Option C below is not decided and not built. The two action-list queues "Survey Finding without Task" and "Task Request pending approval" are also not built. Line numbers are as of 2026-09-26.

The full original research (options A, B, D and the source survey) is in git history at `docs/superpowers/specs/2026-09-26-dashboard-coverage-design.md`.

### C. Let the workspace set the good/warn cutoffs for the metrics that already exist

**What.** Replace the hardcoded band with workspace-saved cutoffs for the coverage ids the summary already emits. Default stays whatever is chosen at design time. No new ratio.

**Why it is a real gap, and why it is only a prototype gap.** The server band is fixed. The prototype has an edit modal and says the API for it does not exist. The dashboard design doc never mentions editable thresholds.

- `apps/backend/src/modules/dashboard/service.ts` lines 51–53: `value >= 75 ? 'good' : value >= 40 ? 'warn' : 'bad'`.
- `docs/design-prototype/screen-coverage.jsx` line 116: modal default `{ good: 65, warn: 45 }`. The screen's "New policy" button and the callout that thresholds live in workspace settings are prototype copy.
- `docs/design-prototype/HANDOFF.md`: "Coverage thresholds persist to `window.COVERAGE_THRESHOLDS` (in-memory). No coverage-threshold endpoint exists in the catalog — `api/core.md` settings has no such field, so wiring one would be a new contract, not a wiring task."
- Workspace settings today are `permission_self_approval` and `survey_anonymity_threshold` only (`docs/implementation/api/core.md`).

**Lift: small to medium.** One settings field (or one pair per coverage id), audit on change, admin control, and `coverageStatus` reads the saved cutoffs. The color is already rendered by `HomeScreen`.

**Not this option.** The prototype's "New policy" action. `docs/design/08-dashboard-system.md` lists "custom calculated metrics" under out-of-MVP metric scope. Also not this option: the two unimplemented action-list queues named under D ("Survey Finding without Task", "Task Request pending approval"). Those are closer to "unlinked data" than a cutoff editor is.


## Not offered as an option

- **Trend over time.** Not named in Phase 1 or Phase 2. The dashboard doc says metrics are "supporting signals for action queues, not a free-form BI analysis surface," and lists cohort/funnel/retention and advanced BI as out of MVP. A time series would be a new store, not a use of the live counts.
- **`computed_at` or a metric cache by itself.** The contract asks for `computed_at` when values may be stale. This endpoint is computed in the request and sent `no-cache`. A timestamp on a live read does not change coverage or unlinked data.
- **Recovery items, snooze, mute, and three-month history.** Specified in `08-dashboard-system.md` and `03-api-contracts.md`. They are a queue model (item id, resolution, history), not a coverage-percent enhancement, and nothing in `apps/backend/src/modules/dashboard/` implements them.
- **Overdue, blocked, and milestone progress.** Named in the system-dashboard and MVP-metric lists. They are not coverage or unlinked-data, and milestone-outcome is explicitly future.
