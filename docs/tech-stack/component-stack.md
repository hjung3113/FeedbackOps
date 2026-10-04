# FeedbackOps Frontend Component Stack

## Purpose

This document records the recommended frontend component stack for FeedbackOps.

It complements:

```text
docs/frontend/ui-design-system.md
docs/frontend/tokens.md
docs/design/12-ui-ux-principles.md
```

It is not a generic package list. FeedbackOps has product-specific UI contracts that no third-party component library should own.

The shipped component inventory is `packages/ui/src/index.ts`. Component contracts and required states live in `docs/frontend/component-inventory.md`. This document owns library governance: which libraries are approved, which are not adopted, and how a new one is added.

## Decision

Use a governed shadcn/ui-style component architecture:

```text
Radix-backed shadcn/ui primitives
-> FeedbackOps-owned product primitives
-> FeedbackOps-owned domain workflow components
-> domain screens
```

MVP should use Radix-backed shadcn/ui as the default primitive layer.

Base UI is a future evaluation candidate, not the MVP default.

## Why This Direction

FeedbackOps is a dense operational SaaS with:

```text
- list-first workflows
- persistent detail panels
- evidence-to-action traces
- permission-limited content
- workflow repair queues
- separate internal and reporter-facing status
- light Pack 17 density (ADR-0021)
```

Most full UI kits solve generic app components, but they do not solve:

```text
- linked-entity trails
- evidence highlights
- action queue rows
- permission-blocked states
- public update composition
- rich content editing
- reporter-facing vs internal status separation
- permission-aware redaction states
```

Those components must be owned by this codebase.

## Component Ownership Layers

### Layer 1: UI Primitives

Owned path:

```text
packages/ui/src/components/shadcn/*
```

The shipped primitives are listed in `packages/ui/src/components/shadcn/` and exported from `packages/ui/src/index.ts`.

Recommended source:

```text
shadcn/ui + Radix UI
```

Rules:

```text
- These components expose visual tokens and accessibility behavior.
- They do not know FeedbackOps domain concepts.
- They must be normalized to frontend semantic tokens derived from docs/frontend/tokens.md.
- Feature screens must not import @radix-ui/* directly (scripts/check-boundaries.mjs rule 3). They import the wrapper from @fops/ui.
```

### Layer 2: Product And Domain Components

Owned path:

```text
packages/ui/src/<area>/*
```

Areas: `badges`, `data`, `entity`, `feedback`, `forms`, `identity`, `indicators`, `layout`, `panel`, `permissions`, `rich-content`, `toolbar`. Shared pickers and `Button` live in `packages/ui/src/components/*`. The layout shells are exactly `PageShell`, `ListShell`, and `WorkbenchShell` (ADR-0020).

Components that only one feature uses stay feature-local, under `apps/frontend/src/features/<feature>/`.

Rules:

```text
- These components encode FeedbackOps layout, density, and state contracts.
- Feature screens should prefer these over composing tables, badges, panels, and permission states independently.
- These components preserve product rules from docs/design.
- They must not be replaced by generic card/table/chart blocks.
- They should make missing links, restricted content, and next actions explicit.
- They do not call APIs or own domain mutations.
```

### Layer 3: Screens

Owned path:

```text
apps/frontend/src/features/*
apps/frontend/src/routes/*
apps/frontend/src/lib/*
```

Screens compose product and domain components.

Rules:

```text
- Screens should not create one-off list, badge, permission, or detail panel implementations.
- If a screen needs a new shared state or variant, add it to docs/frontend/ui-design-system.md and the relevant shared component first.
- Keep components feature-local until a second real feature needs the same behavior.
- Promote reusable components to packages/ui only after their props, states, and token usage are stable enough for multiple consumers.
```

## Approved MVP Stack

### Base UI And Interaction

```text
React 19
shadcn/ui
Radix UI
lucide-react
sonner
cmdk
```

Use:

```text
- shadcn/ui for source-owned UI wrappers (packages/ui/src/components/shadcn; shadcn is not a runtime dependency)
- Radix UI for accessible primitives (@radix-ui/react-* dependencies of packages/ui)
- lucide-react for icons
- sonner for ephemeral mutation feedback
- cmdk for the CommandPalette primitive
```

Constraints:

```text
- sonner is only for transient feedback. Meaningful workflow state must also appear inline in rows, detail panels, or activity history.
- cmdk is only the visual/interaction primitive. The product command palette is apps/frontend/src/lib/layout/command-palette/ (see docs/frontend/routes-and-layout.md, Global command palette).
- lucide-react requires an icon vocabulary so the same icon is not reused inconsistently across evidence, links, permissions, public updates, task requests, and risk signals.
```

