# VOC Feature Agent Guide

## Ownership

VOC owns frontend route composition for VOC submission, inbox, triage, reporter-facing status, public updates, and VOC detail panels.

It does not own Task status, Survey Response conversion, Finding persistence, or Entity Link visibility rules.

## Route Boundary

- Owns `/vocs` (single view-switching route covering inbox, triage, and create — see `apps/frontend/src/routes/_authed/vocs.tsx`).
- May start Create Finding or Request Task flows without losing VOC list/detail context.
- VOC Clusters are a separate feature (`features/voc-cluster/`, mounted at `/voc-clusters`) — see its AGENTS.md.

## Cluster Recommendation Surface

- The Cluster 추천 section in the triage panel owns the ADR-0034 recommendation surface: per-candidate rows with confirm and dismiss actions, read from `GET /vocs/:id/recommendations`.
- `voc.similar_count` and the ADR-0031 same-Managed-System heuristic are retained alongside it and still drive the Similarity badge. The badge is not recommendation-derived.
- `available: false` carries two reasons, `provider_disabled` and `source_not_embedded`. Each renders its own copy. Never collapse one into the other, and never render either as an empty candidate list.

## Invariants

- VOC means customer or user-submitted voice.
- Never expose Survey Response -> Create VOC.
- Reporter-facing VOC status and internal Task status must be visually and structurally separate.
- Task Done or Released must not automatically resolve VOC.
- Public Update, Reporter Reply, and Internal Comment are distinct communication surfaces.
- Reporter Summary must be public-safe and must not expose raw Task statuses, internal comments, priority, developer discussion, severity, or confidence.

## Rules

- Triage is a primary workspace, not just an Inbox filter.
- Unassigned VOC is a first-class operational failure mode.
- VOC creation requires Managed System, allows optional Product Area under the selected Managed System, allows optional Source Context, and must not ask Reporter for severity.
- Use list/detail layout and URL-selected detail state.
- Linked Findings, Tasks, and Evidence render through backend-approved summaries and `LinkedEntityTrail`.

## Verification

- Test route restore, selected detail panels, triage filters, public update flows, forbidden Survey Response-to-VOC affordances, and reporter/internal status separation when touched.
