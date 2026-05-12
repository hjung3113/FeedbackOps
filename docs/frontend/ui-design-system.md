# FeedbackOps Frontend UI Design System

## Purpose

This document is the frontend implementation contract for FeedbackOps UI.

It is limited to UI design, component behavior, states, layout, responsive behavior, and accessibility. It does not define backend APIs, data ownership, or domain rules.

Visual foundation:

```text
DESIGN.md
```

Product UI intent:

```text
docs/design/12-ui-ux-principles.md
```

## Relationship To DESIGN.md

`DESIGN.md` is the visual reference and token seed:

```text
- dark Linear-like aesthetic
- color palette
- typography
- spacing
- radius
- shadows
- base button/card/input/badge styling
```

Implementation precedence:

```text
- DESIGN.md owns raw visual token seed.
- docs/frontend/ui-design-system.md owns reusable UI pattern contracts.
- docs/frontend/component-inventory.md owns component inventory and required states.
- docs/frontend/routes-and-layout.md owns route and URL state behavior.
- docs/frontend/interaction-patterns.md owns workflow-level UX transitions.
- App code should consume semantic tokens, not raw color tokens directly.
```

This document fills the frontend gaps:

```text
- component anatomy
- variants
- interaction states
- layout contracts
- responsive behavior
- accessibility behavior
- FeedbackOps-specific UI patterns
```

## Global Layout Contracts

### AppShell

Purpose:

```text
The persistent application frame for all internal FeedbackOps screens.
```

Anatomy:

```text
- LeftSidebar
- MainRegion
- RightDetailPanel optional
- CommandMenu overlay
- ToastRegion
```

Desktop layout:

```text
- LeftSidebar width: 240px default
- LeftSidebar collapsed width: 56px
- MainRegion: fills remaining width
- RightDetailPanel width: 420px default
- RightDetailPanel min width: 360px
- RightDetailPanel max width: 520px
```

Rules:

```text
- MainRegion remains usable when RightDetailPanel is open.
- Opening a detail panel should not navigate away from the list context.
- Object creation from a selected object should prefer inline panel or drawer over full-page redirect.
- Avoid full-screen modals for routine workflow actions.
```

### Responsive Behavior

Breakpoints:

```text
- mobile: < 768px
- tablet: 768px - 1023px
- desktop: >= 1024px
```

Mobile:

```text
- LeftSidebar becomes drawer navigation.
- RightDetailPanel becomes full-screen drill-in panel.
- Dense tables become stacked object rows.
- Primary action remains sticky at bottom when form-like.
```

Tablet:

```text
- LeftSidebar may collapse by default.
- RightDetailPanel overlays MainRegion unless there is enough width.
- Object rows remain list-first.
```

Desktop:

```text
- Sidebar, list, and detail panel can be visible together.
- Bulk actions appear in toolbar after selection.
```

## Core Components

### ObjectList

Purpose:

```text
Shared list pattern for VOC, Findings, Task Requests, Tasks, Surveys, and Dashboard queues.
```

Anatomy:

```text
- ListToolbar
- FilterViewTabs
- ObjectRow[]
- EmptyState
- LoadingState
- ErrorState
- BulkActionBar when rows selected
```

ObjectRow anatomy:

```text
- selection checkbox optional
- object icon
- title
- primary status badge
- secondary signal badges
- metadata line
- owner/avatar optional
- linked entity count optional
- next action slot optional
- overflow menu
```

Sizing:

```text
- compact row height: 40px
- default row height: 52px
- expanded row min height: 88px
- row horizontal padding: 12px
- row gap: 8px
```

States:

```text
- default
- hover
- selected
- active/open in detail panel
- disabled
- permission-limited
- loading skeleton
- error
```

Rules:

```text
- Clicking the row opens the RightDetailPanel.
- Inline controls must not accidentally trigger row open.
- Multi-select enables BulkActionBar.
- Rows should remain scannable without reading descriptions.
```

### InboxList

Purpose:

```text
Specialized ObjectList for VOC triage.
```

Required row fields:

```text
- VOC title
- severity
- reporter-facing status
- owner
- product area
- created time
- similar VOC indicator
- linked Finding / Task indicator
- next action
```

VOC next action examples:

```text
- Triage
- Link Product Area
- Add to Cluster
- Create Finding
- Request Task
- Write Public Update
```

### DataTable

Purpose:

```text
Dense tabular display for operational lists where column comparison matters.
```

Required behavior:

```text
- sticky header
- sortable columns
- filterable columns
- column visibility optional
- row selection
- keyboard navigation
- empty/loading/error states
```

Rules:

```text
- Use ObjectList over DataTable when workflow action is more important than column comparison.
- Do not use wide tables on mobile; transform rows into stacked ObjectRow layout.
```

### DetailPanel

Purpose:

```text
Preserve list context while inspecting or editing an object.
```

Anatomy:

