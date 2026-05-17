# FeedbackOps Suite — Handoff Document

> Hi-fi interactive prototype for the FeedbackOps Suite internal operating platform.
> Bridge between design exploration (here) and production implementation.

**Last updated:** 2026-05-17 (session 19 — Pack 20: Baseline QA + nested-button polish + screenshot cleanup)
**Author:** Design (Claude session)
**Entry point:** [`FeedbackOps.html`](./FeedbackOps.html)
**Page · Component · Spec map:** [`DESIGN-MAP.md`](./DESIGN-MAP.md)

---

## ⚠️ Working Instructions — read this first

These rules govern every change to this prototype. Do not skip.

### 🔒 Rule 1 — Component-first

Before implementing anything new:

1. Check whether a shared component in `components.jsx` already covers it.
2. Search for similar inline patterns in `screen-*.jsx`.
3. If the same pattern appears in **2 or more places** and no shared component exists, **extract it first**, then build on top.

This is why we have `DetailPanelHeader`, `DetailPanelSectionNav`, `PanelTitleBlock`, `NestedTextBlock`, `Callout`, `UserChip`, `OutlineBadge`, `ListToolbar`, `EntityIconBadge`, `ClusterStatusBadge`, `SurveyStatusBadge`, `priorityToSeverity`, `EntityHoverPreview`, `RichEditor`, `CommandMenu`, `ListFilterButton`, `ListSortButton`, `MoreButton`, `DetailPanelHeaderActions`, `PreviewModal`, `ToastHost`. Keep applying it.

### 🔒 Rule 2 — File split budget

Every `screen-*.jsx` file stays **under ~900 lines**. If a screen is approaching the budget — or the next piece will push it over — **split first, then build**:

- Visualization atoms (charts, gantts, custom timelines) → own file (e.g. `screen-milestone-gantt.jsx`).
- Big detail panels past ~300 lines → split into `screen-<entity>-panel.jsx`.
- Per-section sub-views (Builder, Result Summary) → already separate files.

Loading order matters — helper file loads **before** the screen that uses it. Helpers expose via `Object.assign(window, …)`; consumers destructure `const { TaskGantt } = window;`. Don't introduce ESM imports.

When the natural unit is "one entity, one route, under 900 lines", keep it in one file. Don't pre-split.

### 🔒 Rule 3 — Terminology contract (visible copy)

Every visible label must match the canonical vocabulary in `docs/design/*` and `docs/frontend/*`:

- **"Managed System"** — never "system", "MS", or "managed-system" in copy.
- **"Analytics Area"** — never "Area", "AA", or "영역".
- **"Reporter-facing VOC Status"** vs **"Internal Task Status"** — visually + verbally separate (pill vs squared badge).
- **Allowed Survey follow-up labels:** Create Finding · Link Finding · Request Task · Add Evidence Highlight · **"기존 VOC에 근거 연결"** (`attach_evidence_to_existing_voc`).
- **Forbidden Survey labels:** "Create VOC", "Convert to VOC", "Generate VOC from Response", "Link Existing VOC".
- **Task verbs:** "Request Task" (from VOC/Finding/Survey follow-up), "Create Task" (standalone only, from Tasks surface), "Convert to Task" (Task Request review), "Link Existing Task" (alternative to convert).
- **Backlog → Execution language:** docs say "execution starts at Todo or Doing". Use "Awaiting execution" or "Execution starts at Todo/Doing", NOT "Ready to promote" or "Promote to Todo".
- **Workspace Admin** — two words, capitalised. Role label across docs.
- **Permission Request lifecycle:** `blocked → request_opened → pending → needs_more_info → pending → approved | rejected | expired | revoked`. Explicit deny is its own decision, not a stronger "reject".

### 🔒 Rule 4 — Spec is the source of truth

`docs/design/*` and `docs/frontend/*` win every disagreement with the prototype. When in doubt, read the spec — don't infer from the prototype.

### 🔒 Rule 5 — Production-honest copy

The prototype is design-only, but the copy lands as-is in production review. Match real product tone (Korean honorifics, no AI-flavoured filler, no placeholder "Lorem"). Don't pad with content that wouldn't survive a PM review.

---

## 1. What this is

A clickable, design-system-conformant prototype that visualizes every primary screen specified in `docs/frontend/` and `docs/design/`. Built with vanilla React + Babel (no build step) so it opens directly in a browser. **Not** wired to a backend — interactions validate UX, not behavior.

Use as:
- Pixel-level reference for layout, density, typography, color, spacing
- Behavioral reference for what each panel/badge/queue means and which CTAs sit above the fold
- Jumping-off point to translate into the production stack (`apps/frontend/`)

## 2. How to run

Open `FeedbackOps.html` in Chrome 124+. No build, no install. CDN deps pinned with integrity hashes:

- React 18.3.1 · React DOM 18.3.1 · @babel/standalone 7.29.0

Tweaks panel (bottom-right toggle in the toolbar) flips between screens, MS scope, role level, and accent color without reload.

**URL state** — `#route=&view=&scope=&param=` syncs to the address bar. Refresh, browser back/forward, and sharable deep links all work.

**Command Menu (⌘K)** — global palette with Navigate / Create / Switch scope / Open verbs. Also reachable from the sidebar "Command" item.

## 3. File map

```
FeedbackOps.html         entry; loads scripts in this order:
  styles.css             all design tokens + utility classes (single source of truth)
  data.js                mock domain data (Vocs, Findings, Tasks, Users, ManagedSystems, ...)
  components.jsx         primitives: Icon, Avatar, Button, badges, PageShell,
                         LinkedEntityTrail, PermissionBlockedPanel, ListToolbar, ...
  entity-preview.jsx     EntityHoverPreview — hover popover for entity refs (VOC/FIN/TASK ids)
  rich-editor.jsx        RichEditor — 4-surface contentEditable editor
                         (voc-description / reporter-reply / public-update / internal-comment)
  shell.jsx              AppShell: GlobalRail (52px), Sidebar (240px), Topbar
                         + role-level nav filtering (User/Developer/Admin)
  screen-home.jsx        Home / Action Dashboard
  screen-voc.jsx         VOC Inbox list + VOC Detail panel
  screen-voc-create.jsx  Create VOC form + Triage Console (optimistic mutation + undo)
  screen-clusters.jsx    VOC Clusters list + cluster detail
  screen-findings.jsx    Findings list + Finding detail
  screen-tasks.jsx       Tasks Board (Kanban + drag-drop) + Task Requests
                         + Backlog + Task detail
  screen-tasks-views.jsx My Tasks + Tasks Inbox (Pack 19 split)
  screen-evidence.jsx    Integration·Evidence highlights list + detail
  screen-coverage.jsx    Integration·Coverage signals + missing-link queries + threshold modal
  screen-entity-links.jsx Integration·Entity links list + detail + bulk-detach
  screen-milestone-gantt.jsx Mini-timeline + TaskGantt (split out of milestones)
  screen-milestones.jsx  Tasks·Milestones list + detail (Overview/Timeline/Tasks/Evidence/Activity)
  screen-tasks-roadmap.jsx Tasks·Roadmap — multi-milestone shared-axis Gantt (Pack 10)
  screen-integration.jsx Integration Action Dashboard (Pack 19 split)
  screen-surveys.jsx     Surveys list + detail panel + follow-up CTAs (Pack 19 split)
  screen-admin.jsx       Admin · Managed Systems + Analytics Areas + AA slide-over (Pack 19 split)
  screen-survey-result.jsx Survey Result Summary
  screen-survey-builder.jsx Survey Builder full-page (outline + editors + settings)
  screen-survey-builder-preview.jsx Survey Preview pane + Launch validation modal (Pack 19 split)
  screen-permissions.jsx Permission Requests review console
  screen-admin-settings.jsx Workspace settings + cross-MS policy retro warning (Pack 8)
  affordances.jsx        Pack 12 — shared interaction primitives:
                         <ToastHost>, useFullscreenPanel,
                         <Popover>, <ListFilterButton>, <ListSortButton>,
                         <MoreButton>, <DetailPanelHeaderActions>, <PreviewModal>
  cmdk.jsx               CommandMenu (⌘K) palette
  app.jsx                Top-level App: route state, scope, role, breadcrumb, URL sync, Tweaks
```

`screen-*.jsx` files publish components to `window` at the bottom. Prototype convenience — production replaces with proper ESM imports.

