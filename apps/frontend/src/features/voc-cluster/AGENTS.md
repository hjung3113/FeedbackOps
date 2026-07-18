# VOC Cluster Feature Agent Guide

## Ownership

VOC Cluster owns frontend route composition and mutations for VOC Cluster list, detail, membership management, cluster-to-existing-Finding association, and cluster-originated Create Finding / Request Task flows (`useCreateVocCluster`, `useConfirmCluster`, `useAddClusterMember`, `useRemoveClusterMember`, `useVocClusterDetail`, `useVocClusterList`, `useCreateFindingFromCluster`, `useLinkExistingFindingToVocCluster`, `useRequestTaskFromCluster`).

It does not own VOC record lifecycle, reporter-facing VOC status, or Finding/Task persistence — those belong to VOC, Integration, and Tasks respectively.

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

## Verification

- Test cluster list/detail route restore, member add/remove invalidation, confirm-cluster status transition, and cluster-to-Finding/Task creation flows when touched.
