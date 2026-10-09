# VOC Feature Agent Guide

## Ownership

VOC owns frontend route composition for VOC submission, inbox, triage, reporter-facing status, public updates, and VOC detail panels.

It does not own Task status, Survey Response conversion, Finding persistence, or Entity Link visibility rules.

## Route Boundary

- Owns `/vocs` (single view-switching route covering inbox, triage, and create — see `apps/frontend/src/routes/_authed/vocs.tsx`).
- May start Create Finding or Request Task flows without losing VOC list/detail context.
- VOC Clusters are a separate feature (`features/voc-cluster/`, mounted at `/voc-clusters`) — see its AGENTS.md.

## Cluster Recommendation Surface

- The `유사 VOC 추천` section in the triage panel owns the ADR-0034 recommendation surface: per-candidate rows with confirm and dismiss actions, read from `GET /vocs/:id/recommendations`.
- `voc.similar_count` remains the ADR-0031 same-Managed-System peer count. Show it with the label `같은 Managed System의 VOC N건` in detail and triage; do not render it as an inbox row chip or as a recommendation count.
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
- VOC creation requires Managed System, allows optional Analytics Area under the selected Managed System, allows optional Source Context, and must not ask Reporter for severity.
- Use list/detail layout and URL-selected detail state.
- Linked Findings, Tasks, and Evidence render through backend-approved summaries and `LinkedEntityTrail`.

## Key files

- `apps/frontend/src/routes/_authed/vocs.tsx` — VOC view branch for inbox, triage, and create.
- `apps/frontend/src/features/voc/routes/InboxRoute.tsx` — inbox/My VOC list state, filters, and detail selection.
- `apps/frontend/src/features/voc/routes/TriageRoute.tsx` — triage permission gate, session processed count, and queue state.
- `apps/frontend/src/features/voc/routes/CreateRoute.tsx` — VOC creation route composition.
- `apps/frontend/src/features/voc/components/list/VocList.tsx` — VOC list rows and loading/empty/error states.
- `apps/frontend/src/features/voc/components/triage/VocTriageScreen.tsx` — triage queue screen and selected panel.
- `apps/frontend/src/features/voc/components/triage/useVocTriageScreenController.ts` — screen-session selection history, Finding target, and queue action handlers.
- `apps/frontend/src/features/voc/components/triage/TriagePanel.tsx` — triage detail and actions.
- `apps/frontend/src/features/voc/components/detail/VocDetailPanel.tsx` — VOC detail and communication states.
- `apps/frontend/src/features/voc/components/detail/ReporterStatusChangeBlock.tsx` — reporter-facing status change copy and actions.
- `apps/frontend/src/features/voc/lib/triage-types.ts` — triage inputs and state types.
- `apps/frontend/src/features/voc/lib/triage-error-policy.ts` — triage mutation error classification.
- `apps/frontend/src/lib/copy/reporter-status-labels.ts` — reporter-facing status labels.

## Verification

- Test route restore, selected detail panels, triage filters, public update flows, forbidden Survey Response-to-VOC affordances, and reporter/internal status separation when touched.
