# Dashboard Module Agent Guide

## Ownership

Dashboard owns Home/Integration action queues, coverage projections, missing-link projections, and dashboard read models.
Dashboard is not a passive reporting helper.

## Invariants

- Each actionable row must explain why it appears and what the next action is.
- Dashboard must not mutate source records directly.
- Dashboard completeness indicators must account for missing links and permission limits.
- Missing-link queues are policy-driven by workspace policy, Managed System policy, Analytics Area policy, severity rules, or explicit workflow configuration.

## Cross-System Rules

- Read through approved module read interfaces or projections.
- Open next actions in the owning module rather than duplicating command logic.
- Include source object type, source object id, target route, selected object, and action intent in next-action payloads.

## Verification

- Test missing-link queues, permission-aware rows, refresh after repair, and next-action routing when touched.

## Close-out contract (ADR-0067; staged G/H)

- 56-G implements required `computed_at` and live recovery list/detail with deterministic
  canonical opaque category/source tokens. Compatibility/readability is rechecked; a readable
  resolved address needs no historical proof and returns no repair actions.
- Reuse owner predicates for summary/list/active detail. Scope/category and Home's explicit
  `view=actionable` executable repair eligibility precede count/LIMIT. Permission Requests stay
  workspace-level; Survey safe list is Survey-grain while its summary remains response-grain.
- Inject owner recovery projections through server wiring; batch distinct-System decisions
  and safe linked VOC hydration. Restricted linked identities/owners/routes/actions never leak.
  Generic Survey reads use only the safe batch adapter, fail closed on empty scopes, and never
  call personal readers or write domain audits. Required personal source audits are unchanged.
- H extends G strict schemas with truthful nullable occurrence/resolution, personal presentation
  and visible/hidden totals. Dashboard owns storage/recorder/pg-boss, presentation PATCH and
  history; GETs write no source/projection state. History starts at the first instant of the
  current UTC month minus two calendar months, inclusive; current permission filtering precedes
  count/LIMIT. Runtime history is append-only; reconciliation uses observation evidence.
- H's personal 1-day/7-day snooze/current-occurrence mute never changes operational summary counts; reopen resets
  hiding. Outcome response presentation/history remains Survey-owned/personal-gated (ADR-0055).
- Coverage (#1087) reads resolved five metric pairs once; `no_data` differs from absent keys.
  Rendered consumer compatibility is #1088-owned; deliver atomically.
  Measure bounded API/UI and recorder fanout against ADR-0067's budget.

## Analytics Area report (ADR-0069; implemented by #1078)

- Compose authorized grouped owner reads and batch catalog metadata, not foreign repositories or per-Area service calls.
- Attribute each VOC/Finding/Task/Survey to its own current nullable Area UUID; keep null/archived context.
- Survey output counts Surveys and safe Survey-level follow-up signals, never responses or personal fields.
- Omit unavailable metrics; authorized empty is zero. Hidden linked facts are not missing follow-up.
- Keep Home summary intact; consume canonical recovery resolution without report-owned lifecycle writes.
- Emit exact source-list filters only after both API and strict browser support exist; contract: `docs/implementation/api/dashboard.md`.
