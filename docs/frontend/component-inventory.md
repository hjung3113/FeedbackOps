# Frontend Component Inventory

## Purpose

This inventory defines the reusable components that should exist before domain screens are built. The complete shipped `@fops/ui` export inventory is `packages/ui/src/index.ts`; this document describes reusable component contracts and required states.

Component ownership paths live in `docs/tech-stack/component-stack.md`.
Screen mapping lives in `docs/frontend/ui-design-system.md`.

## Token Governance

```text
- docs/frontend/tokens.md provides raw visual token seed.
- Frontend components consume semantic tokens from the design system layer.
- Screen code must not hard-code colors, radii, or shadows.
- New tokens require updating this document or docs/frontend/ui-design-system.md.
```

## Primitive Components

| Component | Variants | Required States | Accessibility Contract |
| --- | --- | --- | --- |
| Button | primary, secondary, subtle, destructive; `size=toolbar`, `icon-sm`, `icon-xs`; `spacing=compact`; `padding=compact`; `wrapText` (size `sm` only) | hover, pressed, focus-visible, disabled, loading | label required |
| FieldLabel | `appearance=section`, `tone=secondary` | default, required, help tip | associated control; the required `*` is `aria-hidden`; the help tip trigger has an accessible name |
| FieldRow | `inset=none`, `layout=property` | default, detail property | label and value remain readable |
| Card / CardContent | `Card padding=compact`; `CardContent padding=none` | default | presentational container |
| EmptyState | `density=compact`, `padding=wide` | title, optional body, icon, action | useful text; action is keyboard reachable |
| IconButton | subtle, selected, destructive | hover, pressed, focus-visible, disabled | aria-label and tooltip required |
| Badge | status, signal, visibility, permission | default, muted, urgent, blocked | text label required |
| TextInput | default, search, invalid | focus, disabled, invalid, loading | associated label and error |
| Textarea | default, public-update, internal-note | focus, disabled, invalid | associated label and error |
| RichEditor (+ RichContentRenderer for read) | voc-description, reporter-reply, public-update, internal-comment; `RichContentRenderer size=sm` | focus, disabled, invalid, uploading, readonly | label, toolbar, and editor region required |
| Select | single, multi; `SelectTrigger appearance=canvas`, `appearance=field`, `density=compact` | focus, disabled, invalid, loading | keyboard navigable |
| DatePicker | typed date, calendar; `appearance=detail` | focus, disabled, invalid, min/max, clear, keyboard navigation | associated label; live validity for submit gating; error appears after blur or submit; calendar is keyboard accessible |
| Combobox | user, analytics-area, entity | focus, empty, loading, error | keyboard navigable |
| Checkbox | default, indeterminate | focus, checked, disabled | label required |
| RadioGroup | default, segmented | focus, selected, disabled | group label required |
| Tooltip | text, shortcut; `TooltipContent size=sm` | open, closed | not sole source of critical info |
| Popover | menu, info, picker | open, focus-trapped when interactive | escape closes |
| Dialog | confirmation, destructive; `DialogFooter spacing=compact` | open, loading, error | focus trap |
| Drawer | create, detail, multi-step | open, dirty, loading, error | focus management |
| Toast | success, error, warning, info | visible, dismissed | non-blocking |
| Skeleton | row, panel, card; `shape=rounded` | loading | reduced motion safe |
| ToggleGroupItem | `appearance=selected-filter` | selected, unselected, disabled | keyboard navigable |
| Avatar | user, team | default, missing image | text fallback |
| Table | data, comparison | loading, empty, selected | keyboard row navigation |
| ListRow | object, action-queue | hover, selected, active, permission-limited | row action is keyboard reachable |
| Panel | detail, blocked, create | loading, dirty, error | close is keyboard reachable |
| DetailPanelHeader | VOC, Finding, Task Request, Task, Milestone, Survey, Cluster | record id available or omitted | kind chip uses its accent and dot; non-Milestone headers retain the accent stripe |
| UnassignedBadge | owner, reviewer | assigned value or missing | default label is `담당자 없음`; reviewer uses `검토자 없음`; danger tone includes text |
| Toolbar | view, action, bulk | default, selection-active | one primary action maximum |

## Composed Components

This list is the original prescriptive inventory and several entries were never built under these names, or at all. The shell shipped as `AppFrame` / `AppRail` / `AppSidebar` (`apps/frontend/src/lib/layout/`), governed by ADR-0020, which supersedes the `AppShell` / `RoleLevelAwareSidebar` naming below. Route shells (`ListShell`, `PageShell`) and `ObjectRow` live in `@fops/ui`. Treat the code and ADR-0020 as authoritative when they disagree with a name here. The Built Mapping section below maps design-time names to what shipped.