### Agent input bundle

If another agent must continue or recreate the prototype, give it this whole bundle. `HANDOFF.md` alone is not enough for visual parity.

**Required context**
- `HANDOFF.md` — operating rules, changelog, non-negotiables, remaining work.
- `DESIGN-MAP.md` — route/file/spec map and final visual baselines.
- `DESIGN.md`, `docs/design/*.md`, `docs/frontend/*.md` — source requirements, route contract, and UI contracts.
- `docs/implementation/03-api-contracts.md`, `docs/design/15-data-contracts.md`, `docs/implementation/06-entity-linking-contract.md`, `docs/adr/0012-error-code-contract.md` — production API/data/error/linking contracts. Required for clean-room implementation, not just prototype continuation.

**Required prototype files**
- `FeedbackOps.html`, `app.jsx`, `styles.css`, `data.js`
- `components.jsx`, `shell.jsx`, `affordances.jsx`, `cmdk.jsx`, `entity-preview.jsx`, `rich-editor.jsx`, `flow-drafts.jsx`
- every `screen-*.jsx` file in the project root

**Required visual evidence**
- Use the current canonical PNG set in `screenshots/final-baselines/`, with `screenshots/final-baselines/manifest.json` as capture metadata.
- Use `DESIGN-MAP.md` §2 as the baseline target list.
- Treat older files directly under `screenshots/` as working evidence, not canonical references, unless a later handoff promotes them.

**Rebuild instruction**
- Start from the existing prototype files when the goal is visual parity. Start from the source docs only when the goal is a production implementation; in that case use the prototype as acceptance evidence, not as architecture.

### Linked-project implementation spec handoff

Use this when handing the Open Design prototype back to the linked `FeedbackOps` project and asking another agent to turn it into a React + TypeScript + Tailwind + shadcn/ui implementation spec.

**Prompt to give the implementation agent**

> Create an implementation-ready frontend spec for FeedbackOps using the Open Design prototype as visual/interaction evidence and the linked project docs as product/API truth. Target stack: React, TypeScript, Tailwind, shadcn/ui. Preserve the prototype's route structure, information density, entity language, visual hierarchy, and core interactions, but do not copy prototype architecture patterns such as hash-only routing, `window` globals, synthetic local data, or draft-only API intent panels. Bind implementation behavior to the linked project's API/data/link/error contracts.

**How to use the bundle**
- Treat `DESIGN-MAP.md` as the route-to-screen-to-source-doc index.
- Treat `HANDOFF.md` as the operating constraints, known non-goals, and pass/fail contract.
- Treat the curated screenshots in `DESIGN-MAP.md` §2 as the visual baseline, not the whole `screenshots/` folder.
- Treat `FeedbackOps.html`, `app.jsx`, `styles.css`, `components.jsx`, `shell.jsx`, `affordances.jsx`, `cmdk.jsx`, `entity-preview.jsx`, `rich-editor.jsx`, `flow-drafts.jsx`, `data.js`, and `screen-*.jsx` as executable reference material for visual density and interaction behavior.
- Treat `docs/implementation/03-api-contracts.md`, `docs/design/15-data-contracts.md`, `docs/implementation/06-entity-linking-contract.md`, and `docs/adr/0012-error-code-contract.md` as production truth for endpoints, payloads, linked-object workflows, and error handling.

**Spec output expected from the linked project**
- Route matrix: route id, URL, React page/component owner, required params, panel behavior, loading/empty/error/permission states.
- Component mapping: prototype component or surface -> shadcn/ui primitive/custom component -> required props -> state variants.
- Data mapping: prototype mock entity fields -> production DTO/schema fields -> unresolved gaps.
- Interaction contract: filters, tabs, modals, command palette, dirty-save bar, drag/drop, launch validation, linked-flow creation, permission requests.
- Visual contract: Tailwind tokens for surfaces, text, borders, status colors, radii, density, row heights, and focus states; current prototype palette is Samsung-light blue (`#f3f7fe` canvas, `#1428a0` primary/focus).
- Acceptance evidence: each implemented route must be compared against the curated screenshot baseline and the P0/P1 reproduction contract below.

**Do not let the implementation agent infer these from screenshots alone**
- Production endpoint shapes, mutation semantics, error envelopes, permission envelopes, entity-link creation, or route-resolution behavior. These come from the linked project contracts.
- Mobile/tablet parity. Current artifact is a desktop parity spec unless a new responsive brief is written.
- New product copy or metrics. Copy should come from existing docs/prototype; unknown values should stay explicit TODOs.

## 4. Design system mapping

Source of truth: [`DESIGN.md`](../DESIGN.md). Implementation contract: [`docs/frontend/ui-design-system.md`](../docs/frontend/ui-design-system.md).

### Raw tokens (DESIGN.md → CSS custom properties)

All raw color tokens declared as `--color-*` on `:root` in `styles.css`. Examples:

| DESIGN.md name | CSS var | Hex |
|---|---|---|
| Pitch Black | `--color-pitch-black` | `#f3f7fe` |
| Graphite | `--color-graphite` | `#fbfdff` |
| Deep Slate | `--color-deep-slate` | `#edf3fb` |
| Charcoal Grey | `--color-charcoal-grey` | `#cbd6e6` |
| Porcelain | `--color-porcelain` | `#101828` |
| Storm Cloud | `--color-storm-cloud` | `#687386` |
| Neon Lime | `--color-neon-lime` | `#1428a0` (legacy var name; Samsung Blue primary/focus) |
| Aether Blue | `--color-aether-blue` | `#1428a0` |

### Semantic tokens

Per `ui-design-system.md`, **screen code consumes semantic tokens, not raw color tokens.** Defined in `styles.css`:

- **Text** — `--text-primary`, `--text-secondary`, `--text-muted`, `--text-disabled`, `--text-danger`, `--text-warning`, `--text-success`, `--text-info`
- **Surface** — `--surface-canvas`, `--surface-sidebar`, `--surface-row-hover`, `--surface-row-selected`, `--surface-detail`, `--surface-card`, `--surface-card-elevated`, `--surface-popover`
- **Border / focus** — `--border-subtle`, `--border-strong`, `--border-selected`, `--focus-ring`
- **Reporter VOC status** — `--status-reporter-received`, `--status-reporter-reviewing`, … (8 states)
- **Internal task status** — `--status-internal-backlog`, `--status-internal-todo`, … (7 states)
- **Severity / confidence / priority** — `--severity-low|medium|high|critical`, `--confidence-low|medium|high`
- **Layout** — `--sidebar-width`, `--rail-width`, `--detail-panel-width`, `--row-height-default`, …

When porting to production, copy these semantic tokens verbatim and re-bind to the design system's raw tokens.

### Typography & spacing

- Font: Inter (substitutes Inter Variable) · Mono: JetBrains Mono (substitutes Berkeley Mono)
- Spacing: DESIGN.md 4px base unit; `--spacing-4` through `--spacing-128`
- Radii: `--radius-sm` 2px (tags) · `--radius-md` 6px (default) · `--radius-pill` 9999px

### Visual rules from DESIGN.md enforced here

- Samsung Blue (`#1428a0`) reserved for primary action + active/focus emphasis only (never status badges)
- Reporter-facing status = pill, Internal task status = squared (different shape per spec)
- Surface layering now uses light cool-blue neutrals: canvas `#f3f7fe` → card `#fbfdff` → elevated `#edf3fb`
- Subtle blue-grey inset shadows (`--shadow-subtle: rgb(213,224,244) 0 0 0 1px inset`); no heavy diffuse drop shadows
- Critical / blocked states use icon + label, never color alone (a11y)
- 6px border radius for buttons/cards/inputs; 2px for tags
- Row density via tokens — `.object-row`, `.compact` (44px), `.expanded` (96px). Triage queue uses `expanded`; all other lists use default 60px. Don't override with inline `minHeight`.
- Header density token — sidebar system header, route shell toolbar, and drawer panel headers now align to the same 50px baseline. Do not reintroduce one-off taller board/triage/drawer headers.
- Route layout taxonomy — use `PageShell` for page-body routes, `ListShell` for filter/list/detail routes, and `WorkbenchShell` for board/builder/triage work surfaces. Backlog and Survey are extension cases on top of those shells, not separate layout families.

## 5. Routes & screens

