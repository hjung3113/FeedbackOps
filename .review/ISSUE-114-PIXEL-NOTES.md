# Issue #114 Pixel Notes

Baseline: `docs/design-prototype/screenshots/final-baselines/integration-links.png`

Implementation route: `/integration/links`

## Expected Content Deltas

- Prototype mock rows include relation types such as `evidence_of`, `executes`, and `public_update_of`; production Slice 4.3 only supports `related_to`.
- Prototype mock rows include multiple entity types (`finding`, `task`, `survey`); production rows are currently VOC to VOC only.
- Prototype mock managed systems include names such as `powerbi`, `tableau`, and `looker`; production renders real `core.managed_systems` rows when available, otherwise a truncated managed_system_id.
- Prototype includes stale and revoked mock rows; production currently creates only active and detached rows. The UI still renders filters and badge variants for all four states.
- Hidden rows intentionally render permission-limited treatment and omit endpoint ids. This is an expected data visibility delta, not a layout failure.
- Bulk checkbox column is visual-only. No detach, refresh, or bulk mutation action should appear from this table.

## Must Match Layout/Chrome

- `ListShell` list surface with a 50px toolbar rhythm.
- Status tabs: `All`, `Active`, `Stale`, `Detached`, `Revoked`.
- Toolbar density, 8px control gaps, compact search/filter/refresh controls.
- Checkbox column, mono link id column, relation stem column, status badge column, managed-system column, created-by, created, updated columns.
- `LinkStatusBadge` tone mapping must stay on Pack 17 semantic tokens: success for active, warning for stale, muted for detached, danger for revoked.
- Empty state remains terse and text-only: `해당 상태의 entity_link 가 없습니다.`

## Review Classification

Treat row content, relation vocabulary, entity types, and managed-system names as expected data-shape deltas. Flag spacing, header height, column rhythm, badge token drift, filter chrome, or empty-state copy as implementation defects.