```text
AppShell (built as AppFrame)
RoleLevelAwareSidebar (built as AppRail + AppSidebar)
ManagedSystemScopeSwitcher (built as the AppSidebar scope control, #143)
ScopeFilterBar
ObjectList
InboxList
DataTable
DetailPanel
LinkedEntityTrail
EvidenceHighlight
StatusBadge
SignalBadge
PublicUpdateComposer
ConversationComposer
ReporterSummaryBlock
ActionQueueRow
PermissionBlockedPanel
CommandMenu
ActionToolbar
ManagedSystemPicker
AnalyticsAreaPicker
ReviewerPicker
UserPicker
AuditTimeline
```

## Built Mapping

Names in the primitive table and the composed list above are design-time names. This table maps them to what shipped; `packages/ui/src/index.ts` remains the export inventory.

| Design-time name | Shipped as | Path |
| --- | --- | --- |
| AppShell | `AppFrame` | `apps/frontend/src/lib/layout/AppFrame.tsx` |
| RoleLevelAwareSidebar | `AppRail` + `AppSidebar` | `apps/frontend/src/lib/layout/` |
| ManagedSystemScopeSwitcher | scope selector inside `AppSidebar` (`ManagedSystemScopeOption`) | `apps/frontend/src/lib/layout/AppSidebar.tsx` |
| ObjectList, ListRow | `ObjectRow` + `ListToolbar` / `ListTabs` + `ListStateMessage` | `packages/ui/src/data/ObjectRow.tsx`, `packages/ui/src/toolbar/`, `apps/frontend/src/components/ListStateMessage.tsx` |
| FilterViewTabs, Toolbar | `ListTabs` composed by `ListToolbar`, with `ListFilterButton` and `ListSortButton` | `packages/ui/src/toolbar/` |
| LoadingState, ErrorState | `Skeleton` rows; `ListStateMessage` `error` variant | `packages/ui/src/components/shadcn/skeleton.tsx`, `apps/frontend/src/components/ListStateMessage.tsx` |
| BulkActionBar | internal `BulkActionBar` of the VOC list (actions disabled by design) | `apps/frontend/src/features/voc/components/list/VocList.tsx` |
| DetailPanel, Panel | `DetailPanelHeader`, `DetailPanelSectionNav`, `PanelTitleBlock` (`inset=none`), `PanelSectionTitle` (`inset=panel`, `size=tiny`), `FieldRow`, `NestedTextBlock`, `Callout` | `packages/ui/src/panel/` |
| StatusBadge | shared `ReporterStatusBadge`, `InternalTaskBadge`; feature-local `SurveyStatusBadge`, `LinkStatusBadge`, `MilestoneStatusBadge` | `packages/ui/src/badges/`, `apps/frontend/src/features/surveys/components/`, `apps/frontend/src/features/integration/components/`, `apps/frontend/src/features/tasks/components/` |
| SignalBadge | `SeverityBadge`, `SeverityIndicator`, `UnassignedBadge`, `ManagedSystemPill`, `EntityIconBadge`, generic `OutlineBadge` | `packages/ui/src/badges/`, `packages/ui/src/indicators/` |
| RichContentEditor | `RichEditor` + `RichContentRenderer` | `packages/ui/src/rich-content/` |
| PublicUpdateComposer | feature-local `PublicUpdateComposer` | `apps/frontend/src/features/voc/components/detail/` |
| ConversationComposer | feature-local `ComposerSection` + `ComposerTabs` hosting `PublicUpdateComposer`, `ReporterReplyComposer`, `InternalCommentComposer` | `apps/frontend/src/features/voc/components/detail/` |
| EvidenceHighlight | feature-local `EvidenceHighlights` | `apps/frontend/src/features/findings/components/FindingDetail/` |
| ActionQueueRow | feature-local `ActionQueueRow` (Home); `IntegrationDashboardCards` (Integration) | `apps/frontend/src/features/home/HomeScreen.tsx`, `apps/frontend/src/features/integration/components/IntegrationDashboardCards.tsx` |
| CommandMenu | `CommandPalette` | `apps/frontend/src/lib/layout/command-palette/` |
| UserPicker | feature-local `OwnerPicker` (VOC Triage owner) | `apps/frontend/src/features/voc/components/triage/OwnerPicker.tsx` |
| Drawer | `Sheet` | `packages/ui/src/components/shadcn/sheet.tsx` |
| Toast | `sonner` `Toaster` mounted in the root route; `UndoToast` | `apps/frontend/src/routes/__root.tsx`, `packages/ui/src/feedback/UndoToast.tsx` |
| Avatar | `Avatar`, `UserAvatar`, `UserChip` | `packages/ui/src/components/shadcn/avatar.tsx`, `packages/ui/src/identity/` |
| TextInput | `Input` | `packages/ui/src/components/shadcn/input.tsx` |

