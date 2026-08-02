# Admin Permission Request UX deviations

## Status

Accepted 2026-08-02. Records approved decisions D1 and D8 for issues #288 and #276. Deviates from `docs/design-prototype/screen-admin-settings.jsx:209-217`, `docs/design-prototype/screenshots/final-baselines/admin-settings.png`, `docs/design-prototype/screen-permissions.jsx:310-315`, and `docs/design-prototype/screenshots/final-baselines/admin-permissions.png`.

## Context

`docs/design-prototype/screen-admin-settings.jsx` and its final baseline label the self-approval setting as `Self-approval of Task Request`. The production workspace setting is only `permission_self_approval`, which governs Permission Requests; Task Request self-approval is governed separately by ADR-0026.

The permission review prototype header shows `Permission`. Production previously rendered the shared `DetailPanelHeader` with `kind="task"`, producing a Task/TASK header for a Permission Request.

## Decision

The setting is labeled `Self-approval of Permission Request` and includes a one-line statement that Task Request self-approval follows ADR-0026 and is unrelated to this setting.

The production permission review detail uses a local `Permission Request` header at the established 50px toolbar rhythm and displays the requester display name with the UUID as secondary metadata. Email is never rendered.

D7, D9, and D13 are approved prototype-silent state extensions: inline dialog validation and focus recovery, an already-archived action state, and a blocked non-requestable contact path. They do not introduce a broader layout change.

## Consequences

The two approved production corrections intentionally differ from their prototype references without changing either permission policy or Task Request behavior.
