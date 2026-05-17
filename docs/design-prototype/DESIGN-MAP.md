# FeedbackOps — Page · Component · Spec Mapping

> Source of truth for how the prototype's screens and shared components map back onto the project's design / frontend / domain specifications.
>
> Pair with [`HANDOFF.md`](./HANDOFF.md) (overview, working rules, changelog).
> Maintain alongside every Pack so production handoff stays unambiguous.

**Last updated:** 2026-05-17 (Pack 17 — Samsung-light palette + shared detail section nav)

---

## Legend

| Symbol | Meaning |
|---|---|
| 🧱 | Shared primitive in `components.jsx` |
| 🧩 | Cross-cutting component in its own file (rich-editor, entity-preview, cmdk) |
| 🪟 | Screen surface — usually `screen-*.jsx` |
| 🏷️ | Pack 10 promotion / extraction |

Spec column references — short names map onto files:
- `00 overview`     → `docs/design/00-product-overview.md`
- `01 domain`       → `docs/design/01-domain-model.md`
- `04 voc`          → `docs/design/04-voc-system.md`
- `05 finding`      → `docs/design/05-finding-insight-system.md`
- `06 task`         → `docs/design/06-task-project-system.md`
- `07 survey`       → `docs/design/07-survey-system.md`
- `09 permission`   → `docs/design/09-permission-access.md`
- `11 linking`      → `docs/design/11-entity-linking.md`
- `12 ux`           → `docs/design/12-ui-ux-principles.md`
- `ui-ds`           → `docs/frontend/ui-design-system.md`
- `routes`          → `docs/frontend/routes-and-layout.md`
- `inv`             → `docs/frontend/component-inventory.md`
- `inter`           → `docs/frontend/interaction-patterns.md`
- `api-contracts`   → `docs/implementation/03-api-contracts.md`
- `data-contracts`  → `docs/design/15-data-contracts.md`
- `link-contract`   → `docs/implementation/06-entity-linking-contract.md`
- `error-contract`  → `docs/adr/0012-error-code-contract.md`

---

## 1. Routes → screens → primary spec

| Route | Screen file | Backing spec | Detail panel | Notes |
|---|---|---|---|---|
| `home`, `my-work` | `screen-home.jsx` | 12 ux · routes (Home) | — | Action queues + KPI + My Work + Coverage |
| `voc` (`inbox`/`my`) | `screen-voc.jsx` | 04 voc · inter (VOC list + detail) | ✓ | Reporter-status pill, internal task badge separation, trail CTA action panel |
| `voc` (`triage`) | `screen-voc-create.jsx` | 04 voc §Triage Console | ✓ | Optimistic mutation + undo |
| `voc-new` | `screen-voc-create.jsx` | 04 voc §VOC creation | — | RichEditor surface: `voc-description` |
| `voc-clusters` | `screen-clusters.jsx` | 04 voc §FR-VOC-005 Cluster | ✓ | Confirmation requires Admin/Developer |
| `findings` | `screen-findings.jsx` | 05 finding · inv (Finding) | ✓ | Evidence-first layout, execution CTA, trail CTA action panel |
| `tasks` (`board`) | `screen-tasks.jsx` | 06 task · inter (Kanban) | ✓ | DnD on cards |
| `tasks` (`inbox`/`my`) | `screen-tasks.jsx` | 06 task · routes | ✓ | Assignment-scoped views |
| `tasks` (`requests`) | `screen-tasks.jsx` | 06 task §FR-TASK-002 Review | ✓ | Self-approval + capability gating |
| `tasks` (`backlog`) | `screen-tasks.jsx` | 06 task §FR-TASK-003 Backlog | ✓ | Awaiting-execution language only |
| `tasks` (`milestones`) | `screen-milestones.jsx` + `screen-milestone-gantt.jsx` | 06 task §FR-TASK-004 | ✓ | Per-row mini-timeline + Detail Gantt |
| `tasks` (`roadmap`) 🏷️ | `screen-tasks-roadmap.jsx` | 06 task §FR-TASK-005 + routes | — | Pack 10 — multi-milestone shared-axis Gantt |
| `integration` | `screen-other.jsx`·`IntegrationScreen` | 12 ux (Action Dashboard) | — | Live counts (Pack 10) |
| `integration-evidence` | `screen-evidence.jsx` | 05 finding · ui-ds (EvidenceHighlight) | ✓ | Source · Linked Execution · Trail action panel |
| `integration-coverage` | `screen-coverage.jsx` | 12 ux §Coverage signals | — | Threshold modal in-page |
| `integration-links` | `screen-entity-links.jsx` | 11 linking §FR-LINK-001..003 | ✓ | Bulk-detach + Last refreshed (Pack 10) |
| `surveys` | `screen-other.jsx`·`SurveysScreen` | 07 survey · routes | ✓ | Follow-up = 5 allowed CTAs |
| `survey-builder` | `screen-survey-builder.jsx` | 07 survey §FR-SURVEY-002 | — | One-level branch · option preservation · outline drag-reorder |
| `survey-result` | `screen-survey-result.jsx` | 07 survey §FR-SURVEY-004 | — | Anonymity threshold reminder |
| `admin` | `screen-other.jsx`·`AdminScreen` | 09 permission · routes | — | MS registry + Permission teaser |
| `admin-areas` | `screen-other.jsx`·`AdminAreasScreen` | 09 permission §5.4 + routes | — | AA slide-over (Pack 10) |
| `admin-permissions` | `screen-permissions.jsx` | 09 permission §FR-PERM-002 | ✓ | Pending → Approved/Rejected/Expired/Revoked. Self-approval audit capture (Pack 8). |
| `admin-settings` | `screen-admin-settings.jsx` (Pack 8) | 09 permission · ADR-0011 | — | Dirty save bar, locked SR→VOC row, cross-MS / self-approval retro warning. |

