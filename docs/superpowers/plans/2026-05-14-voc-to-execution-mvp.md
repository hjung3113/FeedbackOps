# VOC To Execution MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable TypeScript MVP that proves the docs-backed VOC-to-execution loop from internal VOC submission through triage, finding, task request review, backlog task creation, reporter conversation, and action dashboard repair queues.

**Architecture:** Use a pnpm monorepo with `apps/backend`, `apps/frontend`, `packages/shared`, and `packages/ui`. The backend is an in-memory Express application service layer for MVP behavior verification; the frontend is a dense Vite/React operational shell that composes shared list/detail/status components before feature screens.

**Tech Stack:** pnpm workspaces, TypeScript, Express, Vitest, Supertest, React, Vite, Testing Library, lucide-react.

---

## Scope Decision

The first coherent MVP target is the VOC-to-execution loop described by `docs/design/13-mvp-roadmap.md` and `docs/implementation/08-mvp-slice-plan.md` Slices 0-7a.

Full Survey builder and response flows are deferred because the docs conflict: `docs/design/02-requirements-matrix.md` and `docs/implementation/03-api-contracts.md` list Survey as MVP, while the slice plan places Survey in Slice 8 after dashboard and VOC conversation. This plan still protects the forbidden invariant by exposing no Survey Response -> VOC API or UI path and rejecting `generated_voc` entity links.

## Deliverables

- Runnable backend health check and in-memory API.
- Runnable frontend app shell with docs-aligned top-level routes.
- Shared semantic UI tokens and reusable components extracted before screens.
- Backend invariant tests for permission, VOC, links, task conversion, and dashboard queues.
- Frontend tests for route shell, status separation, permission blocked states, and VOC-to-task screen flow.
- `pnpm lint`, `pnpm test`, and `pnpm build` scripts.
- Branch pushed and PR opened after verification.

## File Structure

