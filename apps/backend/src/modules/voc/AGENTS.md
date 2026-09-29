# VOC Module Agent Guide

## Ownership

VOC owns VOC records, VOC clusters, reporter-facing VOC status, public updates, and VOC-specific read models.

VOC Clusters are a separate module directory (`../voc-clusters/`) but logically owned by VOC. Recommendations and pre-submit peers live under this module.

## Invariants

- VOC means customer or user-submitted voice.
- Do not create VOC from Survey Response.
- Reporter-facing VOC status is separate from Task status.
- Task Done or Released must not automatically mark a VOC as resolved.
- Public updates are distinct from internal comments.
- The ADR-0031 visibility rule (Managed System in the actor's `voc.read` scope, or the actor reported it) has one definition with two faces in `authorization.ts`: `similarVocVisibilityPredicate` (SQL; callers pass the row alias) and `isVocVisibleToActor` (already-loaded rows). They must change together; `__tests__/voc-visibility-predicate.integration.test.ts` pins both, including an SQL/object agreement matrix. Do not add a third copy.
- VOC Clusters delegates the base scope-or-reporter rule to `isVocVisibleToActor` and adds only cluster membership conditions.

## Cross-System Rules

- VOC may create Finding through the approved application command.
- VOC links to Findings, Tasks, and other entities through `entity_links`.
- Convenience projections are allowed only when canonical history remains in `entity_links`.

## Embedding And Recommendations

Provider, ingestion, threshold, and the recommendation HTTP surface are ADR-0034 (D2, D4, D5, D6), including the 2026-07-27 amendments. D4 reuses `similarVocVisibilityPredicate`. Do not restate those rules here.

## Verification

- Test reporter-facing status transitions, public update behavior, VOC-to-Finding creation, cluster-to-Finding creation, and forbidden Survey Response-to-VOC paths when touched.