---

## 2. Final visual baselines

These are the canonical screenshot targets for visual acceptance. The current canonical PNG set lives in `screenshots/final-baselines/`, with capture metadata in `screenshots/final-baselines/manifest.json`.

| Baseline | Route / state | Screenshot | What must survive |
|---|---|---|---|
| Home / Action Dashboard | `#route=home` | `screenshots/final-baselines/home-action-dashboard.png` | KPI strip, action queues, live-count posture, desktop shell density |
| My Work | `#route=my-work` | `screenshots/final-baselines/my-work.png` | Same action-queue shell as Home with assignment-focused content |
| VOC list + detail | `#route=voc&view=inbox` | `screenshots/final-baselines/voc-inbox-detail.png` | Reporter/public status vs internal task status split, entity trail action panel, detail column rhythm |
| VOC triage console | `#route=voc&view=triage` | `screenshots/final-baselines/voc-triage-console.png` | WorkbenchShell title/header rhythm, queue list, triage panel, optimistic-action affordance |
| New VOC | `#route=voc-new` | `screenshots/final-baselines/voc-new.png` | PageShell form layout, Inbox back affordance, rich editor and attachment dropzone |
| VOC cluster detail | `#route=voc-clusters` | `screenshots/final-baselines/voc-clusters.png` | Cluster confidence, member rows, confirmation/admin affordance |
| Finding detail | `#route=findings` | `screenshots/final-baselines/findings-detail.png` | Evidence-first hierarchy, execution CTA, linked entity rows |
| Tasks board | `#route=tasks&view=board` | `screenshots/final-baselines/tasks-board.png` | WorkbenchShell title/header rhythm aligned with triage, group controls, Kanban density |
| Task requests | `#route=tasks&view=requests` | `screenshots/final-baselines/tasks-requests.png` | ListShell toolbar/body split, capability gating, self-approval semantics |
| Task backlog | `#route=tasks&view=backlog` | `screenshots/final-baselines/tasks-backlog.png` | ListShell extension with backlog health strip and awaiting-execution language |
| Task inbox | `#route=tasks&view=inbox` | `screenshots/final-baselines/tasks-inbox.png` | Assignment-scoped activity list with shared ListShell header/body line |
| My Tasks | `#route=tasks&view=my` | `screenshots/final-baselines/tasks-my.png` | Grouped personal task list and shared ListShell detail rhythm |
| Milestones list/detail | `#route=tasks&view=milestones` | `screenshots/final-baselines/tasks-milestones.png` | Mini-timeline, detail tabs, task/evidence relationship density |
| Tasks roadmap | `#route=tasks&view=roadmap` | `screenshots/final-baselines/tasks-roadmap.png` | PageShell roadmap body, compact padding, Milestones back affordance, shared-axis Gantt |
| Integration Action Dashboard | `#route=integration` | `screenshots/final-baselines/integration-action-dashboard.png` | Action dashboard counts, PageShell section rhythm, live-count posture |
| Evidence highlights | `#route=integration-evidence` | `screenshots/final-baselines/integration-evidence.png` | ListShell list/detail layout, long evidence content, linked execution and trail action panel |
| Coverage signals | `#route=integration-coverage` | `screenshots/final-baselines/integration-coverage.png` | PageShell coverage cards, missing-link queries, threshold modal entry points |
| Entity links | `#route=integration-links` | `screenshots/final-baselines/integration-links.png` | ListShell list/detail layout, bulk-detach, freshness timestamp |
| Survey list cards | `#route=surveys` | `screenshots/final-baselines/surveys-list.png` | ObjectCard consumer pattern and survey follow-up CTA framing |
| Survey builder | `#route=survey-builder` | `screenshots/final-baselines/survey-builder.png` | WorkbenchShell builder layout, outline drag-reorder, preview drawer header baseline |
| Survey result follow-up | `#route=survey-result` | `screenshots/final-baselines/survey-result.png` | Five allowed follow-up actions, anonymity threshold language, draft-panel entry points |
| Admin managed systems | `#route=admin` | `screenshots/final-baselines/admin-managed-systems.png` | Managed-system registry density and permission teaser placement |
| Analytics areas | `#route=admin-areas` | `screenshots/final-baselines/admin-analytics-areas.png` | PageShell analytics-area catalog and slide-over entry affordance |
| Permission self-approval audit | `#route=admin-permissions` | `screenshots/final-baselines/admin-permissions.png` | Reviewer console states, audit capture, self-approval warning semantics |
| Workspace policy warning | `#route=admin-settings` | `screenshots/final-baselines/admin-settings.png` | Dirty save bar, locked SR->VOC row, retroactive/non-retroactive policy impact copy |
| Command palette | `#route=home` | `screenshots/final-baselines/probe-cmdk.png` | Verb/object search language and local navigation behavior |
| Rail / scope behavior | `#route=home&scope=all` | `screenshots/final-baselines/probe-rail-scope.png` | Role-level rail filtering and bounded-scope chip semantics |

