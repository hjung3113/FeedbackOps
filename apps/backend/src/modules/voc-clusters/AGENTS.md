# VOC Clusters Module Agent Guide

## Ownership

VOC Clusters owns `voc_cluster.voc_clusters` and `voc_cluster.voc_cluster_members`, the `/voc-clusters/*` routes, bulk public-update application, and the cluster-to-Finding commands in `conversion.ts` (create, link existing, unlink). It is a separate directory but logically owned by VOC (`../voc/AGENTS.md`).

Recommendations and pre-submit peers live under `../voc/`. The autogen shadow job (ADR-0054, `../voc/jobs/cluster-autogen-shadow.ts`) records measurement rows only and never creates clusters, members, or audit events.

## Invariants

- Cluster read and mutation authority is the Finding capability pair, not a VOC capability: `canReadCluster` and `canManageCluster` in `service.ts` use `finding.read` / `finding.manage` with `requireElevatedRole: true`.
- Member visibility delegates to VOC's `isVocVisibleToActor` (`isAuthorizedMember` in `service.ts`) and additionally requires a non-archived VOC in the cluster's own Managed System. Do not copy the predicate; counts and member lists the actor sees are filtered through it.
- A cluster, its Finding, and any link between them must share a Managed System: `assertLinkManagedSystemCompatibility` guards create-finding and link-finding (`conversion.ts`).
- Create, link, and unlink Finding each run in one transaction with the ADR-0015 idempotency frame. They write the Finding through `../findings/commands.ts` and the link through `../entity-links/commands.ts` (`created_finding` and `evidence_of`, both `internal_only`), plus audit events, and never write those tables directly. A Finding outside the actor's read scope is reported as `not_found.record`.
- `POST /voc-clusters/:id/request-task` is hosted here, but the Task Request write is `taskRequestsService.createFromVocCluster` (ADR-0028); a cluster cannot create a Task directly.

## Cross-System Rules

- Other modules use the barrel (`index.ts`), e.g. `lockVocClusterById`, not `repo.ts` (`pnpm check:boundaries`).
- Bulk public updates reuse the injected VOC `postPublicUpdate`; do not write Public Updates from this module.

## Verification

- Test member visibility for a reporter-only and an out-of-scope actor, cross-Managed-System link rejection, the missing-grant error shape on link/unlink, idempotent replay of create/link/unlink, and the audit and `entity_links` side effects when touched.
