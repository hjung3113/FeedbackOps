# Core Module Agent Guide

## Ownership

Core owns workspace and actor context, teams, Managed System Registry, Analytics Areas, Role Level vocabulary, shared identifiers, shared attachment governance, and audit log append APIs.

Analytics Areas, the Managed System Registry, and attachment governance are implemented as separate top-level module directories (`../analytics-areas/`, `../managed-systems/`, `../attachments/`) but logically owned by Core for boundary/permission purposes.

## Boundaries

- Core must not import VOC, Finding, Task, Survey, Dashboard, Permission, or frontend modules.
- Core must not own lifecycle rules for domain objects outside its ownership list.
- Core must not decide reporter-facing VOC status.
- Analytics Area is business context and historical classification; do not force it to mirror UI routes or product code modules.
- Managed System Registry provides MVP scope, filters, and default owner/reviewer inputs; it does not create separate system instances.

## Rules

- Do not add domain-specific lifecycle, status, workflow, or reporting logic to Core.
- Expose stable interfaces for workspace checks, actor context, Analytics Area lookup, and audit appends.
- Expose stable interfaces for Managed System lookup and default owner/reviewer resolution inputs.
- Audit APIs must preserve actor, workspace, target, action, timestamp, and safe metadata.

## Permission audit projection (ADR-0066; proposed/new)

Core supplies the approved workspace/request-scoped latest Admin-question audit
projection for Permission requester detail. Keep storage reads inside Core and
return only the allowed question metadata. Permission supplies authorization and
owns requester lifecycle/risk; Core must not import Permission or decide access.

## Close-out contract (ADR-0067; implementation pending)

- ADR-0067 accepts proposed/new Managed System reviewer Actor/team inputs alongside owner.
  Core-owned registry/Analytics Area seams provide transaction-aware inputs, not destination
  eligibility or assignment writes. No runtime import of Dashboard/source commands.
- Teams can be responsibility targets without new CRUD/membership or permission grants;
  defaults do not retroactively reassign records. Survey operator routing is independent.

## Audit and cached Survey responses (ADR-0064; cutover pending)

#740 revokes raw `core.audit_log` SELECT from `fops_app`, retaining INSERT and
no UPDATE/DELETE. Preserve canonical Actor/subject/detail identifiers, append-only
history and same-transaction accountability; controlled migrate/operator reads
supply test observations. No broad app-readable audit definer. Inventory consumers
before cutover. ADR-0015 permits only targeted sanitization of confirmed legacy
Survey-generated cached Finding responses, preserving Actor/key/hash/status and
exactly-once side effects; no unrelated cache reset or authored-text rewrite.