Acceptance use:
- For a continuation task, compare against these screenshots plus the live prototype.
- For a clean-room implementation, compare against these screenshots only after the source docs and route contract are implemented.
- Treat older PNGs directly under `screenshots/` as working evidence unless a later handoff promotes them into `screenshots/final-baselines/`.

---

## 3. Component inventory by file

### `components.jsx` (shared primitives) 🧱

| Component | First used | Promoted in | Backing spec |
|---|---|---|---|
| `Icon`, `Avatar`, `Button` | Session 1 | — | ui-ds |
| `PageShell` | Session 4 | — | ui-ds §Layout patterns |
| `SearchInput`, `CoverageBar`, `SeverityIndicator` | Session 1 | — | ui-ds |
| `FieldRow`, `PanelSectionTitle` | Session 2 | — | ui-ds (Detail Panel) |
| `ReporterStatusBadge` · `InternalTaskBadge` | Session 1 | — | 04 voc / 06 task |
| `SeverityBadge`, `ConfidenceBadge`, `FindingStatusBadge`, `TaskRequestBadge`, `ManagedSystemPill` | Session 1 | — | 04/05/06 |
| `ClusterStatusBadge`, `SurveyStatusBadge`, `HelpTip` | Session 2 | — | 04/07 |
| `EntityNode`, `LinkedEntityTrail` | Session 1 | Pack 13 keyboard/selection pass | 11 linking |
| `DetailPanelHeader`, `DetailPanelSectionNav`, `PanelTitleBlock`, `NestedTextBlock`, `Callout`, `UserChip`, `OutlineBadge`, `ListToolbar`, `EntityIconBadge`, `priorityToSeverity` | Session 2 / Pack 17 | Pack 17 | ui-ds · inter §Anchored sections |
| `PermissionBlockedPanel` | Session 4 | — | 09 permission · inter |
| `SourceTypeIcon` 🏷️ | Session 3 (`screen-evidence`) | Pack 10 | 05 finding · ui-ds |
| `SentimentChip` 🏷️ | Session 3 (`screen-evidence`) | Pack 10 | 05 finding |
| `ImportanceChip` 🏷️ | Session 3 (`screen-evidence`) | Pack 10 | 05 finding |
| `EntityRelationRow` 🏷️ | Pack 10 | Pack 10 | 11 linking · inter |
| `ObjectCard` 🏷️ | Pack 10 | Pack 10 | ui-ds (card patterns) |
| `LiveTimestamp`, `LiveCount`, `useTicker`, `relativeFromNow` 🏷️ | Pack 10 | Pack 10 | 12 ux §Action Dashboard live signals |

### `affordances.jsx` (interaction primitives — Pack 12) 🎛️

| Component / hook | Backing spec |
|---|---|
| `<ToastHost>` + `window.__toast()` emitter | inter §Feedback toasts |
| `useFullscreenPanel()` | inter §Detail patterns (expand) |
| `<Popover>` (anchor-ref, `position: fixed`, click-outside dismiss) | ui-ds |
| `<ListFilterButton categories applied onChange onClear>` | inter §Filter popover |
| `<ListSortButton fields value onChange>` (also used as Group by) | inter §Sort + Group |
| `<MoreButton items>` | ui-ds (kebab menus) |
| `<DetailPanelHeaderActions entityKind entityId copyHash>` | inter §Detail header actions |
| `<PreviewModal open onClose title>` | 04 voc §Composer preview |

