# TITLE-BLOCK-RESTORE — option A applied

**Date:** 2026-05-21
**Branch:** `feature/v1-inline-kicker-triage`
**Reference:** `.review/title-reference.png` (user-supplied)

## Why

The previous title block on VocDetailPanel + TriagePanel rendered:

- A compact `text-lg font-semibold` title via `PanelTitleBlock` (default size)
- A multi-row badge stack stuffed directly under the title (severity, managed
  system pill, analytics area chip, source-context outline badge)
- Two `FieldRow`s ("제출자" + "제출 시각") repeating identity information
- The body via `PanelSectionTitle('설명')` + `NestedTextBlock` (no card tint)

The reference image (`.review/title-reference.png`) shows a different rhythm:

1. A larger title — `text-xl font-bold tracking-tight`
2. A single horizontal meta row immediately below the title — status pill +
   middle-dot + `<reporter name> · <relative time>`
3. An English `BODY` label as the section header for the description
4. The body content inside a tinted card (blue-grey, `#edf3fb` deep-slate)

The visual hierarchy in the reference focuses the eye on the title and the
single most relevant identity dimension (status + reporter + when). The badge
stack survived in the implementation but no longer competes with the title —
it is relocated to a compact chip strip below the body card.

This restore was previously blocked by the strict Korean-only copy convention
in root `AGENTS.md` / `apps/frontend/AGENTS.md` / `PRODUCT.md` (the English
`BODY` label and the mixed-language meta line violated the rule). The user
explicitly relaxed that convention in the same task (한글 영어 혼용으로),
which unblocked option A.

## What changed

### `packages/ui/src/panel/PanelTitleBlock.tsx`

- New optional `size?: 'lg' | 'xl'` prop, default `'lg'`.
- `'lg'` keeps the existing compact `text-lg font-semibold tracking-tight`
  treatment — every existing consumer is unaffected.
- `'xl'` renders `text-xl font-bold tracking-tight` per the reference image.
- The two VOC surfaces (IdentitySection, TriagePanel) opt into `'xl'`.

### `apps/frontend/src/features/voc/components/detail/IdentitySection.tsx`

- `PanelTitleBlock` now invoked with `size='xl'`.
- The component now renders a single meta row below the title:
  - `ReporterStatusBadge` (status pill, Korean label preserved)
  - middle-dot separator (`·`)
  - reporter display name (resolved from `useMe` if matching, else
    `Actor <id-prefix>` stub — unchanged Slice-3 behavior)
  - middle-dot separator
  - relative time via the existing `formatVocCreatedAt` util ('방금', '6시간 전', …)
- `제출자` / `제출 시각` `FieldRow`s removed (their information is now in
  the meta line).
- New `IdentityMetadataStrip` export — a compact `flex flex-wrap gap-2`
  chip array (severity badge / managed-system pill / analytics-area chip /
  source-context outline badge) rendered by `VocDetailPanel` directly below
  the `DescriptionSection`. The badges are still there for product
  completeness; they're just out of the title group.
- Title block margin-bottom is `mb-7` (28px, on the canonical spacing scale)
  to match the reference rhythm.

### `apps/frontend/src/features/voc/components/detail/DescriptionSection.tsx`

- New label: `BODY` in English uppercase, styled
  `text-xs font-semibold uppercase tracking-wide text-text-muted mb-2`.
- Body wrapped in a card:
  `rounded-md bg-surface-card-elevated p-4 text-sm text-text-secondary leading-relaxed`.
  `--surface-card-elevated` maps to `--color-deep-slate` (`#edf3fb`) per
  `packages/ui/src/styles/tokens.css`, which matches the reference's
  blue-grey tint.
- `RichContentRenderer` rendering preserved inside the card.
- The `'설명 없음'` fallback for empty TipTap docs is preserved inside the
  card with `text-text-muted`.
- The reporter-only `설명 수정` button is unchanged, just relocated to
  `mt-2` below the new card.

### `apps/frontend/src/features/voc/components/detail/VocDetailPanel.tsx`

- Imports `IdentityMetadataStrip` and renders it inside the
  `data-anchor="description"` block so the relocated chips scroll with the
  body and stay anchored to the description section in the section nav.

### `apps/frontend/src/features/voc/components/triage/TriagePanel.tsx`

- Same xl title + status-pill + meta line treatment as IdentitySection,
  applied to the overview anchor.