Built under the same name: `LinkedEntityTrail`, `PermissionBlockedPanel`, `ManagedSystemPicker`, `AnalyticsAreaPicker`.

Never built: `IconButton`, `Table` / `DataTable`, `InboxList`, `ScopeFilterBar`, `ReporterSummaryBlock`, `ActionToolbar`, `ReviewerPicker`, `AuditTimeline`.

## Implemented Shared Flow Components

- `CommandPalette` (`apps/frontend/src/lib/layout/command-palette/`) — the inventory's `CommandMenu`, built in #611: cmdk's Radix Dialog hosted by `AppFrame`, shortcut + sidebar-row entry per `docs/frontend/routes-and-layout.md` → Global command palette (#611).
- `apps/frontend/src/features/cross-system/request-task/TaskRequestDraftCard.tsx` — neutral inline source request form and pending-source read presentation with the contract fields Evidence Summary and Requested Outcome; source mutations stay in their owning features.
- `ListTabs` — reusable 28px list tab strip with optional bare counts, icons, native title tips, and overflow controls; composed by `ListToolbar`.
- Internal `useHorizontalOverflow` — shared 1px scroll-edge state, resize observation, direct-child rebinding, and cleanup for `ListTabs` and `DetailPanelSectionNav`. Each consumer retains its active-item reveal, fade or scrollspy behavior, and component-specific layout rules.

## Status And Signal Catalog

```text
VOC Row Status Signals:
- Reporter-facing VOC Status: public progress shown to Reporter.
- VOC Triage State: internal workflow state for classification and follow-up decisions.
- Ownership State: unassigned, assigned user, or assigned team.
- Linked Execution Signal: linked Finding, Task Request, Task, or explicit no-follow-up-needed decision.
- These signals may appear in one row, but Reporter-facing VOC Status and VOC Triage State must be visually distinct and must not collapse into one generic status badge.

Reporter-facing VOC Status:
- 접수됨
- 검토 중
- 담당자 배정됨
- 처리 중
- 해결 준비 중
- 해결됨
- 다시 처리 중
- 종료됨

Task Status:
- Backlog
- Todo
- Doing
- Review
- Done
- Released
- Reopened

Task Request Status:
- pending_review
- approved
- rejected
- needs_more_evidence
- converted

Milestone Detail:
- Header with title, Primary Managed System, Analytics Area, owner, status, due date, and actions
- Overview section for why the milestone exists and source context
- Timeline section with child Task Gantt chart
- Tasks section with child Task list
- Evidence section with linked Evidence Highlights and source objects
- Activity section with decisions, audit events, and updates

Milestone List Row:
- Title and source context
- Managed System and Analytics Area
- Owner, status, due date, and progress
- Mini timeline for schedule risk scanning

Finding Status:
- draft
- active
- not_actionable
- converted
- archived

Permission Request Status:
- pending
- needs_more_info
- approved
- rejected
- expired
- revoked

Visibility:
- internal_only
- summary_visible
- visible_to_reporter
- admin_only
```

Rich content surfaces:

```text
- voc-description
- reporter-reply
- public-update
- internal-comment
```

Rich content constraints:

```text
- One shared WYSIWYG-first editor foundation across all rich-content surfaces.
- Surface-specific toolbar and rendering restrictions are required.
- Inline images are uploaded/stored as attachments and referenced from rich content.
- External image URLs and base64 body images are not allowed for inline rendering in MVP.
- Rich tables are editor nodes; large spreadsheets are file attachments.
```

## Visual State Requirements

```text
- Focus-visible must be visible on every surface (light canvas, tinted selected rows, cards).
- Selected row and hover row must be distinguishable.
- Disabled content must remain readable enough to explain why action is blocked.
- Invalid fields must show text and border/ring state, not color alone.
- Destructive actions must use destructive label and confirmation when irreversible.
- Loading and optimistic states must not erase user input.
- Permission-limited states must show PermissionBlockedPanel or summary-visible content.
```
