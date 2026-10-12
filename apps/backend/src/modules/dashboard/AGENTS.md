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

## Close-out contract (ADR-0067; implementation pending)

- ADR-0067 accepts proposed/new stable recovery identity/occurrences, bounded detail,
  personal presentation, three-calendar-month history, computation time and derived hints;
  implementation is pending. Reuse summary predicates/grains; GETs write no projections.
- Dashboard's injected transaction-aware recorder captures committed source/link transitions;
  pg-boss discovers/reconciles drift without invented action time. No source resolution writes.
- Personal 1-day/7-day snooze/current-occurrence mute never changes counts; reopen resets hiding.
- Outcome response presentation/history remains Survey-owned/personal-gated under ADR-0055.
- Coverage reads resolved five metric pairs once; proposed `no_data` differs from absent keys.
  Measure bounded API/UI and recorder fanout against ADR-0067's budget.

## Analytics Area report (ADR-0069; accepted, implementation pending)

- Compose authorized grouped owner reads and batch catalog metadata, not foreign repositories or per-Area service calls.
- Attribute each VOC/Finding/Task/Survey to its own current nullable Area UUID; keep null/archived context.
- Survey output counts Surveys and safe Survey-level follow-up signals, never responses or personal fields.
- Omit unavailable metrics; authorized empty is zero. Hidden linked facts are not missing follow-up.
- Keep Home summary intact; consume canonical recovery resolution without report-owned lifecycle writes.
- Emit exact source-list filters only after both API and strict browser support exist; contract: `docs/implementation/api/dashboard.md`.
