# Visual mock API

Add a screen's route fixtures in `support/mock-api/<screen>.ts`. Export a
`create<Screen>Handlers(context)` function that returns entries with an HTTP
`method`, a `path` matcher (exact path or `RegExp`), an optional query matcher,
and a response handler. Compose the new screen's entries in
`support/mock-api.ts` and keep fixture state in `MockApiContext` when handlers
need to share mutations.

`installMockApi` uses first-match precedence. Preserve these shared-route orders:

- `/dashboard/summary`: Integration Dashboard, Home, Coverage.
- `/managed-systems`: Integration Dashboard, Coverage, Milestones, Finding,
  Surveys, then the selected/default fixture.
- `/tasks`: Home's unfiltered list before Milestones' `milestone_id` query.
- `/actors`: Milestones, Triage, VOC scenario, Finding, Survey, default.
- `/analytics-areas`: Coverage, Milestones, Triage, VOC scenario, Finding.
- `/vocs`: Triage, high-no-link inbox, VOC review, reporter Task summary.
- `/surveys`: Survey, Survey Results, Survey Follow-up.
- `/findings`: Finding detail's deep-link fixture before the scenario fallback.

Keep the same-origin fail-closed error in `support/mock-api.ts`; an unanswered
same-origin fetch or XHR should fail the visual spec.
