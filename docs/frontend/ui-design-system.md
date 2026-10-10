# FeedbackOps Frontend UI Design System

## Purpose

This document is the frontend implementation contract for FeedbackOps UI.

It is limited to UI design, component behavior, states, layout, responsive behavior, and accessibility. It does not define backend APIs, data ownership, or domain rules.

Visual foundation:

```text
docs/frontend/tokens.md
```

Product UI intent:

```text
docs/design/12-ui-ux-principles.md
```

## Relationship To The Token Seed

`docs/frontend/tokens.md` is the visual reference and token seed:

```text
- light Samsung One UI aesthetic
- color palette
- typography
- spacing
- radius
- shadows
- base button/card/input/badge styling
```

Implementation precedence:

```text
- docs/frontend/tokens.md owns raw visual token seed.
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

### Three Route Shells (ADR-0020)

Every AppShell route classifies as one of three shells (ADR-0020): `PageShell` for page-body routes, `ListShell` for filter/list/detail routes, and `WorkbenchShell` for work surfaces that are not simple object lists. Do not introduce a fourth shell; extend one of these three when a route needs a new layout pattern.

### AppShell

Purpose:

```text
The persistent application frame for all internal FeedbackOps screens.
```

Anatomy:

```text
- AppRail + AppSidebar
- ManagedSystemScopeSwitcher when applicable (built as the AppSidebar scope control)
- MainRegion
- RightDetailPanel optional
- CommandMenu overlay
- ToastRegion
```

ToastRegion: the desktop bottom offset is `calc(var(--panel-footer-max) + 16px)` (sonner bottom-centred toaster). Footers are not height-capped; one taller than `--panel-footer-max` (a wrapping Finding footer) can be overlapped by a toast while it shows (#867, accepted).

Desktop layout:

```text
- LeftSidebar width: 240px default
- LeftSidebar collapsed width: 56px
- MainRegion: fills remaining width
- RightDetailPanel width: 440px default
- RightDetailPanel min width: 360px
- RightDetailPanel max width: 520px
```

Rules:

```text
- MainRegion remains usable when RightDetailPanel is open.
- Opening a detail panel should not navigate away from the list context.
- Object creation from a selected object should prefer inline panel or drawer over full-page redirect.
- Avoid full-screen modals for routine workflow actions.
- AppSidebar renders route-owned navigation entries. Admin discovery entries use the approved
  `workspace.admin` capability as a display hint; Admin route `PermissionGate`s remain authoritative.
