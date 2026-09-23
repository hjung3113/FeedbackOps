# Implementation Documentation

These documents convert product design into implementation constraints.

## Required Reading Order

```text
1. 00-architecture.md
2. 01-coding-conventions.md
3. 02-domain-module-boundaries.md
4. 03-api-contracts.md
   - Domain contracts are docs/implementation/api/*.md.
5. 04-database-and-migrations.md
6. 05-permission-policy.md
   - Check order, audit event verbs, sensitive capabilities, decision endpoints.
   - The capability matrix and default-user boundary are docs/design/09-permission-access.md. Do not duplicate the matrix here.
7. 06-entity-linking-contract.md
8. 07-testing-strategy.md
9. 08-mvp-slice-plan.md
   Shipped-slice record, not an open queue. Release grouping is docs/design/13-mvp-roadmap.md.
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
- Follow the root `AGENTS.md` Source Of Truth rules: CONTEXT.md owns vocabulary and invariants, and docs/adr/*.md own architectural decisions; ADR authority does not end when a decision is incorporated into design docs.
- 04-database-and-migrations.md owns migration mechanism only.
- docs/design/15-data-contracts.md is the field and enum authority.
- docs/implementation/06-entity-linking-contract.md owns relation type meaning and visibility rules.
- Endpoint authority is docs/implementation/03-api-contracts.md (index, global rules, error codes, contract template) together with docs/implementation/api/*.md (behavior and catalog in the same domain file). No other document is an endpoint authority.
- 05-permission-policy.md owns check order and audit event verbs. docs/design/09-permission-access.md owns the capability matrix and default-user UX.
```

Current implementation alignment rules:

```text
- Managed System replaces Project as the MVP scope, filter, defaulting, and Developer permission boundary.
- Analytics Area belongs to one Managed System and is not an MVP permission boundary.
- Project or Work Initiative is future execution grouping only unless a later ADR changes this.
- Rich content is WYSIWYG-first; inline images are attachment references, not base64 body data or external inline image URLs.
```
