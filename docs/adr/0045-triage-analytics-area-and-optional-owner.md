# Triage Analytics Area wiring and optional owner

## Status

Accepted 2026-08-03. Records decisions D4, D5, and D10 for issues #269, #270, and #268.

## Context

Issue #269 was initially labeled as an enhancement because UX decision D12 assumed that the Analytics Area selection affordance still needed to be designed. That premise was incorrect. The triage panel already rendered `AnalyticsAreaPicker`, staged its value, and included it in the mutation payload; a stubbed empty options array was the only missing connection. The defect therefore removed an already-designed capability and is a bug.

An Analytics Area belongs to one Managed System. It is classification and default-routing context, not an authorization boundary. Historical VOCs and Findings may continue to reference an Analytics Area after it is archived.

The existing Owner picker decision D-2.3 maps `(미지정)` to null user and team owner ids, and the triage mutation accepts that state. Treating Owner as required in the UI would contradict that established mapping and create a frontend-only gate.

## Decision

1. Triage loads Analytics Areas once, scoped by the VOC's `primary_managed_system_id`. The request includes archived records so the current historical value can be resolved. The frontend retains every active Area plus the one archived Area currently referenced by the VOC, and excludes every other archived Area. A retained archived value is labeled `(보관됨)` and may be preserved, but it is not presented as an ordinary unlabeled active choice.
2. Managed System scoping prevents cross-system misclassification. It does not grant, narrow, or otherwise participate in authorization; Managed System permission scope remains the boundary.
3. Finding creation from a VOC inherits the source VOC's Analytics Area as an editable default. The modal shows the selected Area before submission and permits another Area from the same Managed System to be chosen. If the source has no Area, the request omits `analytics_area_id`. Silent inheritance is rejected because an operator must be able to verify or correct classification before creating the Finding.
4. Owner remains optional during triage. The UI labels it as optional and explains that `(미지정)` is a valid state that can be assigned later. Confirm remains governed by dirty and submitting state only; no Owner validation gate is added.

## Consequences

- The existing triage picker and mutation contract are reused; no backend endpoint or permission rule changes.
- Current archived classifications remain legible without making unrelated archived Areas selectable.
- Findings preserve source classification by default without hard-coding it after the operator changes the modal selection.
- Unassigned VOCs can be triaged intentionally and remain visible to operational recovery queues.
