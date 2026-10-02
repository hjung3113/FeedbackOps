# Findings Feature Agent Guide

## Ownership

This folder owns Finding screens and hooks: `FindingDetailPanel` and its panel tree (`FullFindingDetail`, `FindingExecutionSection`, the evidence/link modals, the Finding-owned Request Task draft host, `useFindingDetailController`), plus the Finding read/mutation hooks (`useFindingsList`, `useFindingDetail`, `useFindingStatusMutation`, `useEvidenceHighlights`, `useEvidenceMutations`, `useRequestTaskFromFinding`). The neutral `TaskRequestDraftCard` form and read presentation lives in `features/cross-system/request-task/`.

It does not own source object lifecycles or backend authorization truth.

## Route Boundary

- Finding screens mount at the top-level `/findings` route; `/findings/$findingId` remains a
  redirect to `/findings?selected=:findingId` and preserves `returnTo` when provided. Route files
  live in `apps/frontend/src/routes/_authed/findings/`, not in this folder.
- This folder does not own the entity-link inventory or `/integration/links` — `EntityRelationRow`, `EntityLinksInventoryTable`, `LinkStatusBadge`, and `useEntityLinkInventory` stay under `features/integration/`.

## Rules

- Finding detail is evidence-first and keeps execution links visible.
- Finding detail composes `FindingDetailPanel` → `FullFindingDetail` with separate detail and execution section controllers. Requested-link selection, retry/focus handling, and the draft host belong to `FindingExecutionSection`.
- Other features may use Finding source reads and the Finding-owned Request Task draft host through `features/findings/public.ts`; do not import Finding hook internals across feature boundaries. Survey retains selected-Finding load/ready/error orchestration, and Tasks uses the public Finding read for Task Request source defaults.
- Finding bridges evidence to execution, but backend permission checks remain authoritative; permission-limited content renders approved summaries or a request path.

## Key files

- `apps/frontend/src/routes/_authed/findings/index.tsx` — list, selected-detail state, and list status labels.
- `apps/frontend/src/routes/_authed/findings/$findingId.tsx` — redirects direct Finding deep links
  to the list + selected panel.
- `apps/frontend/src/features/findings/hooks/useFindingsList.ts` — Finding list query.
- `apps/frontend/src/features/findings/components/FindingDetail/FindingDetailPanel.tsx` — loading, blocked, error, and full-detail branches; includes inline blocked copy.
- `apps/frontend/src/features/findings/components/FindingDetail/FullFindingDetail.tsx` — detail fields, actions, and status labels.
- `apps/frontend/src/features/findings/components/FindingDetail/FindingExecutionSection.tsx` — requested Task Request links, retry/focus state, and section actions.
- `apps/frontend/src/features/findings/components/FindingDetail/FindingRequestTaskDraftHost.tsx` — Finding-owned Task Request form host used by Finding and Survey.
- `apps/frontend/src/features/findings/public.ts` — supported source-read and Request Task host edge for other features.
- `apps/frontend/src/features/findings/components/FindingDetail/useFindingDetailController.ts` — detail action and status state, excluding execution-section state.
- `apps/frontend/src/features/findings/hooks/useFindingStatusMutation.ts` — Finding status mutation.
- `apps/frontend/src/features/findings/components/FindingDetail/AddEvidenceModal.tsx` — add-evidence (highlight) dialog.
- `apps/frontend/src/features/findings/hooks/useEvidenceMutations.ts` — evidence link mutations.
- `apps/frontend/src/features/findings/components/FindingDetail/LinkEvidenceModal.tsx` — link-existing-evidence modal.
- `apps/frontend/src/features/findings/components/FindingDetail/LinkTaskModal.tsx` — link-Task dialog.
- `apps/frontend/src/lib/copy/permission-reasons.ts` — shared permission-blocked copy, including the Finding list.

## Verification

- Test Finding action CTAs, evidence summaries, and deep-link action restore when touched.