```text
- PanelHeader
- IdentityBlock
- StatusBlock
- FieldSections
- EvidenceBlock optional
- LinkedEntitiesBlock optional
- ActivityBlock optional
- PublicUpdateBlock optional
- NextActionBlock
- StickyActionFooter optional
```

PanelHeader:

```text
- object type
- object id optional
- close button
- overflow menu
- open full page optional
```

Rules:

```text
- The most important next action appears above the fold.
- Evidence and source context should be visible without deep navigation.
- Internal status and reporter-facing status must be visually separate.
- Permission-hidden content should show a PermissionBlockedPanel, not disappear silently.
- Unsaved edits show dirty state and confirm before close.
```

### LinkedEntityTrail

Purpose:

```text
Make VOC, Evidence, Finding, Task, Survey, and Outcome feel connected.
```

Anatomy:

```text
- source node
- evidence node optional
- finding node
- task request node optional
- task or milestone node optional
- outcome survey node optional
```

Rules:

```text
- Each node has object type, title, status, and jump action.
- Missing expected link is shown as a dashed placeholder with CTA.
- Permission-hidden node uses summary-visible contract when available.
```

Example:

```text
VOC → Evidence → Finding → Task Request → Task → Outcome Survey
```

### EvidenceHighlight

Purpose:

```text
Show the exact evidence fragment behind a Finding or Task.
```

Anatomy:

```text
- quote_or_summary
- source type
- source title
- customer/account optional
- sentiment optional
- importance optional
- product area optional
- created by
```

Variants:

```text
- VOC evidence
- Survey response evidence
- Manual note evidence
- permission-limited evidence
```

Rules:

```text
- Quotes should be visually distinct from generated summaries.
- Evidence source must be visible.
- If source is hidden by permission, show restricted summary state.
```

### StatusBadge

Purpose:

```text
Represent lifecycle status without mixing internal and reporter-facing meanings.
```

Families:

```text
- internal-task-status
- reporter-facing-voc-status
- task-request-status
- finding-status
- survey-status
- permission-request-status
```

Rules:

```text
- Internal Task Status and Reporter-facing VOC Status must use different badge shapes or prefixes.
- Do not use Neon Lime for ordinary status badges.
- Neon Lime is reserved for primary action and selected/focus emphasis.
- Status badges must include text, not color alone.
```

Recommended visual distinction:

```text
- internal-task-status: square-ish 4px radius, muted border
- reporter-facing-voc-status: pill shape, public-facing icon
- severity: compact chip with stronger color
- confidence: neutral chip with signal icon
```

### SignalBadge

Purpose:

```text
Represent non-lifecycle signals.
```

Variants:

```text
- severity: low / medium / high / critical
- confidence: low / medium / high
- priority: low / medium / high / urgent
- permission: allowed / blocked / requested
- visibility: internal_only / summary_visible / visible_to_reporter / admin_only
- link-state: linked / unlinked / stale
- archive-state: active / archived
```

Rules:

```text
- Signal badges are secondary unless they represent urgent action.
- Critical and blocked states must remain distinguishable for color-blind users through icon or label.
```

### PublicUpdateComposer

Purpose:

```text
Separate internal notes from reporter-visible communication.
```

Anatomy:

```text
- reporter-facing status selector
- public update textarea
- recipient scope
- preview
- send/save action
- internal note toggle or separate tab
```

Rules:

```text
- Public update copy must be clearly marked as reporter-visible.
- Internal comments must never share the same input area as public updates.
- Bulk update candidates show affected reporters before confirmation.
```

### ActionQueueRow

Purpose:

```text
Dashboard row that explains a broken workflow and offers the next repair action.
```

Anatomy:

```text
- queue reason
- source object preview
- missing link or stale state
- owner/status
- recommended action
- secondary actions
```

Examples:

```text
- High Severity VOC without Finding
- Finding without Task Request
- Released Task with unresolved Reporter-facing VOC Status
- Bad Outcome Survey without Follow-up Task
```

Rules:

```text
- The row must answer: what is wrong, why it matters, what to do next.
- Primary action opens inline flow or detail panel, not a disconnected page.
```

### PermissionBlockedPanel

Purpose:

```text
Explain restricted content and offer a permission request path.
```

Anatomy:

```text
- blocked content summary
- reason access is restricted
- request access CTA when allowed
- required permission/scope
- fallback public summary optional
```

Rules:

```text
- Never show blank space where restricted linked content exists.
- Do not leak internal details in the blocked-state copy.
```

### CommandMenu

Purpose:

```text
Fast keyboard-driven actions and navigation.
```

Trigger:

```text
Cmd/Ctrl + K
```

Sections:

```text
- Navigate
- Create
- Current Selection Actions
- Recent Objects
- Admin / Settings when allowed
```

Command row anatomy:

```text
- icon
- verb + object
- shortcut optional
- scope/context
- disabled reason optional
```

Rules:

