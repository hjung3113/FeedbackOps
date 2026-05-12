# FeedbackOps Documentation Index

This directory separates product design, frontend UI contracts, and implementation decisions.

## Reading Order For Implementation

```text
1. docs/design/00-product-overview.md
2. docs/design/01-domain-model.md
3. docs/design/02-requirements-matrix.md
4. docs/design/10-cross-system-workflows.md
5. docs/design/11-entity-linking.md
6. docs/design/12-ui-ux-principles.md
7. docs/frontend/README.md
8. docs/implementation/README.md
9. The target system design document
10. DESIGN.md when visual token input is needed
```

## Source Of Truth

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

When documents appear to conflict, use this precedence:

```text
1. Domain names, invariants, and ownership: docs/design/01-domain-model.md
2. Requirement IDs and scope status: docs/design/02-requirements-matrix.md
3. Implementation structure and code boundaries: docs/implementation/*
4. Frontend component and interaction contracts: docs/frontend/*
5. Raw visual tokens: DESIGN.md
```

## Non-Negotiable Rules

```text
- Survey Response never creates VOC.
- Task Done never automatically resolves reporter-facing VOC status.
- Cross-system relationships use entity_links unless a direct foreign key is explicitly approved.
- Visibility is enforced on every read path.
- Backend permission checks are authoritative; frontend permission states are display hints.
- Dashboard owns recovery queues and projections, not source object lifecycle.
```
