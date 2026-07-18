# FeedbackOps Documentation Index

This directory separates product design, frontend UI contracts, and implementation decisions.

## Reading For Implementation

Root `AGENTS.md` → "Required Reading" and "Source Of Truth" decide what to read for a given change.

## What Lives Where

```text
docs/design/
- Product intent, domain language, ownership, requirements, and roadmap.

DESIGN.md
- Visual reference and raw token seed only.

docs/frontend/
- Frontend UI contracts, reusable component rules, routes, layout, and interactions.

docs/tech-stack/
- Approved implementation stack and third-party library governance.

docs/implementation/
- Implementation architecture, API, data, permission, entity-linking, testing, and slice plan.
```

Conflict resolution lives in root `AGENTS.md` → "Source Of Truth" (authority by subject + tiebreaks); this file only describes what each `docs/` directory contains.

## Non-Negotiable Rules

```text
- Survey Response never creates VOC.
- Task Done never automatically resolves reporter-facing VOC status.
- Cross-system relationships use entity_links unless a direct foreign key is explicitly approved.
- Visibility is enforced on every read path.
- Backend permission checks are authoritative; frontend permission states are display hints.
- Dashboard owns recovery queues and projections, not source object lifecycle.
```
