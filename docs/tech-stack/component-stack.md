# FeedbackOps Frontend Component Stack

## Purpose

This document records the recommended frontend component stack for FeedbackOps.

It complements:

```text
docs/frontend/ui-design-system.md
DESIGN.md
docs/design/12-ui-ux-principles.md
```

It is not a generic package list. FeedbackOps has product-specific UI contracts that no third-party component library should own.

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
- dark Linear-like visual density
```

Most full UI kits solve generic app components, but they do not solve:

```text
- LinkedEntityTrail
- EvidenceHighlight
- ActionQueueRow
- PermissionBlockedPanel
- PublicUpdateComposer
- reporter-facing vs internal status separation
- permission-aware redaction states
```

Those components must be owned by this codebase.

## Component Ownership Layers

### Layer 1: UI Primitives

Owned path:

```text
packages/ui/src/ui/*
```

Examples:

```text
- Button
- Input
- Textarea
- Select
- Combobox
- Dialog
- Sheet
- Popover
- Tooltip
- Tabs
- Badge
- Table
- Command
- Toast
```

Recommended source:

```text
shadcn/ui + Radix UI
```

Rules:

```text
- These components expose visual tokens and accessibility behavior.
- They do not know FeedbackOps domain concepts.
- They must be normalized to frontend semantic tokens derived from DESIGN.md.
- Feature screens should not import raw Radix primitives directly unless a wrapper does not exist yet.
```

### Layer 2: Product Primitives

Owned path:

```text
packages/ui/src/product/*
```

Examples:

```text
- AppShell
- ObjectList
- InboxList
- DataTable
- DetailPanel
- ActionToolbar
- StatusBadge
- SignalBadge
- PermissionGate
- RedactedValue
- AccessRequestDialog
```

Rules:

```text
- These components encode FeedbackOps layout, density, and state contracts.
- Feature screens should prefer these over composing tables, badges, panels, and permission states independently.
- ObjectList and DataTable should be built once and reused across VOC, Finding, Task Request, Survey, Dashboard, and Permission screens.
```

### Layer 3: Domain Workflow Components

Owned path:

```text
packages/ui/src/domain/*
```

Examples:

```text
- LinkedEntityTrail
- EvidenceHighlight
- PublicUpdateComposer
- ActionQueueRow
- PermissionBlockedPanel
- FindingExecutionActions
- TaskRequestDecisionPanel
- SurveyResultSummaryBlock
```

Rules:

```text
- These components preserve product rules from docs/design.
- They must not be replaced by generic card/table/chart blocks.
- They should make missing links, restricted content, and next actions explicit.
```

### Layer 4: Screens

Owned path:

```text
apps/frontend/src/features/*
apps/frontend/src/app/*
```

Screens compose product and domain components.

Examples:

```text
- VOC Inbox
- Finding Detail
- Task Request Queue
- Task Detail
- Survey Result
- Action Dashboard
- Permission Requests
```

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
shadcn/ui
Radix UI
lucide-react
sonner
cmdk
```

Use:

```text
- shadcn/ui for source-owned UI wrappers
- Radix UI for accessible primitives
- lucide-react for icons
- sonner for ephemeral mutation feedback
- cmdk for the CommandMenu primitive
```

Constraints:

```text
- sonner is only for transient feedback. Meaningful workflow state must also appear inline in rows, detail panels, or activity history.
- cmdk is only the visual/interaction primitive. FeedbackOps CommandMenu also needs a command registry, permission filtering, routing integration, and audit/telemetry hooks.
- lucide-react requires an icon vocabulary so the same icon is not reused inconsistently across evidence, links, permissions, public updates, task requests, and risk signals.
```

### Data Display

```text
@tanstack/react-table
@tanstack/react-virtual
```

Use:

```text
- ObjectList for workflow-first lists
- DataTable for comparison-heavy operational tables
- virtualization for large VOC, response, and audit lists
```

Constraints:

```text
- Do not let each feature screen compose TanStack Table independently.
- Build one canonical ObjectList/DataTable abstraction early.
- Keyboard navigation, selection state, sticky headers, loading, empty, error, and permission-limited states belong in the shared abstraction.
```

### Drag And Drop

```text
@dnd-kit/core
@dnd-kit/sortable
```

Approved use:

```text
- Product Area tree sorting
- Survey Builder question ordering
- bounded Task Board interactions
```

Avoid:

```text
- using drag as the primary workflow for permission queues
- using drag as the only way to repair Action Dashboard items
- hidden state changes that are not keyboard-accessible
```

### Charts

```text
recharts
```

Use:

```text
- small inline distribution charts
- coverage indicators
- survey result summaries
- product-area breakdowns
```

Constraint:

```text
Dashboard screens must remain action-queue-first, not BI-card-first.
```

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
1. Copy into packages/ui/src/ui, packages/ui/src/product, or packages/ui/src/domain.
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
Prefer Recharts directly for small charts.
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
These are full component systems with stronger visual and API opinions. They can speed up generic admin surfaces, but they work against the FeedbackOps requirement to own dense Linear-like visual language, permission-aware states, and evidence-to-action workflow components.
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

The stack must include explicit permission-aware components.

Required components:

```text
- PermissionGate
- RedactedValue
- PermissionBlockedPanel
- AccessRequestDialog
```

Rules:

```text
- Restricted linked content should not silently disappear.
- A user should see a safe blocked state when the existence of restricted content is visible.
- Redacted content must not leak internal task comments, personal survey responses, customer-sensitive data, or admin-only links.
- Permission request paths must show scope and reason requirements.
```

## Command Menu Requirements

CommandMenu is a product subsystem, not only a `cmdk` wrapper.

Required pieces:

```text
- command registry
- route integration
- current selection actions
- permission filtering
- disabled reasons
- recent object source
- audit/telemetry hooks for sensitive actions
```

Rules:

```text
- Command verbs must match visible UI actions.
- Permission-blocked actions may appear disabled with a reason.
- Sensitive actions should route to a confirmation flow rather than execute directly.
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

## Implementation Order

Recommended order:

```text
1. Implement semantic frontend tokens derived from DESIGN.md and the base theme.
2. Add shadcn/ui Radix-backed primitives.
3. Build AppShell, Button, Badge, Field, Dialog, Sheet, Popover, Tooltip, Command, Toast.
4. Build StatusBadge, SignalBadge, PermissionGate, RedactedValue, PermissionBlockedPanel.
5. Build ObjectList and DetailPanel.
6. Build DataTable only after ObjectList behavior is stable.
7. Build LinkedEntityTrail, EvidenceHighlight, PublicUpdateComposer, ActionQueueRow.
8. Use domain screens to validate shared components.
```

## Package Baseline

Initial MVP package direction:

```text
apps/frontend runtime dependencies:
- lucide-react
- sonner
- cmdk
- @tanstack/react-table
- @tanstack/react-virtual
- @dnd-kit/core
- @dnd-kit/sortable
- recharts
```

Add shadcn/ui components through the shadcn CLI rather than treating shadcn as a normal runtime UI dependency.
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
- Require canonical ObjectList/DataTable wrappers.
- Add explicit permission-aware UI primitives.
- Scope dnd-kit and chart usage.
- Treat CommandMenu as a product subsystem.
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
