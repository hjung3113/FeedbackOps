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
