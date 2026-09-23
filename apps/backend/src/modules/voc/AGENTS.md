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
- The ADR-0031 visibility rule (Managed System in the actor's `voc.read` scope, or the actor reported it) has one implementation in this module: `similarVocVisibilityPredicate` in `authorization.ts`. Callers pass the row alias. It is pinned by `__tests__/voc-visibility-predicate.integration.test.ts`. Do not add a second copy.
- One copy still lives outside this module: the private `isAuthorizedMember` helper in the VOC Clusters module. It wraps the same scope-or-reporter disjunction with cluster membership conditions (same Managed System, not archived). A change to the scope semantics here must be applied there in the same commit.

## Cross-System Rules

- VOC may create Finding through the approved application command.
- VOC links to Findings, Tasks, and other entities through `entity_links`.
- Convenience projections are allowed only when canonical history remains in `entity_links`.

## Embedding And Recommendations

Provider, ingestion, threshold, and the recommendation HTTP surface are ADR-0034 (D2, D4, D5, D6), including the 2026-07-27 amendments. D4 reuses `similarVocVisibilityPredicate`. Do not restate those rules here.

## Verification

- Test reporter-facing status transitions, public update behavior, VOC-to-Finding creation, cluster-to-Finding creation, and forbidden Survey Response-to-VOC paths when touched.
