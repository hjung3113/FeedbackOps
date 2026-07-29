# Routes And Layout

## Purpose

This document defines route, URL state, and layout behavior for the FeedbackOps frontend.

Product UI intent lives in `docs/design/12-ui-ux-principles.md`.
Reusable component contracts live in `docs/frontend/ui-design-system.md`.

## Route Contract

```text
/
/my-work
/vocs?view=triage&triage=unassigned&managedSystem=:managedSystemId|all&selected=:vocId
/vocs?view=inbox&managedSystem=:managedSystemId|all&selected=:vocId
/vocs?view=my&selected=:vocId
/voc-clusters?selected=:clusterId
/surveys
/surveys/:surveyId
/surveys/:surveyId?builder=true
/surveys/:surveyId/results
/tasks?view=my&managedSystem=:managedSystemId|all&selected=:taskId
/tasks?view=inbox&managedSystem=:managedSystemId|all
/tasks?view=requests&status=pending_review&managedSystem=:managedSystemId|all&selected=:requestId
/tasks?view=backlog&managedSystem=:managedSystemId|all&selected=:taskId
/tasks?view=board&managedSystem=:managedSystemId|all&selected=:taskId
/tasks?view=milestones&managedSystem=:managedSystemId|all&selected=:milestoneId
/integration
/findings?managedSystem=:managedSystemId|all&selected=:findingId
/integration/evidence?managedSystem=:managedSystemId|all
/integration/coverage?managedSystem=:managedSystemId|all
/integration/links?managedSystem=:managedSystemId|all
/admin/managed-systems
/admin/analytics-areas?selected=:analyticsAreaId
/admin/permissions/requests?selected=:requestId
/admin/settings
```

Route naming rules:

