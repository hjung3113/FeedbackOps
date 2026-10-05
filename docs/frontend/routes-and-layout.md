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
/surveys/:surveyId
/surveys/:surveyId?builder=true
/surveys/:surveyId/results
/surveys/:surveyId/follow-up
/surveys/participate
/surveys/:surveyId/respond
/tasks?view=my&managedSystem=:managedSystemId|all&param=:taskId
/tasks?view=inbox&managedSystem=:managedSystemId|all
/tasks?view=requests&managedSystem=:managedSystemId|all&param=:requestId
/tasks?view=backlog&managedSystem=:managedSystemId|all&param=:taskId
/tasks?view=board&managedSystem=:managedSystemId|all&param=:taskId&public_update=missing
/tasks?view=milestones&managedSystem=:managedSystemId|all&param=:milestoneId
/integration?managedSystem=:managedSystemId|all
/findings?managedSystem=:managedSystemId|all&selected=:findingId&execution=none&returnTo=:encodedVocUrl
/findings/:findingId (redirects to /findings?selected=:findingId)
/integration/coverage?managedSystem=:managedSystemId|all
/integration/links?managedSystem=:managedSystemId|all&status=active|stale|detached|revoked&type=related_to
/admin/managed-systems
/admin/analytics-areas?managedSystem=:managedSystemId&includeArchived=true&selected=:analyticsAreaId
/admin/permissions/requests?tab=:tab&selected=:requestId
/admin/permissions/grants?tab=grants|denies&selected=:permissionId (planned, round 2 of #762)
/admin/settings
```

| Deep-link route | Search keys | Omitted defaults |
|---|---|---|
| `/findings` | `managedSystem`, `selected`, `execution`, `returnTo` | `managedSystem` for the caller's effective scope union (`all` is also accepted); `selected` when none is selected; `execution` when unfiltered; `returnTo` unless the selected Finding was opened from a VOC flow |
| `/findings/:findingId` | `returnTo` | Redirects to `/findings?selected=:findingId`, preserving `returnTo` when supplied |
| `/surveys` | `managedSystem`, `selected` | `managedSystem` for the caller's effective scope union (`all` is also accepted); `selected` when none is selected |
| `/surveys/participate` | — | No search state |
| `/surveys/:surveyId/respond` | — | No search state; respondent surfaces do not carry Managed System scope |
| `/voc-clusters` | `managedSystem`, `selected` | `managedSystem` for the caller's effective scope union (`all` is also accepted); `selected` when none is selected |
| `/voc-clusters/:clusterId` | — | No search state; the cluster id is the path param and the cluster list stays as the list context |
| `/tasks` | `view`, `param`, `managedSystem`, `public_update` | `view` for the backlog list; `param` when none is selected; `managedSystem` for the caller's effective scope union (`all` is also accepted); `public_update` unless filtering `view=board` to Tasks missing a public update (`missing` is the only value) |
| `/integration` | `managedSystem` | `managedSystem` for the caller's effective scope union (`all` is also accepted) |
| `/integration/links` | `managedSystem`, `status`, `type` | `managedSystem` for the caller's effective scope union; `status` and `type` when unfiltered |
| `/admin/analytics-areas` | `managedSystem`, `includeArchived`, `selected` | `managedSystem` for all Managed Systems; `includeArchived` when archived records are hidden; `selected` when none is selected |
| `/admin/permissions/requests` | `tab`, `selected` | `tab` for the pending tab; `selected` when none is selected |
| `/admin/permissions/grants` (planned, round 2 of #762) | `tab`, `selected` | `tab` for grants; `selected` when none is selected |

Route naming rules:

```text
- Home is the user-facing navigation label for `/home`; `/` is an entry-only redirect.
- Findings routes at top-level `/findings`. Feature code lives in `features/findings/`, not under Integration.
- The Evidence route is planned, not built. Coverage and Links are the shipped routes under `/integration/*`.
- Task Requests are Tasks intake routes, not top-level routes.
- Analytics Areas and Permission Requests are Admin routes, not top-level work
  routes; `/admin/permissions/grants` is planned for round 2 of #762.
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
- Broader browsing is served by sidebar saved views (`apps/frontend/src/lib/api/saved-views.ts`, `docs/implementation/api/saved-views.md`); `/vocs?view=list` is not a registered route.
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
- Every workspace Managed System is listed. Systems outside the Actor's grants are dimmed and marked `범위 밖`, with a note that names are workspace-visible and access is requested separately (#282).
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
(`apps/frontend/src/lib/copy/dashboard-actions.ts`) and is not a URL search key, so no `action=` intent is carried on these links. Shipped queue routes:

```text
/vocs?view=inbox&tab=unassigned
/vocs?view=inbox&tab=high-no-link
/findings
/tasks?view=board
/surveys
/admin/permissions/requests
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
