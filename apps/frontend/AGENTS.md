# Frontend Agent Guide

## Required Docs

- Read `docs/frontend/README.md` before frontend changes.
- Use `docs/frontend/ui-design-system.md` for component behavior and layout contracts.
- Use `docs/frontend/component-inventory.md` before creating a new shared component.
- Use `docs/frontend/routes-and-layout.md` for URL state, list/detail behavior, and responsive navigation.
- Use `DESIGN.md` only as the raw token seed.

## Design Consistency Rules

- Consume semantic tokens such as `--text-primary`, `--surface-detail`, and `--border-selected`; do not hard-code hex colors in screens.
- Keep the visual model dark, compact, and list-first. Avoid decorative cards, broad gradients, oversized hero sections, and empty whitespace.
- Use one primary action per toolbar or panel. Secondary actions belong in subtle buttons, menus, or contextual rows.
- Reuse `ObjectList`, `DetailPanel`, `StatusBadge`, `SignalBadge`, `PermissionBlockedPanel`, and `LinkedEntityTrail` before making a screen-specific variant.
- Keep components feature-local until a second real feature needs the same behavior; then promote stable reusable components to `packages/ui`.
- Separate reporter-facing status from internal workflow status visually and structurally.
- Keep row click, inline controls, keyboard focus, hover, selected, active, disabled, loading, error, and permission-limited states distinct.
- Right detail panels preserve list context on desktop; they become drill-in panels on mobile.
- Permission-limited content must show an approved summary or a request path, not a blank failure.

## Component Intake

- Do not build repeated UI patterns directly inside screens. Create or reuse a feature-local component first, then compose it in the screen.
- Before creating a new component, check `packages/ui`, the feature's existing components, and `docs/frontend/component-inventory.md`.
- Use existing wrappers under `packages/ui/src/ui` before importing shadcn/Radix primitives directly.
- Do not import raw Radix primitives in feature screens when a wrapper exists.
- Use installed libraries, shadcn/Radix wrappers, and `lucide-react` before hand-rolling interaction behavior, accessibility primitives, icons, popovers, menus, tabs, dialogs, or form controls.
- Add new tokens or variants to docs before using them broadly.
- Use `lucide-react` icons and accessible labels for icon-only controls.

## Verification

- Test route restore, selected detail panels, blocked permission states, cross-system pending/error flows, and status badge separation when touched.
- Screenshot-check desktop, tablet, and mobile for layout changes.
