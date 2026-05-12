# VOC Module Agent Guide

## Ownership

VOC owns VOC records, VOC clusters, reporter-facing VOC status, public updates, and VOC-specific read models.

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

## Verification

- Test reporter-facing status transitions, public update behavior, VOC-to-Finding creation, cluster-to-Finding creation, and forbidden Survey Response-to-VOC paths when touched.