```text
- Command verbs must match visible UI actions.
- Permission-blocked commands can appear disabled with reason.
- Commands should be context-aware based on current screen and selected object.
```

### ActionToolbar

Purpose:

```text
Expose common actions for current view or selected rows.
```

Rules:

```text
- One dominant primary action maximum.
- Secondary actions use subtle buttons or icon buttons.
- Destructive actions go in overflow unless they are the only purpose of the view.
- Bulk actions appear only after selection.
```

### Forms

Required field components:

```text
- TextInput
- Textarea
- Select
- Combobox
- MultiSelect
- Checkbox
- RadioGroup
- SegmentedControl
- DateInput
- UserPicker
- ProductAreaPicker
```

Form rules:

```text
- Labels appear above fields in forms and as compact inline labels in detail panels.
- Required fields use text marker and validation, not color alone.
- Validation appears after blur or submit.
- Save failure preserves user input.
- Dirty forms warn before close.
```

### Modal / Drawer / InlineCreatePanel

Usage rules:

```text
- InlineCreatePanel: preferred for creating linked objects from current context.
- Drawer: use for multi-step creation while preserving current screen.
- Modal: use for confirmation, destructive actions, or short focused tasks.
- Full page: use only for complex builders, such as Survey Builder.
```

## State Contracts

### Empty State

Required content:

```text
- title
- short reason
- primary action when useful
- secondary action optional
```

Rules:

```text
- Empty states should be operational, not decorative.
- Do not use large illustration-led empty states in dense work surfaces.
```

### Loading State

Rules:

```text
- Lists use skeleton rows.
- DetailPanel uses skeleton sections.
- Dashboard queues show independent loading per queue when possible.
- Avoid full-page spinners after the app shell is loaded.
```

### Error State

Rules:

```text
- Preserve user context.
- Explain what failed.
- Offer retry when possible.
- For failed mutations, keep user-entered content.
```

### Permission-Limited State

Rules:

```text
- Show PermissionBlockedPanel.
- Use summary-visible data when permitted.
- Provide Request Access CTA when the user can request permission.
```

### Optimistic Update State

Rules:

```text
- Small status changes may update optimistically.
- Cross-system creation should show pending state until link creation succeeds.
- On failure, rollback visual state and show retry.
```

## Semantic Tokens To Add On Top Of DESIGN.md

Text:

```text
--text-primary
--text-secondary
--text-muted
--text-disabled
--text-danger
--text-warning
--text-success
--text-info
```

Surfaces:

```text
--surface-canvas
--surface-sidebar
--surface-list
--surface-row-hover
--surface-row-selected
--surface-detail
--surface-popover
--surface-field
--surface-blocked
```

Borders and focus:

```text
--border-subtle
--border-strong
--border-selected
--focus-ring
--focus-ring-danger
```

Workflow:

```text
--status-internal-*
--status-reporter-*
--severity-*
--confidence-*
--priority-*
--permission-*
--visibility-*
```

Layout:

```text
--sidebar-width
--sidebar-width-collapsed
--detail-panel-width
--detail-panel-width-min
--detail-panel-width-max
--toolbar-height
--row-height-compact
--row-height-default
--badge-height
--icon-size-sm
--icon-size-md
```

## Accessibility Rules

```text
- All interactive controls must have visible focus states.
- Status and severity cannot rely on color alone.
- CommandMenu and menus must be keyboard navigable.
- DetailPanel close, save, and destructive actions must be reachable by keyboard.
- Icon-only buttons require accessible labels and tooltips.
- Error messages must be associated with fields.
- Respect reduced motion settings.
- Touch targets should be at least 40px on mobile.
```

## Screen Mapping

VOC Inbox:

```text
AppShell + InboxList + DetailPanel + StatusBadge + SignalBadge + PublicUpdateComposer + LinkedEntityTrail
```

Finding Detail:

```text
DetailPanel + EvidenceHighlight + LinkedEntityTrail + SignalBadge + ActionToolbar
```

Task Request Queue:

```text
ObjectList + ActionQueueRow pattern + DetailPanel + StatusBadge + ActionToolbar
```

Task Detail:

```text
DetailPanel + StatusBadge + EvidenceHighlight + LinkedEntityTrail + PublicUpdateComposer
```

Survey Result:

```text
DataTable/ObjectList + ResultSummaryBlock + EvidenceHighlight + ActionToolbar
```

Action Dashboard:

```text
ActionQueueRow + ObjectList + SignalBadge + LinkedEntityTrail + DetailPanel
```

Permission Requests:

```text
ObjectList + DetailPanel + PermissionBlockedPanel + StatusBadge + ActionToolbar
```

## Implementation Guidance

```text
- Build reusable components from this document before building domain screens.
- Prefer composition over one-off screen-specific components.
- If a screen needs a new status, signal, or row pattern, add it here before implementing.
- Keep DESIGN.md as the visual token reference; do not duplicate full token tables here.
```
