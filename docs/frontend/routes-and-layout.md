# Routes And Layout

## Purpose

This document defines route, URL state, and layout behavior for the FeedbackOps frontend.

Product UI intent lives in `docs/design/12-ui-ux-principles.md`.
Reusable component contracts live in `docs/frontend/ui-design-system.md`.

## Route Contract

```text
/
/home?tab=dashboard|inbox&managedSystem=:managedSystemId
/vocs?view=triage&tab=unassigned&managedSystem=:managedSystemId|all&selected=:vocId
/vocs?view=inbox&managedSystem=:managedSystemId|all&selected=:vocId
/vocs?view=my&selected=:vocId
/voc-clusters?managedSystem=:managedSystemId|all&selected=:clusterId
/voc-clusters/:clusterId
/surveys?managedSystem=:managedSystemId|all&selected=:surveyId
/surveys/:surveyId?managedSystem=:managedSystemId|all&filter.analytics_area=:areaId|unset&status=open&follow_up=needed&builder=true&returnTo=:encodedQueueUrl
/surveys/:surveyId/results
/surveys/:surveyId/follow-up
/surveys/participate
/surveys/:surveyId/respond
/tasks?view=my&q=:query&managedSystem=:managedSystemId|all&param=:taskId
/tasks?view=inbox&managedSystem=:managedSystemId|all
/tasks?view=requests&managedSystem=:managedSystemId|all&param=:requestId
/tasks?view=backlog&q=:query&managedSystem=:managedSystemId|all&param=:taskId
/tasks?view=board&q=:query&managedSystem=:managedSystemId|all&param=:taskId&public_update=missing
/tasks?view=milestones&managedSystem=:managedSystemId|all&param=:milestoneId
/integration?managedSystem=:managedSystemId|all
/findings?q=:query&managedSystem=:managedSystemId|all&selected=:findingId&execution=none&assignment=assigned|unassigned&filter.analytics_area=:areaId|unset&status=active&returnTo=:encodedVocUrl
/findings/:findingId (redirects to /findings?selected=:findingId)
/integration/evidence?managedSystem=:managedSystemId|all&source=voc|survey_response|note&q=:query&selected=:highlightId&cursor=:opaqueCursor
/integration/coverage?managedSystem=:managedSystemId|all
/integration/links?managedSystem=:managedSystemId|all&status=active|stale|detached|revoked&type=related_to
/admin/managed-systems
/admin/analytics-areas?managedSystem=:managedSystemId&includeArchived=true&selected=:analyticsAreaId
/admin/permissions/requests?tab=:tab&selected=:requestId
/admin/permissions/grants?tab=denies&selected=:permissionId
/admin/settings
```

| Deep-link route | Search keys | Omitted defaults |
|---|---|---|
| `/findings` | `q`, `managedSystem`, `selected`, `execution`, `assignment`, `filter.analytics_area`, `status`, `returnTo` | `managedSystem` for the caller's effective scope union (`all` is also accepted); `selected` when none is selected; `execution`, `assignment`, `filter.analytics_area` and `status` when unfiltered; `returnTo` unless the selected Finding was opened from a VOC flow |
| `/vocs` | `view`, `tab`, `q`, `managedSystem`, `selected`, `filter.severity`, `filter.reporterStatus`, `filter.owner`, `filter.analytics_area`, `sort`, `action`, `returnTo` | `view` for the Inbox default; `action` unless the create form is open; `returnTo` unless opened from a recovery queue; `tab`, `q`, `selected`, filters and `sort` when unset (`sort` defaults to `created_at:desc`; Triage has no `sort` or `q`); `managedSystem` for the caller's effective scope union (`all` is also accepted). There is no `cursor` key: paging state never enters the URL. |
| `/findings/:findingId` | `returnTo` | Redirects to `/findings?selected=:findingId`, preserving `returnTo` when supplied |
| `/surveys` | `managedSystem`, `selected`, `filter.analytics_area`, `status`, `follow_up` | `managedSystem` for the caller's effective scope union (`all` is also accepted); `selected` when none is selected; `filter.analytics_area`, `status` (`open`) and `follow_up` (`needed`) when unfiltered |
| `/surveys/:surveyId` | `managedSystem`, `filter.analytics_area`, `status`, `follow_up`, `builder`, `returnTo` | Same list-filter omissions as `/surveys`. Selection is the path `surveyId`, not a search key. `builder` unless the builder is open; `returnTo` unless opened from a recovery queue. The detail toolbar matches the index list (title, create, chips). Row selection and chip removal stay on `/surveys/:surveyId` and keep unrelated search. Close returns to `/surveys` with the remaining list context and drops `builder` and `returnTo`. |
| `/surveys/:surveyId/follow-up` | `returnTo` | `returnTo` unless opened from a recovery queue |
| `/surveys/participate` | — | No search state |
| `/surveys/:surveyId/respond` | — | No search state; respondent surfaces do not carry Managed System scope |
| `/voc-clusters` | `managedSystem`, `selected` | `managedSystem` for the caller's effective scope union (`all` is also accepted); `selected` when none is selected |
| `/voc-clusters/:clusterId` | — | No search state; the cluster id is the path param and the cluster list stays as the list context |
| `/tasks` | `q`, `view`, `param`, `managedSystem`, `public_update`, `filter.analytics_area`, `status`, `status_group`, `overdue`, `reporter_update`, `returnTo` | `view` for the backlog list; `param` when none is selected; `managedSystem` for the caller's effective scope union (`all` is also accepted); `public_update` (`missing`) unless filtering the board, backlog or My list to Released Tasks missing a public update (the board shows it as a removable `ActiveFilterBar` chip); `filter.analytics_area`, `status`, `status_group` (`in-flight`), `overdue` (`true`) and `reporter_update` (`needed`) when unfiltered — these apply to backlog and My only, not the board |
| `/home` | `managedSystem`, `tab`, `category`, `selected`, `presentation`, `history`, `returnTo`, `cursor` | Dashboard tab, visible presentation, history=false and absent filters/selection/return/cursor; Home scope is a UUID when explicit |
| `/integration` | `managedSystem`, `category`, `selected`, `presentation`, `history`, `returnTo`, `cursor` | `managedSystem` for the caller's effective scope union (`all` is also accepted); visible presentation, history=false and absent filters/selection/return/cursor |
| `/integration/evidence` | `managedSystem`, `source`, `q`, `selected`, `cursor` | omit unfiltered defaults; selection uses a local highlight UUID; cursor is opaque |
| `/integration/links` | `managedSystem`, `status`, `type` | `managedSystem` for the caller's effective scope union; `status` and `type` when unfiltered |
| `/admin/analytics-areas` | `managedSystem`, `includeArchived`, `selected` | `managedSystem` for all Managed Systems; `includeArchived` when archived records are hidden; `selected` when none is selected |
| `/admin/permissions/requests` | `tab`, `selected`, `returnTo` | `tab` for the pending tab; `selected` when none is selected; `returnTo` unless opened from a recovery queue |
| `/admin/permissions/grants` | `tab`, `selected` | `tab` for grants; `selected` when none is selected |