- ManagedSystemScopeSwitcher is built as the AppSidebar scope control: it is rendered whenever the sidebar is expanded, `All` is always offered, Managed Systems outside the actor's grants are dimmed and marked `범위 밖`, and the control is disabled on Admin and Survey respondent routes (routes-and-layout.md "Managed System Scope Switcher").
- Switching Managed System scope updates URL state and list queries; it must not navigate to a duplicated per-Managed-System app tree.
- `All` in ManagedSystemScopeSwitcher means the actor's effective Managed System scope union; only Admin sees true workspace-wide all.
```

### Responsive Behavior

Desktop (≥1024px) only is built; the tablet/mobile rules below are the target contract, out of scope until responsive lands — `apps/frontend/AGENTS.md`.

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

Component names in this section are design-time names; see `docs/frontend/component-inventory.md` "Built Mapping" for what shipped.

### Shared Component Variants

These opt-in props encode repeated caller treatments. Their default values preserve each component's existing appearance; variant classes are applied before `className` so a caller can still supply layout-specific classes.

| Component | Opt-in props | Appearance contract |
| --- | --- | --- |
| Button | `size=toolbar`, `icon-sm`, `icon-xs`; `spacing=compact`; `padding=compact`; `wrapText` (size `sm` only: it sets a 32px minimum height) | Toolbar and icon dimensions, compact icon spacing/padding, or multiline labels |
| FieldRow | `inset=none`; `layout=property` | Remove horizontal inset or use the two-column milestone property layout |
| FieldLabel | `appearance=section`; `tone=secondary` | Muted uppercase section heading or secondary label color |
| EmptyState | `density=compact`; `padding=wide` | Compact empty state or 24px horizontal padding |
| Card / CardContent | `Card padding=compact`; `CardContent padding=none` | Compact Card padding or remove CardContent padding |
| SelectTrigger | `appearance=canvas`, `field`; `density=compact` | Canvas or form-field skin, or compact trigger dimensions |
| DatePicker | `appearance=detail` | Detail-surface background |
| DialogFooter | `spacing=compact` | Compact action spacing |
| PanelTitleBlock | `inset=none` | Remove title-block inset |
| PanelSectionTitle | `inset=panel`; `size=tiny` | Align section heading with panel content or render milestone-sized typography |
| RichContentRenderer | `size=sm` | Small rich-text rendering |
| Skeleton | `shape=rounded` | Smaller-radius placeholder (`rounded`, 4px instead of the default `rounded-md` 6px) |
| TooltipContent | `size=sm` | Small tooltip text |
| RadioGroup / RadioGroupItem | `appearance=segmented`; `RadioGroup spacing=compact` | Source-context segmented track and triggers, with radio semantics preserved; compact 4px gap between options |
| PopoverContent | `padding=compact`, `none` (default `p-4`) | 4px padding for option menus, or no padding when the content draws its own sections |
| ToggleGroup | `appearance=filter` | Compact card-surface track for filter choices |
| ToggleGroupItem | `appearance=selected-filter` | Selected filter uses the selected border, row background, text, and weight |
| `ProgressMeter` | `size=thin`, `normal`; `clip` (clip the fill to the rounded track; off by default); primary, success, warning, danger tones; unannotated by default, decorative, or labeled `meter` / `progressbar` semantics | Value is expressed as fill width; decorative mode hides the track and fill from assistive technology |
| `StatusBadgeFrame` | `reporter`, `task`, `severity`, `compact`, `compact-identity`, `compact-outline`, `link`; shared success, warning, muted, danger, and internal status tones | Shared geometry and token classes; tone plus token uses the exact `rgb(var(--token) / 0.12)` tint; each domain retains its own label and status-to-tone map |
| `ManagedSystemMark` | 16, 18, 22, 28px | Decorative square initial mark with caller-provided label and identity color |
| `SkeletonRows` | `size=compact`, `regular`; caller-owned count | Repeated list placeholders without owning caller spacing |
| `SkeletonBlocks` | `line`, `title`, `body`, `badge` | Named detail-panel placeholder shapes |
| `KeyboardShortcut` | compact shortcut hint | Shared keyboard-hint geometry; caller supplies platform label |
| `ToolbarKicker` | label, divider, route name | Inline route identity for dense workbench toolbars |

Picker option grids are feature-local in VOC triage: `PickerOptionGrid` applies the shared owner and severity column templates to the existing button, preserving its interaction and accessibility semantics.

### ObjectList

Purpose:

```text
Shared list pattern for VOC Triage/Inbox, Integration Findings, Tasks, Task intake, Surveys, and Home/Integration queues.
```

Anatomy:

```text
- ListToolbar (composes the reusable ListTabs strip)
- ListTabs: compact 28px strip with optional bare counts, decorative icons, native title tips, and overflow controls
- FilterViewTabs
- ObjectRow[]
- `ListStateMessage` for application list states, wrapping `@fops/ui` `EmptyState` with `empty`,
  `filtered`, and `error` variants
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
- compact row min height: 44px
- default row min height: 60px
- expanded row min height: 96px
- row horizontal padding: 20px
- row column gap: 12px
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
- analytics area
- created time
- no per-row same-Managed-System peer indicator; show that count in detail and triage copy instead
- linked Finding / Task indicator
- next action
```

VOC creation required fields:

```text
- title
- description using the shared RichContentEditor foundation
- Managed System required
- Analytics Area optional, limited to the selected Managed System
- Source Context optional, defaulting to Direct Use
```

Rules:

```text
- Do not ask the reporter for Severity at creation.
- Managed System cannot be changed by the reporter after creation.
- Analytics Area can be corrected during triage by an authorized Developer or Admin.
- When Source Context is Proxy Report, the description prompt should ask who or which team the Reporter is reporting for and the situation observed.
- Analytics Area appears as secondary metadata under Primary Managed System, not as a primary identity or permission indicator.
```

VOC next action examples:

```text
- Triage
- Link Analytics Area
- Add to Cluster
- Create Finding
- Request Task
- Write Public Update
```

VOC next actions must be rendered from backend-provided `next_actions`.
Frontend components must not infer whether actions are allowed by combining
status badges, Role Level labels, or linked-object indicators.

Status: only Survey result and outcome follow-up `next_actions` are populated today; VOC detail returns `[]`
(`docs/implementation/api/next-actions.md`), so the VOC action examples above are target vocabulary, not shipped ids.

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
- one shared kind chip with the kind accent, tint, and dot
- object id optional
- close button
- overflow menu
- open full page optional
- secondary navigation such as the Finding VOC return link may use the header extras slot
```

Rules:

```text
- The most important next action appears above the fold.
- Evidence and source context should be visible without deep navigation.
- Internal status and reporter-facing status must be visually separate.
- Permission-hidden content should show a PermissionBlockedPanel, not disappear silently.
- Unsaved edits show dirty state and confirm before close.
- Keep the 4px kind accent stripe on every header except Milestone.
- Omit the id until the record is available; render it in mono when present.
- Panel section navigation follows the Korean labels recorded in ADR-0057 A2; keep the approved domain nouns and anchor ids.
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
- finding node optional
- task request node optional
- task or milestone node optional
- outcome survey node optional
```

