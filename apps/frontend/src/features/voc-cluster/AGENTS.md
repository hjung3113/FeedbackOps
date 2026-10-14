# VOC Cluster Feature Agent Guide

## Ownership

VOC Cluster owns frontend route composition and mutations for VOC Cluster list, detail, membership management, cluster-to-existing-Finding association, and cluster-originated Create Finding / Request Task flows (`useCreateVocCluster`, `useConfirmCluster`, `useAddClusterMember`, `useRemoveClusterMember`, `useVocClusterDetail`, `useVocClusterList`, `useCreateFindingFromCluster`, `useLinkExistingFindingToVocCluster`, `useRequestTaskFromCluster`).

Screen components live in this feature folder: `components/detail/VocClusterListShell.tsx`, `components/detail/VocClusterDetailPanel.tsx`, and `components/modals/` (`AddVocModal`, `LinkExistingFindingModal`, `CreateFindingFromClusterModal`). The route files under `src/routes/_authed/voc-clusters/` own URL wiring only — path/search params in, shell callbacks out (plus `CreateClusterModal`, which stays in `index.tsx`).

Cluster detail owns `components/detail/VocClusterMemberRow.tsx` for its VOC member presentation. `EntityRelationRow` in Integration is reserved for Entity Link DTOs. The Request Task draft form itself is shared from `features/cross-system/request-task/`; Cluster keeps its source-specific mutation here.

It does not own VOC record lifecycle, reporter-facing VOC status, or Finding/Task persistence — those belong to VOC, Findings, and Tasks respectively.

## Route Boundary

- Owns `/voc-clusters` and `/voc-clusters/$clusterId` (`apps/frontend/src/routes/_authed/voc-clusters/`).
- A VOC Cluster groups existing VOC records (domain relationship to VOC); it is a separate top-level feature from `features/voc/`, not a sub-route of it.

## Invariants

- A cluster confirms via `status: 'confirmed'`, not by implicit membership count.
- Cluster membership changes (add/remove) must invalidate cluster detail; create/confirm must invalidate the cluster list.
- Create Finding / Request Task from a cluster follow the same approved application commands as their VOC-originated counterparts — no cluster-only bypass.

## Rules

- Use list/detail layout and URL-selected detail state, consistent with VOC.
- Managed System is an optional list filter (`managed_system_id` query param on `useVocClusterList`), not a separate navigation tree.

## Key files

- `apps/frontend/src/routes/_authed/voc-clusters/index.tsx` — cluster list route, URL state, and create dialog.
- `apps/frontend/src/routes/_authed/voc-clusters/$clusterId.tsx` — selected cluster route.
- `apps/frontend/src/features/voc-cluster/components/detail/VocClusterListShell.tsx` — cluster list and selected-detail shell.
- `apps/frontend/src/features/voc-cluster/components/detail/VocClusterDetailPanel.tsx` — cluster detail and actions.
- `apps/frontend/src/features/voc-cluster/components/detail/VocClusterMemberRow.tsx` — Cluster-local VOC member row.
- `apps/frontend/src/features/voc-cluster/lib/presentation.tsx` — cluster status labels and badges.
- `apps/frontend/src/features/voc-cluster/hooks/useVocClusterList.ts` — cluster list query.
- `apps/frontend/src/features/voc-cluster/hooks/useVocClusterDetail.ts` — selected cluster query.
- `apps/frontend/src/features/voc-cluster/components/modals/AddVocModal.tsx` — add-member dialog.
- `apps/frontend/src/features/voc-cluster/components/modals/LinkExistingFindingModal.tsx` — link-Finding dialog.
- `apps/frontend/src/features/voc-cluster/components/modals/CreateFindingFromClusterModal.tsx` — create-Finding dialog.
- `apps/frontend/src/features/voc-cluster/hooks/useCreateFindingFromCluster.ts` — cluster-originated Finding command.
- `apps/frontend/src/features/voc-cluster/hooks/useRequestTaskFromCluster.ts` — cluster-originated Task Request command.

## Verification

- Test cluster list/detail route restore, member add/remove invalidation, confirm-cluster status transition, and cluster-to-Finding/Task creation flows when touched.

## Close-out contract (ADR-0067; implemented)

- ADR-0067's Finding owner/Task Request assigned-reviewer creation inputs and
  results follow destination commands; Cluster never invents target ownership/permissions.
  Preserve same-system/source visibility, pending/error states and atomic provenance.

## Cluster suggestion review (ADR-0068; shipped #1098)

Own the separate `Cluster 제안` section on the existing `/voc-clusters` ListShell,
feature-local selection/panel/hooks and `lib/copy/voc-cluster.ts` wording. Review
two currently authorized VOC texts, then `확인 후 Cluster 생성`, `기각`, or contextual
`되돌리기`. A suggestion is not Cluster detail or a fake CLU ID, and offers no
Finding/Task Request/member/bulk/link operations. Confirm creates a human-confirmed
Cluster, invalidating suggestions, Cluster list, nav counts and Recovery/Dashboard; discard/restore invalidate
suggestions. Preserve existing Cluster URL state/manual flows. Hide a complete
pair/count when either VOC is unreadable; never infer permission from labels.

The fourth tab is shown only for Admin/Developer after the shared suggestion read
returns `available:true`. Loading, errors and provider-disabled reads add no chrome.
Availability loss returns to the default tab without changing Cluster URL state.
The mounted suggestion session resets on tab/route exit or MS/workspace/actor change;
Cluster panel drafts reset on conditional unmount. Undo records survive query replacement
until their absolute server deadline; settlement after exit still invalidates caches but
never restores local prose/focus. Stale/revoked notices contain no copied VOC text.

Denied suggestion mutations (403/404) evict that id from every cached MS/all scope
for the captured workspace/actor context, cancel obsolete reads, and invalidate
those scopes even after session exit. Corrective reads never delay safe local
notice handling. Each notice event moves focus after commit, including identical
messages; closing its panel returns focus to the connected list.
