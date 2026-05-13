# Admin Feature Agent Guide

## Ownership

Admin owns frontend route composition for Managed System Registry, Product Areas, Permission Requests, workspace settings, and administrative review queues.

It does not own source-system lifecycles, Entity Link relation semantics, or application-service permission decisions.

## Route Boundary

- Owns `/admin/managed-systems`, `/admin/product-areas`, `/admin/permissions/requests`, and `/admin/settings`.
- Product Areas, Permission Requests, Managed System Registry, and workspace settings are Admin routes, not top-level work routes.

## Invariants

- Product Area is business context, not a forced mirror of routes or code modules.
- Managed System Registry provides scope, filters, and default owners/reviewers; it does not create separate route trees.
- Explicit Deny overrides general Allow.
- Sensitive permission decisions are auditable.

## Rules

- Product Area management should use a compact tree and detail panel.
- Permission Request review should show requester, scope, reason, risk, expiration, and decision state.
- Managed System defaults prefill responsibility; they do not remove explicit owner/reviewer fields from records.
- Do not expose complex permission matrix builders in MVP.

## Verification

- Test Product Area tree restore, Managed System default editing, permission approval/rejection/revocation states, explicit deny display, and blocked-state return paths when touched.