- The triage panel doesn't have a reporter name available on `VocListItem`
  (the list-item shape doesn't carry it), so the meta row is `status pill ·
  <created-at date>` — the closest possible mirror of IdentitySection
  given the data shape.
- Body section: `BODY` label + tinted card (same tokens as DescriptionSection)
  with the existing `voc.title` stub still rendered inside. Replacing the
  stub with the real body field is Slice 4 work and out of scope here.
- Removed now-unused `NestedTextBlock` import.

### Tests added

- `packages/ui/src/panel/__tests__/PanelTitleBlock.test.tsx`
  - `size='xl'` renders `text-xl font-bold tracking-tight`
  - Explicit `size='lg'` matches the default (backward-compat assertion)
- `apps/frontend/src/features/voc/components/detail/__tests__/IdentitySection.test.tsx`
  - Title renders at `text-xl font-bold`
  - Meta line shape: reporter + relative time, no `제출자` / `제출 시각` labels
  - Severity badge is NOT in the title group
  - `IdentityMetadataStrip` does render severity badge
- `apps/frontend/src/features/voc/components/detail/__tests__/DescriptionSection.test.tsx`
  - `BODY` label replaces `설명`
  - Body card has `bg-surface-card-elevated` + `rounded-md`
- `apps/frontend/src/features/voc/components/triage/__tests__/TriagePanel.titleBlock.test.tsx` (new)
  - Title renders at `text-xl font-bold`
  - `BODY` label present
  - Body card has `bg-surface-card-elevated` + `rounded-md`

### Test fallout

- `apps/frontend/src/features/voc/components/detail/__tests__/VocDetailPanel.test.tsx`
  — the section-title smoke test that snapshotted `'설명'` now asserts `'BODY'`.

## Token / spacing discipline

- No raw hex. Every color goes through `bg-surface-card-elevated` /
  `text-text-muted` / `text-text-secondary` / the Pack 17 token names.
- No raw px outside the spacing scale. `mb-7` is 28px on the scale; `gap-2`
  is 8px; `p-4` is 16px; `mt-2` is 8px.
- The Korean label for the status pill comes from `ReporterStatusBadge`
  which is the existing Pack 17 component; no inline `style={{}}` was added.

## Test suite delta

| Suite       | Before | After | Delta | New tests                               |
| ----------- | ------ | ----- | ----- | --------------------------------------- |
| FE          | 391    | 396   | +5    | 2 IdentitySection + 3 TriagePanel.title |
| UI          | 365    | 367   | +2    | 2 PanelTitleBlock size variants         |
| shared      | 236    | 236   | 0     | —                                       |
| BE          | 186    | 186   | 0     | —                                       |

All four suites green; `pnpm -r typecheck` clean; `pnpm --filter frontend build` clean.

## Commits

1. `8a0e448` refactor(ui): PanelTitleBlock accepts optional size='lg'|'xl' prop
2. `cb5bbee` refactor(voc): restore detail title block + BODY card per reference image
3. `8f1ae1d` refactor(voc): parallel TriagePanel title + BODY card per reference image
4. `35ccebd` test(voc): VocDetailPanel section-title assertion now expects 'BODY'

(Plus the prior `3d2bed8` docs commit that relaxed the Korean-only convention,
which is what allowed the `BODY` label.)

## Visual verification

A Playwright MCP screenshot pass against the dev server (`:3010`/`:3011`)
was attempted to produce `.review/baselines/captured/voc-detail-restored.png`
for side-by-side comparison with `.review/title-reference.png`.

**Playwright verdict:** the dev server on `localhost:3010` responds `200`,
but the screenshot MCP toolchain is not callable from the executor context
that ran this task (only Read / Write / Edit / Bash are exposed; no
`mcp__playwright__*` tools). The visual comparison is therefore deferred
to a follow-up pass that runs from an agent context with the Playwright MCP
attached. The token/spacing assertions exercised by the unit tests above
cover the structural claims (xl title, BODY label, tinted card, no
`제출자` / `제출 시각` labels), but a pixel-diff sign-off is still owed
before this lands in `develop` per the page-level pixel-diff rule in
`apps/frontend/AGENTS.md`.

Structural similarity to `.review/title-reference.png` based on
DOM + class assertions:

| Reference feature                        | Impl status |
| ---------------------------------------- | ----------- |
| Larger title — `text-xl font-bold`       | asserted    |
| Status pill + meta row below title       | asserted    |
| Reporter name + middle-dot + rel time    | asserted    |
| English `BODY` section label             | asserted    |
| Tinted body card (`#edf3fb` deep-slate)  | asserted    |
| Body content inside the card             | preserved   |
| Verbose badge stack removed from title   | asserted    |
| `제출자` / `제출 시각` FieldRows removed | asserted    |

Estimated structural match: **8/8 reference features mirrored** at the
DOM/class level. Pixel-precise spacing and color rendering must still be
verified visually in a follow-up pass with Playwright MCP available.