### `shell.jsx` + `styles.css` (responsive shell — Pack 13) 🪟

| Component / style | Backing spec |
|---|---|
| Mobile nav toggle + backdrop dismiss | routes §Responsive app shell |
| Sidebar drawer state closes on route/nav selection | inter §Navigation behaviour |
| Touch target pass for nav/action rows | ui-ds §Touch targets |

### `data.js` (domain helpers — Pack 8) 🧩

| Helper | Backing spec |
|---|---|
| `Actors`, `WORKSPACE_MS_IDS`, `effectiveScopeFor(role)`, `resolveScopeMembers(scopeId, role)` | 09 permission §Role Level, Scope, Capability |
| `getPermissionDecision(entity, key)` | 09 permission · inter §Permission-Limited Linked Objects |
| `REPORTER_STATUS_TRANSITIONS`, `reporterStatusGate(next, voc, task)` | 04 voc §Reporter state machine |

### Cross-cutting 🧩

| Component | File | Backing spec |
|---|---|---|
| `EntityHoverPreview` | `entity-preview.jsx` | inter §Entity hover preview |
| `RichEditor` (4 surfaces) | `rich-editor.jsx` | 04 voc · ADR-0002 |
| `CommandMenu` | `cmdk.jsx` | inter §Command menu |
| Trail CTA action panels | `screen-voc.jsx`, `screen-evidence.jsx`, `screen-findings.jsx` | 11 linking · inter §Linked object actions |

### Layout 🪟

| Component | File | Backing spec |
|---|---|---|
| `GlobalRail`, `Sidebar`, `Topbar` | `shell.jsx` | routes · 12 ux §Role-level navigation. Sidebar scope switcher renders `union` chip + grants list when `all` is bounded (Pack 8). |

### Screen-specific composites

(See HANDOFF §6.  Pack 10 makes the following list rows use the shared atoms above:)

- `EntityLinkRow` — uses `EntityRelationRow` for src → tgt stem 🏷️
- `ClusterDetailPanel` member list — uses `EntityRelationRow` single-entity form 🏷️
- `AnalyticsAreaSlideOver` — uses `EntityRelationRow` for related findings 🏷️
- `IntegrationScreen` + `HomeScreen` — use `LiveTimestamp` + `LiveCount` 🏷️
- `ReporterStatusChangeBlock` (`screen-voc.jsx` — Pack 8) — public-update composer sub-surface; allowed-only picker, linked-Task gate, Reporter preview card
- `PolicyRetroWarning` (`screen-admin-settings.jsx` — Pack 8) — fires when `crossMsLinking` / `selfApproval` are dirty; tightens vs loosens flow
- `PermissionRequestPanel` SELF_APPROVAL capture (`screen-permissions.jsx` — Pack 8) — policy citation + peer-reviewer absence + envelope preview

---

## 4. Shared atoms — usage map

A flat reverse-index so production engineers can find every consumer of a primitive when porting it.

| Atom | Consumers (file) |
|---|---|
| `PageShell` | home · voc-create (Create) · integration · surveys · admin · admin-areas · admin-settings · survey-result · tasks-roadmap |
| `ListShell` | tasks requests · tasks backlog · my tasks · task inbox · evidence · entity-links |
| `WorkbenchShell` | tasks board · voc triage · survey builder · survey result |
| `ShellTitle` | tasks board · voc triage |
| `DetailPanelHeader` | voc · clusters · findings · tasks · evidence · entity-links · milestones · permissions |
| `DetailPanelSectionNav` 🏷️ | voc · triage · clusters · findings · tasks · task requests · evidence · entity-links · surveys · admin-areas · milestones · permissions |
| `PanelTitleBlock` | All detail panels |
| `Callout` | clusters · findings · evidence · milestones · surveys (forbidden) · survey-builder · entity-links · permissions · settings · areas (slide-over) |
| `ListToolbar` | voc · clusters · findings · tasks · evidence · entity-links · milestones · permissions |
| `EntityIconBadge` | trail · evidence · entity-link rows · cluster · roadmap (via `EntityRelationRow`) |
| `PermissionBlockedPanel` | voc detail · finding detail · evidence (source) · cluster (member) · triage (out-of-scope) · survey result (anonymity) · entity-link target |
| `EntityRelationRow` 🏷️ | entity-links rows · cluster member VOCs · AA slide-over related findings · VOC detail "Linked execution" · Finding detail "Linked execution" |
| `ObjectCard` 🏷️ | Findings card view (`FindingCard`) · Surveys card view (`SurveyCard`) |
| `ViewModeToggle` 🏷️ | Findings list · Surveys list |
| `SourceTypeIcon` 🏷️ | evidence list · milestone evidence section · survey result excerpts |
| `SentimentChip` 🏷️ | evidence list · survey result text response highlights |
| `ImportanceChip` 🏷️ | evidence list · finding evidence section |
| `LiveTimestamp` 🏷️ | home KPI · integration action dashboard · entity links toolbar |
| `LiveCount` 🏷️ | home KPI pills · home action cards · integration action cards · integration "N gaps" |
| `EntityHoverPreview` | voc rows · task backlog rows · task request rows (extend to every entity-id site) |
| `RichEditor` | voc detail compose · voc create body |
| `CommandMenu` | global ⌘K |
| `ListFilterButton` 🎛️ | voc inbox · tasks board · findings list |
| `ListSortButton` 🎛️ | voc inbox (Sort) · tasks board (Group by) |
| `DetailPanelHeaderActions` 🎛️ | voc · cluster · finding · task · task request · milestone · evidence · entity link · permission request |
| `PreviewModal` 🎛️ | voc composer Preview |
| `ToastHost` 🎛️ | global (single mount in `app.jsx`) |
| `useFullscreenPanel` 🎛️ | all `DetailPanelHeaderActions` consumers (expand icon) |

