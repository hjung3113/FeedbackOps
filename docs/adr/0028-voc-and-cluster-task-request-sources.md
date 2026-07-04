# ADR-0028: VOC And VOC Cluster Task Request Sources

Date: 2026-07-04

## Status

Accepted

## Context

ADR-0025 introduced the first Task Request creation path:
`Finding -> Task Request`. The Task Request table already reserved
`source_type='voc'` and `source_type='voc_cluster'`, and the product invariant
requires VOC follow-up to create a Task Request rather than a Task directly.

Issue #136 completes the Slice 6 source expansion by enabling Task Request
creation from individual VOCs and VOC Clusters while keeping the same review
queue introduced by issue #133.

## Decision

Add two source-shaped endpoints:

```text
POST /vocs/:id/request-task
POST /voc-clusters/:id/request-task
```

Both endpoints accept the same body as `POST /findings/:id/request-task`:

```text
evidence_summary
requested_outcome
```

Both create only a `pending_review` row in
`task_request.task_requests`, copy the source object's Primary Managed System,
and return `TaskRequestDto` with `source.type` set to `voc` or `voc_cluster`.
The existing `GET /task-requests` review queue remains the only review queue.

The `core.entity_links` tuple CHECK is widened additively with exactly:

```text
(voc, task_request, requested_task)
(voc_cluster, task_request, requested_task)
```

Creation records source-specific audit events:

```text
task_request_created_from_voc
task_request_created_from_voc_cluster
```

No new capability is introduced. VOC request-task mirrors VOC create-finding
authority: the source VOC must be readable by the actor and the actor must have
`finding.manage` on the VOC Primary Managed System, with Admin bypass. VOC
Cluster request-task mirrors cluster create-finding authority: Admin or
Developer with `finding.manage` on the cluster Primary Managed System.

## Consequences

- VOC and VOC Cluster follow-up still cannot create Tasks directly.
- The Task Request review queue must handle `source.type='finding' | 'voc' |
  'voc_cluster'`.
- Task Request source provenance remains canonical through `entity_links`.
- The tuple CHECK remains composite; independent value CHECKs remain rejected
  because they admit invalid source/target/relation combinations.
