# Home Feature Agent Guide

## Ownership

Home owns the landing action queue surface for the current actor, workspace, and Managed System scope.

Home is not a chart-only dashboard and must not duplicate source-system workflow logic.

## Route Boundary

- Owns `/home`.
- `/` is an entry-only route that redirects authenticated actors to `/home` and unauthenticated actors to `/login`.
- May deep-link into VOC, Tasks, Surveys, Integration, or Admin routes with action intent.
- Must preserve AppShell and permission-aware summaries for direct route access.

## Rules

- Prioritize backend-provided next actions over decorative metrics.
- Show only queues and summaries allowed for the actor.
- Include source object type, source object id, target route, selected object, and action intent in next-action links.

## Key files

- `apps/frontend/src/routes/_authed/home.tsx` — Home route and URL state.
- `apps/frontend/src/features/home/HomeScreen.tsx` — Home queues, assigned-work panel, and coverage surface.
- `apps/frontend/src/features/home/InboxPanel.tsx` — notification inbox list, filters, and empty/error states.
- `apps/frontend/src/features/home/homeNavigation.tsx` — Home sidebar queue destinations.
- `apps/frontend/src/lib/copy/home.ts` — Home, queue, coverage, and notification inbox copy.

## Verification

- Test Role Level-specific Home content, Managed System filtering, permission-limited summaries, and deep links when touched.

## Permission close-out contract

- ADR-0066 accepts owner-scoped Permission Request detail from Home open-request rows (implementation pending): same-ID pending edit, needs_more_info supplementation with the latest Admin question, and requester-only `요청 철회`.
- Render server allowed actions/scope candidates and send expected_revision. Preserve unsaved input and focus on stale/error responses; form closing is not withdrawal.
- Withdrawal removes only the affected open row; refresh relevant mine/check/scope queries. Requester detail must not expose Admin risk/deny internals or email.