Route contract from `docs/frontend/routes-and-layout.md`. Implementation in `app.jsx`:

| Route | Screen | Detail panel? | Component file |
|---|---|---|---|
| `home`, `my-work` | Home / Action Dashboard | – | `screen-home.jsx` |
| `voc` (view=`inbox`/`my`) | VOC Inbox/List | ✓ | `screen-voc.jsx` |
| `voc` (view=`triage`) | Triage Console | ✓ | `screen-voc-create.jsx` |
| `voc-new` | Create VOC form | – | `screen-voc-create.jsx` |
| `voc-clusters` | VOC Clusters | ✓ | `screen-clusters.jsx` |
| `findings` | Findings list | ✓ | `screen-findings.jsx` |
| `tasks` (view=`board`) | Task Kanban (drag-drop) | ✓ | `screen-tasks.jsx` |
| `tasks` (view=`inbox`) | Task activity inbox | ✓ | `screen-tasks.jsx` |
| `tasks` (view=`my`) | My Tasks | ✓ | `screen-tasks.jsx` |
| `tasks` (view=`requests`) | Task Request review console | ✓ | `screen-tasks.jsx` |
| `tasks` (view=`backlog`) | Task Backlog list | ✓ | `screen-tasks.jsx` |
| `tasks` (view=`milestones`) | Milestones list + mini-timeline + Task Gantt panel | ✓ | `screen-milestones.jsx` |
| `integration` | Integration Action Dashboard | – | `screen-integration.jsx` |
| `integration-evidence` | Evidence highlights list | ✓ | `screen-evidence.jsx` |
| `integration-coverage` | Coverage signals + missing-link queries + threshold modal | – | `screen-coverage.jsx` |
| `integration-links` | Entity links list + detail + bulk-detach | ✓ | `screen-entity-links.jsx` |
| `surveys` | Surveys list | ✓ | `screen-surveys.jsx` |
| `survey-builder` | Survey Builder + Preview pane + Launch validation | – | `screen-survey-builder.jsx` |
| `survey-result` | Survey Result Summary | – | `screen-survey-result.jsx` |
| `admin` | Admin · Managed Systems registry | – | `screen-admin.jsx` |
| `admin-areas` | Admin · Analytics Areas catalog | – | `screen-admin.jsx` |
| `admin-permissions` | Permission Requests review console | ✓ | `screen-permissions.jsx` |
| `admin-settings` | Workspace settings (controlled + dirty save bar) | – | `screen-admin-settings.jsx` |

`hasPanelByRoute` in `app.jsx` controls the 3- vs 4-column grid. When `:has(aside.detail-panel)` doesn't match, the grid auto-collapses to 3 columns — a closed detail panel doesn't leave a blank column.

### Reproduction acceptance contract

Use this when asking another agent to reproduce or continue the work. A pass means the prototype still behaves like FeedbackOps, not just that the files load.

**P0 — must match**
- App opens through `FeedbackOps.html` and preserves URL hash state as `#route=&view=&scope=&param=`.
- Global shell keeps the 52px rail, 240px sidebar, topbar breadcrumb/actions, and 3/4-column detail-panel collapse behavior.
- Route/file mapping matches the table above and `DESIGN-MAP.md` §1. Do not merge extracted routes back into a multi-surface file (Pack 19 closed the legacy `screen-other.jsx` host — keep `screen-integration.jsx`, `screen-surveys.jsx`, `screen-admin.jsx` separate).
- Core entity language stays intact: VOC, Finding, Evidence, Task, Milestone, Survey, Managed System, Analytics Area, Permission Request.
- Public reporter status and internal task status remain visually and semantically separate.
- Permission and cross-MS surfaces keep explicit blocked/request/review/audit/retro-warning states.
- Draft linked-flow panels keep source entity, target route, target id where available, editable copy, and API-pending intent language.

**P1 — should match**
- Visual density remains desktop-first: compact rows, tabular numerics, restrained color, 6px radii, no marketing-card treatment.
- Detail panels preserve header actions and the shared `DetailPanelSectionNav` anchored-section bar on long panels.
- Card/list toggles, filters, modals, command palette, drag/drop, dirty-save bar, and launch validation remain interactive.
- Curated screenshots in `DESIGN-MAP.md` §2 can be regenerated without major layout drift.

**Known non-goals**
- Mobile/tablet parity is intentionally deferred. The shell has basic responsive behavior, but phone/tablet-specific detail flows are not a final spec.
- Production API architecture is not specified by the prototype. `flow-drafts.jsx` demonstrates intent; production must use backend route-resolution and linked-object workflow endpoints.

### Adversarial review notes

The docs are sufficient for continuation, but only conditionally sufficient for a clean-room rebuild.

- **Weakest link: visual baseline selection.** The screenshot folder contains many iterations. Use `DESIGN-MAP.md` §2; do not let an agent choose a random old PNG.
- **Second weakest link: production vs prototype boundary.** Hash routing, `window` globals, synthetic data, and local draft intents are prototype conveniences. Rebuilding production from these patterns would be wrong.
- **Third weakest link: screen ownership drift.** Closed in Pack 19. Integration / Surveys / Admin each live in their own file (`screen-integration.jsx`, `screen-surveys.jsx`, `screen-admin.jsx`); Admin Settings stays in `screen-admin-settings.jsx`. Do not merge them back into a single multi-surface host.
- **Fourth weakest link: mobile expectations.** If an agent is asked for responsive polish, it needs a new brief. Current docs authorize desktop parity, not native mobile UX.

## 6. Component inventory

Aligned with `docs/frontend/component-inventory.md`. Source locations:

### Primitives (`components.jsx`)
- `<Icon>` — inline SVG, 45+ icon paths (`ICON_PATHS`)
- `<Avatar>` — initials avatar w/ color
- `<Button>` — variants: primary, secondary, subtle, ghost, danger; sizes sm/md/lg; supports `icon`
- `<SearchInput>` — input with leading search icon
- `<CoverageBar>` — progress bar, status good/warn/bad
- `<SeverityIndicator>` — 3px×16px left bar
- `<PageShell>` — unified layout wrapper for non-list pages (`title`, `subtitle`, `eyebrow`, `actions`, `back`, `fluid`)
- `<ListShell>` — unified route wrapper for filter/list/detail routes. Owns the toolbar slot, optional `beforeList` extension row, scroll body, and optional detail panel.
- `<WorkbenchShell>` — unified route wrapper for work surfaces whose body is not a simple object list: Tasks board, Triage, Survey Builder, Survey Result. Owns the toolbar slot, optional below-toolbar content, body, and optional detail panel.
- `<ShellTitle>` — shared icon + title + badge block for workbench/list headers. Tasks board and Triage currently use this so the title position and rhythm match.

### Detail panel scaffolding (`components.jsx`)
- `<DetailPanelHeader kind id onClose extras>` — colored kind-badge + id + close + custom extras. `kind` ∈ {voc, finding, task, request, cluster, triage, survey, evidence, milestone, permission}; colors from `DETAIL_PANEL_KINDS`.
- `<DetailPanelSectionNav sections scrollRef>` — sticky horizontal section jump bar for long drawer/detail panels. Tracks active anchors through `IntersectionObserver`, falls back to scroll math, and uses `data-anchor="<id>"` blocks inside `.panel-scroll`.
- `<PanelTitleBlock title>{badges}</PanelTitleBlock>` — h2 + flex-wrap badge row.
- `<NestedTextBlock padding>{text}</NestedTextBlock>` — pitch-black-bg padded text card.
- `<Callout tone icon title action>{body}</Callout>` — tinted alert box (tones: amber / red / blue / cyan / emerald).
- `<UserChip user size sub>` — avatar + name (+ optional sub) inline.
- `<OutlineBadge>` — transparent bg + subtle ring badge.
- `<ListToolbar tabs activeTab onTabChange action>{children}</ListToolbar>` — tabs + spacer + children + sticky-right `action` slot. The `action` slot stays clickable even when the toolbar overflows from a detail panel being open.
- `<EntityIconBadge type size>` — colored letter icon (V/F/T/R/E/S/O).
- `<HelpTip text size>` — circular `?` with native title tooltip.
- `priorityToSeverity(priority)` — `urgent|high|medium|low` → `critical|high|medium|low`.
- `<PermissionBlockedPanel state category reason requiredScope summary>` — inline panel for permission-limited linked content. 4 states (`request_access` / `summary_visible` / `denied` / `blocked_not_requestable`). Wired into 7 surfaces.