Rules:

```text
- Each node has object type, title, status, and jump action.
- Missing expected link is shown as a dashed placeholder with CTA only when policy or workflow configuration expects it.
- Permission-hidden node uses summary-visible contract when available.
- Compact surfaces use LinkedEntityTrail as preview only; full linked-object details belong in the linked object's DetailPanel or route.
```

Example:

```text
VOC → optional Evidence → optional Finding → optional Task Request → optional Task → optional Outcome Survey
```

### Managed System Identity Mark

Managed System marks use `managedSystemMarkColor(slug)` from `@fops/ui`, which
maps `tableau`, `power-bi`, `looker`, and `metabase` to their identity tokens.
Unknown slugs use the neutral `--managed-system-default` token. Keep the
Managed System name visible next to its mark.

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
- analytics area optional
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

Survey status labels (`apps/frontend/src/lib/copy/enum-labels.ts`):

```text
- draft → 초안 (neutral)
- open → 진행 중 (accent)
- closed → 종료됨 (muted-strong)
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
- Use the shared UnassignedBadge for missing owners and reviewers: danger text on a faint danger background, default label `담당자 없음`, reviewer label `검토자 없음`.
```

### RichContentEditor

Purpose:

```text
Shared WYSIWYG-first rich input foundation for VOC description, Reporter Reply, Public Update, and Internal Comment.
```

Surface variants:

```text
- voc-description
- reporter-reply
- public-update
- internal-comment
```

Rules:

```text
- Non-developer users must not need Markdown or HTML knowledge to write rich content.
- Each surface may restrict toolbar actions, embeds, and rendering.
- Pasted, dropped, or uploaded images appear inline but are stored as governed attachments.
- Do not store base64 body images.
- Do not render external image URLs inline in MVP.
- Rich Table support is spike-gated in MVP; when enabled, tables are stored as rich table nodes.
- Large spreadsheet-like data belongs in file attachments.
```

### PublicUpdateComposer

Purpose:

```text
Separate internal notes from reporter-visible communication.
```

Anatomy:

```text
- reporter-facing status selector
- public update RichContentEditor surface
- recipient scope
- preview
- send/save action
```

Rules:

```text
- Public update copy must be clearly marked as reporter-visible.
- Internal comments must never share the same input area as public updates.
- Bulk update candidates show affected reporters before confirmation.
```

### ConversationComposer

Purpose:

```text
Keep Public Update, Reporter Reply, and Internal Comment visibly separate in VOC detail.
```

Rules:

```text
- Reporter Reply belongs to the public VOC conversation and uses the reporter-reply editor surface.
- Public Update is authored by an Admin or same Managed System Developer and uses the public-update editor surface.
- Internal Comment is private operational discussion and uses a separate internal-comment editor surface.
- Internal Comment must never share the same input, submit action, or default visibility as Public Update.
- Public Update and Reporter Reply render in a public timeline; Internal Comment renders in a separate internal timeline.
- MVP conversation does not include real-time chat, reactions, read receipts, threaded replies, or general message editing.
- In the VOC conversation, mentions are supported only in the Internal Comment surface (picker-button insertion, no inline `@` autocomplete).
- Cluster update candidates must show selected target VOCs before applying; applying creates individual Public Updates and does not change Reporter-facing VOC Status automatically.
```

### ReporterSummaryBlock

Purpose:

```text
Show public-safe linked-work progress to the Reporter without exposing internal execution detail.
```

May show:

```text
- public title
- reporter-facing VOC status
- owning team public name
- expected resolution date when public
- last public update time
- public update excerpt
```

Must not show:

```text
- raw Task Status values such as Backlog, Todo, Doing, Review, Done, Released, or Reopened
- internal comments
- priority
- developer discussion
- severity or confidence
- internal due dates or root-cause analysis detail
```

### ActionQueueRow

Purpose:

```text
Home or Integration row that explains a local ownership gap, configured follow-up gap, or stale workflow state and offers the next repair action.
```

Anatomy:

```text
- queue reason
- source object preview
- missing expected link or stale state
- owner/status
- recommended action
- secondary actions
```

Examples:

```text
- Unassigned VOC in configured Managed System scope
- High Severity VOC eligible for follow-up and currently unlinked
- Finding marked actionable without Task Request or linked Task
- Released Task with unresolved Reporter-facing VOC Status
- Bad Outcome Survey without configured follow-up
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
- Render request access CTA when the backend marks the state request_access or blocked_requestable. A revoked or expired grant is also requestable; preserve its state copy and use the existing request-access action (ADR-0061, #767).
- If the backend marks linked content hidden, render nothing and do not show a placeholder.
- If the backend marks linked content denied, show non-requestable restricted copy unless policy allows appeal.
- Summary-visible linked content must use backend-provided safe summary fields only.
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
- Current Selection Actions (not built — first version, #611)
- Recent Objects (not built — first version, #611)
- Admin / Settings when allowed
```