---

## 5. Domain object → primary screen → detail surface

For each canonical object in `01 domain`, which surfaces own its CRUD/review story.

| Object | List | Create | Review/Detail | Backstory pages |
|---|---|---|---|---|
| VOC | `screen-voc.jsx` inbox/my | `screen-voc-create.jsx` form | VocDetailPanel | Triage console · clusters list |
| VOC Cluster | `screen-clusters.jsx` | inline | ClusterDetailPanel | Sample VOCs use `EntityRelationRow` |
| Finding | `screen-findings.jsx` | trail CTA action panel | FindingDetailPanel | Evidence highlights, Draft / Link existing / Later |
| Evidence Highlight | `screen-evidence.jsx` | trail CTA action panel | EvidenceDetailPanel | Linked execution, Draft / Attach / Review |
| Task Request | `screen-tasks.jsx` requests | from VOC/Finding/Survey | TaskRequestPanel | Capability gating, self-approval |
| Task | `screen-tasks.jsx` board/my/inbox/backlog | from request | TaskDetailPanel | Drag-drop column move |
| Milestone | `screen-milestones.jsx` | (inline) | MilestoneDetailPanel (scroll-spy 🏷️) | Roadmap multi-MS view 🏷️ |
| Survey | `screen-other.jsx` surveys | builder full-page | (surveys panel) | Result Summary · Builder |
| Survey Question | `screen-survey-builder.jsx` | inline | Edit pane | Option preservation 🏷️ |
| Entity Link | `screen-entity-links.jsx` | implicit (created on link) | EntityLinkDetailPanel | Bulk-detach + freshness 🏷️ |
| Coverage Signal | `screen-coverage.jsx` | — | Threshold modal | — |
| Managed System | `screen-other.jsx` admin | inline | Configure CTA | Settings cross-MS policy |
| Analytics Area | `screen-other.jsx` admin-areas | inline | `AnalyticsAreaSlideOver` 🏷️ | Pack 10 |
| Permission Request | `screen-permissions.jsx` | from any blocked panel | PermissionDetailPanel | Approval lifecycle |

---

## 6. Pack 12 deliverables — traceability

| Deliverable | Touched | Spec link | HANDOFF rule satisfied |
|---|---|---|---|
| Global toast host + emitter | `affordances.jsx` (`<ToastHost>`, `window.__toast`), `app.jsx` (mount), `styles.css` (`.toast-host`, `.toast`) | inter §Feedback toasts | Rule 1 |
| Detail panel fullscreen (expand icon → panel-fullscreen) | `affordances.jsx` (`useFullscreenPanel`), `app.jsx` (route-change collapse), `styles.css` (`.app-shell.panel-fullscreen`) | inter §Detail patterns | Rule 1 |
| Detail panel copy-link + kebab menu | `affordances.jsx` (`<DetailPanelHeaderActions>`, `<MoreButton>`), 8 screens migrated | inter §Detail header actions | Rule 1 · Rule 5 (production-honest copy) |
| List filter / sort popovers | `affordances.jsx` (`<Popover>`, `<ListFilterButton>`, `<ListSortButton>`), VOC inbox + Tasks board + Findings list wired | inter §Filter / Sort popovers | Rule 1 |
| Tasks board Group by | `screen-tasks.jsx` (`TASK_GROUP_BY_FIELDS`, `buildGroupColumns`, `taskGroupValue`) | 06 task §Board grouping | Rule 1 |
| Composer preview modal | `affordances.jsx` (`<PreviewModal>`), `screen-voc.jsx` (`ComposerPublicPreview`, `ComposerReplyPreview` + Preview button wiring) | 04 voc §Composer | Rule 1 · Rule 5 |