### Cross-cutting (own files)
- `<EntityHoverPreview type id blocked>` — `entity-preview.jsx`. Wraps inline entity refs (`FIN-181`, `VOC-2814`, etc.). On hover, shows a safe-summary popover with id, title, status, MS, owner, jump action. Falls back to `window.__feedbackOpsNavigate` when no `onNavigate` prop is passed. Permission-blocked targets render `PermissionBlockedPanel` instead.
- `<RichEditor surface value onChange>` — `rich-editor.jsx`. 4 surfaces with distinct toolbar allowlists:
  - `voc-description` — Bold/Italic/Underline/Code/List/Link/Attach
  - `reporter-reply` — Bold/Italic/Link/Attach
  - `public-update` — Bold/Italic/List (no link, no attach — public-safe)
  - `internal-comment` — Bold/Italic/Code/List/Link/@Mention/Attach
  Each surface carries its own footer hint and (when applicable) a yellow surface warning. Used in VocDetailPanel compose tabs and CreateVocScreen body.
- `<CommandMenu open onClose onNavigate onScopeChange>` — `cmdk.jsx`. Spotlight-style overlay. Built-in command catalog (Navigate · Create · Switch scope · Open recent entities). Fuzzy filter, keyboard nav, Esc close.

### Composed
- `<LinkedEntityTrail nodes>` / `<EntityNode>` — VOC → Evidence → Finding → Request → Task → Outcome chain
- `<FieldRow>` — 120px label + flexible value, used in detail panels
- `<PanelSectionTitle>` — uppercase section header with optional right-side action

### Layout (`shell.jsx`)
- `<GlobalRail role>` — left 52px rail with system icons. Filters icons by role (`ROLE_RAIL_VISIBILITY`).
- `<Sidebar role>` — 240px, system header + scope switcher + primary nav + sections. Filters items by role (`ROLE_SIDEBAR_HIDE`). The Home rail's "Command" item invokes `onCommandMenu`.
- `<Topbar>` — breadcrumb + ⌘K + actions (not currently rendered; rail+sidebar+breadcrumb cover this surface)

### Screen-specific
- `<ActionCard>` — Action queue cell on Home / Integration (`screen-home.jsx`)
- `<VocRow>` / `<VocList>` / `<VocDetailPanel>` (`screen-voc.jsx`)
- `<TriageQueueRow>` / `<TriagePanel>` with per-severity color picker (`screen-voc-create.jsx`)
- `<TaskCard>` / `<TaskDetailPanel>` / `<TaskRequestRow>` / `<TaskRequestPanel>` (`screen-tasks.jsx`)
- `<TaskMyView>` / `<TaskInboxView>` — assignment-scoped views (`screen-tasks-views.jsx`, Pack 19 split)
- `<FindingRow>` / `<FindingDetailPanel>` with evidence-first layout (`screen-findings.jsx`)
- `<ClusterRow>` / `<ClusterDetailPanel>` (`screen-clusters.jsx`)
- `<EvidenceRow>` / `<EvidenceDetailPanel>` (`screen-evidence.jsx`)
- `<MilestoneCard>` / `<MilestoneDetailPanel>` / `<TaskGantt>` (`screen-milestones.jsx`)
- `<SurveyPreviewPane>` / `<LaunchValidationModal>` (`screen-survey-builder-preview.jsx`, Pack 19 split)

## 7. Domain rules enforced

Read `docs/design/00-product-overview.md` Non-Negotiable Interpretation Rules. Visible in the UI:

- **VOC is reporter-submitted only.** Reporter does **not** assign severity. Severity is set during Triage (`screen-voc-create.jsx`).
- **Survey Response → VOC is forbidden.** Explicit warning shown in Surveys detail panel.
- **Managed System is the MVP scope, not Project.** Used everywhere as filter + grouping.
- **VOC, Finding, Task Request, Task, Survey all require exactly one Primary Managed System.** Enforced in forms.
- **Internal task status vs Reporter-facing VOC status separated visually.** Pill vs squared badges; different colors; never mixed in the same row.
- **Public update vs Internal note vs Reporter reply** — three separate composer surfaces, each with its own `RichEditor` surface variant.
- **Automatic clustering only recommends.** Cluster confirmation requires Admin/Developer (warning shown in `<ClusterDetailPanel>` for `suggested` status).
- **Self-approval of own Task Request** requires scoped capability (property field in `<TaskRequestPanel>`). Decisions on self-approval requests capture a `SELF_APPROVAL` audit envelope (policy citation + peer-reviewer absence + captured fields preview) before the Admin can confirm — see `<PermissionRequestPanel>` in `screen-permissions.jsx`.
- **Released task but unresolved reporter-facing VOC status** surfaces an inline warning in `<TaskDetailPanel>`.
- **Analytics Area is not an MVP permission boundary.** Inline note in Triage.
- **Role-level navigation** — User / Developer / Admin filter rail + sidebar. Backend permission decisions remain authoritative.

## 8. Production-only — what the prototype mocks

Replace these before shipping. Each item is a real wiring task, not a bug.

- **All data is mock** (`data.js` + per-screen fixtures) — replace with API/store.
- **Permission decisions are a unified envelope.** Every restricted reference reads `entity.permissionDecisions[<key>]` (Pack 8). Keys today: `linkedFinding` (VOC), `execution` (Finding), `linkedVoc` (Task), `source` (Evidence). Each carries `state`/`category`/`reason`/`requiredScope`/`summary`/`decisionId`/`evaluatedAt`. Production wires `permissionDecisions` off the backend `permission_decision` envelope returned with each linked-object reference. Use `window.getPermissionDecision(entity, key)` as the read-through helper.
- **No real form submission** — Create VOC doesn't POST; only validates required fields. RichEditor uses `document.execCommand` — replace with TipTap per ADR-0002.
- **Triage mutation** is optimistic local-state only with 4s undo toast. Wire to `POST /vocs/:id/triage` with rollback on error.
- **Admin · Settings save** is local state — wire to `PATCH /admin/settings`.
- **Coverage thresholds** persist to `window.COVERAGE_THRESHOLDS` (in-memory). Wire to workspace policy endpoint.
- **Entity Links bulk-detach** mutates local state. Wire to `POST /entity_links/:id/detach` (audited per FR-LINK-001A — never hard-delete).
- **Task Kanban drag-drop** updates local `statusOverrides`. Wire to `POST /tasks/:id/status`.
- **Survey Builder Launch** is a stub — validation runs but no `POST /surveys/:id/launch`.
- **Survey Builder Preview** renders the respondent UI live but doesn't persist responses.
- **Survey Builder Outline drag-reorder** mutates local draft only.
- **Attachments** (Create VOC + RichEditor) — file picker accepts files but no upload. Wire to ADR-0011 storage.
- **CommandMenu** verbs invoke local navigate. Production should resolve verb+object via backend route resolution per `interaction-patterns.md`.
- **Desktop linked-flow drafts** are prototype intents. `DesktopFlowDraftPanel` now preserves source/target context and navigates with `#route=...&view=...&param=<entityId>` where a target id exists. Production must submit the intent to the linked-object workflow endpoint, receive the created/resolved entity id, then redirect with that resolved id.
- **Permission checks** are presentation-only. `<PermissionBlockedPanel>` is wired in 7 spots driven by the unified `permissionDecisions` envelope on each entity (Pack 8). Production swaps the mock envelopes for backend `permission_decision` payloads attached to each linked-object reference.
- **Routing** uses URL hash with internal React state — replace with React Router. Flat prototype routes (`admin-areas`, `survey-builder`) map onto spec's nested URLs (`/admin/analytics-areas`, `/surveys/:id`).
- **Responsive shell pass** is implemented in `styles.css` + `shell.jsx`: sidebar becomes a hamburger/drawer below 900px, detail panels become drill-in overlays, rows wrap metadata/trailing controls, popovers/toasts fit phone widths, and key touch targets are 44px+.
- **Scope filter** uses `scope.members` — the role-aware effective Managed System id array (Pack 8). Admin `all` = workspace-wide; Developer `all` = `workspace ∩ grants`; User `all` = own scope. Driven by `window.effectiveScopeFor(role)` + `window.Actors`; production wires off the backend `actor.effective_scope` envelope instead.
- **Role level switching** (User/Developer/Admin) only filters navigation. Backend permission checks remain authoritative.
- **Tweaks panel** is design-exploration only; remove in production.

