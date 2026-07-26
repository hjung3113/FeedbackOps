# VOC Module Agent Guide

## Ownership

VOC owns VOC records, VOC clusters, reporter-facing VOC status, public updates, and VOC-specific read models.

VOC Clusters are implemented as a separate top-level module directory (`../voc-clusters/`) but logically owned by VOC for boundary/permission purposes.

## Invariants

- VOC means customer or user-submitted voice.
- Do not create VOC from Survey Response.
- Reporter-facing VOC status is separate from Task status.
- Task Done or Released must not automatically mark a VOC as resolved.
- Public updates are distinct from internal comments.

## Cross-System Rules

- VOC may create Finding through the approved application command.
- VOC links to Findings, Tasks, and other entities through `entity_links`.
- Convenience projections are allowed only when canonical history remains in `entity_links`.

## Embedding Provider (ADR-0034 D2)

- `embedding/` is a pure text-to-vector provider boundary. It has no database,
  job, queue, route, or recommendation-resource dependency.
- `EmbeddingProvider.embed(texts)` preserves batch order and returns vectors
  with provider, model, dimensions, and embedding version metadata for storage.
- `fake` is deterministic and valid for offline tests only; hash-derived vectors
  are not semantic similarity data. `voyage` uses injected fetch for testability.
- `disabled` signals unavailability with `EmbeddingUnavailableError`; callers
  must not convert it to an empty result.

## Verification

- Test reporter-facing status transitions, public update behavior, VOC-to-Finding creation, cluster-to-Finding creation, and forbidden Survey Response-to-VOC paths when touched.