Shipped as `CommandPalette` with the groups `이동`, `생성`, and `열기`; see `docs/frontend/routes-and-layout.md` "Global command palette (#611)".

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
- Permission-blocked commands can appear disabled with reason (not built — first version, #611).
- Commands should be context-aware based on current screen, selected object, and Managed System scope (not built — first version, #611).
- Command results must be filtered by the current effective workspace/Managed System scope.
- Blocked commands may appear only with backend-provided disabled reasons (not built — first version, #611).
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
- RichContentEditor
- Select
- DatePicker
- Combobox
- MultiSelect
- Checkbox
- RadioGroup
- SegmentedControl
- UserPicker
- AnalyticsAreaPicker
```

Form rules:

```text
- Labels appear above fields in forms and as compact inline labels in detail panels.
- Required fields use text marker and validation, not color alone.
- Validation appears after blur or submit.
- DatePicker validity remains live for submit gating; non-native submit handlers use `onValidityChange` to block invalid drafts.
- Save failure preserves user input.
- Dirty forms warn before close.
- Feature code uses the shared `Select` and `DatePicker`; do not use native `<select>` or `type="date"` controls.
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
- Lists use skeleton rows. Skeleton placeholder fill: bg-surface-blocked (visible on canvas, card, and detail surfaces).
- DetailPanel uses skeleton sections.
- Home and Integration queues show independent loading per queue when possible.
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

## Semantic Tokens (shipped in `packages/ui/src/styles/tokens.css`)

The semantic token set is defined in `packages/ui/src/styles/tokens.css`; `docs/frontend/tokens.md` is the seed and documents the `-label` text pairs under "Semantic Text Label Tokens". Application code consumes these groups, not the raw color tokens:

```text
Text: --text-*
Surfaces: --surface-*
Borders and focus: --border-*, --focus-ring, --focus-ring-danger
Workflow: --status-internal-*, --status-reporter-*, --severity-*, --confidence-*
Layout: see `Layout tokens` in tokens.css
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
- Touch targets should be at least 40px on mobile (target contract; mobile is not built).
```

## Screen Mapping

VOC Inbox:

```text
AppShell + InboxList + DetailPanel + StatusBadge + SignalBadge + RichContentEditor + PublicUpdateComposer + ConversationComposer + ReporterSummaryBlock + LinkedEntityTrail
```

Finding Detail:

```text
DetailPanel + EvidenceHighlight + LinkedEntityTrail + SignalBadge + ActionToolbar
```

Task Request Queue:

```text
ObjectList + ActionQueueRow pattern + DetailPanel + StatusBadge + ActionToolbar
```

Task Request UI labels:

```text
- Source follow-up CTA: Request Task.
- Review conversion CTA: Convert to Task.
- Do not use Create Task for VOC, Finding, or Survey follow-up.
```

The English action names above are the canonical semantics; rendered copy is Korean per ADR-0057 A2 (`apps/frontend/src/lib/copy/*`).

Task Board:

```text
ObjectList/KanbanBoard + DetailPanel + StatusBadge + SignalBadge + ActionToolbar
```

Rule:

```text
Task Board is execution work only. VOC owner assignment is not Task assignee/kanban assignment.
Task Board cards show title, status, assignee, priority, due date, Managed System, and linked-context indicators only. Source VOC, Finding, Survey, Evidence, Reporter Summary, and Public Update candidates belong in Task Detail or the source object's route.
```

Task Detail:

```text
DetailPanel + StatusBadge + optional EvidenceHighlight + optional LinkedEntityTrail
```

Survey Result:

```text
DataTable/ObjectList + ResultSummaryBlock + EvidenceHighlight + ActionToolbar
```

Home / Integration Action Queue:

```text
ActionQueueRow + ObjectList + SignalBadge + LinkedEntityTrail + DetailPanel
```

Permission Requests:

```text
ObjectList + DetailPanel + PermissionBlockedPanel + StatusBadge + ActionToolbar
```

Permission Request surfaces:

```text
Requester form:
- requested permission or capability
- requested scope
- blocked source object/action safe summary when available
- reason
- requested expiration or duration when supported

Admin review detail:
- requester identity and current role/scope
- requested capability and requested scope
- source object/action and safe source summary
- reason
- risk indicators
- requested expiration
- explicit deny state
- decision actions
```

## Implementation Guidance

```text
- Build reusable components from this document before building domain screens.
- Prefer composition over one-off screen-specific components.
- If a screen needs a new status, signal, or row pattern, add it here before implementing.
- Keep docs/frontend/tokens.md as the visual token reference; do not duplicate full token tables here.
```