## 9. Glossary

| Term | Meaning |
|---|---|
| **Actor** | AD-authenticated internal user |
| **Reporter** | Actor who submitted a specific VOC (not a role) |
| **Managed System** | Internal company analytics product (Tableau, Power BI, Looker, Metabase) — MVP scope |
| **Analytics Area** | Sub-category within one Managed System; not a permission boundary |
| **VOC** | Voice of Customer — internal-submitted feedback record |
| **Finding** | Evidence-based judgment object bridging VOC/Survey → execution |
| **Evidence Highlight** | Quote/summary extracted from VOC text, Survey response, or note |
| **Task Request** | Reviewed execution candidate — protects Task backlog quality |
| **Task** | Internal execution work item; backstage by default |
| **Reporter-facing VOC Status** | Public-safe status (8 states) visible to the Reporter |
| **Internal Task Status** | Backlog / Todo / Doing / Review / Done / Released / Reopened |
| **Action Queue** | Curated row pattern on Home / Integration that names a workflow gap + next action |
| **Coverage** | Percentage indicator of how much linkage exists (VOC→Task, Milestone→Outcome, etc.) |

## 10. Cross-references

| Topic | Source doc |
|---|---|
| Visual tokens | `DESIGN.md` |
| Route URLs | `docs/frontend/routes-and-layout.md` |
| Component contract | `docs/frontend/ui-design-system.md` |
| Required components | `docs/frontend/component-inventory.md` |
| Workflow UX | `docs/frontend/interaction-patterns.md` |
| Product intent | `docs/design/12-ui-ux-principles.md` |
| Domain glossary | `docs/design/01-domain-model.md` |
| Non-negotiable rules | `docs/design/00-product-overview.md` |
| Action traceability | `docs/design/12-ui-ux-principles.md` (UI Action → Requirement → API table) |
| Production API contract | `docs/implementation/03-api-contracts.md` |
| Production data contract | `docs/design/15-data-contracts.md` |
| Entity linking backend contract | `docs/implementation/06-entity-linking-contract.md` |
| Error response contract | `docs/adr/0012-error-code-contract.md` |

---

## 11. Remaining packs (next session)

Identified spec gaps that didn't make it into sessions 6-7. Priorities are relative.

**Current priority stance:** desktop prototype completeness first. Phone/tablet support is not a near-term product target; keep the basic responsive guardrails already added, but push deeper mobile/tablet UX work to the final cleanup tier.

- **Pack 14 — Desktop linked-flow draft completion** ✅ (Session 13)
  - New `flow-drafts.jsx · DesktopFlowDraftPanel` provides the shared editable desktop panel for Evidence Highlight draft, Task Request draft, Finding draft, and existing-VOC evidence attach.
  - VOC trail actions now open draft panels inside `<VocDetailPanel>` for Evidence Highlight / Finding / Task Request / attach flows.
  - Finding execution CTA + trail CTA now open a Task Request draft panel without leaving the detail rhythm.
  - Evidence "Promote to Finding" and "Attach to…" now open editable panels from the existing detail panel.
  - Survey follow-up actions in both Surveys detail and Survey Result Summary now open the matching draft panel, including "기존 VOC에 근거 연결".
  - Mobile/tablet remains deferred; no phone sheets or tablet-specific flows were introduced.

- **Pack 15 — Desktop route-resolution intent handoff** ✅ (Session 14)
  - `onNavigate(route, view, param)` now preserves selected desktop entity ids across VOC / Finding / Evidence / Task Request / Task Board / Survey list targets.
  - `DesktopFlowDraftPanel` shows the API-pending route-resolution intent: source entity, target route, target id when available, and workflow payload shape.
  - User QA confirmed the intended desktop behavior: draft panels open, route-resolution intent appears to match selected source/target context, inputs are editable, CTA navigation keeps entity context, close/reopen state does not appear stale, and Evidence trail draft buttons surface the panel.
  - Remaining next-session work: production handoff/API contract only. Replace prototype intent staging with the backend linked-object workflow response, then redirect to the created/resolved entity id. Keep copy/state polish scoped to that production handoff.
  - Mobile/tablet remains final priority; do not start deeper touch/tablet work next session unless explicitly redirected.

- **Pack 16 — Handoff hardening + visual baselines** ✅ (Session 15)
  - Fixed stale `admin-settings` route ownership from `screen-other.jsx` to `screen-admin-settings.jsx`.
  - Added the required agent input bundle so another agent knows which docs, prototype files, and screenshots must travel together.
  - Added reproduction acceptance criteria and adversarial review notes to separate desktop visual parity from production architecture and mobile/tablet non-goals.
  - Promoted curated screenshots into `DESIGN-MAP.md` as the canonical visual baseline set.

- **Pack 17 — Samsung-light palette + shared detail section nav** ✅ (Session 16)
  - Rebound the legacy raw color variables to a Samsung-light palette: cool blue-white canvas (`#f3f7fe`), near-white surfaces, soft blue borders, and Samsung Blue (`#1428a0`) for primary/focus/accent states.
  - Preserved the existing token names for low-risk prototype continuity; treat `--color-neon-lime` as a legacy alias for Samsung Blue in this artifact.
  - Promoted the Milestone drawer's anchored section-jump pattern into `components.jsx · DetailPanelSectionNav`.
  - Applied the shared section bar to long detail panels across VOC, Triage, Finding, Task, Task Request, Cluster, Evidence, Entity Link, Survey, Analytics Area, Milestone, and Permission Request surfaces.

- **Pack 20 — Baseline QA + nested-button polish** ✅ (Session 19)
  - Headless Playwright captured all 26 routes; pixel diff vs `final-baselines/` returned 23/26 IDENTICAL and 3 sub-1% diffs that are dynamic noise. Pack 19 file split confirmed as zero visual regression.
  - `screenshots/pack20-current/voc-inbox-detail-full.png` captures the long VOC detail trail by expanding the inner `.panel-scroll` before fullPage shot.
  - `screen-survey-builder.jsx · OutlineRow` no longer nests a `<button>` inside a `<button>` (React `validateDOMNesting` warning eliminated); outer element is `<div role="button" tabIndex={0}>` with Enter/Space activation.
  - `qa-capture.js` + `qa-diff.js` left in repo for future re-runs.
  - Screenshot folder cleanup: deleted ~95 stale loose PNGs directly under `screenshots/` (Pack 1–11 era working captures) plus 3 root-level temp PNGs (`test-playwright.png`, `mp9ir2hn-image.png`, `mp8o44dk-image.png`). Canonical sets retained: `screenshots/final-baselines/` (28 reference PNGs), `screenshots/pack20-current/` (28 fresh captures incl. VOC full-page), `screenshots/pack20-diff/` (4 diff artifacts).

- **Pack 19 — Rule 2 split cleanup** ✅ (Session 18)
  - Resolved the long-standing `screen-other.jsx` multi-host (adversarial review §3 weakest link) by splitting it into three single-surface files:
    - `screen-integration.jsx` (145 lines) — Integration Action Dashboard + `IntegrationJumpCard`
    - `screen-surveys.jsx` (306 lines) — `SURVEYS`, `SurveyFollowupAction`, `SurveyCard`, `SurveysScreen`
    - `screen-admin.jsx` (327 lines) — `AdminScreen`, `AdminAreasScreen`, `AnalyticsAreaSlideOver`
  - Split `screen-tasks.jsx` (964 → 732 lines) by extracting `TaskMyView` + `TaskInboxView` (with `INBOX_EVENT_KINDS`, `buildTaskInbox`, `TaskInboxRow`, `MY_TASK_TABS`) into `screen-tasks-views.jsx` (237 lines). Dispatcher now reads `window.TaskMyView` / `window.TaskInboxView` to honour the helper-after-screen load order.
  - Split `screen-survey-builder.jsx` (1149 → 809 lines) by extracting `SurveyPreviewPane` + `PreviewQuestionRender` + `LaunchValidationModal` into `screen-survey-builder-preview.jsx` (349 lines). `SurveyBuilderScreen` references them via `window.SurveyPreviewPane` / `window.LaunchValidationModal`.
  - Updated `FeedbackOps.html` script order so each helper file loads immediately after its primary screen file.
  - All `screen-*.jsx` files are now under the 900-line budget; the `screen-other.jsx` and "merged extracted routes back" risks called out in §6 adversarial review are closed.

