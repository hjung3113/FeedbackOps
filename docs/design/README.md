# Design Documentation

`docs/design` holds product intent and system design contracts; authority follows subject (root `AGENTS.md` → Source Of Truth).

## Document Roles

```text
00-product-overview.md
- Product positioning, system map, non-negotiable interpretation rules.

01-domain-model.md
- Entity ownership and system boundaries. Glossary and stable invariants live in root `CONTEXT.md`.

02-requirements-matrix.md
- Requirement IDs, scope status, dependencies, and forbidden requirements.

03-11 system documents
- System behavior, boundaries, workflows, permissions, and MVP exclusions.

09-permission-access.md
- Permission UX and what each role can do: default user can/cannot, and the only capability matrix.
- Does not own check order or audit event verbs. Those are docs/implementation/05-permission-policy.md.

12-ui-ux-principles.md
- Product-level UI intent and workflow traceability.

13-mvp-roadmap.md
- Release grouping and recommended success flow.
- Not an execution queue; slice status is the GitHub milestones.

15-data-contracts.md
- Field and enum authority. Not a draft, and not replaced by migrations.
```

Endpoint authority is `docs/implementation/03-api-contracts.md` (index, global rules, error codes, contract template) together with `docs/implementation/api/*.md` (behavior and catalog in the same domain file). No other document is an endpoint authority.

## Drift Control

```text
- System documents may explain local behavior, but must not redefine canonical entity names.
- Schema blocks in system documents are explanatory drafts.
- Field and enum contracts belong in docs/design/15-data-contracts.md. docs/implementation/04-database-and-migrations.md owns migration mechanism only.
- Scope changes must update docs/design/02-requirements-matrix.md before roadmap prose.
- Do not copy the 09 capability matrix into docs/implementation/05-permission-policy.md, and do not copy check order or audit verbs back into 09.
```