```text
- Home is the user-facing navigation label for `/`.
- Findings routes at top-level `/findings`, while Integration retains feature ownership.
- Evidence, Coverage, and Links stay under `/integration/*`.
- Task Requests are Tasks intake routes, not top-level routes.
- Analytics Areas and Permission Requests are Admin routes, not top-level work routes.
- Managed Systems are MVP scope, filters, defaults, and dashboard grouping; they do not create per-Managed-System route trees.
- Analytics Area is secondary classification under Managed System; it may appear as filter, column, detail metadata, Admin catalog item, or nested dashboard breakdown, but not as top-level navigation.
- `managedSystem=all` means the actor's effective Managed System scope union. It is workspace-wide only for Admin.
- Work Initiatives may group execution work after triage, but they are not VOC scope owners.
- Work Initiative routes are future routes and are not part of the MVP route contract.
```

VOC route views:

```text
- `/vocs?view=inbox` is the open-processing workspace for newly submitted, recently updated, waiting reporter, and follow-up-needed VOCs.
- `/vocs?view=triage` is the structured decision workspace for ownership, severity, Analytics Area, similar VOC, follow-up, and no-follow-up decisions.
- Inbox and Triage share the `/vocs` route family and list/detail mechanics, but Triage must not be implemented as only an Inbox filter.
- `/vocs?view=list` or saved list views may support broader browsing after the Inbox and Triage workspaces are defined.
- `/voc-clusters` owns cluster-specific list/detail behavior.
```

## Role Level Navigation Contract

Navigation is Role Level-based display only; backend permission checks remain authoritative.

```text
User:
- Primary nav: Submit VOC, My VOCs, Surveys.
- Hidden by default: Triage, Findings, Task Requests, Tasks, Integration, Admin.
- Home may show only backend-provided user-safe queues.

Developer:
- Primary nav: Home, My Work, VOC Triage, Tasks intake, Tasks, Integration, Surveys when assigned.
- Linked VOC/Finding context appears only as backend-approved summaries.
- Managed System scope controls which work is visible and actionable.

Admin:
- Primary nav includes Admin, Managed System Registry, Analytics Areas, Permission Requests, and settings.
```

Current sidebar entries live in `SIDEBAR_ENTRIES` (`apps/frontend/src/routes/_authed.tsx`) — that array is authoritative; this paragraph describes it. Entries are grouped under the section labels `VOC` (Inbox, Triage, My VOCs, Clusters, Findings, New VOC), `TASKS` (Task Requests, Tasks, My Tasks), and `MANAGED SYSTEMS` (Managed Systems, Analytics Areas). Per the AGENTS.md two-consumer rule, each feature adds its entry in the slice that owns it.

Count badges and global Managed System scope selection are still absent — they are the scope of #143 (GlobalRail multi-domain IA).

Routes may exist without being visible in navigation. Direct route access must restore AppShell and render allowed content, summary-visible content, request-access state, not_found, or permission_denied according to backend response.

## Home Queue Contract

Home uses one shared route and container. It must not fork into separate
role-specific products. The backend provides the queue groups and summary-safe
items the actor may see.

```text
User Home:
- Own submitted VOCs
- Reporter Reply requested from the actor
- Surveys the actor can answer

Developer Home:
- Assigned VOC triage or follow-up
- Task Requests awaiting the actor's review or action
- Assigned Tasks
- Summary-safe recovery items within effective Managed System scope when the actor can act on them

Admin Home:
- Workspace or Managed System operational gaps
- Permission Requests
- Unassigned queues
- Policy-driven recovery queues that need administrative action
```

Frontend Home renders only backend-provided queue groups. It may choose layout,
empty states, and ordering affordances, but it must not infer hidden queues from
role labels alone.

Home may show the same recovery item as Dashboard or Integration only when the
current actor can personally act on it now, such as owner, reviewer, assignee,
or scoped actor with the required capability. It uses the same recovery identity
as the other surfaces.

## URL State Rules

```text
- List filters, view tabs, sort, and selected object must be representable in URL state.
- VOC, Survey, Task, Integration, and Home views may include `managedSystem=:managedSystemId|all` as URL state.
- For Developers, `all` must query only their effective Managed System scope union. For Users, own-work views should not expose `all` as a workspace-wide choice.
- The global Managed System switcher sets default Managed System context but must not create separate per-Managed-System navigation.
- Managed System filters refine lists and defaults; they do not create separate VOC, Survey, Task, or Integration route trees.
- Desktop selection opens RightDetailPanel without losing list context.
- Dashboard recovery item selection opens a Dashboard-scoped recovery detail in
  RightDetailPanel. Source-object jump actions navigate to the owning route
  while preserving the Dashboard filters in browser history.
- In `view=milestones`, desktop selection opens Milestone Detail in RightDetailPanel; the list remains the primary context.
- Mobile selection uses a drill-in route; back returns to the previous list filters.
- Browser refresh on a selected URL restores AppShell, list context, and selected detail when data is accessible.
- Closing a detail panel preserves filters, sort, and scroll position when possible.
- CommandMenu actions must route to the same panel, drawer, or page as visible UI buttons.
```

## Managed System Scope Switcher

`managedSystem=all` is a scope value, not a workspace bypass.

```text
- Admin: `all` means true workspace-wide scope on Admin, Dashboard, VOC, Tasks, Surveys, and Integration views where the backend allows it.
- Developer: `all` may appear on VOC, Tasks, Dashboard, and Integration views only when the actor has access to more than one Managed System; it means the union of the actor's effective Managed System scopes.
- User: `all` is hidden on Home, My VOCs, Survey response, and other own-work views; the backend returns only actor-safe own work.
- Survey respondent surfaces do not show Managed System `all`.
- A Developer with one Managed System scope should see that scope directly, not a redundant `all` option.
```

Changing Managed System scope updates URL state and list queries. It must not
change the top-level route tree or imply that Managed Systems are separate app
instances.

## Linked Context Navigation

Linked-object jump actions navigate inside the same AppShell to the linked
object’s owning route. They do not inline the full linked object inside the
current compact surface.

```text
- List, board, queue, and summary linked-object clicks route to the linked object's route with selected id when available.
- DetailPanel linked-object clicks route to the owning route and restore the target object's detail panel or drill-in view.
- If the current panel or form has unsaved changes, confirm before navigation.
- If there are no unsaved edits, navigate directly and preserve as much prior list state as practical in browser history.
- CommandMenu linked-object commands use the same route intents as visible jump actions.
```

## Primary Layout Grammar

```text
- List-first + RightDetailPanel is the default operating grammar for scannable work objects.
- This default applies to VOC, VOC Cluster, Finding, Evidence, Task Request, Task, Milestone, Permission Request, and operational queue items when the main job is scanning records and acting on one selected object.
- A route may use another primary layout only when the user's main job is not scanning records and acting on one selected object.
- Allowed exceptions:
  - builder-first: complex creation flows such as Survey Builder.
  - board-first: execution management surfaces such as Tasks board view.
  - action queue-first: Home, Dashboard, and Integration recovery queues where the next action is primary.
  - result summary-first: Survey result summaries and coverage summaries where aggregate interpretation is primary.
  - settings/form-first: Admin configuration, Managed System Registry, Analytics Areas, workspace settings, and policy configuration.
- Exceptions must still preserve AppShell navigation, permission states, URL-restorable context, and deep links to the relevant object or action.
```

## Integration And Home Deep Links

Home, Dashboard, and Integration are all action queue-first surfaces, but they
answer different user questions:

```text
- Home: What can I personally act on now?
- Dashboard: Where is this Managed System or workspace operationally stuck?
- Integration: Where is source evidence, synthesis, execution, or validation disconnected?
```

Home and Integration next-action links must include:

```text
- source object type
- source object id
- target route
- selected detail object when applicable
- action intent
```

Example:

```text
/vocs?view=triage&triage=high_severity&selected=:vocId&action=create_finding
/findings?selected=:findingId&action=request_task
/tasks?view=board&selected=:taskId&action=review_reporter_status
/tasks?view=milestones&selected=:milestoneId&action=review_timeline
```

## Task And Milestone Layout Rules

```text
- Tasks views remain list-first or board-first operational surfaces.
- `view=milestones` shows a compact Milestone list with a mini timeline per row for schedule risk scanning.
- Selecting a Milestone opens RightDetailPanel as Milestone Detail.
- Milestone Detail uses tabs or anchored sections for Overview, Timeline, Tasks, Evidence, and Activity.
- The full Gantt chart lives in the Timeline section of Milestone Detail and shows child Tasks by date and internal Task status.
- The mini timeline in the list is a scan affordance only; it must not replace Milestone Detail.
- Reporter-safe summaries derived from Milestone or Task work must use explicit public-safe fields and must not expose raw Gantt internals.
```

## AppShell Layout

```text
Desktop >= 1024px:
- LeftSidebar: 240px default, 56px collapsed.
- MainRegion: fills remaining width.
- RightDetailPanel: 420px default, 360px min, 520px max.

Tablet 768px-1023px:
- LeftSidebar may collapse by default.
- RightDetailPanel overlays MainRegion when space is limited.

Mobile < 768px:
- LeftSidebar becomes drawer navigation.
- DetailPanel becomes full-screen drill-in.
- Dense tables become stacked ObjectRow layouts.
```

## Scroll Ownership

```text
- AppShell owns viewport height.
- LeftSidebar scrolls independently when needed.
- MainRegion owns list scroll.
- RightDetailPanel owns detail scroll.
- Sticky list toolbars stay inside MainRegion.
- Sticky action footers stay inside the panel or drawer that owns the form.
```

## Creation Surface Rules

```text
- InlineCreatePanel: preferred for single-step linked object creation.
- Drawer: use for multi-step creation while preserving current context.
- Modal: use for confirmation, destructive actions, or short focused tasks.
- Full page: use for complex builders such as Survey Builder.
```