- **Pack 18 — Route pattern shells + aligned headers** ✅ (Session 17)
  - Confirmed the product has three route layout families: `PageShell` page-body screens, `ListShell` filter/list/detail screens, and `WorkbenchShell` board/builder/triage work surfaces.
  - Added `components.jsx · ListShell`, `WorkbenchShell`, and `ShellTitle`.
  - Migrated Tasks requests/backlog/my/inbox, Evidence, and Entity Links onto `ListShell`. Evidence and Entity Links may look taller because their row contents are vertically richer, but they are still the same list pattern.
  - Migrated Tasks board, VOC Triage, Survey Builder, and Survey Result onto `WorkbenchShell`. Backlog and Survey should be treated as extension cases of the shared shells, not new layout families.
  - Aligned Tasks board and Triage header title treatment to the Triage icon/title pattern via `ShellTitle`.
  - Reduced the sidebar system header by roughly 10% and aligned sidebar system header, ListShell/WorkbenchShell toolbar, drawer panel header, and Survey preview drawer header to a shared 50px baseline.
  - Browser screenshot refresh completed in Pack 20 — see `screenshots/pack20-current/` and the pixel diff report in `screenshots/pack20-diff/diff-report.json`. Pack 19 split confirmed zero visual regression. At end of Pack 20 the `pack20-current/` set was promoted into `screenshots/final-baselines/` (27 routes overwritten with newer captures + `voc-inbox-detail-full.png` added + `probe-cmdk.png` re-captured via Meta+K). `manifest.json` bumped to `count: 28`.

- **Pack 8 — Permission & Scope completion** ✅ (Session 10)
  - Effective Managed System scope union landed — `Actors` registry + `effectiveScopeFor(role)` + role-aware `scope.members` in `app.jsx`. Sidebar surfaces the bounded-`all` hint + out-of-grants flag.
  - Reporter-facing Status 변경 규칙 + Reporter preview surface in `<VocDetailPanel>` (`screen-voc.jsx · ReporterStatusChangeBlock`). Drives off `REPORTER_STATUS_TRANSITIONS` + `reporterStatusGate(next, voc, task)`.
  - `_blocked*` flag consolidation → unified `permissionDecisions` envelope (4 keys: `linkedFinding`, `execution`, `linkedVoc`, `source`). `window.getPermissionDecision(entity, key)` is the read helper.
  - Self-approval audit capture (`<PermissionRequestPanel>` SELF_APPROVAL block + audit-log labelling).
  - Cross-MS policy retro warning (`<PolicyRetroWarning>` in `screen-admin-settings.jsx`). Fires when `crossMsLinking` or `selfApproval` are dirty; classifies the transition (tighten / loosen) and shows non-retroactive impact lines.

- **Pack 9 — Responsive & cross-device** ⏬ Deferred / final priority
  - Basic mobile shell drawer and touch-target guardrails landed in Pack 13.
  - Do not invest near-term scope in tablet bottom sheets, phone-first drill-in flows, or deeper touch tuning.
  - Revisit only after desktop flows, copy, and production-handoff states are stable.

- **Pack 10 — Polish & component extraction** ✅ (Session 9)
  - All Pack 10 deliverables landed.  See §12 below + [`DESIGN-MAP.md`](./DESIGN-MAP.md) for traceability.

- **Pack 11 — Pack 10 follow-up adoption** ✅ (Session 9)
  - `ObjectCard` consumers (Findings + Surveys card views), `EntityRelationRow` reach extended into VOC + Finding detail panels, Roadmap row opens Milestone detail as in-place slide-over (no route change).

---

## 12. Session changelog (latest first)

### Session 19 — 2026-05-17 — Pack 20 (Baseline QA + nested-button polish)

Playwright smoke + pixel diff against the 26 final-baseline PNGs, plus one DOM polish surfaced by the run.

**Smoke test**
- `python3 -m http.server 8765` serves the project root; `node qa-capture.js` launches headless Chromium at 1440×960 and walks all 26 routes. 26/26 captured, no JS errors (favicon 404s ignored).
- Captures land in `screenshots/pack20-current/`. `screenshots/pack20-current/capture-log.json` records the run.

**Pixel diff vs `screenshots/final-baselines/`**
- `node qa-diff.js` (pngjs + pixelmatch). Report: `screenshots/pack20-diff/diff-report.json`.
- 23/26 IDENTICAL. Three sub-1% diffs are dynamic noise (timestamps / live counters), not real regressions:
  - `probe-rail-scope.png` — 0.285%
  - `surveys-list.png` — 0.081%
  - `home-action-dashboard.png` — 0.006%
- Pack 19 split caused **zero visual regression** — the budget cleanup is visually safe.

**Full-page VOC detail**
- `screenshots/pack20-current/voc-inbox-detail-full.png` (1452×1976) — the detail column has its own `.panel-scroll` so the standard viewport capture clipped at ~900px; the new capture temporarily expands the inner scroller and uses `fullPage:true` to keep the long-form trail / activity rhythm in view.

**Polish — survey-builder DOM nesting**
- `screen-survey-builder.jsx · OutlineRow` was a `<button>` containing a `<button>` (`<Icon name="close" />` delete). React surfaced a `validateDOMNesting` warning in the headless run.
- Outer element changed to `<div role="button" tabIndex={0}>` with keyboard activation on Enter/Space. Inner delete `<button>` retained. Visual baseline unchanged; warning gone.

**Tooling left in the repo for next session**
- `qa-capture.js`, `qa-diff.js`, `screenshots/pack20-current/`, `screenshots/pack20-diff/` — re-runnable. `pixelmatch` + `pngjs` were added as transient `npm install` (not saved to `package.json`).

**Screenshot folder cleanup**
- Removed ~95 stale loose PNGs directly under `screenshots/` (Pack 1–11 era working captures) and 3 root-level temp PNGs (`test-playwright.png`, `mp9ir2hn-image.png`, `mp8o44dk-image.png`).
- Retained sets: `screenshots/final-baselines/` (28 canonical reference PNGs — refreshed from pack20-current at end of Pack 20), `screenshots/pack20-current/` (28 fresh captures incl. `voc-inbox-detail-full.png`), `screenshots/pack20-diff/` (diff artifacts).
- `final-baselines/` was promoted from `pack20-current/` at end of Pack 20: 27 captured routes overwritten + `voc-inbox-detail-full.png` added + `probe-cmdk.png` re-captured via Meta+K (the harness in `qa-capture.js` does not cover the command palette overlay — capture it manually when refreshing). `manifest.json` `count` bumped to 28.

### Session 18 — 2026-05-17 — Pack 19 (Rule 2 split cleanup)

File-split pass with no visual changes. Three canonical files were over (or close to) the 900-line budget; each was split along its natural single-surface seam.

**screen-other.jsx → 3 files**
- `screen-integration.jsx` owns the Integration Action Dashboard route only.
- `screen-surveys.jsx` owns the Surveys list, detail panel, and follow-up CTAs.
- `screen-admin.jsx` owns Managed Systems registry, Analytics Areas catalog, and the AA slide-over.
- Closes the §6 adversarial review note about `screen-other.jsx` being a multi-surface holdover.

**screen-tasks.jsx (964 → 732)**
- New `screen-tasks-views.jsx` carries My Tasks + Tasks Inbox (`TaskMyView`, `TaskInboxView`, `TaskInboxRow`, `buildTaskInbox`, `INBOX_EVENT_KINDS`, `MY_TASK_TABS`).
- `TasksScreen` dispatcher resolves the two views via `window.*` so the helper file loads after the screen file per Rule 2.

**screen-survey-builder.jsx (1149 → 809)**
- New `screen-survey-builder-preview.jsx` carries the respondent preview + Launch validation modal.
- `SurveyBuilderScreen` resolves them via `window.SurveyPreviewPane` / `window.LaunchValidationModal`.

**FeedbackOps.html** load order updated so each helper file follows immediately after its primary screen file. No CSS or token changes; visual baselines unchanged.

### Session 16 — 2026-05-17 — Pack 17 (Samsung-light palette + shared detail section nav)

Color pass only, followed by drawer-pattern standardization.

