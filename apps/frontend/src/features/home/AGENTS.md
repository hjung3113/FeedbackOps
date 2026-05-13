# Home Feature Agent Guide

## Ownership

Home owns the landing action queue surface for the current actor, workspace, and Managed System scope.

Home is not a chart-only dashboard and must not duplicate source-system workflow logic.

## Route Boundary

- Owns `/`.
- May deep-link into VOC, Tasks, Surveys, Integration, or Admin routes with action intent.
- Must preserve AppShell and permission-aware summaries for direct route access.

## Rules

- Prioritize backend-provided next actions over decorative metrics.
- Show only queues and summaries allowed for the actor.
- Include source object type, source object id, target route, selected object, and action intent in next-action links.
- Managed System scope is a filter/defaulting context, not a separate Home tree.

## Verification

- Test Role Level-specific Home content, Managed System filtering, permission-limited summaries, and deep links when touched.
