# Implementation Architecture

## Purpose

This document defines repository shape, module boundaries, and dependency direction.

## Repository Shape

```text
apps/backend
- HTTP API
- application services
- domain modules
- database access
- migrations
- background jobs

apps/frontend
- React/Vite UI
- route composition
- feature screens
- typed API client usage

packages/shared
- generated API types
- validation schemas
- enum constants
- DTO helpers
- no DB access
- no domain workflow orchestration

packages/ui
- reusable visual components from docs/frontend/*
- no API calls
- no domain mutation logic

docs/design
- product and domain source of truth

docs/frontend
- UI implementation contracts

docs/implementation
- implementation constraints
```

## System, App, And Module Meaning

FeedbackOps Suite is a set of bounded product systems implemented inside one
modular monolith for MVP.

```text
Product systems:
- Core Platform
- VOC
- Finding / Insight
- Task
- Survey
- Dashboard
- Permission / Access
- Entity Linking / Cross-System Workflow

Deployable app shells:
- apps/backend
- apps/frontend

Implementation boundaries:
- apps/backend/src/modules/{module}
- apps/frontend/src/features/{feature}
```

Product systems are independent in ownership and workflow rules, not separate
deployable applications. Do not create `systems/{system}/frontend` or
`systems/{system}/backend` unless an approved architecture decision introduces
independent deployment, team ownership, or package-level reuse that requires it.

## Backend Layers

Each backend domain module should use:

```text
routes/controllers
- HTTP only
- request parsing
- response mapping

application services
- transaction orchestration
- permission checks
- audit events
- entity link side effects
- idempotency behavior

domain services
- local business rules owned by the module

repositories
- database access for owned tables only

read models
- list, detail, dashboard, and projection queries
```

Controllers must not create cross-system records directly.

## Dependency Direction

Allowed:

```text
- domain modules -> core interfaces/types
- domain modules -> entity-linking application API
- domain modules -> permission check API
- dashboard -> domain read/query interfaces
- frontend features -> typed API client + packages/ui
- packages/ui -> design tokens
```

Forbidden:

```text
- core -> voc/finding/task/survey/dashboard modules
- packages/shared -> apps/backend or apps/frontend
- frontend -> backend internals
- domain repositories querying another domain's owned tables except through approved read models
- UI components enforcing backend permission decisions as source of truth
```

## Cross-System Command Rule

Cross-system commands must run in an application service that:

```text
- validates workspace ownership
- validates the Primary Managed System for scoped records
- checks permission
- writes the target object
- writes required entity_links
- writes audit events when required
- returns data for frontend pending or optimistic states
- is idempotent when retried
```

Source-shaped routes may exist for API and UX clarity, such as
`POST /vocs/:id/create-finding`. The route shape does not grant write ownership
to the source module. Target object writes must go through the target module's
application command or an approved cross-system orchestration service.

Examples:

```text
- VOC -> Finding
- VOC Cluster -> Finding
- Survey Response -> Finding
- Finding -> Task Request
- Task Request -> Task
- Finding -> linked existing Task
- VOC -> Task Request
- Finding -> Work Initiative or Milestone only when future execution grouping is enabled
- Task Released -> reporter-facing status review candidate
```

## Managed System Scope

MVP scope, filtering, defaulting, and Developer permission checks are based on
Managed System, not Project. Core owns the Managed System Registry, Product
Areas, Actors, Role Levels, audit logs, and shared attachment governance.

Implementation implications:

```text
- VOC, Finding, Task Request, Task, and Survey records require managed_system_id.
- Analytics Areas belong to exactly one Managed System.
- Analytics Area is business context, not an MVP permission boundary.
- Work Initiative or Project may later group execution work, but it must not replace managed_system_id for MVP authorization or defaults.
```