---

## 7. Pack 8 deliverables — traceability

| Deliverable | Touched | Spec link | HANDOFF rule satisfied |
|---|---|---|---|
| Unified `permissionDecisions` envelope | `data.js` (entity shape + `getPermissionDecision`), `screen-evidence.jsx` (fixture migration), `screen-voc.jsx`, `screen-findings.jsx`, `screen-tasks.jsx`, `screen-evidence.jsx` (consumers all read through helper) | 09 permission · inter | Rule 4 (spec is source of truth) |
| Effective Managed System scope union | `data.js` (`Actors`, `effectiveScopeFor`, `resolveScopeMembers`), `app.jsx` (role-aware `scope` with `.members`), `shell.jsx` (bounded-`all` chip + out-of-grants flag), 10 consumer screens migrated to `scope.members.includes(…)` | 09 permission §Role Level, Scope, Capability | Rule 3 (terminology) · Rule 4 |
| Reporter-facing Status change + public-copy preview | `data.js` (`REPORTER_STATUS_TRANSITIONS`, `reporterStatusGate`), `screen-voc.jsx · ReporterStatusChangeBlock` inside `<VocDetailPanel>` compose surface | 04 voc §Reporter state machine · inter §Public update | Rule 3 (Reporter-facing Status copy) · Rule 5 (production-honest copy) |
| Self-approval audit capture | `screen-permissions.jsx · PermissionRequestPanel` (capture block + envelope preview), `Audit log` rendering with SELF_APPROVAL label | 09 permission §FR-PERM-002 · ADR-0008 | Rule 4 |
| Cross-MS / self-approval policy retro warning | `screen-admin-settings.jsx` (`PolicyRetroWarning`, `classifyPolicyTransition`, `POLICY_IMPACT_MOCK`) | 09 permission §FR-PERM-003 · routes | Rule 2 (file split, ex `screen-other.jsx`) |

---

## 8. Pack 10 deliverables — traceability

| Deliverable | Touched | Spec link | HANDOFF rule satisfied |
|---|---|---|---|
| `EntityRelationRow` extraction | `components.jsx`, `screen-entity-links.jsx`, `screen-clusters.jsx`, `screen-tasks-roadmap.jsx`, `screen-other.jsx` (AA slide-over) | 11 linking · inter | Rule 1 (component-first) |
| `ObjectCard` generalisation | `components.jsx` (primitive available; Milestone card not yet refactored — see §9) | ui-ds | Rule 1 |
| `SourceTypeIcon` / `SentimentChip` / `ImportanceChip` promotion | `components.jsx`, `screen-evidence.jsx` (consumer) | 05 finding · ui-ds | Rule 1 |
| Multi-milestone TaskGantt roadmap (`/tasks/roadmap`) | `screen-tasks-roadmap.jsx`, `shell.jsx`, `app.jsx`, `cmdk.jsx`, `FeedbackOps.html` | 06 task §FR-TASK-005 · routes | Rule 2 (own file, < 900 lines) |
| AnalyticsArea detail slide-over | `screen-other.jsx` (`AnalyticsAreaSlideOver`) | 09 permission §5.4 | Rule 3 (AA is filter, not boundary) |
| Action Dashboard live counts | `components.jsx` (`LiveTimestamp`, `LiveCount`, `useTicker`), `screen-home.jsx`, `screen-other.jsx`, `styles.css` (`live-ping`) | 12 ux §Action queues are live | Rule 1 |
| EntityLinks "Last refreshed at" | `screen-entity-links.jsx` (`LiveTimestamp` toolbar entry + Refresh button) | 11 linking · 12 ux | Rule 1 |
| MilestoneDetail scroll-spy | `screen-milestones.jsx` (`IntersectionObserver` block) | inter §Anchored sections | — |
| Survey Builder option preservation | `screen-survey-builder.jsx` (Kind chooser patch logic + stash hint) | 07 survey §FR-SURVEY-002 | Rule 5 (production-honest copy) |

### Pack 11 — Pack 10 follow-up adoption

