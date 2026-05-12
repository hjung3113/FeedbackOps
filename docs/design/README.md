# Design Documentation

`docs/design` is the product and domain source of truth.

## Document Roles

```text
00-product-overview.md
- Product positioning, system map, non-negotiable interpretation rules.

01-domain-model.md
- Canonical glossary, entity ownership, and domain invariants.

02-requirements-matrix.md
- Requirement IDs, scope status, dependencies, and forbidden requirements.

03-11 system documents
- System behavior, boundaries, workflows, permissions, and MVP exclusions.

12-ui-ux-principles.md
- Product-level UI intent and workflow traceability.

13-mvp-roadmap.md
- Release grouping and recommended success flow.

14-api-draft.md
- Design input for APIs. Not the final implementation authority.

15-data-contracts.md
- Field and enum draft until superseded by docs/implementation/04-database-and-migrations.md.
```

After implementation begins, agents must not treat `14-api-draft.md` or
`15-data-contracts.md` as final contracts when they conflict with
`docs/implementation/03-api-contracts.md`,
`docs/implementation/04-database-and-migrations.md`, or applied migrations.

## Drift Control

```text
- System documents may explain local behavior, but must not redefine canonical entity names.
- Schema blocks in system documents are explanatory drafts.
- Implementation-facing database details belong in docs/implementation/04-database-and-migrations.md.
- Implementation-facing endpoint contracts belong in docs/implementation/03-api-contracts.md.
- Scope changes must update docs/design/02-requirements-matrix.md before roadmap prose.
```