### Routing, Data, And Forms

```text
@tanstack/react-router
@tanstack/react-query
react-hook-form
@hookform/resolvers
zod
```

### Styling

```text
tailwindcss (v4, CSS-first theme, ADR-0058)
@tailwindcss/vite
tailwind-merge
class-variance-authority
clsx
```

Constraints:

```text
- Theme and tokens are CSS: packages/ui/src/styles/{tokens,semantic,theme,compat}.css. The Tailwind JS preset and tailwind.config are removed (ADR-0058).
- Light is the only MVP theme (ADR-0021).
```

### Drag And Drop

```text
@dnd-kit/core
```

Approved use:

```text
- Analytics Area tree sorting
- Survey Builder question ordering
- bounded Task Board interactions
```

As built, only the Task Board uses `@dnd-kit/core`. `@dnd-kit/sortable` is not installed.

Avoid:

```text
- using drag as the primary workflow for permission queues
- using drag as the only way to repair Home or Integration action queue items
- hidden state changes that are not keyboard-accessible
```

### Charts

No chart library is installed.

Constraint:

```text
Home and Integration queue screens must remain action-queue-first, not BI-card-first.
```

### Rich Content Editor

```text
TipTap (ADR-0011)
```

Use:

```text
- one shared WYSIWYG-first editor foundation in packages/ui/src/rich-content/ (RichEditor for authoring, RichContentRenderer for read-only rendering)
- VOC description
- Reporter Reply
- Public Update
- Internal Comment
- surface-specific toolbar, embed, and rendering restrictions (docs/design/15-data-contracts.md)
```

Constraints:

```text
- Non-developer users must be able to author rich content without Markdown or HTML.
- Images pasted, dropped, or uploaded appear inline but are stored as attachments.
- Do not store base64 body images.
- Do not render external image URLs inline in MVP.
- Rich Table is out of MVP (ADR-0011, Rich Table): the editor blocks the table toolbar action and rejects pasted table nodes; spreadsheets are file attachments.
- Public-facing surfaces must preserve reporter-safe rendering.
```

### Not Adopted

These libraries were considered and are not installed in any `package.json`:

```text
- @tanstack/react-table
- @tanstack/react-virtual
- @dnd-kit/sortable
- recharts
```

Lists use the shared list shells and `ObjectRow` (`packages/ui/src/data`). Adopting any of these is a new dependency: add it to the owning package and move it into the Approved MVP Stack in the same change.

## Reference Registries

The following libraries may be used as references or source templates only.

They are not approved as direct visual systems.

```text
- ReUI
- Kibo UI
- Origin UI
- Tremor
```

### Intake Rule

Any component copied from a registry must go through this process:

```text
1. Copy into packages/ui/src/components/shadcn (primitives) or the matching packages/ui/src/<area> folder (product and domain components).
2. Normalize colors, spacing, radius, typography, focus rings, and density to `docs/frontend/ui-design-system.md` semantic tokens.
3. Remove unrelated variants and decorative styling.
4. Verify accessibility behavior.
5. Add or update examples for default, loading, empty, error, permission-limited, and responsive states when applicable.
6. Avoid importing registry components directly into feature screens.
```

### Registry-Specific Guidance

ReUI:

```text
Useful for Data Grid, Tree, Filters, Timeline, Kanban, and dense dashboard references.
Use as source/reference only.
```

Kibo UI:

```text
Useful for advanced components such as Kanban, Gantt-like surfaces, editor-like inputs, dropzone, and builder UI references.
Use selectively when the product need is concrete.
```

Origin UI:

```text
Useful for app UI composition examples and copy-paste interaction patterns.
Must be restyled to FeedbackOps tokens.
```

Tremor:

```text
Useful as a dashboard/chart reference.
Do not make it a default dependency for MVP unless a concrete chart component is accepted.
If a chart library is adopted, prefer Recharts directly for small charts.
```

## Deferred Or Not Recommended As Primary Stack

### Base UI

Status:

```text
Future evaluation candidate
```

Reason:

```text
Base UI is promising and shadcn/ui now documents Base UI-backed components, but MVP should prefer the more established Radix-backed path to reduce migration and ecosystem risk.
```

Evaluate when:

```text
- Radix primitives block required accessibility or composition behavior.
- shadcn/ui Base UI support becomes the local team's preferred default.
- a prototype confirms parity for Dialog, Select, Combobox, Popover, Tabs, Tooltip, Command, and Sheet.
```

### Mantine, HeroUI, Chakra UI, Ant Design, MUI

Status:

```text
Not recommended as the primary UI stack.
```

Reason:

```text
These are full component systems with stronger visual and API opinions. They can speed up generic admin surfaces, but they work against the FeedbackOps requirement to own the dense Pack 17 light visual language (ADR-0021), permission-aware states, and evidence-to-action workflow components.
```

Use only if:

```text
- a specific isolated tool requires a component that would be expensive to build
- the component can be visually normalized
- it does not become the foundation for product screens
```

### daisyUI, Flowbite, Preline

Status:

```text
Not recommended for product screens.
```

Reason:

```text
They are useful Tailwind component accelerators, but FeedbackOps needs React-owned interaction state, accessibility guarantees, and product-specific composition. shadcn/Radix is a better fit.
```

## Permission-Aware UI Requirements

The stack must include explicit permission-aware components. `PermissionBlockedPanel` (`packages/ui/src/permissions/`) is the shared blocked state.

Rules:

```text
- Restricted linked content should not silently disappear.
- A user should see a safe blocked state when the existence of restricted content is visible.
- Redacted content must not leak internal task comments, personal survey responses, customer-sensitive data, or admin-only links.
- Permission request paths must show scope and reason requirements.
```

## Icon Vocabulary

Use `lucide-react` as the default icon set.

Define stable semantic usage before broad implementation:

```text
- Evidence
- Entity link
- Missing link
- Stale link
- Permission blocked
- Request access
- Public update
- Internal note
- Task request
- Finding
- Survey result
- Severity/risk
- Confidence
```

Rules:

```text
- Icon-only buttons require accessible labels and tooltips.
- Critical, blocked, and warning states must use text or shape in addition to color.
- Do not use Neon Lime for ordinary status icons.
```

## Package Baseline

As-built dependency direction (`apps/frontend/package.json`, `packages/ui/package.json`):

```text
apps/frontend runtime dependencies:
- react, react-dom (19)
- @tanstack/react-router, @tanstack/react-query
- react-hook-form, @hookform/resolvers, zod
- lucide-react, sonner, cmdk
- @dnd-kit/core
- @fontsource-variable/inter, @fontsource-variable/jetbrains-mono, pretendard
- @fops/ui, @fops/shared (workspace)

apps/frontend styling dev dependencies:
- tailwindcss, @tailwindcss/vite (v4, ADR-0058)

packages/ui dependencies:
- @radix-ui/react-* (avatar, checkbox, dialog, dropdown-menu, hover-card, label, popover, radio-group, select, slot, tabs, toggle-group, tooltip)
- @tiptap/* (core, react, pm, starter-kit, html, extension-link, extension-placeholder, extension-underline)
- class-variance-authority, clsx, tailwind-merge
- lucide-react, sonner
```

shadcn/ui is not a normal runtime UI dependency; its components are source files under `packages/ui/src/components/shadcn`.
Install reusable component dependencies at the workspace root or target package
according to the chosen workspace manager; do not create per-app lockfiles.

## Review Notes

An adversarial technical review challenged the initial stack framing.

Accepted review changes:

```text
- Document this as a governed component architecture, not a shopping list.
- Make Radix-backed shadcn/ui the MVP default.
- Defer Base UI to future evaluation.
- Treat ReUI, Kibo UI, Origin UI, and Tremor as reference registries only.
- Require external component intake and token normalization.
- Add explicit permission-aware UI primitives.
- Scope dnd-kit and chart usage.
- Add icon vocabulary governance.
```

## References

Checked on 2026-05-12:

```text
- shadcn/ui Base UI changelog: https://ui.shadcn.com/docs/changelog/2026-01-base-ui
- Radix UI primitives: https://www.radix-ui.com/primitives/docs/overview/introduction
- Base UI: https://base-ui.com/
- ReUI: https://reui.io/docs
- Kibo UI: https://www.kibo-ui.com/
- Origin UI: https://github.com/shadcn/originui
- Tremor: https://tremor.so/
- TanStack Table: https://tanstack.com/table/latest/docs/installation
- TanStack Virtual: https://tanstack.com/virtual/v3/docs
- dnd-kit: https://docs.dndkit.com/
- Recharts: https://recharts.org/
- lucide: https://lucide.dev/
```