| Deliverable | Touched | Spec link |
|---|---|---|
| `ObjectCard` consumers shipped | `screen-findings.jsx` (`FindingCard` + view-mode toggle), `screen-other.jsx` (`SurveyCard` + view-mode toggle) | ui-ds (card patterns) |
| `ViewModeToggle` primitive | exposed from `screen-findings.jsx`, consumed by Surveys list | ui-ds |
| `EntityRelationRow` reach extended | `screen-voc.jsx` (Linked execution section), `screen-findings.jsx` (Linked execution row) | 11 linking · inter |
| In-place Milestone detail slide-over | `screen-tasks-roadmap.jsx` (`MilestoneRoadmapSlideOver`), `screen-milestones.jsx` (`MilestoneDetailPanel` now exposed) | inter §Detail patterns |
| Layout-bug fix in `EntityRelationRow` | `components.jsx` — replaced `.entity-node` (fixed 3-col grid) with flex layout so multi-element stems don't get crammed into an 18px column | ui-ds |

### Pack 13 — responsive shell + actionable linked-object flows

| Deliverable | Touched | Spec link |
|---|---|---|
| Backlog execution terminology cleanup | `screen-tasks.jsx` (`Start execution` / `Execution started`) | 06 task §FR-TASK-003 |
| Survey Builder drag-reorder status clarified | `screen-survey-builder.jsx` (HTML5 DnD comment + local dirty state) | 07 survey §FR-SURVEY-002 |
| Linked entity trail nodes made selectable | `components.jsx` (`EntityNode` keyboard activation + selected state) | 11 linking · inter |
| Trail CTA action panels | `screen-voc.jsx`, `screen-evidence.jsx`, `screen-findings.jsx` | 04 voc · 05 finding · 11 linking |
| Basic mobile/tablet shell drawer | `shell.jsx`, `styles.css` | routes · ui-ds responsive shell |
| Basic touch target pass | `styles.css` | ui-ds §Touch targets |

Note: mobile/tablet support is now explicitly lowest priority. Keep the basic drawer/touch fixes as guardrails, but do not spend next-session scope on phone/tablet polish unless the product direction changes.

### Pack 14 — desktop linked-flow draft completion

| Deliverable | Touched | Spec link |
|---|---|---|
| Shared desktop draft panel | `flow-drafts.jsx`, `FeedbackOps.html` | 11 linking · inter |
| VOC trail drafts | `screen-voc.jsx` — Evidence Highlight / Finding / Task Request / existing attach flows now open editable desktop panels | 04 voc · 11 linking |
| Finding task-request draft | `screen-findings.jsx` — execution CTA + trail CTA open editable Task Request draft panel | 05 finding · 06 task |
| Evidence promotion / attach drafts | `screen-evidence.jsx` — Promote to Finding and Attach to existing VOC open editable panels | 05 finding · 11 linking |
| Survey follow-up draft flows | `screen-other.jsx`, `screen-survey-result.jsx` — allowed follow-up actions open the matching desktop draft panel, including existing VOC evidence attach | 07 survey §FR-SURVEY-005 |

### Pack 15 — desktop route-resolution intent handoff

| Deliverable | Touched | Spec link |
|---|---|---|
| Route-param entity preservation | `app.jsx` — `onNavigate(route, view, param)` keeps selected desktop entity ids in `#route=...&view=...&param=<entityId>` | 11 linking · deep link |
| Draft route-resolution intent | `flow-drafts.jsx` — draft panels expose source entity, target route, target id, and API-pending workflow intent | 11 linking · production handoff |
| Target screen selection | `screen-voc.jsx`, `screen-findings.jsx`, `screen-evidence.jsx`, `screen-other.jsx`, `screen-survey-result.jsx`, `screen-tasks.jsx` — route params seed the matching row/detail where supported | 04 voc · 05 finding · 06 task · 07 survey |
| Manual desktop QA status | User confirmed draft panel open/reopen, editable fields, intent matching, CTA entity-context preservation, and Evidence trail panel visibility look correct in the Open Design preview | QA handoff |

### Pack 16 — handoff hardening + visual baselines

| Deliverable | Touched | Spec link |
|---|---|---|
| Curated final screenshot baselines | `DESIGN-MAP.md` §2 — promoted selected `screenshots/*.png` files as canonical visual acceptance references | handoff QA |
| Agent input bundle | `HANDOFF.md` — lists required docs, prototype files, and evidence to pass to a continuation/rebuild agent | handoff QA |
| Reproduction acceptance contract | `HANDOFF.md` — P0/P1 criteria, known non-goals, and adversarial review notes | handoff QA |
| Admin Settings drift fix | `HANDOFF.md`, `DESIGN-MAP.md` — `admin-settings` consistently maps to `screen-admin-settings.jsx` | routes |

### Pack 17 — Samsung-light palette + shared detail section nav