Route naming rules:

```text
- Home is the user-facing navigation label for `/home`; `/` is an entry-only redirect.
- Findings routes at top-level `/findings`. Feature code lives in `features/findings/`, not under Integration.
- Evidence, Coverage, and Links are shipped under `/integration/*` (ADR-0065).
- Task Requests are Tasks intake routes, not top-level routes.
- Analytics Areas, Permission Requests, and active grants/denies are Admin routes,
  not top-level work routes.
- Managed Systems are MVP scope, filters, defaults, and dashboard grouping; they do not create per-Managed-System route trees.
- Analytics Area is secondary classification under Managed System; it may appear as filter, column, detail metadata, Admin catalog item, or nested dashboard breakdown, but not as top-level navigation.
- `managedSystem=all` means the actor's effective Managed System scope union. It is workspace-wide only for Admin.
- Work Initiatives may group execution work after triage, but they are not VOC scope owners.
- Work Initiative routes are future routes and are not part of the MVP route contract.
- `/my-work` is not an MVP route (ADR-0038, ADR-0040). No route is registered. `apps/frontend/src/features/my-work/` is the future implementation location only.
```

## Document Titles

The root `DocumentTitleProvider` synchronizes `document.title` once, combining
the active screen title with `FeedbackOps`. A detail may replace the screen
title with `<display_id> · <title>` only after its matching read succeeds for
the current viewer. Loading, blocked, failed, not-found, and cleared selections
restore the screen title; unmounting the provider restores `FeedbackOps`.

VOC route views:

```text
- `/vocs?view=inbox` is the open-processing workspace for newly submitted, recently updated, waiting reporter, and follow-up-needed VOCs.
- `/vocs?view=triage` is the structured decision workspace for ownership, severity, Analytics Area, similar VOC, follow-up, and no-follow-up decisions.
- Inbox and Triage share the `/vocs` route family and list/detail mechanics, but Triage must not be implemented as only an Inbox filter.
- Broader browsing is served by sidebar saved views (`apps/frontend/src/lib/api/saved-views.ts`, `docs/implementation/api/saved-views.md`); `/vocs?view=list` is not a registered route. Saved views are surface-scoped: the sidebar lists only the active surface's views, and a domain without a saved-view surface (Home, Surveys, Integration, Admin) lists none (#870).
- `/voc-clusters` owns cluster-specific list/detail behavior.
- The global VOC rail uses loaded navigation counts for its landing: a `voc.inbox` key, including zero, links to `/vocs?view=inbox`; an omitted key links to `/vocs?view=my`. While counts are loading or unavailable after an error, keep the Inbox destination. This landing hint does not replace route or backend authorization.
```

Task route views:

```text
- `/tasks?view=requests` is Task Requests. `/tasks?view=board` is the board.
- `/tasks?view=backlog`, `/tasks?view=inbox`, and `/tasks` with no `view` render `TaskListRoute` in backlog mode. `/tasks?view=my` also renders `TaskListRoute`, filtered to Tasks assigned to the current actor (`assignee=me`). The Task sidebar labels that destination `내 Task`.
- `managedSystem` and `param` on that URL are the list's scope and selection, not a personal filter.
```

## Capability-Based Admin Navigation Contract

Navigation is a discovery surface; backend permission checks remain authoritative (ADR-0056).

```text
- Domain destinations (Home, VOC, Findings, Tasks, Integration, Surveys) stay visible to every Actor.
  Their route data and actions remain permission-gated by their owning contracts.
- The Admin rail entry, `관리자` sidebar entries (Managed Systems, Analytics Areas, Permission requests,
  Workspace settings), and Workspace settings footer link appear only after `workspace.admin` is
  approved by `/me/permissions/check`.
- Keep those Admin entries hidden while the capability check is pending, failed, or not approved.
- Direct links to Admin routes still render their route-level blocked panel when the Actor is not approved; navigation visibility does not replace `PermissionGate`.
```

Current sidebar entries live in `NAV_TREE` (`apps/frontend/src/routes/_authed.tsx`), which owns route
labels and destinations. `AppFrame` filters its `관리자` section entries using the same `workspace.admin` check
as the Admin page gates. The section labels are `VOC`, `Triage 보기`, `보기`, `Finding`, `Task` (including
Milestones), `연동`, `Survey`, and `관리자`. The Survey sidebar has `Survey 참여`
at `/surveys/participate` followed by `Survey 관리` at `/surveys`; the active
entry follows the participation and respondent routes versus the management
routes. The Surveys rail destination opens `/surveys/participate`. The Home rail's entries come from `homeSidebarEntries`
(`apps/frontend/src/features/home/homeNavigation.tsx`); its sections are `FEEDBACKOPS` and `액션 큐`.

The bottom avatar in the global rail opens an account menu with the current Actor display name and Role Level plus logout. Logout revokes the session, clears the client query cache, then routes to `/login`; successful login clears prior Actor data and seeds the `['me']` identity from the login response before routing so a new Actor never sees prior Actor data.

### Global command palette (#611)

`Ctrl+K` on Windows/Linux, `⌘K` on macOS (owner decision: most users are on Windows) toggles the palette mounted once in `AppFrame` (`apps/frontend/src/lib/layout/command-palette/`). `platform.ts` (`isMacPlatform`/`shortcutLabel`) drives the binding and every visible hint — the Home sidebar `명령 메뉴` row (a `SidebarNavActionEntry`, an action not a route), and the palette footer — never a hard-coded `⌘`. The shortcut is ignored while an IME composition is active and `preventDefault`s the browser's own Ctrl+K binding.

Commands derive from the existing nav sources (`AppRail.RAIL_ITEMS` + `NAV_TREE`) so labels never drift; Admin entries use the same `workspace.admin` approval as the sidebar (ADR-0056). The only create verb is `VOC 생성` (`/vocs?action=create`). A query matching `^(VOC|FIN|REQ|TASK)-[1-9][0-9]*$` shows one `열기` row that resolves `GET /nav/resolve?display_id=` (typed client `fetchNavResolve`, `navResolveResponseSchema`) and navigates to the returned route intent; missing/unreadable records show an inline `해당 항목을 찾을 수 없거나 접근 권한이 없습니다.` and keep the palette open. The palette does not synthesize commands the backend does not resolve; scope switching and recent records are out of scope for the first version.

In production (`import.meta.env.PROD`), `/login` performs one full-page replace to `/auth/login?return_to=…`, preserving a safe internal `redirectTo` (what the `_authed` guard sends on a 401; `return_to` or `redirect` when absent) unchanged after validation against the backend OIDC rules, with `/home` as the fallback. Non-production keeps the mock-login picker; callback failures return backend JSON errors rather than redirecting to `/login`.

The authenticated route guard reuses the shared `['me']` cache while it is fresh and revalidates it in the background on an authenticated entry when the cached identity is older than five minutes. A background 401 clears the client query cache and routes to `/login`, preserving the current URL in `redirectTo`.

Count badges and global Managed System scope selection shipped in #143 (GlobalRail multi-domain IA, closed). Counts: backend aggregation in `apps/backend/src/modules/nav/service.ts`, fetched via `apps/frontend/src/lib/api/nav.ts` and passed through `AppFrame`, rendered as badges in `AppSidebar` (`NAV_TREE` count keys). Scope selector: `AppSidebar`'s `ManagedSystemScopeOption` control (`data-testid="scope-selector"`), backed by the `['managed-systems', 'scope-selector']` query in `AppFrame`.

Routes may exist without being visible in navigation. Direct route access must restore AppShell and render allowed content, summary-visible content, request-access state, not_found, or permission_denied according to backend response.

### Unknown routes and route errors

- Authenticated unknown paths, including an unmatched suffix under a known route, render a centered `PageShell` inside the existing `AppFrame`, with a localized not-found message, Home link, and back action.
- Unknown paths check the current identity before showing AppShell; a 401 still redirects to `/login` and preserves the requested URL.
- Route errors render a localized `ListStateMessage` inside AppShell when identity is available, offer
  retry, and keep raw error details in the console only. Standalone error content keeps the viewport-height
  centering of the pending state; in-shell errors center within `AppFrame`. A `/me` rate-limit error uses the
  existing "잠시 후 다시 시도하세요." message in a standalone state, and retry resets the identity query
  before invalidating the router.
- While the authenticated guard is resolving, the route shows a centered "불러오는 중…" state after the router's pending delay.
- Search validation drops invalid and unrecognized fields independently, preserves valid fields, and clears dropped values from TanStack's merged search and the URL so each route uses its omitted defaults.

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

`/home?tab=inbox` (tab label `수신함`) is the Actor's notification inbox
(`apps/frontend/src/features/home/InboxPanel.tsx`; contract
`docs/implementation/api/notifications.md`), with an `읽지 않음` / `전체` filter. The
global rail's bell links to it and shows an unread count badge. The Dashboard
tab is the default and omits `tab`.

The Home Surveys panel shows up to five backend-provided answerable surveys and
links to the full participation list. Its list, loading, empty, and retry states
use the same answerable-surveys query as `/surveys/participate`.

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
- Mobile selection uses a drill-in route (target contract, not built); back returns to the previous list filters.
- Browser refresh on a selected URL restores AppShell, list context, and selected detail when data is accessible.
- Finding, Task list, Task Request queue, VOC Inbox and 내 VOC screens load cursor pages of 50 rows
  using the shipped load-more control. Finding and Task counts use the first
  page's exact total. Task Request badges and global-empty state use a separate
  unfiltered `limit=1` summary; active-tab pages send the server status filter.
  Badges stay unknown until that summary succeeds. The Task board is bounded (#1178):
  grouped by status, each of the seven status columns runs its own paged read
  (`status`, `limit=50`, cursor) with the board's scope, `q`, `public_update` and
  personal filters, shows that read's exact first-page total in its header, and ends
  with the shipped load-more control (`더 불러오기`, that column's cursor only). Grouped
  by priority, Managed System or assignee, the board reads the open set once
  (`status_group=open`, same filters, no `limit`) and shows `완료·배포된 Task는 제외됩니다.
  상태별 보기에서 확인하세요.`; Done and Released Tasks appear only under the status
  grouping. The personal priority, Milestone and assignee filters are server filters on
  every one of those reads; their options come from the priority enum, the scope's
  Milestones and the workspace actors (teams are not filter options). The stat strip
  (`전체 Task`, `미배정`, `진행 중`) is three `limit=1` totals using scope, `q` and
  `public_update` only, never the personal filters, and shows `—` until each succeeds;
  the title badge is the sum of the column totals (the open-set size outside status
  grouping).
  VOC Inbox and 내 VOC append pages under the rows with the same control and never put the
  cursor in the URL; VOC Triage keeps its single 50-row working page, and each command's
  refetch brings the next rows.
- A selected ID absent from loaded pages resolves through its detail endpoint;
  page membership does not prove deletion. Detail 404 or the screen's active
  scope/filter rule reconciles selection. VOC Cluster selections (`/voc-clusters?selected=` and
  `/voc-clusters/:clusterId`) follow this rule: a detail 404 keeps the URL and shows the not-found
  notice in the detail panel, and no other Cluster opens; a resolved Cluster outside the active
  Managed System scope or tab is reconciled away. Task Request explicit selections never fall back
  to another row while unresolved. Review decisions refresh page and
  summary caches while keeping the current tab. If the decided request leaves
  the tab, select the next loaded row in visible order, otherwise the preceding
  row. If no loaded rows remain, fetch remaining cursor pages before claiming
  emptiness; preserve loading/error/retry until that read settles. The all tab
  (or any matching-status tab) keeps a request that still belongs.
- Without an explicit `param`, changing the Task list view or either Task screen's
  Managed System scope, or switching a Task Request status tab, resets the panel
  selection to the new context's first row (or none when empty). An explicit
  `param` remains authoritative; review completion replaces it with the next
  current-tab selection (or clears it while remaining pages reconcile). Explicit
  deep links still align to a request's status tab once; manual tab changes persist.
- Task Request row selection pushes `param` while preserving the current search
  context. Task list row selection also pushes `param` while preserving the current
  search context, including `view` and `managedSystem`.
  Panel close and detail 404/out-of-scope cleanup remove `param` with
  replace; only the current selection's detail can trigger cleanup. On both screens,
  closing a panel keeps it closed until row selection, a tab/view or scope change,
  or a new defined `param`. Closing either Task screen's panel returns keyboard
  focus to the row that was selected when the close started; when that row is
  not shown, focus does not move. A detail 404/out-of-scope link shows the not-found notice
  in the detail-panel area and opens no row, including after URL cleanup or refetch. On the
  board, a selected Task that no loaded column page contains resolves through
  `GET /tasks/:id` under the same 404 and explicit-Managed-System rules; the board never
  auto-selects a first card, and the detail panel's `다음 상태로 이동` works on that fallback
  Task (its unloaded source column only has its total adjusted).
  The notice clears on row selection, a tab/view or scope change, or a new defined
  `param`; removing `param` during cleanup does not clear it. First-row auto-selection
  stays local and runs only without an explicit `param`, a closed panel, or the notice.
  Review decisions replace `param` with the current-tab selection, reconciling
  it after refetch so refresh restores that selection.
- Task Request status tabs stay mounted during initial load, uncached-tab loading,
  cached refresh, and queue errors/permission denial; loading/error content replaces
  only the list body. Empty/rows motion boundaries keep their existing context keys.
  A manual tab or scope change still reconciles selection by the rules above.
- Approval/rejection/additional-evidence completion retains the old panel and
  successful dialog content until the newly selected current-tab row (or a
  confirmed empty-state heading with `tabIndex=-1`) receives focus while the
  content is still connected. The dialog releases its trap before handoff,
  respects its exit animation, and reconciles deferred close autofocus. A failed
  remaining-page read offers retry in the retained dialog. Cancel/Escape keep
  opener restoration; newer openings, selections, and manual tabs own focus.
  Action-specific success copy names the decision; approval explains that Task
  conversion is a separate next step. Automatic conversion explains configured
  defaults and reports the returned Task's actual actor/team/unassigned recipient
  with a Task link. Finding request registration keeps a persistent, dismissible
  toast with an action to `/tasks?view=requests&param=:requestId`.
  The `본인 승인` property describes actual self/peer approval for approved or
  converted requests; other statuses use a neutral not-yet-approved value.
  Pending dialog submit controls stay focusable with `aria-disabled` and keep their loading
  spinner; repeated submissions and dismissal are guarded, and cancel stays disabled.
- Restoring a Task Request `param` follows its in-scope status tab once per URL-param
  occurrence, including Back/Forward. A matching status or the `all` tab also consumes
  the occurrence; later manual tab changes persist while the same `param` stays.
  Statuses without a dedicated tab (`converted`) use `all`.
- Finding creation from a selected VOC may carry `returnTo` with the same-origin `/vocs` URL; the selected Finding detail offers an action that restores the VOC view, scope, filters, and selection.
- The `/findings/$findingId` deep link redirects to `/findings?selected=:findingId`, preserving `returnTo` when supplied.
- Closing a detail panel preserves filters, sort, and scroll position when possible.
- CommandMenu actions must route to the same panel, drawer, or page as visible UI buttons.
```

## Managed System Scope Switcher

`managedSystem=all` is a scope value, not a workspace bypass.

```text
- Admin: `all` means true workspace-wide scope on Admin, Dashboard, VOC, Tasks, Surveys, and Integration views where the backend allows it.
- Developer: `all` means the union of the actor's effective Managed System scopes.
- User: own-work views return only actor-safe own work; the backend rejects `managed_system_id=all` for VOC `view=my`.
- Survey respondent surfaces do not carry Managed System scope; the control is disabled there.
- `/surveys/participate` lists answerable Surveys and the current Actor's
  response history; `/surveys/:surveyId/respond` renders the respondent form.
```

As built, the scope control is the `AppSidebar` scope selector (`data-testid="scope-selector"`):

```text
- It is rendered whenever the sidebar is expanded, for every Actor; it is disabled on Admin routes and on Survey respondent routes.
- `All` ("전체 Managed System") is always offered; choosing it removes `managedSystem` from the URL.
- Every workspace Managed System is listed. Systems outside the actor's `voc.read` scope (`GET /me/permissions/scope`), including Admin denies, are dimmed and marked `범위 밖`, with a note that names are workspace-visible and access is requested separately (#282).
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

The Dashboard queue links shown on Home and Integration are aggregate list routes, not per-record links. Each
queue's `next_action` and `secondary_action` carry `label`, `route`, and an `intent` string
(`packages/shared/src/dashboard.ts`). Navigation uses `route` only; `intent` maps to the Integration button label
(`apps/frontend/src/lib/copy/dashboard-actions.ts`) and is not a URL search key, so no `action=` intent is carried on these links. Each route is the filtered
source list the queue count promises (#1179). Home and Integration append
`managedSystem=<id>` to a queue route when a specific Managed System is selected
(`hrefWithManagedSystem` in `apps/frontend/src/lib/router/managed-system-href.ts`);
with no selection or `all`, the bare route is used and the destination applies the
caller's effective scope. Shipped queue routes:

```text
/vocs?view=inbox&tab=unassigned
/vocs?view=inbox&tab=high-no-link
/findings?execution=none
/tasks?view=backlog&reporter_update=needed
/surveys?follow_up=needed
/admin/permissions/requests
```

## Task And Milestone Layout Rules

```text
- Tasks views remain list-first or board-first operational surfaces.
- `view=milestones` shows a compact Milestone list with source, scope, owner, status, due date, and progress.
- Selecting a Milestone opens RightDetailPanel as Milestone Detail.
- Milestone Detail presents Overview, Tasks, Evidence, and Activity.
- Reporter-safe summaries derived from Milestone or Task work use explicit public-safe fields and do not expose internal Task status, backlog priority, private due dates, or Developer discussion.
```

## AppShell Layout

Desktop (≥1024px) only is built; the tablet/mobile rules below are the target contract, out of scope until responsive lands — `apps/frontend/AGENTS.md`.

```text
Desktop >= 1024px:
- LeftSidebar: 240px default, 56px collapsed.
- MainRegion: fills remaining width.
- RightDetailPanel: 440px default, 360px min, 520px max.

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

## Permission close-out composition (ADR-0066)

No new frontend route is required. `/home` own open-request rows open owner-scoped
detail/dialog with edit, withdrawal or supplementation as permitted by the server.
Do not send requesters to an Admin-only console. Preserve Home context on close;
withdrawal confirmation is distinct from unsaved-form close. The feature-local
`OwnerPermissionRequestDialog` uses owner detail and server actions/candidates.
Reopening waits for a fresh selected read. Stale/error responses preserve inputs
and focus; a stale request needs explicit reconciliation against latest values,
and a failed refetch stays blocked. Edit/supplement omit unchanged fields and
use explicit null to clear expiry; neither command changes capability/source/return intent.

`/admin/permissions/requests` keeps `tab`/`selected` and Back/Forward restoration,
but fetches selected detail rather than relying only on list rows. `cancelled`
belongs in all-history with label `철회` and no decisions. Selection or revision
changes clear decision/risk drafts; stale conflicts refetch, latch an inline
review notice above the form until the Admin picks a new action, and require fresh
review, never auto-submit. `selected-permission-request-detail.tsx` uses a per-ID selected query;
loading/error has no decision controls and retains URL selection. Drafts, mutation
state and intent keys start fresh on ID or revision change; an unchanged
background refetch (same ID and revision) must preserve them. A successful review
refreshes to a new revision, which starts the next draft fresh. When a same-ID
revision refetch resets a non-empty Admin draft, the decision area shows an inline
reset notice and the discarded reason as read-only text. Starting a new decision
or selecting another request dismisses the notice.
If a list refetch moves the selected request out of the active status tab, keep
the URL selection and detail mounted; the existing stale-submit guard requires
review of the latest revision. Explicit tab changes retain their keep/reselect rule.
Identical retries reuse a key; a changed reviewed body/revision uses a new key.
Completion invalidates the submitted ID even if selection changed during the call.
No client-side risk computation and no source/privacy bypass. Risk presentation
and direct-grant composition below remain separate ADR-0066 implementation items.
Admin risk review presents supplied signals (or the successful zero-signals message)
before compact current-access and review-authority facts. Signal evidence shares
its title line; self-approval facts share one row on the reviewer's own request.
Current-access expiry is labelled and shown only for allowed access; empty effective
scope is omitted. Terminal requests retain the section with
`현재 상태 기준`: these are current facts, not a snapshot of the original decision.

`/admin/permissions/grants` stays `ListShell` with its existing grants/denies tabs.
Its `권한 부여` primary action opens a feature-local form; direct-grant success
selects the actual returned grant in the grants tab while preserving URL/history
semantics. Server options, explicit workspace administrative governance,
`permission_self_approval`, reason and optional expiry govern submission. When
the chosen `voc.triage` candidate's `voc.read` prerequisite is `missing`, the
form warns `이 권한만으로는 VOC를 볼 수 없습니다. VOC 조회 권한도 필요합니다.`
and still submits that one grant. After success, the selected grant offers
`VOC 조회 권한도 부여`, which reopens the same dialog prefilled for a separate
`voc.read` grant (same recipient, Managed System, expiry, and reason). A
`denied` prerequisite shows the deny-lift link and no follow-up; `held` shows
no notice. Use workspace Actor display names, never email; retain input/focus
on errors.

Canonical copy owners are `apps/frontend/src/lib/copy/home.ts` and
`apps/frontend/src/lib/copy/admin-permissions.ts`; update them in implementation.
Verify desktop 1440, keyboard focus and existing visual fixtures before delivery.

## Close-out recovery and responsibility URL contract (ADR-0067)

Both `/integration` and `/home` validate `category`, `selected`
(stable recovery ID), `presentation` (`visible` default/`hidden`), `history` (boolean,
false default), and validated same-origin `returnTo`, preserving existing `managedSystem`
and Home `tab`. Recovery selection opens the Integration-owned compact shared detail via
`features/integration/public.ts`, even on Home; no new shell or duplicate source workflow.
Coverage may jump to `/integration` carrying category/scope/selected/return intent; only
an authorized Admin gets a Settings link for bands.

Omit optional default search values; category is one of the six emitted IDs. Invalid/
unrecognized values follow the existing cleanup rule. Selection/Escape/back/refresh
preserves list scope/category/view and restores readable detail; close clears selection
and returns focus. Resolved readable selection stays open with metadata; unknown/unreadable
identity shows the standard not-found state. Source jumps preserve queue context in history.
VOC, Task, Permission Request and Survey source URLs also accept bounded recovery queue
`returnTo`; VOC repair
opens `view=triage` with the repair Managed System, Task selection uses `param`, and Finding
selection uses `selected`.
Personal hiding offers 1-day/7-day snooze, current-occurrence mute, hidden-items and restore
with Korean labels explaining `내 화면`; reopen returns the occurrence automatically.
History is three calendar months, currently permission-filtered.

`cursor` restores an opaque bounded page; category, Managed System, presentation and history
navigation producers clear it when creating a new filter/scope/view URL; Back/Forward retains
compatible cursor/filter pairs. Load-more appends pages within the current query. Recovery IDs
validate the opaque `r1_` shape and are never decoded. Queue `returnTo` is limited to internal Home,
Integration and Coverage URLs, at most 2048 characters; foreign, protocol-relative,
backslash and control-character forms are discarded.

Home registers the existing `PageShell.detailPanel` slot only on Dashboard. Inbox and
unmount unregister it while retaining URL selection for Dashboard/Back restoration.
Closing returns focus to the clicked row (including an individual history occurrence),
then to the queue heading if that row disappeared. Escape respects nested overlays,
prevented events and fullscreen. Hook-level pending PATCH completion invalidates queries
after unmount without closing or focusing a newer selection or scope.

Shared `lib/query/recovery.ts` invalidates recovery list/detail/history and all summary
scopes after presentation or source repairs; each owning mutation also refreshes its source
queries. Summary freshness is shown on Home, Integration and Coverage, with the last server
`computed_at`, last successful browser refresh and a failed-refresh marker. Queue and detail
show independent clocks; these reads do not form an atomic snapshot.


Survey response selection/actions/history remain on `/surveys/:surveyId/follow-up` under
ADR-0055's personal seam, never generic response-derived URL identities for non-holders.
Home item queues require current action capability; operational summary counts stay scope-wide.
Task Request URL `reviewer` (Actor UUID/`me`) and `reviewerTeam` (team UUID)
map to backend assigned-reviewer filters in `view=requests`; omitted means full authorized
review queue. Home's personal request panel sends `reviewer=me`; team membership is not
inferred. Source assignment display/edit/filter stays VOC/Finding/Tasks-owned.

## Coverage Analytics Area tab and report destinations (ADR-0069)

Status: Accepted 2026-10-13 by the owner (MVP close-out decisions).
The `/vocs`, `/findings`, `/tasks` and `/surveys` destination filters and active-filter controls are
implemented by #1077 (parts a/b). Coverage extensions below are implemented by #1079. FR-DASH-002 in
`docs/design/08-dashboard-system.md` owns metric meanings and UI acceptance.

- `/integration/coverage`: existing PageShell; overview is the default (omit `view`),
  `view=areas` selects `Analytics Area별 현황`. Keep `managedSystem=<uuid|all>` and add
  `filter.analytics_area=<uuid|unset>` plus opaque `cursor` for report paging.
  Omitted scope means the actor's effective scope union. Default report page size is 50.
  Scope changes clear incompatible Area and pagination; Area changes clear pagination.
  Back/Forward/refresh restore tab, filters and page. No new rail or Admin report route.
- Implemented: Integration's Coverage card has a secondary link to `view=areas` preserving Managed System;
  Home's existing Coverage entry still reaches the same page. Catalog administration remains separate.
- Implemented: `/vocs`, `/findings`, `/tasks` and `/surveys` accept `filter.analytics_area=<uuid|unset>` in their
  strict browser schemas and typed clients. VOC forwards the same dot key; the other clients map
  it to backend `analytics_area_id`.
  Report links always retain the row's Managed System UUID.
  For these destinations, switching to a specific Managed System clears a UUID
  `filter.analytics_area`; switching to all/unscoped keeps it. `unset` always remains.
- VOC total/unassigned/high-follow-up/unlinked inspection use `view=inbox`, with omitted tab,
  `tab=unassigned`, `tab=high-no-link`, or `tab=no-task` respectively.
- Implemented Finding links carry `status=active` or `execution=none`. Implemented Task links carry `view=backlog`
  plus single `status`, `status_group=in-flight`, `overdue=true`, `public_update=missing`, or
  `reporter_update=needed`; Survey links carry `status=open` or `follow_up=needed`.
  Task backlog/my lists apply all six filters; the board keeps only its existing `public_update` behavior, shown as a removable `ActiveFilterBar`
  chip (`공개 업데이트 없음`; `필터 초기화` drops it).
  These are source membership filters, not `action=` intents. All combinations intersect.
- VOC/Finding/Task/Survey render `ActiveFilterBar` below the list toolbar. Area UUID labels resolve through
  the paged authorized catalog including archived Areas; unresolved labels disclose no existence.
  VOC removal/reset drops only Area; Finding reset drops Area/status/execution/assignment.
  Task reset drops Area/status/status_group/overdue/public_update/reporter_update;
  Survey reset drops Area/status/follow_up and clears the local status tab and search text.
  Each chip removes its own URL key; resets keep
  scope, view and selection. Survey's local status/search filters intersect the server
  filters and tab counts use the fetched array. URL-filtered empty states name active
  conditions and use the filter bar as the sole reset control.
  Show active filters with explicit clear actions. Selection and panel close preserve them;
  restore them with navigation history. Counts reevaluate on arrival and after owning repair.
  A count must not link to a destination that drops its filter during strict validation.
- Task Request review is `/tasks?view=requests&managedSystem=<system>` only, labeled
  `Task Request 검토`, explicitly the whole Managed System queue with no Area count/filter.
- The report uses its own typed query/cache key including scope, Area, page and session lifecycle.
  Scope/permission changes clear stale counts; loading/error/denial do not render zero.
  No eager source detail/personal Survey reads. Tab and positive-count links support keyboard
  operation and visible focus. Source actions remain on source routes with fresh permissions.

## Close-out assistance (ADR-0068; Cluster review shipped #1098, preview shipped #1100)

No new domain route/shell is added. The existing `/voc-clusters` ListShell owns a
separate suggestion review section with feature-local selection, not a fake
`selected` Cluster ID or `/voc-clusters/:clusterId` detail. Preserve existing
Cluster URL/search restoration. `/vocs` create ships the optional explicit-click
semantic preview (#1100) above its separate recent-peer panel only after
`GET /vocs/similarity-preview/availability` returns `available:true`; otherwise
no card or placeholder renders (provider-free MVP, ADR-0068 amendment 2026-10-14). Only `유사 VOC 확인`
sends the merged `POST /vocs/similarity-preview` (#1099), after transmission
disclosure. Actual text/MS changes clear and cancel the check; unchanged values
and unrelated rerenders preserve it. Candidate UUID navigation retains the
unsaved-change blocker and never creates a relationship. Preview states never
block submit or send automatic requests.
`/admin/settings` owns the default-off suggestion-generation opt-in. Both suggestion
surfaces are omitted until the existing suggestion read succeeds with `available:true`;
loading/errors/provider-disabled responses preserve existing layout. The fourth tab is
Admin/Developer-only; its selection, undo and notices end on tab/route/context exit.
Existing Cluster selection/default reconciliation pauses while the fourth tab is active.
Availability loss returns to the default tab without writing Cluster URL state;
automatic fallback keeps reconciliation/defaulting paused until a user selects a
Cluster or changes an ordinary filter.
Confirm stays on the tab and offers a Cluster link; discard has an inline five-minute
server-deadline undo independent of refetched pending rows. Cluster panel drafts reset
when switching to the suggestion panel.

## Evidence inventory (ADR-0065; implemented by #1107)

`/integration/evidence` uses ListShell/ListToolbar, compact rows and the existing
ListShell detail-panel slot. Strict URL keys: `managedSystem` (UUID or `all`), `source`
(`voc|survey_response|note`), `q` (trimmed max 200 characters), `selected` (local
highlight UUID), `cursor` (opaque). Omit unfiltered defaults; drop invalid keys
independently. Clients map scope/source to `managed_system_id`/`source_type`.

Refresh/Back/Forward restores filters, page and selected safe detail. A later-page URL
opened without a cached first-page chain offers compact `처음부터 보기` above the rows;
it pushes the same filters and selection without `cursor`. Scope/source/
search changes clear cursor and reconcile selection against safe detail/current
filters. Resolve explicit selection directly via `GET /evidence-highlights/:id`;
page absence alone never clears it. Missing/unreadable selection shows not-found
and opens no substitute row. Close removes selection with replace, preserves list
context and returns row focus where possible. Session/scope/permission changes
clear stale content. Primary `Finding 보기` opens `/findings?selected=<findingId>`;
Back restores Evidence context. Sidebar and dashboard entries preserve Managed System scope.

Render loading, permission block, genuinely empty, filtered-empty, withheld,
selected-not-found, first-page failure and load-more failure distinctly; retry
load-more without discarding successful rows. A first-page `422` with cursor field
code `invalid_cursor` removes `cursor` with replace and reloads the first page,
retaining filters and selection. Manual refresh keeps current rows visible while
reads are pending, then reconciles the authorized responses; session/scope and
permission invalidation still clears stale content. Blocked lists explain the
workspace administrator request path and disable source tabs, search and refresh.
Rows use the default compact Integration density: snippet title plus one truncated
metadata line containing Finding identity, source and classification. Withheld
row titles and panel text are muted and italic. A readable VOC's panel source label
links to its authorized `source.route` as a secondary action; notes and withheld
sources have no source jump. Explain `Finding에 저장된 Evidence를 찾습니다.`
No editing, standalone creation, Unlinked tab, count/coverage KPI or execution
control. Use ADR-0060's prototype reference only for this new surface and shipped
Integration patterns for density/copy/scroll; verify desktop 1440 and keyboard focus.

Finding responsibility (#1090): the source-owned list uses persisted owner fields for its
owner display and `assignment=assigned|unassigned` URL filter. Owner-only detail edits preserve
workflow status, refetch detail/list/Home/navigation counts after success, and keep the editor
open on failure without retrying a mutation. The creator is displayed separately as provenance.

Task responsibility UI (#1091) keeps assigned reviewers distinct from actual decision Actors.
Task Request properties and Task detail edit the source Actor/team/null pair through their
owned APIs; backend authority remains canonical. Conversion starts in automatic mode and
omits both keys; deliberate unassignment sends both null, and Actor/team modes send only one
non-null destination. Responsibility draft state resets with the existing conversion
item/scope/form lifecycle. Team labels remain teams, including board grouping/filtering and
unassigned counts; no personal member is selected. Reviewer URL changes preserve Managed
System and other search context, clear the old selection and restore through browser history.

### Task and Finding list search (#1177)

Task backlog, `내 Task`, Task board, and Findings expose `SearchInput` with
placeholder `제목 또는 ID`. The route-lifetime shared
`apps/frontend/src/lib/useCommittedSearchDraft.ts` restores URL `q`, keeps a local
draft, and commits on Enter/blur or debounce (300 ms; Hangul-final text 700 ms).
Blank search omits `q`; the strict route schemas use the same trimmed, max-100
query contract as the API. Each search changes the list query key and starts
from page one without a cursor; the board's column pages, open-set read and summary
totals include `q` too.
Pending/error/empty Task list bodies preserve the shell and focused search draft.
While a search is pending, Task list/board and Findings retain previous rows and
counts only when that query differs by `q` alone and the previous query
succeeded. A Managed System, view, filter, or status change, or a previous
error, shows the loading state with no previous rows. A normalized write that
does not change the committed `q` settles the draft immediately, so a later
reset can clear it. Normalized URL acknowledgements still preserve newer raw
typing. Task and Findings lists show a `제목 또는 ID: …` chip;
removing it clears `q`, and clear-all resets `q` with the other filters.
No matches show `검색 결과가 없습니다.` with a reset action.

`내 Task` exposes a status selector for individual `status` values or
`status_group=in-flight` (Todo/Doing/Review), preserving the `assignee=me` request.
Findings exposes `execution=none` and `status=active` checkboxes alongside owner
assignment. Their URL filters have removable ActiveFilterBar chips and reset.
The board's per-column query keys, request parameters and keyboard-recovery scope include
`q` (and the personal filters, except in the summary totals); changing search or a filter
abandons pending keyboard focus recovery while preserving grouping, local filters and the
existing selection policy.
