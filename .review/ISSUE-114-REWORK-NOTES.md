# Issue 114 rework notes

## Changed

- Replaced the Integration Entity Links column table with a headerless object-row list matching `docs/design-prototype/screen-entity-links.jsx` `EntityLinkRow`.
- Rows now use the 4-column grid shape: visual checkbox, mono link id, stacked relation/status + metadata body, and an intentionally empty trailing slot.
- Row metadata now renders `ManagedSystemPill`, `by {created_by actor display name}`, and `updated {updated_at}`.
- Status tabs now show counts derived from the already-fetched all-status inventory query, without adding a backend endpoint.
- Updated the integration route test to assert the object-row DOM, tab counts, row metadata, and absence of table column headers.
- Added named entity-link row tokens in `packages/ui/src/styles/tokens.css` and documented them in `DESIGN.md`.

## Deferred / not implemented

- Right-hand detail panel with Overview / Endpoints / Properties / Detach.
- Integration-specific left sidebar and Recovery / Coverage queue sections.
- `Select actionable / Live / Last refreshed just now` live-refresh toolbar.
- Per-row Refresh, detach, or overflow action buttons.