| Deliverable | Touched | Spec link |
|---|---|---|
| Samsung-light palette rebound | `styles.css`, `app.jsx`, direct JSX color remnants — cool blue-white canvas, near-white surfaces, soft blue borders, Samsung Blue `#1428a0` primary/focus | ui-ds visual tokens |
| `DetailPanelSectionNav` promotion | `components.jsx`, `styles.css` — shared anchored section jump bar with active-section tracking | inter §Anchored sections |
| Long drawer migration | `screen-voc.jsx`, `screen-voc-create.jsx`, `screen-clusters.jsx`, `screen-findings.jsx`, `screen-tasks.jsx`, `screen-evidence.jsx`, `screen-entity-links.jsx`, `screen-other.jsx`, `screen-milestones.jsx`, `screen-permissions.jsx` | ui-ds detail panels |

### Pack 18 — route pattern shells + aligned headers

| Deliverable | Touched | Spec link |
|---|---|---|
| Three route layout shells | `components.jsx`, `styles.css` — `PageShell` for page-body screens, `ListShell` for filter/list/detail routes, `WorkbenchShell` for board/builder/triage work surfaces | ui-ds layout patterns |
| ListShell migration | `screen-tasks.jsx`, `screen-evidence.jsx`, `screen-entity-links.jsx` — requests/backlog/my/inbox/evidence/entity-links use the shared filter + list + detail shell | routes · ui-ds lists |
| WorkbenchShell migration | `screen-tasks.jsx`, `screen-voc-create.jsx`, `screen-survey-builder.jsx`, `screen-survey-result.jsx` — Tasks board, Triage, Survey Builder, and Survey Result use the shared workbench frame | routes · ui-ds workbench |
| Header height alignment | `styles.css`, `components.jsx` — sidebar system header, ListShell/WorkbenchShell toolbar, panel drawer header, and survey preview drawer header align to the same 50px header baseline | ui-ds layout tokens |
| Shared title treatment | `components.jsx`, `screen-tasks.jsx`, `screen-voc-create.jsx` — Tasks board and Triage use `ShellTitle` icon + title + badges so title position and rhythm match | ui-ds headings |

---

## 9. Known follow-up (carry into next pack)

These items finished the recent prototype passes but leave intentional next-pack work. Prioritise desktop workflow completeness; mobile/tablet polish is last.

0. **Production linked-flow API handoff** — Desktop linked-flow completion is done through Pack 15. Next session should not repeat the prototype QA pass unless a regression is reported. Start from the API contract: replace the prototype route-resolution intent with the backend linked-object workflow endpoint response, persist the selected source/target ids, and redirect to the newly created/resolved entity id.

1. **`ObjectCard` for grouped lists** — Findings + Surveys now have card view via `<ObjectCard>` (Pack 11).  Same pattern can apply to Task Backlog and Milestones if a card view there pulls weight.
2. **`EntityRelationRow` reach** — six consumers today (entity-links, cluster members, AA slide-over related findings, VOC detail Linked execution, Finding detail Linked execution, plus the source→target stem inside EntityLinkRow).  Still natural targets: Task detail's source-VOC card, Survey result's allowed follow-up rows (currently a custom `SurveyFollowupAction` — different shape, not a hard convert).
3. **`LiveCount` source-of-truth** — prototype drives counts off a synthetic timer.  Production should wire to the SSE/long-poll endpoint that powers the Action Dashboard; the `LiveTimestamp` should display server-issued `last_refreshed_at`, not local clock time.
4. **Roadmap milestone state in URL** — Pack 11 opens the Milestone detail as a slide-over over the Roadmap.  Selected milestone state is local; production should put it in URL (`#route=tasks&view=roadmap&milestone=M-21`) so back-button closes the panel and links are deep.
5. **Permission Request → originally-blocked action return-route** — Pack 8 added the unified envelope but didn't yet wire `return_route_intent` so approval lands the requester back on the originally blocked card.  Per spec FR-PERM-001.
6. **`scope.members` deep-link** — URL hash currently encodes a single `scope` id.  Multi-MS picks (e.g. a developer explicitly comparing two of their granted systems) need a `scope=tableau,powerbi` form.
7. **Mobile/tablet polish** — Explicitly deferred. Basic shell drawer exists, but tablet bottom sheets, phone-first detail flows, and deeper touch tuning should wait until desktop flows stop moving.

---

## 10. Editing this document

When you ship a Pack:
1. Bump the **Last updated** stamp.
2. Add new rows to §1 (routes → screens), §2 (visual baselines), and §3 (component inventory).
3. If you promoted/extracted a primitive: tag with 🏷️ and list in the component inventory.
4. If you completed an item from §9: delete it from there and add to the Pack section.
5. Cross-check against `HANDOFF.md` §11 (remaining packs) — items should only live in one of the two docs.
