# ADR-0057: Approved UX deviations from the prototype (#579)

Date: 2026-10-01

## Status

Accepted 2026-09-30 by the owner (#579; language policy #580). All nine deviations are approved; B2 additionally
requires the owner to see a rendered design of the first implementation before it merges.

B8 and B9 came from the 2026-10-01 pre-release audit (#685).

## Context

The 2026-09-30 design review (#578) found places where following the prototype verbatim hurts users. The owner reviewed
nine proposed deviations on an interactive before/after page and approved all of them (#579). The prototype remains the
spec for everything not listed here. A1/A2 are implemented by #613; B1–B6 by #615; B7 by #616.

## Decisions

### A1 — Display labels for enum values

Show user-facing display labels for serialized enum values. Keep API payloads, query values, and stored enum values unchanged. Use exhaustive label maps keyed by shared enum types so a new enum value requires a corresponding label.

### A2 — Korean-first field and action copy

Use Korean for field labels and action buttons on Korean-language surfaces. Keep established product terms in English: `VOC`, `Finding`, `Task`, `Task Request`, `Managed System`, `Analytics Area`, `Triage`, `Milestone`, and `Cluster`. A short product term or wording that would be awkward in Korean may also remain English. Prototype wording remains authoritative for all copy outside these exceptions.

### B1–B7 — Layout and interaction deviations

| Item | Deviation | Implemented by |
|---|---|---|
| B1 | Home queues: half-width cards become a full-width list | #615 |
| B2 | One primary action per decision area; after a decision, show the status and the next action only (the owner reviews the rendered first implementation before merge) | #615 (Task Request panel groundwork in #610) |
| B3 | Clipped tab strips get an overflow affordance | #615 |
| B4 | The scope selector is not clipped: name plus a one-line qualifier | #615 |
| B5 | One blocked/empty state per region, in the same placement everywhere | #615 |
| B6 | Managed System marks come from identity tokens everywhere | #615 |
| B7 | Native `select`/date inputs become the shared Select and a new shared DatePicker | #616 |
| B8 | Board has no standalone Task creation control; it points to Task Request conversion (owner, 2026-10-01) | #669 |
| B9 | Internal-sounding prototype copy rewritten (MVP, particle spacing, table names, metric keys) | owner, 2026-10-01, #683 |

## Consequences

Frontend copy maps render labels without changing enum values sent to APIs. Korean-language field labels and action buttons may differ from the prototype where A2 applies. ADR-0010's former screen-mixing rule is refined for these labels and buttons only.
