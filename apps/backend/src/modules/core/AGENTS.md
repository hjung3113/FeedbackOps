# Core Module Agent Guide

## Ownership

Core owns workspace and actor context, teams, Managed System Registry, Product Areas, Role Level vocabulary, shared identifiers, shared attachment governance, and audit log append APIs.

## Boundaries

- Core must not import VOC, Finding, Task, Survey, Dashboard, Permission, or frontend modules.
- Core must not own lifecycle rules for domain objects outside its ownership list.
- Core must not decide reporter-facing VOC status.
- Product Area is business context and historical classification; do not force it to mirror UI routes or product code modules.
- Managed System Registry provides MVP scope, filters, and default owner/reviewer inputs; it does not create separate system instances.

## Rules

- Do not add domain-specific lifecycle, status, workflow, or reporting logic to Core.
- Expose stable interfaces for workspace checks, actor context, product area lookup, and audit appends.
- Expose stable interfaces for Managed System lookup and default owner/reviewer resolution inputs.
- Audit APIs must preserve actor, workspace, target, action, timestamp, and safe metadata.