- Create `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, and `.gitignore`.
- Create `packages/shared/src/index.ts` for domain vocabulary, DTOs, schemas, and pure validation helpers.
- Create `packages/ui/src/*` for tokens, primitives, product components, and domain display components.
- Create `apps/backend/src/*` for Express setup, mock auth, in-memory store, domain modules, and route tests.
- Create `apps/frontend/src/*` for app shell, route parsing, API client, feature screens, and component tests.

## Task 1: Workspace Foundation

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `packages/shared/package.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/ui/package.json`
- Create: `packages/ui/src/index.ts`
- Create: `apps/backend/package.json`
- Create: `apps/backend/src/index.ts`
- Create: `apps/frontend/package.json`
- Create: `apps/frontend/index.html`
- Create: `apps/frontend/src/main.tsx`

- [ ] **Step 1: Write failing foundation smoke tests**

Add package scripts that will fail until app code exists:

```json
{
  "scripts": {
    "lint": "tsc -b --pretty false",
    "test": "pnpm -r test",
    "build": "pnpm -r build"
  }
}
```

- [ ] **Step 2: Run foundation command to verify failure**

Run: `pnpm test`
Expected: FAIL because workspace packages and tests are not implemented.

- [ ] **Step 3: Implement minimal workspace**

Add workspace manifests, TS config, and empty package exports.

- [ ] **Step 4: Run foundation verification**

Run: `pnpm test`
Expected: PASS for empty smoke tests.

## Task 2: Shared Domain Contract And Backend Invariant Tests

**Files:**
- Modify: `packages/shared/src/index.ts`
- Create: `apps/backend/src/domain.test.ts`
- Create: `apps/backend/src/app.ts`
- Create: `apps/backend/src/mvp.ts`

- [ ] **Step 1: Write failing backend tests**

Tests must cover:

```text
- POST /vocs requires managed_system_id.
- POST /vocs rejects reporter-submitted severity.
- VOC analytics_area_id must belong to managed_system_id.
- Reporter cannot patch title or description after triage begins.
- Managed System scope blocks sibling Managed System access.
- Explicit Deny overrides Allow.
- POST /entity-links rejects generated_voc.
- Cross-workspace entity links are rejected.
- Task Done and Released do not auto-resolve reporter-facing VOC status.
- POST /survey-responses/:id/create-voc returns 404.
```

- [ ] **Step 2: Run backend tests to verify red**

Run: `pnpm --filter @feedbackops/backend test`
Expected: FAIL with missing routes/domain behavior.

- [ ] **Step 3: Implement minimal shared types and backend services**

Implement in-memory actors, managed systems, analytics areas, VOCs, links, findings, task requests, tasks, audit events, permissions, and dashboard queue queries.

- [ ] **Step 4: Run backend tests to verify green**

Run: `pnpm --filter @feedbackops/backend test`
Expected: PASS.

## Task 3: Cross-System MVP Flow Tests And API Implementation

**Files:**
- Modify: `apps/backend/src/domain.test.ts`
- Modify: `apps/backend/src/mvp.ts`
- Modify: `apps/backend/src/app.ts`

- [ ] **Step 1: Add failing VOC-to-execution flow tests**

Tests must cover:

```text
- User creates VOC with Managed System.
- Admin triages VOC and assigns severity.
- Admin creates VOC Cluster and creates Finding from cluster.
- Finding preserves source through entity link.
- Finding creates Task Request.
- Admin approves and converts Task Request to Backlog Task.
- Dashboard high-severity follow-up queue clears after required links exist.
- Public Update, Reporter Reply, and Internal Comment are separate append-only entry types.
- Reporter Summary excludes raw task status, priority, internal comments, developer names, severity, and confidence.
```

- [ ] **Step 2: Run backend tests to verify red**

Run: `pnpm --filter @feedbackops/backend test`
Expected: FAIL on missing cross-system commands.

- [ ] **Step 3: Implement cross-system commands**

Use application service functions for source-shaped routes. Target writes must go through target-owned service functions and create entity links and audit events.

- [ ] **Step 4: Run backend tests to verify green**

Run: `pnpm --filter @feedbackops/backend test`
Expected: PASS.

## Task 4: Shared UI Components First

**Files:**
- Create: `packages/ui/src/tokens.css`
- Create: `packages/ui/src/primitives.tsx`
- Create: `packages/ui/src/components.tsx`
- Modify: `packages/ui/src/index.ts`
- Create: `packages/ui/src/components.test.tsx`

- [ ] **Step 1: Write failing component tests**

Tests must cover:

```text
- ObjectList marks selected rows.
- DetailPanel renders permission blocked state.
- StatusBadge distinguishes reporter VOC status from Task status.
- ActionQueueRow exposes next action text.
- RichContentEditor rejects base64 and external inline image strings.
```

- [ ] **Step 2: Run UI tests to verify red**

Run: `pnpm --filter @feedbackops/ui test`
Expected: FAIL on missing components.

- [ ] **Step 3: Implement components**

Use semantic tokens and compact list-first layout. Components must not call APIs or own domain mutations.

- [ ] **Step 4: Run UI tests to verify green**

Run: `pnpm --filter @feedbackops/ui test`
Expected: PASS.

## Task 5: Frontend App Shell And MVP Screens

**Files:**
- Create: `apps/frontend/src/App.test.tsx`
- Create: `apps/frontend/src/App.tsx`
- Create: `apps/frontend/src/api.ts`
- Create: `apps/frontend/src/fixtures.ts`
- Create: `apps/frontend/src/features/home/HomePage.tsx`
- Create: `apps/frontend/src/features/voc/VocPage.tsx`
- Create: `apps/frontend/src/features/integration/IntegrationPage.tsx`
- Create: `apps/frontend/src/features/tasks/TasksPage.tsx`
- Create: `apps/frontend/src/features/admin/AdminPage.tsx`
- Modify: `apps/frontend/src/main.tsx`

- [ ] **Step 1: Write failing frontend tests**

Tests must cover:

```text
- Home renders action dashboard as first screen.
- Navigation exposes Home, My Work, VOC, Surveys, Tasks, Integration, Admin for Admin fixture.
- VOC page renders list, selected detail, reporter-facing status, internal triage status, and separate conversation composers.
- Permission blocked panel renders safe summary instead of blank content.
- No UI affordance exists for Survey Response -> VOC.
```

- [ ] **Step 2: Run frontend tests to verify red**

Run: `pnpm --filter @feedbackops/frontend test`
Expected: FAIL on missing app shell/screens.

- [ ] **Step 3: Implement frontend**

Compose shared UI components from `packages/ui` and route surfaces from `docs/frontend/routes-and-layout.md`.

- [ ] **Step 4: Run frontend tests to verify green**

Run: `pnpm --filter @feedbackops/frontend test`
Expected: PASS.

## Task 6: Verification, Commit, Push, PR

**Files:**
- Modify only files required by previous tasks.

- [ ] **Step 1: Run full verification**

Run:

```bash
pnpm lint
pnpm test
pnpm build
git status --short
```

Expected: typecheck, tests, and builds pass; git status shows only intended changes.

- [ ] **Step 2: Browser verification**

Run frontend locally and inspect:

```text
- desktop >= 1024px
- tablet 768-1023px
- mobile < 768px
```

Expected: AppShell, list, selected detail, and permission-blocked states are non-overlapping and readable.

- [ ] **Step 3: Commit and push**

Run:

```bash
git add .
git commit -m "feat: implement VOC-to-execution MVP scaffold"
git push -u origin feat/mvp-foundation
```

- [ ] **Step 4: Open PR**

Run:

```bash
gh pr create --base main --head feat/mvp-foundation --title "Implement VOC-to-execution MVP scaffold" --body-file /tmp/feedbackops-mvp-pr.md
```

PR body must include scope, tests, deferred Survey rationale, and docs traceability.
