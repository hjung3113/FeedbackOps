# Shell taxonomy: three route shells + 50px header rhythm

## Context

Pack 18 of the Open Design hi-fi prototype (`docs/design-prototype/`, 2026-05-17, refreshed through Pack 20) locked the route-layout vocabulary. Earlier packs let each screen invent its own toolbar / detail-panel / header geometry, which produced visible drift between Tasks board, VOC Triage, Survey builder, Evidence list, and Entity Links — every "list-ish" page had a slightly different toolbar height and header rhythm.

The design pass that landed alongside the Samsung-light palette refresh consolidates every route into one of three layout families and aligns every cross-route header — sidebar system header, list/workbench toolbar, drawer panel header, and Survey preview drawer header — onto a single 50px baseline.

This ADR locks the taxonomy and the rhythm so the production React + TanStack Router + shadcn implementation cannot re-fracture them.

## Decision

### 1. Three shells. No others.

Every production route MUST classify as one of:

- `PageShell` — page-body routes whose content is not a list or work surface. Examples: Home / Action Dashboard, Integration Action Dashboard, Coverage, Survey list (cards), Admin managed systems, Admin analytics areas, Admin settings, Roadmap, New VOC. `PageShell` exposes `title`, `subtitle`, `eyebrow`, `actions`, `back`, and `fluid` slots.
- `ListShell` — filter / list / detail routes. Owns the toolbar slot, an optional `beforeList` extension row, the scroll body, and an optional right detail panel. Examples: VOC inbox + detail, Tasks requests / backlog / my / inbox, Evidence highlights, Entity Links, Findings.
- `WorkbenchShell` — work surfaces whose body is not a simple object list. Owns the toolbar slot, an optional below-toolbar content row, the body, and an optional detail panel. Examples: Tasks board, VOC Triage console, Survey builder, Survey result.

Backlog, Survey builder/result, and Roadmap are explicit **extensions** of those three, not new shell families. When a screen feels like it needs a new shell, the answer is to pick the closest existing shell and add an extension row, not to invent.

### 2. 50px header rhythm

The following surfaces MUST share a single 50px height baseline:

- Sidebar system header (`<Sidebar>` top block).
- `ListShell` toolbar (the row owning tabs / filters / search / actions).
- `WorkbenchShell` toolbar (same row, different body underneath).
- Detail-panel drawer header (`<DetailPanelHeader>` and its analogues).
- Survey preview drawer header.

`PageShell` itself does not impose a 50px header — its layout is content-driven, not toolbar-driven — but any drawer or panel that opens on top of a `PageShell` MUST follow the 50px rule for its own header.

### 3. Source of truth: baseline screenshots + manifest

`docs/design-prototype/screenshots/final-baselines/` (28 PNGs + `manifest.json`, last refreshed Pack 20) is the canonical visual acceptance set. The `mustSurvive` field in `manifest.json` records the contract per route — that text is the acceptance test, not the screenshot pixels.

When porting a screen into production:

1. Find the closest baseline in `manifest.json`. Read `mustSurvive`.
2. Pick the shell — `PageShell` / `ListShell` / `WorkbenchShell`. If unclear, mirror what the prototype's `screen-*.jsx` uses (`docs/design-prototype/screen-*.jsx`).
3. Do not invent a new shell. Extend the chosen one.
4. Verify the header height against the 50px baseline before shipping.

## Consequences

- **Production component library lock.** `packages/ui/src/layout/` MUST export exactly three shell components (`PageShell`, `ListShell`, `WorkbenchShell`) and any shared header primitive (e.g. `<ShellTitle>`). Adding a fourth shell requires an ADR amendment.
- **Frontend specs reference the manifest.** Per-route specs under `docs/frontend/specs/` cite the matching `manifest.json` entry and its `mustSurvive` field as the visual acceptance contract. Spec reviewers verify the spec's chosen shell matches the prototype.
- **Migration cost is bounded.** Once the three shells exist in `packages/ui`, each route is a ≤2-file change (route component + one shell prop pass). Header drift cannot reappear because the 50px height lives in the shell, not in the route.
- **Drawer / panel discipline.** Anywhere a drawer opens — Survey preview, VOC compose, Triage panel, Findings detail — the drawer's header height inherits from the shared primitive. Per-route height overrides are disallowed.
- **Backlog / Survey are not exceptions.** They look different because their bodies carry richer rows; the shell underneath is unchanged. This prevents the next "make backlog its own shell" temptation from re-fracturing the taxonomy.

## Out of scope

- Mobile / tablet shell behaviour. Pack 13 landed responsive scaffolding (sidebar drawer < 900px, detail-panel drill-in overlays); a future ADR will codify the touch-target + breakpoint contract.
- Light-theme support. ADR-0016 dark-only stance still holds. The Samsung-light palette refresh in Pack 17 retunes dark-theme tokens to the new visual identity; it does NOT introduce a light theme.
- Multi-pane shells beyond detail-panel-on-right. If a route ever needs a left+center+right layout, this ADR must amend first.

## Related

- `docs/design-prototype/HANDOFF.md` §"Pack 18 — Route pattern shells + aligned headers" (Session 17 changelog); §"Pack 20 — Baseline QA + nested-button polish" (Session 19) confirms post-Pack-19-split visual stability.
- `docs/design-prototype/DESIGN-MAP.md` §2 (route → screen → baseline mapping).
- `docs/design-prototype/components.jsx` (`PageShell`, `ListShell`, `WorkbenchShell`, `ShellTitle` source-of-truth implementations — port these, do not re-derive).
- ADR-0016 (UI foundation: dark-only MVP, WCAG AA, CSS-var tokens, full shadcn wrap).
- ADR-0011 (Rich content editor + attachment storage — RichEditor surfaces interact with shells but do not vary by shell type).
