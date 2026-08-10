# Finding-to-Task conversion chain decisions

## Status

Accepted 2026-08-03. Amends ADR-0027's conversion consequences for a Task
Request whose source is a Finding.

## Context

ADR-0025 introduced the `Finding -> Task Request` tracer, ADR-0026 separated
approval from conversion, and ADR-0027 made an approved Task Request the
source of a new Backlog Task. The conversion form needs a useful default title
and the completed chain must preserve both the operational Finding projection
and canonical cross-system history.

The source records do not share one universal title contract. In particular,
the Task title limit belongs to the canonical shared
`convertTaskRequestRequestSchema`; it is not a frontend-owned value and must
not be duplicated as a conversion-form literal. Increasing the Task limit to
absorb a longer source title would silently change the Task entity contract.

`finding.linked_task_id` is the single-field operational projection used by
the Finding UI and the duplicate Task-request-prevention decision. It is not
canonical relationship history: that remains an active `entity_links` row, as
required by the domain and module-boundary contracts.

## Decision

1. Preserve each entity-specific maximum length. Task conversion does not
   expand the Task title maximum to accommodate another entity's title. The
   conversion form derives its title maximum from the canonical shared
   `convertTaskRequestRequestSchema`, rather than declaring a second numeric
   limit.

2. When a source-derived default exceeds that maximum, create a meaningful,
   visibly truncated default that fits the Task title contract. The default
   must make truncation apparent (for example, with an ellipsis) and must not
   silently submit a clipped source string. The actor may edit the title before
   submitting.

3. Do not disable Convert to Task merely because the title is empty or
   invalid. A disabled submit hides the reason and prevents focused recovery.
   On submit, render an inline validation error and move focus to the title
   field. This applies the same interaction principle established for issue
   #277: a recoverable validation failure is explained at the point of action,
   not represented only by an unavailable control.

4. In the same conversion transaction, when the Task Request source is a
   Finding and that Finding has no linked Task, write both facts:

   ```text
   finding.linked_task_id = new Task id
   (finding, task, requested_task) active entity link
   ```

   The direct field is the operational projection; the entity link is the
   canonical, auditable cross-system history. Neither substitutes for the
   other. The transaction also retains ADR-0027's Task Request -> Task
   `converted_to` link, Task Request status update, and conversion audit.

5. If that source Finding is already linked to a different Task, approved
   conversion still succeeds: create the new Task and complete the Task
   Request -> Task conversion normally. Preserve the existing
   `linked_task_id`, but still create the new `(finding, task,
   requested_task)` entity link in the same transaction. The direct field is
   one operational/UI decision; entity links are the many-record canonical
   history and must retain this approved conversion. Operational work must not
   be blocked by a pre-existing Finding link, and the existing projection must
   not be overwritten.

6. A Task Request sourced from `voc` or `voc_cluster` is a no-op for this
   Finding-specific projection: conversion writes neither a Finding backlink
   nor a Finding -> Task entity link. Their existing source provenance rules
   remain unchanged.

## Consequences

- Task title validation has one canonical runtime source and form behavior
  stays aligned with it as the contract changes.
- A Finding can make one operational linked-Task decision while retaining the
  full cross-system relationship history through entity links.
- Conversion is resilient to historical or concurrent Finding links: it does
  not overwrite an earlier operational decision, retains every approved
  Finding -> Task historical link, and does not prevent work from entering the
  backlog.
- For a previously unlinked Finding, its new operational projection and
  canonical entity link are atomic with conversion. A conflicting existing
  projection deliberately has no replacement, while its new canonical link is
  still atomic with conversion.
- ADR-0027's general conversion, authorization, Task Request -> Task
  provenance, and source-link preservation rules otherwise remain in force.