**Samsung-light palette**
- `styles.css` now presents the prototype as a light cool-blue product UI: canvas `#f3f7fe`, surfaces `#fbfdff` / `#edf3fb`, blue-tinted row states, and Samsung Blue `#1428a0` for primary action, focus, and selected states.
- `app.jsx` accent defaults and direct JSX color remnants were aligned to the same Samsung Blue family. Legacy raw token names remain for continuity, but the visual contract is no longer Neon Lime / dark command center.

**Detail drawer section nav**
- `components.jsx · DetailPanelSectionNav` centralizes the Milestone-style anchored section bar with active-section tracking, smooth scroll, and `IntersectionObserver` fallback behavior.
- Long drawers now use the same top section-jump bar and `data-anchor` rhythm: VOC, Triage, Finding, Task, Task Request, Cluster, Evidence, Entity Link, Survey, Analytics Area, Milestone, and Permission Request.
- `styles.css` owns the shared `.panel-section-nav*` styling so future panels should add sections rather than recreate custom drawer navigation.

### Session 11 — 2026-05-17 — Pack 12 (Shared interaction affordances)

Wired the long-standing inert toolbar / header buttons. Every change is a small UX improvement, but they compound: filters, group-by, fullscreen, copy-link, kebab menu, composer preview, and a global toast host are now real.

