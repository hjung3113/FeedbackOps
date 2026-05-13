# Implementation Documentation

These documents convert product design into implementation constraints.

## Required Reading Order

```text
1. 00-architecture.md
2. 01-coding-conventions.md
3. 02-domain-module-boundaries.md
4. 03-api-contracts.md
5. 04-database-and-migrations.md
6. 05-permission-policy.md
7. 06-entity-linking-contract.md
8. 07-testing-strategy.md
9. 08-mvp-slice-plan.md
```

## Implementation Gates

Implementation should not start until these are reviewed for the target slice:

```text
- module ownership and dependency direction
- API request/response and errors
- permission requirement
- entity_links side effects
- audit events
- required tests
- frontend route and state behavior
```

## Authority Rules

```text
- CONTEXT.md and docs/adr/*.md own resolved domain decisions until incorporated into design docs.
- 03-api-contracts.md owns endpoint behavior.
- 04-database-and-migrations.md owns migration and storage rules.
- docs/design/15-data-contracts.md owns design-level field and enum vocabulary until replaced by migrations.
- docs/design/11-entity-linking.md owns relation type meaning and visibility rules.
- docs/design/14-api-draft.md is historical design input only where not restated here.
```

Current implementation alignment rules:

```text
- Managed System replaces Project as the MVP scope, filter, defaulting, and Developer permission boundary.
- Analytics Area belongs to one Managed System and is not an MVP permission boundary.
- Project or Work Initiative is future execution grouping only unless a later ADR changes this.
- Rich content is WYSIWYG-first; inline images are attachment references, not base64 body data or external inline image URLs.
```
