# Survey creation requires a dialog

## Status

Accepted 2026-08-02. Deviates from `docs/design-prototype/screen-surveys.jsx:123-129` and adds an accessibility affordance beyond `docs/design-prototype/screen-survey-builder.jsx:108-140`. References issues #273 and #234 and root `AGENTS.md` → Prototype Is The Spec.

Amended 2026-10-13 by [ADR-0070](0070-survey-starting-templates-and-definition-reuse.md).

## Context

The Surveys prototype sends `New survey` directly to a builder with a synthetic ID. The production `POST /surveys` contract cannot create that empty record: it requires `type`, `title`, `primary_managed_system_id`, and `responses_identity_protected` before it returns a real Survey ID.

Two required fields cannot receive silent defaults. `primary_managed_system_id` selects the Managed System permission boundary, and `responses_identity_protected` decides respondent privacy. Choosing either without the Actor would turn a consequential product decision into an invisible implementation default.

The prototype also supports pointer drag reordering but provides no keyboard operation for changing question order.

## Decision

`New survey` opens a focused creation dialog that collects the four required fields. Description and Analytics Area remain optional. Managed System choices are limited to the Actor's `survey.manage` scope, and identity protection requires an explicit choice. A successful `POST /surveys` navigates to the builder using the returned Survey ID; the frontend never invents an ID.

The prototype places `New survey` in the list toolbar beside search and view controls. The implementation renders that same visual row inside `SurveyList` rather than the outer route toolbar so the populated and empty states share one handler. This is a component-ownership difference, not a visible placement deviation.

The prototype does not define an empty Survey-list state. The implementation repeats the same `New survey` action in its empty state, using the toolbar action's handler, so an empty workspace does not become a creation dead end.

Question rows also expose explicit move-up and move-down buttons. These are an intentional accessibility addition beyond the prototype's pointer-only drag interaction; both paths update the same local draft order.

## Consequences

- Survey creation has one required dialog step before entering the builder.
- The API receives explicit permission-scope and respondent-privacy decisions, and the builder always opens with a persisted server ID.
- Populated and empty Survey lists expose the same creation action in the prototype's toolbar row.
- Builder question rows add visible keyboard-operable reorder controls beyond the prototype.

## Amended 2026-10-13

[ADR-0070](0070-survey-starting-templates-and-definition-reuse.md) extends the
focused creation dialog with built-in starters and existing Survey question
reuse. Explicit Managed System and privacy choices and navigation using the
persisted server ID remain required; selecting a source never fills these
choices silently. #1073 delivers the built-in backend/shared contract and
#1074 adds existing-definition reuse. Dialog selection (#1075) offers these sources after explicit system selection,
with editable title/type suggestions and read-only previews. Blank creation remains
the initial dialog mode; backend contracts alone do not complete #1047's acceptance.