**New shared file `affordances.jsx`** (loaded right after `components.jsx`):
- `<ToastHost>` + global `window.__toast({message, tone, action?, duration?})` emitter — mounted once in `App`.
- `useFullscreenPanel()` hook — toggles `.app-shell.panel-fullscreen`. Esc + route change collapse it.
- `<Popover>` primitive — `position: fixed` (so `.main-region { overflow: hidden }` doesn't clip), anchor-ref based positioning, click-outside + Esc dismiss.
- `<ListFilterButton categories applied onChange onClear>` — multi-category checkbox popover. Counts applied filters on the button.
- `<ListSortButton fields value onChange>` — single-select sort/group-by popover with asc/desc toggle.
- `<MoreButton items>` — generic kebab dropdown.
- `<DetailPanelHeaderActions entityKind entityId copyHash extraMore?>` — drop-in replacement for the ad-hoc link/expand/more icon row in every detail panel header. Copy link uses `navigator.clipboard` + toast; expand toggles fullscreen; more has Mark-read / Snooze / Subscribe / Archive defaults (all mock-toast).
- `<PreviewModal>` — dimmed-backdrop modal used by composer Preview.

**Wiring**
- VOC inbox toolbar: `<ListFilterButton>` (Severity / Reporter status / Owner) + `<ListSortButton>` (Created / Severity / Status).
- Tasks board toolbar: `<ListFilterButton>` (Priority / Milestone / Assignee) + `<ListSortButton>` repurposed as **Group by** (Status default / Priority / Managed System / Assignee). Group by Status keeps drag-drop status changes; other groupings toast a warning explaining drag-drop only works in Status mode.
- Findings list toolbar: `<ListFilterButton>` (Confidence / Impact).
- Detail panel headers — 8 surfaces now share `<DetailPanelHeaderActions>`: VOC · Cluster · Finding · Task · Task Request · Milestone · Evidence · Permission Request · Entity Link.
- VOC `Compose · Public update` / `Reporter reply` **Preview** button — opens `<PreviewModal>` rendering `ComposerPublicPreview` (status pill + body + status-change footer) or `ComposerReplyPreview` (threaded message bubbles).
- `app.jsx` exits fullscreen on every route/view change so the next page lands in the normal 4-col layout.

**CSS additions** (`styles.css`)
- `.app-shell.panel-fullscreen` rules — collapse main-region, span the detail panel into column 4 (`grid-column: 4 !important`).
- `.toast-host` + `.toast` (tone-success / tone-warn / tone-danger).
- `.popover` + `.popover-item` + `.popover-section-title` + `.popover-divider` + chip styles.

### Session 10 — 2026-05-17 — Pack 8 (Permission & Scope completion)

Five Pack 8 deliverables landed in one pass; mapping in [`DESIGN-MAP.md`](./DESIGN-MAP.md).

**Permission envelope unification**
- `data.js` gained the canonical `entity.permissionDecisions[<key>]` shape; `_blockedFindingLink` / `_blockedExecution` / `_blockedLinkedVoc` / `_blockedSource` are gone, replaced by keyed envelopes (`linkedFinding`, `execution`, `linkedVoc`, `source`). Each carries `state`, `category`, `reason`, `requiredScope`, `summary`, `decisionId`, `evaluatedAt`.
- `window.getPermissionDecision(entity, key)` is the read helper that the four consumer screens (`screen-voc.jsx`, `screen-findings.jsx`, `screen-tasks.jsx`, `screen-evidence.jsx`) use. The detail panels also surface the decision-id + evaluated-at line below the blocked panel so reviewers can correlate with the audit log.

**Effective Managed System scope union**
- `data.js · Actors` registry encodes per-role `assignedScopes`; `effectiveScopeFor(role)` returns the right Managed System id list (admin = workspace, dev/user = grants only).
- `app.jsx` builds the `scope` object with `.members` (the array screens filter by), `.isUnion`, `.assignedScopes`, `.outOfGrants`. Every consumer of `scope.id === 'all' ? … : list.filter(…)` now reads `list.filter(x => scope.members.includes(x.managedSystem))` — single code path for both "all" and single-MS picks.
- `shell.jsx` Sidebar scope switcher renders the **union** chip + the actor's grants below the name when `all` is bounded, marks ungranted Managed Systems with a shield icon in the dropdown, and flags **out of scope** when the actor picks a system outside their grants.

**Reporter-facing Status change + public-copy preview**
- New `data.js · REPORTER_STATUS_TRANSITIONS` matrix (state machine per `docs/design/04-voc-system.md`) + `reporterStatusGate(next, voc, task)` for linked-Task gates (e.g. cannot mark 해결됨 while the linked Task is still in review).
- New `screen-voc.jsx · ReporterStatusChangeBlock` slots into the `public-update` composer surface: status picker with forbidden states inlined-but-disabled, forbidden-reason callout, linked-Task gate callout, and the Reporter preview card (status pill + body excerpt + privacy footer) showing exactly what the reporter will see. Publish button is disabled when the gate is failed.

**Self-approval audit hardening**
- `screen-permissions.jsx · PermissionRequestPanel` now requires two captures before an Admin can confirm a self-approval `approve`: policy citation + peer-reviewer absence rationale (≥ 8 chars each). The captured envelope is previewed inline (label, decision_id, actor/subject, capability, scope/expiry, citation, no_peer_reviewer) so the Admin sees the exact audit row they're writing.
- Audit log entries containing `self-approval` get the **SELF_APPROVAL** label; the section title surfaces a workspace-wide "고가시" badge for any request flagged `selfApproval: true`.

**Cross-MS / self-approval retro warning + file split**
- `screen-other.jsx` was at 1037 lines (well past the 900 budget). Extracted `AdminSettingsScreen` + `SettingsControlledRow` + the settings constants into a new `screen-admin-settings.jsx` (Rule 2 compliance).
- New `<PolicyRetroWarning>` fires when `crossMsLinking` or `selfApproval` are dirty. `classifyPolicyTransition(key, saved, next)` returns `tighten` / `loosen` / `neutral`; the panel renders the affected counts (existing cross-MS links, active grants, pending requests) and the explicit non-retroactive behaviour for each. Includes a jump CTA to the affected surface (Entity Links / Permission Requests).

### Session 9 — 2026-05-17 — Pack 10 + 11

Pack 10 (Polish & component extraction) followed immediately by Pack 11 (Pack 10 follow-up adoption).  Mapping in [`DESIGN-MAP.md`](./DESIGN-MAP.md).

**Pack 11 — Follow-up adoption**

- **`ObjectCard` consumers shipped** — `FindingCard` (Findings list) + `SurveyCard` (Surveys list).  Both list screens gained a shared `<ViewModeToggle>` so users can switch between list + card view; default stays list.  Same data density as the row version but stacked + with summary excerpt / progress bar visible.
- **`EntityRelationRow` reach extended** —
  - VOC detail panel: new "Linked execution" section above the trail with concrete navigable rows for the linked Finding + Task (only when present and not permission-blocked).
  - Finding detail panel: Linked Task card replaced with `<EntityRelationRow>` + below-row CTA buttons.
  - Layout bug fix: `<EntityRelationRow>` used to inherit `.entity-node`'s fixed `18px / 1fr / auto` grid, which crammed the multi-element stem into the 18px column.  Replaced with flex layout that respects the stem's natural width.
- **In-place Milestone slide-over from the Roadmap** — `screen-tasks-roadmap.jsx` now opens `<MilestoneDetailPanel>` inside `<MilestoneRoadmapSlideOver>` (fixed overlay + Esc close) instead of route-navigating to the Milestones list.  `MilestoneDetailPanel` is now exported from `screen-milestones.jsx`.

**Pack 10 — Polish & component extraction**

**Components promoted to `components.jsx`**
- `SourceTypeIcon`, `SentimentChip`, `ImportanceChip` — lifted from `screen-evidence.jsx` so the Milestone Detail Evidence section, Cluster member rows, and Survey Result excerpts can consume them.  Evidence screen re-picks the same symbols off `window` so its file reads unchanged.
- `EntityRelationRow` — generalised from the EntityLinkRow source→target stem AND the Cluster sample-VOC `entity-node` shape.  One primitive, two render modes (single entity / two-endpoint).  Now used in Entity Links rows, Cluster member lists, and the AA slide-over related-finding list.
- `ObjectCard` — primitive available for grouped card views (Findings/Surveys grid, future grouped lists).  Not retro-fitted onto MilestoneCard yet (that is now a list row, not a card) — see §11 follow-up.
- `LiveTimestamp` / `LiveCount` / `useTicker` / `relativeFromNow` — used by Home KPI strip, Home + Integration action cards, and Entity Links toolbar.  Prototype drives counts off a synthetic ~6s ticker; production replaces with the SSE channel.  `@keyframes live-ping` added to `styles.css`.

**Screens / surfaces**
- **Tasks · Roadmap** (`screen-tasks-roadmap.jsx`, new) — multi-milestone Gantt on a shared horizontal axis.  Group by Managed System / Status / None; toggle hide-released.  Reuses `milestoneTaskRows`, `TASK_BAR_COLORS`, `TASK_GANTT_TODAY` from `screen-milestone-gantt.jsx` so visual vocabulary doesn't fork.  Spec: FR-TASK-005 + `routes-and-layout.md` `/tasks/roadmap`.  Wired into `app.jsx`, `shell.jsx`, `cmdk.jsx`, Tweaks panel.
- **Analytics Area slide-over** (`screen-other.jsx · AnalyticsAreaSlideOver`) — read-only detail surface from the Admin Areas catalog.  Reiterates "AA is not a permission boundary"; shows definition, workload signal, recent findings (via `EntityRelationRow`), and "Used by" surfaces.
- **Milestone Detail scroll-spy** (`screen-milestones.jsx`) — replaced click-only active-section tracking with `IntersectionObserver` watching the five `data-anchor` blocks.  Click handler now flags a `programmaticRef` so smooth-scrolling doesn't fight the observer.
- **Entity Links · "Last refreshed at"** (`screen-entity-links.jsx`) — `LiveTimestamp` + `Refresh` button in the toolbar; manual refresh bumps the timestamp so the relative string ticks.

**Authoring polish**
- **Survey Builder kind switch** (`screen-survey-builder.jsx`) — switching question kind no longer drops options.  Choice options, rating scale, text placeholder stay on the question object; the editor reads only the field relevant to the current kind.  An info hint surfaces when latent fields are stashed but unused, so users trust the round-trip.

**Routing / shell**
- `tasks.view = 'roadmap'` route, breadcrumb, sidebar, Tweaks panel, and command-menu entry added in lockstep.

### Session 8 — 2026-05-17 — Packs 6 & 7

IA/Navigation closure + Authoring depth.

**Pack 6 — IA & Navigation**
- **Tasks · Inbox + My Tasks** (`screen-tasks.jsx`) — completes the `routes-and-layout.md` Tasks route contract. Inbox synthesizes an activity feed (assigned / @mention / status / request / released) from existing Tasks; My Tasks groups by Active / Backlog / Released / Done.
- **CommandMenu** (`cmdk.jsx`) — ⌘K/Ctrl+K palette. Verbs × objects per spec (Navigate / Create / Switch scope / Open). 36+ commands, fuzzy filter, full keyboard nav, mouse hover sync.
- **EntityHoverPreview** (`entity-preview.jsx`) — hover popover for inline entity refs. Wired into `VocRow`, `TaskBacklogRow`, `TaskRequestRow` as demos. Production should adopt this pattern at every entity-id text site.
- **Role-level nav filtering** (`shell.jsx`) — `ROLE_RAIL_VISIBILITY` + `ROLE_SIDEBAR_HIDE` per User/Developer/Admin. Tweaks panel exposes the toggle. App auto-redirects to a safe route on permission downgrade.
- **URL state** (`app.jsx`) — hash sync (`#route=&view=&scope=&param=`). `useEffect` writes on every state change, `hashchange` listener absorbs browser back/forward. Initial state seeded from hash so deep links work.

**Pack 7 — Authoring depth**
- **RichEditor 4-surface** (`rich-editor.jsx`) — `voc-description` / `reporter-reply` / `public-update` / `internal-comment` each with its own toolbar allowlist + footer hint + surface warning. Uses `document.execCommand` for the prototype; production swaps in TipTap.
- **Survey Builder Preview pane** (`screen-survey-builder.jsx`) — 480px right drawer rendering the respondent UI with one-level branch logic active.
- **Survey Builder Launch validation** — modal with blocking vs warning issue separation. Checks empty title, no questions, no required questions, empty question titles, insufficient choice options, missing branch target/option. Jump CTA navigates to the offending question.
- **Survey Builder Outline drag-reorder** — HTML5 DnD on the question outline mutates the local draft and marks it dirty. Dropline indicator + opacity reduction on dragged row.
- **Task Kanban drag-drop** (`screen-tasks.jsx`) — board cards draggable; column drop changes status via local `statusOverrides`. Column highlights on drag-over.
- **Triage optimistic mutation** (`screen-voc-create.jsx`) — `handleAct` removes the VOC from the queue immediately, shows a 4-second toast with **실행 취소**. Empty-queue state added.
- **VOC attachments** (`screen-voc-create.jsx`) — real dropzone (drag-over highlight + click-to-pick), file list with size + remove, 25MB validation, total size display. `formatFileSize` + `AttachmentRow` helpers.

**Components promoted in components.jsx**
- `ICON_PATHS` += `underline`, `code`, `warn`, `info` (RichEditor + Launch validation).
- `ListToolbar` gained an `action` slot — sticky-right primary CTA that stays clickable when the toolbar overflows behind a detail panel. Applied to VOC Inbox `New VOC`.

### Session 7 — 2026-05-16 — Pack 5

Survey Builder full-page + AdminSettings interactive + Coverage threshold modal + Entity Links bulk-detach. See git history for detailed component-level notes; major pieces are listed in §6 and the screen list.

### Session 6 — 2026-05-16 — Pack 4

Integration split (`integration-coverage`, `integration-links` own routes), 3 new PermissionBlockedPanel surfaces (Triage out-of-scope peek, Evidence cross-MS source, Survey Result anonymity), Tasks · Backlog canonical footer.

### Session 5 — 2026-05-16 — Pack 3

Admin 3-way split (`admin`, `admin-areas`, `admin-permissions`, `admin-settings`). PermissionBlockedPanel wired into 4 detail panels with all four state variants demoed.

### Session 4 — 2026-05-16 — Pack 2

Milestones list + per-row mini-timeline. Milestone Detail with anchored section nav. Tasks · Backlog list view. Survey Result Summary. Permission Requests review console. PermissionBlockedPanel primitive built.

### Session 3 — 2026-05-16

Integration · Evidence screen. Tasks · Milestones (iterated through three designs — final: cards-only at screen level + per-milestone Gantt inside detail panel).

### Session 2 — 2026-05-15

Componentization sweep — extracted 11 shared components from inline duplicates (`DetailPanelHeader`, `PanelTitleBlock`, `NestedTextBlock`, `Callout`, `UserChip`, `OutlineBadge`, `ListToolbar`, `EntityIconBadge`, `ClusterStatusBadge`, `SurveyStatusBadge`, `HelpTip`, `priorityToSeverity`). Row density token cleanup. Codified the component-first working principle.
