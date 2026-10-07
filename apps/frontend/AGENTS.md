# Frontend Agent Guide

## Required Docs

- Read `docs/frontend/README.md` before frontend changes.
- Use `docs/frontend/ui-design-system.md` for component behavior and layout contracts.
- Use `docs/frontend/component-inventory.md` before creating a new shared component.
- Use `docs/frontend/routes-and-layout.md` for URL state, list/detail behavior, and responsive navigation.
- Use `docs/frontend/tokens.md` only as the raw token seed.
- Use `apps/frontend/src/features/*/AGENTS.md` for route-specific ownership before adding screens.
- New endpoints must use `apiRequest(method, path, parser, opts)` with a response schema from `@fops/shared`; legacy unparsed calls are tracked in `apps/frontend/src/lib/api/api-unparsed-allowlist.txt`.

## Design Consistency Rules

- In-app navigation uses TanStack `<Link>` or `InternalLink`; a plain `<a href>` to an app path reloads the whole app (#840).
- Consume semantic tokens such as `--text-primary`, `--surface-detail`, and `--border-selected`; do not hard-code hex colors in screens.
- `pnpm lint:design` (`@shadcn/lint`, ADR-0062) checks restyled `@fops/ui` components, raw colors, arbitrary values, and inline styles. Do not add findings; its messages suggest a variant or token, which you verify before applying. When the same override or hard-coded value repeats, add a shared token, variant, or component instead of repeating it. Mechanics: `scripts/gates/AGENTS.md`.
- Keep the visual model light, compact, and list-first. Avoid decorative cards, broad gradients, oversized hero sections, and empty whitespace.
- Use one primary action per toolbar or panel. Secondary actions belong in subtle buttons, menus, or contextual rows.
- Reuse `ObjectRow`, `DetailPanelHeader`, `ReporterStatusBadge`, `InternalTaskBadge`, `SeverityBadge`, `PermissionBlockedPanel`, `RichEditor`, and `LinkedEntityTrail` (full list: `packages/ui/src/index.ts`) before making a screen-specific variant.
- Keep components feature-local until a second real feature needs the same behavior; then promote stable reusable components to `packages/ui`.
- Separate reporter-facing status from internal workflow status visually and structurally.
- Keep row click, inline controls, keyboard focus, hover, selected, active, disabled, loading, error, and permission-limited states distinct.
- Right detail panels preserve list context on desktop; they become drill-in panels on mobile.
- Permission-limited content must show an approved summary or a request path, not a blank failure.
- Top-level feature folders and route ownership follow root `AGENTS.md` → Implementation Boundaries (canonical list, includes `voc-cluster`).
- Finding and Integration route ownership: see root `AGENTS.md` → Implementation Boundaries, `apps/frontend/src/features/findings/AGENTS.md`, and `apps/frontend/src/features/integration/AGENTS.md`.
- Use Role Level labels: Admin, Developer, and User. Backend capability checks remain authoritative.
- Keep Public Update, Reporter Reply, and Internal Comment as separate communication surfaces.
- `WorkbenchShell.toolbar` is optional. High-density screens (e.g. VOC Triage) may omit it and express route identity via an inline kicker as the first child of the route-owned toolbar. When doing so, the inner toolbar MUST remain 50px (ADR-0020 §2 rhythm). See ADR-0020 §Amendment for the toolbar-kicker rule.

## Component Intake

- Do not build repeated UI patterns directly inside screens. Create or reuse a feature-local component first, then compose it in the screen.
- Before creating a new component, check `packages/ui`, the feature's existing components, and `docs/frontend/component-inventory.md`.
- Use existing wrappers under `packages/ui/src/components` (Radix wrappers live in `components/shadcn`) before importing shadcn/Radix primitives directly.
- Never import `@radix-ui/*` in `apps/frontend` (enforced by `pnpm check:boundaries`); use the `@fops/ui` wrappers.
- Use installed libraries, shadcn/Radix wrappers, and `lucide-react` before hand-rolling interaction behavior, accessibility primitives, icons, popovers, menus, tabs, dialogs, or form controls.
- Add new tokens or variants to docs before using them broadly.
- Use `lucide-react` icons and accessible labels for icon-only controls.

## Verification

- Test route restore, selected detail panels, blocked permission states, cross-system pending/error flows, and status badge separation when touched.
- Desktop 1440 only; tablet and mobile are OOS until responsive lands.

## New Surfaces And Gaps

The shipped UI is the authority for existing screens (root `AGENTS.md` → UI Authority, ADR-0060). For a new surface, start from the closest shipped screen; if `docs/design-prototype/` drew that surface, use it as a reference.

- If neither the shipped UI nor the specs decide a behavior or visual question, check `docs/frontend/specs/`, `docs/design/`, and the ADRs. If all are silent, ask; do not fill the gap with framework defaults or personal taste. Record the resolution in the PR body.
- For a layout-changing screen change, capture the page at desktop 1440 (the committed visual harness, or a temporary `tests/visual/zz-*.visual.spec.ts` capture spec deleted afterwards) and put the before/after in the PR body.

## Visual Baselines

For a route with a committed Playwright visual harness (a spec in `apps/frontend/tests/visual/*.visual.spec.ts`), the `test:visual` regression run is the visual check. Committed Playwright screenshot baselines change only in a commit that declares the intended visual change. Blanket `--update-snapshots` to silence red is forbidden. A baseline-change commit must state the intended change, attach or point to the Playwright diff, and have a changed-PNG count equal to the intended-screen count. Running, extending, and debugging the harness: `apps/frontend/tests/visual/AGENTS.md`.
