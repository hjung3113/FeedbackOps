# Frontend Component Inventory

## Purpose

This inventory defines the reusable components that should exist before domain screens are built.

Component ownership paths live in `docs/tech-stack/component-stack.md`.
Screen mapping lives in `docs/frontend/ui-design-system.md`.

## Token Governance

```text
- DESIGN.md provides raw visual token seed.
- Frontend components consume semantic tokens from the design system layer.
- Screen code must not hard-code colors, radii, or shadows.
- New tokens require updating this document or docs/frontend/ui-design-system.md.
```

## Primitive Components

| Component | Variants | Required States | Accessibility Contract |
| --- | --- | --- | --- |
| Button | primary, secondary, subtle, destructive | hover, pressed, focus-visible, disabled, loading | label required |
| IconButton | subtle, selected, destructive | hover, pressed, focus-visible, disabled | aria-label and tooltip required |
| Badge | status, signal, visibility, permission | default, muted, urgent, blocked | text label required |
| TextInput | default, search, invalid | focus, disabled, invalid, loading | associated label and error |
| Textarea | default, public-update, internal-note | focus, disabled, invalid | associated label and error |
| RichContentEditor | voc-description, reporter-reply, public-update, internal-comment | focus, disabled, invalid, uploading, readonly | label, toolbar, and editor region required |
| Select | single, multi | focus, disabled, invalid, loading | keyboard navigable |
| Combobox | user, analytics-area, entity | focus, empty, loading, error | keyboard navigable |
| Checkbox | default, indeterminate | focus, checked, disabled | label required |
| RadioGroup | default, segmented | focus, selected, disabled | group label required |
| Tooltip | text, shortcut | open, closed | not sole source of critical info |
| Popover | menu, info, picker | open, focus-trapped when interactive | escape closes |
| Dialog | confirmation, destructive | open, loading, error | focus trap |
| Drawer | create, detail, multi-step | open, dirty, loading, error | focus management |
| Toast | success, error, warning, info | visible, dismissed | non-blocking |
| Skeleton | row, panel, card | loading | reduced motion safe |
| Avatar | user, team | default, missing image | text fallback |
| Table | data, comparison | loading, empty, selected | keyboard row navigation |
| ListRow | object, action-queue | hover, selected, active, permission-limited | row action is keyboard reachable |
| Panel | detail, blocked, create | loading, dirty, error | close is keyboard reachable |
| Toolbar | view, action, bulk | default, selection-active | one primary action maximum |

## Composed Components

```text
AppShell
RoleLevelAwareSidebar
ManagedSystemScopeSwitcher
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
- Focus-visible must be visible on dark surfaces.
- Selected row and hover row must be distinguishable.
- Disabled content must remain readable enough to explain why action is blocked.
- Invalid fields must show text and border/ring state, not color alone.
- Destructive actions must use destructive label and confirmation when irreversible.
- Loading and optimistic states must not erase user input.
- Permission-limited states must show PermissionBlockedPanel or summary-visible content.
```
