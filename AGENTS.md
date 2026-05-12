# FeedbackOps Agent Guide

## Operating Rules

- Think before editing. State assumptions when the request can be read in more than one way.
- Prefer the smallest change that satisfies the request. Do not add speculative flexibility.
- Touch only files required by the task. Mention unrelated issues instead of fixing them.
- Match existing docs and implementation patterns before inventing new structure.
- Every changed line must trace to a user request, a documented invariant, or a failing verification.
- For multi-step work, define success criteria and verify them before claiming completion.
- If domain rules conflict with generic framework habits, follow the domain rules.

## Monorepo Boundaries

Do not place source code at the repository root. Keep cross-app code in `packages/*` only when both apps need it.

Product systems such as VOC, Finding, Task, Survey, Dashboard, Permission, and
Entity Linking are bounded contexts inside the app shells. They are not separate
deployable apps in the MVP architecture.

## Required Reading Order

Before implementation that changes product behavior, API contracts, domain rules, routing, or shared components, read:

1. `docs/README.md`
2. `docs/design/00-product-overview.md`
3. `docs/design/01-domain-model.md`
4. `docs/design/02-requirements-matrix.md`
5. `docs/design/10-cross-system-workflows.md`
6. `docs/design/11-entity-linking.md`
7. `docs/design/12-ui-ux-principles.md`
8. `docs/frontend/README.md`
9. `docs/implementation/README.md`
10. The `docs/design/*` file matching the touched product system: VOC, Finding, Task, Survey, Dashboard, Permission, or Entity Linking.

## Source Of Truth

- Endpoint behavior: `docs/implementation/03-api-contracts.md`.
- Database and migrations: `docs/implementation/04-database-and-migrations.md`.
- Module ownership: `docs/implementation/02-domain-module-boundaries.md`.
- Permission decisions: `docs/implementation/05-permission-policy.md`.
- Entity links: `docs/implementation/06-entity-linking-contract.md`.
- Frontend routes and panels: `docs/frontend/routes-and-layout.md`.
- Component contracts: `docs/frontend/ui-design-system.md` and `docs/frontend/component-inventory.md`.
- Visual token seed only: `DESIGN.md`.

## Product Invariants

- VOC is customer or user-submitted voice; never create VOC from Survey Response.
- Finding is the bridge from evidence to execution.
- Task Request protects the Task backlog from unreviewed execution candidates.
- Task status and reporter-facing VOC status are separate state machines.
- Dashboard is an action queue surface, not a chart-only reporting page.
- Product Area is business context, not a forced mirror of routes or code modules.
- Cross-system history is canonical through `entity_links`, not convenience columns.

## Implementation Boundaries

- Backend controllers parse HTTP and map responses only.
- Backend application services own transactions, permissions, audits, idempotency, and cross-system commands.
- Repositories write only tables owned by their module.
- Source-shaped routes do not grant write ownership to the source module.
- Frontend screens compose typed API hooks and shared components; they do not enforce backend permissions as truth.
- `packages/shared` must not import either app.
- `packages/ui` must not call APIs or own domain mutations.

## Verification

- For behavior changes and bug fixes, write or update the failing test first, then implement the smallest change that makes it pass.
- If TDD is not practical for the change, state why before implementation and still add verification for the touched behavior.
- Add or update tests for product invariants touched by the change.
- For frontend work, verify desktop, tablet, and mobile states when layout or interaction changes.
- For backend work, verify permissions, entity link side effects, and audit behavior when touched.
- If verification cannot run, report the exact command and blocker.

## Codex Cloud

This repository can be used from Codex Cloud after connecting `hjung3113/FeedbackOps` in ChatGPT Codex.

Use `docs/codex-cloud-setup.md` when creating or updating the Codex Cloud environment. The setup command should be:

```bash
bash scripts/codex-cloud-setup.sh
```

This repo is currently a documentation and architecture scaffold for FeedbackOps. It defines app boundaries under `apps/*` and shared package boundaries under `packages/*`, but it does not yet contain package manager lockfiles, application source code, migrations, or test projects. Do not invent install, build, database, or test commands until the matching project files exist.

For any new Codex task:

1. Read `AGENTS.md`.
2. Read any nested `AGENTS.md` that applies to the requested path.
3. Read `docs/README.md`.
4. Follow the required reading order for product, frontend, backend, or shared package work.
5. Keep changes limited to files required by the user request.

When asked to review a pull request, prioritize product invariant violations, ownership boundary violations, missing verification, accidental source code at the repository root, mismatches between docs and nested agent guides, and frontend changes that break the dense list-first operational UI model.
