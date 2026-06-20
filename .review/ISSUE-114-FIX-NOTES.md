# ISSUE-114 reviewer fix notes

## Changes

- Replaced new integration FE arbitrary pixel classes with named tokens or existing scale classes:
  - `LinkStatusBadge` now consumes existing `--text-tiny` for the 11px badge text.
  - `EntityLinksInventoryTable` now consumes new named table tokens for the 1040px minimum width, 104px narrow columns, and 52px row height.
- Added the new table tokens to `packages/ui/src/styles/tokens.css` and documented them in `DESIGN.md`.
- Added route coverage proving the type filter sends `relation_type=related_to` after selecting `related_to`.

## Verification

- `pnpm --filter frontend exec vitest run src/features/integration/routes/__tests__/LinksRoute.test.tsx`
  - Passes: 5 tests.
- `grep -rnE "\[[0-9]+px\]|\[#[0-9a-fA-F]{3,8}\]" apps/frontend/src/features/integration apps/frontend/src/routes/_authed/integration`
  - No matches.
- `rg -n "[0-9]+px|#[0-9a-fA-F]{3,8}|\[[0-9]+px\]|\[#[0-9a-fA-F]{3,8}\]" apps/frontend/src/features/integration apps/frontend/src/routes/_authed/integration`
  - No matches.
- `pnpm --filter frontend exec tsc --noEmit`
  - Fails on pre-existing out-of-scope frontend errors:
    - VOC test fixtures missing `attachments` / `attachment_count`.
    - `src/main.tsx` missing `./routeTree.gen`.
    - Generated-route type errors where route path strings are not assignable to `undefined`.

No commit made.
