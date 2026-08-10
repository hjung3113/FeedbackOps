# Frontend Agent Guide

## Required Docs

- Read `docs/frontend/README.md` before frontend changes.
- Use `docs/frontend/ui-design-system.md` for component behavior and layout contracts.
- Use `docs/frontend/component-inventory.md` before creating a new shared component.
- Use `docs/frontend/routes-and-layout.md` for URL state, list/detail behavior, and responsive navigation.
- Use `DESIGN.md` only as the raw token seed.
- Use `apps/frontend/src/features/*/AGENTS.md` for route-specific ownership before adding screens.

## Design Consistency Rules

- Consume semantic tokens such as `--text-primary`, `--surface-detail`, and `--border-selected`; do not hard-code hex colors in screens.
- Keep the visual model light, compact, and list-first. Avoid decorative cards, broad gradients, oversized hero sections, and empty whitespace.
- Use one primary action per toolbar or panel. Secondary actions belong in subtle buttons, menus, or contextual rows.
- Reuse `ObjectList`, `DetailPanel`, `StatusBadge`, `SignalBadge`, `PermissionBlockedPanel`, `RichContentEditor`, and `LinkedEntityTrail` before making a screen-specific variant.
- Keep components feature-local until a second real feature needs the same behavior; then promote stable reusable components to `packages/ui`.
- Separate reporter-facing status from internal workflow status visually and structurally.
- Keep row click, inline controls, keyboard focus, hover, selected, active, disabled, loading, error, and permission-limited states distinct.
- Right detail panels preserve list context on desktop; they become drill-in panels on mobile.
- Permission-limited content must show an approved summary or a request path, not a blank failure.
- Top-level feature folders and route ownership follow root `AGENTS.md` → Implementation Boundaries (canonical list, includes `voc-cluster`).
- Integration owns component/hook code for Findings (mounted at top-level `/findings`, `/findings/$findingId`); it owns both code and URL for Links (`/integration/links`). Evidence and Coverage routes are planned, not yet built. See `apps/frontend/src/features/integration/AGENTS.md`.
- Managed System scope is a filter/defaulting context, not duplicated navigation.
- Use Role Level labels: Admin, Developer, and User. Backend capability checks remain authoritative.
- Keep Public Update, Reporter Reply, and Internal Comment as separate communication surfaces.
- `WorkbenchShell.toolbar` is optional. High-density screens (e.g. VOC Triage) may omit it and express route identity via an inline kicker as the first child of the route-owned toolbar. When doing so, the inner toolbar MUST remain 50px (ADR-0020 §2 rhythm). See ADR-0020 §Amendment and `.review/PROTOTYPE-TO-PACK17.md §toolbar-kicker`.

## Component Intake

- Do not build repeated UI patterns directly inside screens. Create or reuse a feature-local component first, then compose it in the screen.
- Before creating a new component, check `packages/ui`, the feature's existing components, and `docs/frontend/component-inventory.md`.
- Use existing wrappers under `packages/ui/src/components` (Radix wrappers live in `components/shadcn`) before importing shadcn/Radix primitives directly.
- Do not import raw Radix primitives in feature screens when a wrapper exists.
- Use installed libraries, shadcn/Radix wrappers, and `lucide-react` before hand-rolling interaction behavior, accessibility primitives, icons, popovers, menus, tabs, dialogs, or form controls.
- Add new tokens or variants to docs before using them broadly.
- Use `lucide-react` icons and accessible labels for icon-only controls.

## Verification

- Test route restore, selected detail panels, blocked permission states, cross-system pending/error flows, and status badge separation when touched.
- Screenshot-check desktop 1440 for layout changes. Tablet and mobile are OOS until responsive lands.

## Prototype-First (BLOCKING)

`docs/design-prototype/` is the spec — see root `AGENTS.md` → Prototype Is The Spec. Frontend-specific enforcement:

- **Every FE chunk brief MUST quote the prototype path being implemented** (`screen-<feature>.jsx` + relevant `data.js` keys + baseline screenshot path). A brief without these three is rejected.
- **First action of any FE chunk:** open the prototype file, open the baseline PNG, write a 5-line "matching plan" listing the shells, sections, copy keys, and interactions being mirrored. Embed that plan in the PR description.
- **No invention.** If the prototype is silent on a behavior or visual decision, stop and ask — do not fill the gap with framework defaults or personal taste. Document the resolution in PR body.

## Page-Level Pixel-Diff (CP-pixel, BLOCKING)

Every page-level FE issue (route mount, full screen) runs a structured Playwright pixel-diff against the prototype baseline before PR merge. Component-only issues are exempt.

**Steps:**

1. Boot dev server + DB seed; authenticate via mock-login.
2. Capture target page with Playwright MCP at desktop 1440. Capture both the empty-state and the populated-state if the route has both.
3. Place impl screenshot side-by-side with `docs/design-prototype/screenshots/final-baselines/<page>.png` in the report HTML.
4. **Enumerate every visible difference** in a structured table — no eyeballing, no "looks close". Required columns:
   - **Region** (e.g. `header.title`, `list.row.severity-cell`, `panel.action-footer`)
   - **Category** (`token` / `spacing` / `hierarchy` / `typography` / `chrome` / `copy` / `interaction-affordance` / `data-shape`)
   - **Prototype** (verbatim quote / pixel value / token name)
   - **Impl** (verbatim quote / pixel value / token name)
   - **Severity** (HIGH = wrong content/copy/hierarchy; MEDIUM = noticeable token/spacing drift; LOW = sub-pixel rhythm)
   - **Resolution** (`fix-now` / `defer-with-issue#` / `intentional-per-ADR-N`)
5. **Gating:**
   - Any HIGH or any **copy** category mismatch → blocks merge. Fix in the same PR.
   - ≥3 MEDIUM, or any MEDIUM in critical regions (primary action, header, status badges) → fix in the same PR.
   - ≤2 LOW with no HIGH/MEDIUM → merge OK with inline note.
6. Recapture after fixes. The merged PR carries the **post-fix** diff report, not the initial one.

**Outputs:**

- `.review/SLICE-N-<issue>-pixel-diff.html` — side-by-side report with the structured diff table embedded.
- PR body checklist must include: `[ ] pixel-diff table complete (HIGH=N MEDIUM=N LOW=N)` with the actual counts.

**Scope:** only when a prototype baseline exists. If absent, state "no prototype baseline" in PR body, capture a fresh screenshot, and queue a prototype refresh follow-up issue — do not silently ship UI without a baseline.

### Durable visual harnesses

For a route with a committed Playwright visual harness (currently `/voc-clusters`), the durable `test:visual` regression run replaces the manual Playwright-MCP recapture step above. The one-time CP-pixel fidelity table against `docs/design-prototype/screenshots/final-baselines/<page>.png` still happens once when introducing the harness, and again for an intentional redesign.

The harness pins a fixed page clock (`FIXED_CLOCK` in `tests/visual/support/visual-test.ts`), so screens that render fixture timestamps as relative time ("3일 전") stay reproducible instead of encoding the capture date. A fixture whose timestamp is newer than the pin will render a future-dated label — move the pin forward with the fixture, and regenerate the affected baselines in that same commit.

The authority prototype baseline is `final-baselines/`, never `pack20-current/`. Committed Playwright screenshot baselines change only in a commit that declares the intended visual change. Blanket `--update-snapshots` to silence red is forbidden. A baseline-change commit must state the intended change, attach or point to the Playwright diff, and have a changed-PNG count equal to the intended-screen count.

## Prototype Copy Authority

See root `AGENTS.md` → Prototype Is The Spec for full rules.

- Frontend-unique addition: per-surface variance (e.g. `BODY` label in detail panel coexisting with `설명` in create form) is allowed when the reference design/screenshot shows it that way.
