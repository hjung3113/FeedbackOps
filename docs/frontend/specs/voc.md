# VOC Frontend Implementation Spec — Slice 3

> Status: Draft for Slice 3 issue derivation (drives backend S3-001..S3-008 and frontend S3-006/S3-007/S3-008).
> Stack: React 18 + TypeScript 5 + Tailwind 3 + shadcn/ui (production), TipTap (rich content, per ADR-0002 / ADR-0011), TanStack Router (production route shell — see `apps/frontend/src/routes/`).
> Authority: AGENTS.md > CONTEXT.md > docs/adr > docs/implementation. Spec docs win every disagreement with the prototype (HANDOFF.md Rule 4).

---

## 1. Header & Scope

### What this spec covers (Slice 3 VOC)

- **Create VOC** — `/vocs?action=create` form, including attachments dropzone, MS / AA pickers, `voc-description` rich editor surface.
- **VOC Inbox** — `/vocs?view=inbox` list-first + RightDetailPanel, with tab filters (Untriaged / High / Unassigned / Similar / No-link), `<ListFilterButton>`, `<ListSortButton>`, bulk-select toolbar.
- **My VOCs** — `/vocs?view=my` reuses Inbox list mechanics filtered by `reporter_id = me`.
- **Triage Console** — `/vocs?view=triage`, expanded-row queue, severity-decide / owner-assign / AA-link / cluster confirm, optimistic mutation + 4-second undo toast.
- **VOC Detail Panel** — identity, triage block, description (TipTap read render), linked-execution section, linked-entity trail, public timeline, internal timeline, three-tab composer (Public Update / Reporter Reply / Internal Comment), Reporter-facing status change block, composer preview modal, sticky next-action footer.

### What this spec does NOT cover

- **VOC Cluster** (`/vocs/clusters`) — Slice 3+ (separate spec).
- **Finding create flow from VOC** (`POST /vocs/:id/create-finding` UI) — Slice 5 (`docs/frontend/specs/finding.md`, TBD).
- **Task Request from VOC** (`POST /vocs/:id/request-task` UI) — Slice 6 (`docs/frontend/specs/task-request.md`, TBD).
- **Entity Links create UI** (free-form linking, bulk detach) — Slice 4 (`docs/frontend/specs/entity-links.md`, TBD).
- **Attachment upload backend** — separate slice (covered by ADR-0011 abstraction; spec assumes the API exists by the time S3-001 ships).
- **Mobile / tablet layouts** — desktop-only per HANDOFF §11; basic responsive guardrails inherited from `AppShell`.
- **Permission Request in-product creation UI** — reuses existing `/admin/permissions/requests` route per `docs/frontend/routes-and-layout.md`.

### Upstream references

| Topic | Source |
|---|---|
| Product invariants | `AGENTS.md`, `docs/design/00-product-overview.md` |
| VOC system design | `docs/design/04-voc-system.md` |
| Domain shapes | `docs/design/01-domain-model.md`, `docs/design/15-data-contracts.md` |
| Routes / URL state | `docs/frontend/routes-and-layout.md` |
| UI contract | `docs/frontend/ui-design-system.md`, `docs/frontend/component-inventory.md`, `docs/frontend/interaction-patterns.md` |
| API contract | `docs/implementation/03-api-contracts.md` §VOC Create And Conversation |
| Permission policy | `docs/design/09-permission-access.md`, `docs/implementation/05-permission-policy.md` |
| Entity linking | `docs/implementation/06-entity-linking-contract.md`, `docs/design/11-entity-linking.md` |
| Error envelope | `docs/adr/0012-error-code-contract.md` |
| Operational safety (rate-limit, idempotency, headers) | `docs/adr/0015-operational-safety-rate-limit-headers-migrations-idempotency.md` |
| Rich editor + attachment storage | `docs/adr/0002-use-wysiwyg-first-rich-content-editor.md`, `docs/adr/0011-rich-content-editor-and-attachment-storage.md` |
| Slice 2 locked decisions | `docs/adr/0019-slice2-review-followups.md` Sections A/B/D/E |
| Prototype operating rules | `docs/design-prototype/HANDOFF.md`, `docs/design-prototype/DESIGN-MAP.md` |
| Prototype visual baselines | `docs/design-prototype/screenshots/final-baselines/voc-inbox-detail.png`, `voc-triage-console.png`, `voc-new.png`, `voc-clusters.png` (+ `manifest.json` for `mustSurvive` contract) |
| Frontend module guide | `apps/frontend/AGENTS.md`, `apps/frontend/src/features/voc/AGENTS.md` (TBD — write at S3-006 prologue) |
| Backend layer rules | `apps/backend/AGENTS.md` (Tx union, tx-not-pool for mutations, snake_case at HTTP / camelCase in services) |

---

## 2. Route Matrix

Production uses TanStack Router (`apps/frontend/src/routes/`) with query-param state. The prototype's `#route=voc&view=inbox&selected=...` maps to `/vocs?view=inbox&selected=...`.

| ID | URL | Page / component owner | Required params | Optional params | Panel | Loading | Empty | Error | Permission |
|---|---|---|---|---|---|---|---|---|---|
| R-VOC-INBOX | `/vocs?view=inbox` | `apps/frontend/src/features/voc/routes/InboxRoute.tsx` → `<VocInboxScreen>` | `view=inbox` | `managedSystem=:msId\|all`, `selected=:vocId`, `tab=untriaged\|high\|unassigned\|similar\|no-link`, `filter.severity=…`, `filter.reporterStatus=…`, `filter.owner=assigned\|unassigned`, `sort=createdAt:desc\|severity:asc\|status:asc` | `<VocDetailPanel>` when `selected=` resolves | Skeleton rows (10) in `<VocList>`; detail panel skeleton sections | "큐가 비었습니다" — `<EmptyState>` with `+ New VOC` CTA | Toast on list fetch fail; `<ErrorState>` row with retry | If actor has no VOC read capability for any MS in scope → render `<PermissionBlockedPanel state="blocked_not_requestable">` instead of the list |
| R-VOC-MY | `/vocs?view=my` | Same screen, `reporter_id=me` server filter | `view=my` | `selected=:vocId` | `<VocDetailPanel>` | Same | "내가 제출한 VOC가 없습니다" + Submit CTA | Same | Always available to authenticated actor |
| R-VOC-TRIAGE | `/vocs?view=triage` | `apps/frontend/src/features/voc/routes/TriageRoute.tsx` → `<VocTriageScreen>` | `view=triage` | `triage=unassigned\|untriaged\|high\|waiting`, `managedSystem=:msId\|all`, `selected=:vocId` | `<TriagePanel>` (always — single-pane decision flow) | Skeleton expanded rows + panel skeleton | "모든 VOC를 triage 처리했습니다" — `<TriageEmpty>` | Toast on per-action failure; rollback optimistic state | Requires VOC triage capability (Admin or same-MS Developer). Out-of-scope VOCs surface a `<PermissionBlockedPanel state="summary_visible">` peek above the queue per backend `out_of_scope_summary` envelope. **Layout (V1 inline kicker, 2026-05-21):** `WorkbenchShell` renders without `toolbar` prop; route identity ("Console · Triage") is the first child of `VocTriageScreen`'s own 50px toolbar. ShellHeader is absent for this route only. Pixel-diff baseline `voc-triage-console.png` is stale (shows removed 50px header); re-capture is a follow-up. |
| R-VOC-CREATE | `/vocs?action=create` | `apps/frontend/src/features/voc/routes/CreateRoute.tsx` → `<VocCreateScreen>` | `action=create` | `managedSystem=:msId` (seeds picker), `prefill=…` (future) | none (full-page form) | Skeleton form | n/a | Field-level `<FormError>` from `code='validation.failed'`; toast on transport failure; `<DirtyConfirmation>` modal on navigate-away | Any AD-authenticated Actor may submit (FR-VOC-001). Workspace + MS submission eligibility enforced server-side; the picker hides MSs the actor cannot submit to. |
| R-VOC-DETAIL | `/vocs?view=inbox&selected=:vocId` (no standalone page in Slice 3) | `<VocDetailPanel>` mounts inside whichever list route owns selection | `selected=:vocId` | — | n/a (panel itself) | Panel skeleton blocks | n/a | If `GET /vocs/:id` returns `404 not_found.record` → render `<DetailPanelNotFound>` with "선택을 해제" CTA; if `403 permission.denied` → `<PermissionBlockedPanel state="denied">` | If actor lacks read permission on the targeted VOC, route still resolves but panel shows blocked state per `permission_decision` envelope. |

**Route-state rules** (per `docs/frontend/routes-and-layout.md` §URL State Rules):
- Filter, tab, sort, and `selected` MUST round-trip through URL; refresh on a selected URL must restore the panel.
- Closing the panel clears `selected=` but preserves filters, sort, tab, scroll.
- The Managed System scope switcher writes `managedSystem=` and re-fetches the list; switching does not change the route tree.
- For Developers, `managedSystem=all` resolves to the actor's effective scope union (per ADR-0019 Section D + backend `actor.effective_scope`); for Users on My VOCs, `all` is hidden.
- Browser back/forward must restore prior URL state intact.
- Closing the panel during a dirty composer prompts the `<DirtyConfirmation>` modal (per `interaction-patterns.md`).

**Future Slice 3+ routes (called out but not implemented here):** `/vocs/clusters?selected=:clusterId` — owned by VOC Cluster spec.

---

## 3. Component Mapping

Production tree under `apps/frontend/src/features/voc/`. Shared primitives live in `packages/ui/src/` (extracted only after a second feature consumer exists, per `apps/frontend/AGENTS.md`).

### 3.1 Detail / panel scaffolding

| Prototype surface | Production component | shadcn/ui base | Props | State variants |
|---|---|---|---|---|
| `<DetailPanelHeader kind="voc" id … extras>` | `<DetailPanelHeader>` in `packages/ui/src/panel/` (custom — no shadcn equivalent) | none (Tailwind + `lucide-react` for icons) | `kind: 'voc' \| 'finding' \| 'task' \| ...10 kinds`, `id: string`, `onClose: () => void`, `extras?: ReactNode` | One color band per kind, bound to `--surface-card-elevated` + kind-specific accent token (voc uses `--color-aether-blue` accent stripe) |
| `<PanelTitleBlock>` | `<PanelTitleBlock>` in `packages/ui/src/panel/` | none | `title: string`, `badges?: ReactNode`, `className?: string`, `size?: 'lg' \| 'xl'` (default `'lg'`) | `size='lg'`: `text-lg font-semibold tracking-tight` (17px, default, all surfaces). `size='xl'`: `text-xl font-bold tracking-tight` (20px, VOC detail/triage hero blocks). `children` prop does not exist — use `badges` slot. |
| `<NestedTextBlock>` | `<NestedTextBlock>` in `packages/ui/src/panel/` | none | `padding?: number`, `children: ReactNode` | Default only |
| `<FieldRow>` | `<FieldRow>` in `packages/ui/src/panel/` | none | `label: string`, `children: ReactNode` | Default |
| `<PanelSectionTitle>` | `<PanelSectionTitle>` in `packages/ui/src/panel/` | none | `children: ReactNode`, `action?: ReactNode` | Default |
| `<Callout tone icon title action>` | `<Callout>` in `packages/ui/src/feedback/` | shadcn `<Alert>` (variant prop replaced by `tone`) | `tone: 'amber' \| 'red' \| 'blue' \| 'cyan' \| 'emerald'`, `icon: IconName`, `title: string`, `action?: ReactNode`, `children: ReactNode` | 5 tones; each binds tone token (`--severity-medium` for amber, etc.) |
| `<DetailPanelHeaderActions entityKind entityId copyHash extraMore?>` | `<DetailPanelHeaderActions>` in `packages/ui/src/panel/` | shadcn `<DropdownMenu>` for kebab, `<Tooltip>` for icon buttons | `entityKind: string` (display name), `entityId: string`, `copyHash: string` (production receives `copyUrl: string` instead), `extraMore?: MoreItem[]` | Default; "copied" toast state after clipboard write |
| `useFullscreenPanel()` | `useFullscreenPanel()` hook in `apps/frontend/src/lib/panel/` | none | none | `(isFullscreen, toggle)`. Esc + route change collapse it. |

### 3.2 List + toolbar

| Prototype surface | Production component | shadcn/ui base | Props | State variants |
|---|---|---|---|---|
| `<VocList>` + `<VocRow>` | `<VocList>` + `<VocRow>` in `features/voc/components/list/` | none (Tailwind grid, `<Checkbox>` from shadcn for row checkbox) | `vocs: VocListItem[]`, `selectedId: string \| null`, `onSelect: (id) => void`, `checked: Set<string>`, `onToggleCheck: (id) => void` | default · hover · selected · checked · permission-limited (row body replaced by `<PermissionBlockedPanel state="summary_visible">`) · skeleton · error |
| Bulk action bar (inline in `<VocList>`) | `<VocBulkActionBar>` in `features/voc/components/list/` | shadcn `<Button>` | `selectedIds: string[]`, `onAssign`, `onSetSeverity`, `onAddToCluster`, `onCreateFinding`, `onClear` | hidden when `selectedIds.length === 0` |
| `<ListToolbar tabs activeTab onTabChange action>` | `<ListToolbar>` in `packages/ui/src/toolbar/` | shadcn `<Tabs>` for tab strip | `tabs: TabDescriptor[]`, `activeTab: string`, `onTabChange`, `action?: ReactNode`, `children?: ReactNode` | default; `action` slot pinned right via `position: sticky` (per Pack 12 wiring rule) |
| `<ListFilterButton categories applied onChange onClear>` | `<ListFilterButton>` in `packages/ui/src/toolbar/` | shadcn `<Popover>` + `<Checkbox>` group | `categories: FilterCategory[]`, `applied: Record<string, Set<string>>`, `onChange: (cat, value, on) => void`, `onClear: () => void` | closed · open · applied (count badge) |
| `<ListSortButton fields value onChange>` | `<ListSortButton>` in `packages/ui/src/toolbar/` | shadcn `<Popover>` + `<RadioGroup>` | `fields: SortField[]`, `value: string` (`'<field>:<asc\|desc>'`), `onChange` | closed · open · sorted (chip on button) |
| `<SearchInput placeholder>` | `<SearchInput>` in `packages/ui/src/forms/` | shadcn `<Input>` + leading icon | `placeholder`, `value?`, `onChange?`, `onSubmit?` | default · focus · with-value |
| `<SeverityIndicator severity>` | `<SeverityIndicator>` in `packages/ui/src/indicators/` | none (3×16px Tailwind bar) | `severity: 'low' \| 'medium' \| 'high' \| 'critical'` | 4 colors via `--severity-*` |

### 3.3 Triage queue specifics

| Prototype surface | Production component | shadcn/ui base | Props | State variants |
|---|---|---|---|---|
| `<TriageQueueRow>` (expanded 96px row) | `<TriageRow>` in `features/voc/components/triage/` | none | `voc: TriageQueueItem`, `selected`, `onSelect` | default · selected · stale (when optimistic-removed elsewhere) |
| `<TriagePanel>` | `<TriagePanel>` in `features/voc/components/triage/` | shadcn `<RadioGroup>` for severity, `<Button>` ghost for cluster decision | `voc: VocDetail`, `onAct: (kind: 'confirm' \| 'finding' \| 'skip') => void` | dirty · clean · submitting (button spinner) |
| Severity picker grid | `<SeverityPicker>` in `features/voc/components/triage/` | shadcn `<ToggleGroup>` | `value`, `onChange`, `disabled?` | 4 options, color bar per option |
| Owner picker rows | `<OwnerPicker>` in `features/voc/components/triage/` | shadcn `<Combobox>` (when count > 5) or `<RadioGroup>` rows | `candidates: ActorChoice[]`, `value: string \| null`, `onChange`, `loadMore?` | default · loading suggestions · empty |
| Triage undo toast | `<UndoToast>` in `packages/ui/src/feedback/` | shadcn `<Toast>` from `sonner` (per `apps/frontend/AGENTS.md` "use installed libraries" rule) | `message`, `actionLabel: '실행 취소'`, `onAction`, `duration: 4000` | visible · dismissing |

### 3.4 Create form

| Prototype surface | Production component | shadcn/ui base | Props | State variants |
|---|---|---|---|---|
| `<PageShell>` | `<PageShell>` in `packages/ui/src/layout/` | none | `title`, `subtitle?`, `eyebrow?`, `actions?`, `back?`, `fluid?` | default |
| `<FieldLabel required tip>` | `<FieldLabel>` in `packages/ui/src/forms/` | shadcn `<Label>` + `<Tooltip>` (for `tip`) | `required?: boolean`, `tip?: string`, `children: ReactNode` | required · with-tip · default |
| Managed System chip selector | `<ManagedSystemPicker>` in `packages/ui/src/pickers/` (already named in `component-inventory.md`) | shadcn `<ToggleGroup>` (chip style) | `value: string`, `onChange`, `options: ManagedSystemRef[]`, `disabled?: string[]` (MSs the actor cannot submit to) | default · disabled-chip (hover tooltip with reason) |
| Analytics Area chip selector | `<AnalyticsAreaPicker>` in `packages/ui/src/pickers/` | shadcn `<ToggleGroup>` | `managedSystemId: string`, `value: string \| null`, `onChange`, `allowEmpty: true` (defaults to true; user may pick 없음) | default · empty-list (helper text) |
| Source segmented control | shadcn `<Tabs>` (segmented variant) wrapped as `<SourceContextSegmented>` in `features/voc/components/create/` | shadcn `<Tabs>` | `value: 'Direct Use' \| 'Proxy Report' \| 'Operational Discovery' \| 'Stakeholder Request'`, `onChange` | 4 options; Proxy Report expands `<ProxyContextRow>` |
| Dropzone + file list | `<AttachmentDropzone>` + `<AttachmentRow>` in `features/voc/components/create/` | none (HTML5 drag/drop + shadcn `<Card>` for rows) | `attachments: PendingAttachment[]`, `onAdd`, `onRemove`, `maxBytes: 25 * 1024 * 1024` (per file), `accept?: string[]` | empty · drag-over · with-files · over-limit (row-level error) |
| `<RichEditor surface="voc-description">` | `<RichEditor>` in `packages/ui/src/rich-content/` (TipTap-based per ADR-0011) | none (TipTap React) | `surface: 'voc-description' \| 'reporter-reply' \| 'public-update' \| 'internal-comment'`, `value?: TipTapDoc`, `defaultValue?: TipTapDoc`, `onChange: (doc: TipTapDoc) => void`, `placeholder?: string`, `onAttach?`, `onMention?`, `minHeight?: number`, `disabled?: boolean` | per-surface toolbar allowlist (see §5.7), focused · invalid · disabled · uploading |
| `<DirtyConfirmation>` modal | `<DirtyConfirmation>` in `packages/ui/src/feedback/` | shadcn `<AlertDialog>` | `open`, `onConfirm`, `onCancel`, `title?`, `message?` | open · closed |

### 3.5 Detail panel composers + Reporter status

| Prototype surface | Production component | shadcn/ui base | Props | State variants |
|---|---|---|---|---|
| Composer tab strip | `<ComposerTabs>` in `features/voc/components/detail/` | shadcn `<Tabs>` | `value: 'public' \| 'reply' \| 'internal'`, `onChange` | tab-active per surface; the `internal` tab Preview button is disabled (intentional, per Pack 12 wiring) |
| Public-update composer body | `<PublicUpdateComposer>` in `features/voc/components/detail/` | composes `<RichEditor surface="public-update">` + `<ReporterStatusChangeBlock>` + `<ComposerFooter>` | `voc: VocDetail`, `task: TaskRef \| null`, `nextReporterStatus`, `onChangeNextStatus`, `draftDoc`, `onChangeDraftDoc`, `onPublish`, `onPreview` | dirty · clean · publishing · gated (publish disabled when `reporterStatusGate` returns a reason) |
| Reporter-reply composer | `<ReporterReplyComposer>` in `features/voc/components/detail/` | composes `<RichEditor surface="reporter-reply">` | `voc`, `draftDoc`, `onChange`, `onSend`, `onPreview` | dirty · clean · sending |
| Internal-comment composer | `<InternalCommentComposer>` in `features/voc/components/detail/` | composes `<RichEditor surface="internal-comment">` | `voc`, `draftDoc`, `onChange`, `onAdd` | dirty · clean · sending |
| `<ReporterStatusChangeBlock>` | `<ReporterStatusChangeBlock>` in `features/voc/components/detail/` (NOT extracted to `packages/ui` — single consumer per Pack 8 comment) | shadcn `<Select>` for picker | `voc: VocDetail`, `task: TaskRef \| null`, `nextStatus`, `onChangeStatus`, `draftDoc`, `owner: ActorRef`, `transitions: ReporterStatusTransitions` (from `GET /vocs/:id` next_states envelope) | unchanged · staged · forbidden-selected (Callout red) · linked-task-gated (Callout amber) |
| `<ComposerPublicPreview>` (inside modal) | `<ComposerPublicPreview>` in `features/voc/components/detail/` | none | `voc`, `owner`, `nextStatus`, `draftDoc` | with-body · empty-body (italic placeholder) |
| `<ComposerReplyPreview>` (inside modal) | `<ComposerReplyPreview>` in `features/voc/components/detail/` | none | `voc`, `owner`, `reporter`, `draftDoc` | with-body · empty-body |
| `<PreviewModal>` | `<PreviewModal>` in `packages/ui/src/feedback/` | shadcn `<Dialog>` (size `lg`) | `open`, `onClose`, `title`, `children` | open · closed |

### 3.5b Detail panel body card + attachment chips (PLAN-22 §Bug-1/2/3, 2026-05-22)

| Prototype surface | Production component | Composition | State variants |
|---|---|---|---|
| BODY card (description) | `<DescriptionSection>` in `features/voc/components/detail/` | BODY label + `bg-surface-card-elevated` rounded card · `<RichContentRenderer doc=voc.description_rich_content mode="internal">` · `<AttachmentChipList attachments=voc.attachments>` rendered below the card when non-empty · `<EditDescriptionModal>` opener (reporter-on-own-VOC only) | empty body → `설명 없음` · with body → rich render · attachments=[] → no chip list · attachments[].length>0 → horizontal chip row |
| Conversation entry body | `<TimelineEntry>` in `features/voc/components/detail/` | actor `<UserChip>` + kind `<OutlineBadge>` · `<RichContentRenderer>` · `<AttachmentChipList attachments=entry.attachments>` below the body · optional status-transition pair | public/reporter_reply/internal_comment all read `entry.attachments[]` |
| Attachment chip | `<AttachmentChip>` in `features/voc/components/detail/` | `<Paperclip>` icon + truncated filename + `formatFileSize(size_bytes)` rendered as `<a href="/attachments/:id/download" download={name}>`. Same-tab navigation; BE's `Content-Disposition: attachment` makes the browser save. | default · hover (`bg-surface-card-elevated`) |
| Existing attachments in EditDescriptionModal | `<EditDescriptionModal>` `voc.attachments` slot | When `voc.attachments?.length > 0`, render `기존 첨부` label + `<AttachmentChipList>` above the active `<AttachmentDropzone>`. **PATCH is additive**: only NEW upload ids land in `attachment_ids[]`; existing rows are NOT re-sent (BE `linkAttachments` rejects already-linked ids). Remove affordance deferred — chips are read-only this slice. | hydrated (chips visible) · empty (dropzone-only) |
| `formatFileSize(bytes)` util | `apps/frontend/src/features/voc/lib/format-file-size.ts` | Single source of truth — previously duplicated in `<AttachmentDropzone>` and `<ComposerAttachmentDropzone>`. Returns `0 B` · `<n> B` · `<n.n> KB` · `<n.n> MB`. | n/a |

### 3.6 Status + signal badges

| Prototype surface | Production component | shadcn/ui base | Props | State variants |
|---|---|---|---|---|
| `<ReporterStatusBadge status>` | `<ReporterStatusBadge>` in `packages/ui/src/badges/` | shadcn `<Badge>` (pill variant — `rounded-full`) | `status: ReporterFacingStatus` (8 enum values) | 8 colors via `--status-reporter-*`; **always pill-shaped** — never collapses into squared |
| `<InternalTaskBadge status>` | `<InternalTaskBadge>` in `packages/ui/src/badges/` | shadcn `<Badge>` (squared variant — `rounded-sm`) | `status: InternalTaskStatus` (7 enum values) | 7 colors via `--status-internal-*`; **always squared** — never inherits reporter pill tokens |
| `<SeverityBadge severity>` | `<SeverityBadge>` in `packages/ui/src/badges/` | shadcn `<Badge>` (compact chip + `<SeverityIndicator>` bar prefix) | `severity: Severity` (4 enum) | 4 colors via `--severity-*` |
| `<ManagedSystemPill id>` | `<ManagedSystemPill>` in `packages/ui/src/badges/` | shadcn `<Badge>` (variant outline + 12px color mark) | `id: string` (resolves to `{ name, color, mark }` via `useManagedSystem(id)`) | 4 MSs in MVP fixtures; unknown id renders muted "Unknown MS" |
| `<OutlineBadge>` | `<OutlineBadge>` in `packages/ui/src/badges/` | shadcn `<Badge variant="outline">` | `children`, `color?` | default |
| `<EntityIconBadge type size>` | `<EntityIconBadge>` in `packages/ui/src/badges/` | none | `type: 'voc' \| 'finding' \| 'task' \| 'request' \| 'evidence' \| 'survey' \| 'outcome'`, `size?: number` | 7 letter glyphs |

### 3.7 Permission, linking, hover preview

| Prototype surface | Production component | shadcn/ui base | Props | State variants |
|---|---|---|---|---|
| `<PermissionBlockedPanel state category reason requiredScope summary>` | `<PermissionBlockedPanel>` in `packages/ui/src/permissions/` | shadcn `<Alert>` (custom layout) | `state: 'request_access' \| 'summary_visible' \| 'denied' \| 'blocked_not_requestable'`, `category: string`, `reason?: string`, `requiredScope?: string[]`, `summary?: ReactNode`, `decisionId?: string`, `evaluatedAt?: string`, `onRequestAccess?: () => void` | 4 state variants. `request_access` shows CTA → navigates to `/admin/permissions/requests?action=create&capability=…&scope=…&source_entity=VOC:<id>`. `summary_visible` renders `summary` slot. `denied` is read-only. `blocked_not_requestable` hides CTA entirely. |
| `<EntityHoverPreview type id blocked>` | `<EntityHoverPreview>` in `packages/ui/src/hover/` | shadcn `<HoverCard>` | `type: 'voc' \| 'finding' \| 'task' \| 'evidence' \| 'request'`, `id: string`, `blocked?: PermissionDecision \| null`, `children: ReactNode` | resolved (id · title · status · MS · owner · jump) · blocked (renders compact `<PermissionBlockedPanel state="summary_visible">`) · loading (skeleton) · error |
| `<EntityRelationRow left/right title meta trailing onClick>` | `<EntityRelationRow>` in `packages/ui/src/entity/` | none | `left?: EntityRef`, `right?: EntityRef`, `title: string`, `meta: ReactNode`, `trailing?: ReactNode`, `onClick?` | single-entity · two-endpoint stem |
| `<LinkedEntityTrail nodes selectedKey onNodeClick>` | `<LinkedEntityTrail>` in `packages/ui/src/entity/` | none | `nodes: TrailNode[]`, `selectedKey?: string`, `onNodeClick?` | default · selected-node · placeholder-node (dashed) · blocked-node (shield icon) |
| `<UserChip user size sub>` | `<UserChip>` in `packages/ui/src/identity/` | none (Tailwind + `<Avatar>`) | `user: ActorRef`, `size?: 'sm' \| 'md'`, `sub?: string` | default · unknown (renders "Unknown") |
| `<Avatar user size>` | `<Avatar>` in `packages/ui/src/identity/` | shadcn `<Avatar>` | `user: ActorRef`, `size?: 'sm' \| 'md' \| 'lg'` | with-image (future) · initials |

### 3.8 Command palette (⌘K)

| Prototype surface | Production component | shadcn/ui base | Props | State variants |
|---|---|---|---|---|
| `<CommandMenu>` | `<CommandMenu>` in `apps/frontend/src/lib/command-menu/` | shadcn `<Command>` (cmdk wrapper) | `open`, `onClose`, `onNavigate`, `onScopeChange`, `commands: CommandDescriptor[]` (resolved server-side per `interaction-patterns.md` §Command menu) | open · closed · filtered · empty |
| VOC command entries | descriptors registered in `features/voc/command-catalog.ts` | n/a | descriptors: `go-voc-inbox`, `go-voc-triage`, `go-voc-my`, `go-clusters`, `new-voc`, `open-<id>` (recent VOCs) | each carries `disabledReason?` from backend |

### 3.9 Form primitives (already in `packages/ui` per inventory)

`<Button>`, `<Input>`, `<Textarea>`, `<Select>`, `<Combobox>`, `<Checkbox>`, `<RadioGroup>`, `<Tooltip>`, `<Popover>`, `<Dialog>`, `<Drawer>`, `<Toast>`, `<Skeleton>`. Use these directly — do not re-wrap.

---

## 4. Data Mapping

Prototype mock entity → production DTO. **snake_case at HTTP boundary, camelCase in services + components** (per `apps/backend/AGENTS.md`). Frontend uses TypeScript types generated from Zod schemas in `packages/shared/src/vocs/`.

### 4.1 VOC core record

| Prototype `Voc` field (`data.js`) | Production HTTP field (`docs/design/15-data-contracts.md`) | Frontend camelCase | Notes / gaps |
|---|---|---|---|
| `id` (e.g. `VOC-2814`) | `id: uuid` | `id: string` | Prototype uses readable slugs; production uses UUID v7 as the canonical object id. |
| `id` (display slug) | `display_id: text` | `displayId: string` | Backend assigns `VOC-####` via `next_voc_display_id(workspace_id)`. The counter is per workspace, so each workspace has an independent contiguous sequence starting at `VOC-1000`; uniqueness is `(workspace_id, display_id)`. |
| `title` | `title: text` | `title: string` | — |
| `description` (plain string) | `description_rich_content: rich_content` (TipTap JSON, ADR-0011) | `descriptionRichContent: TipTapDoc` | Prototype stores plain text; production stores TipTap JSON in `jsonb`. Render via `<RichContentRenderer doc={descriptionRichContent}>`. |
| `reporter` (`u-1`) | `reporter_id: uuid` | `reporterId: string` | Resolved via `useActor(reporterId)` hook; backend may inline `reporter: ActorRef` envelope on `GET /vocs/:id`. |
| `managedSystem` | `primary_managed_system_id: uuid` | `primaryManagedSystemId: string` | Resolve via `useManagedSystem(id)`. |
| `analyticsArea` | `analytics_area_id: uuid \| null` | `analyticsAreaId: string \| null` | Must belong to `primary_managed_system_id` (enforced server-side, validated client-side by picker). |
| `severity` | `severity: enum(low\|medium\|high\|critical) \| null` | `severity: Severity \| null` | Null until triage. Never submitted on create (FR-VOC-001). |
| `reporterStatus` | `reporter_facing_status: enum` (8 states) | `reporterFacingStatus: ReporterFacingStatus` | Enum mirrors `data.js · ReporterStatusLabels` keys. |
| `internalState` (`triaged`/`unassigned`) | `triage_state: enum(untriaged\|triaged\|needs_more_information\|dismissed_not_actionable)` | `triageState: TriageState` | Prototype values (`unassigned`, `in_progress`, `assigned`, `done`) do not match the contract enum. **Use the contract values.** |
| `owner` (`u-1`) | `owner_user_id: uuid \| null` | `ownerUserId: string \| null` | Mutually nullable with `owner_team_id`. |
| n/a | `owner_team_id: uuid \| null` | `ownerTeamId: string \| null` | Teams are read-only in MVP per ADR-0018 / ADR-0019 Section C; the picker shows teams but cannot create them. |
| `createdAt` (`'2시간 전'`) | `created_at: timestamp` (ISO 8601) | `createdAt: string` | Format via `formatRelative(createdAt, locale)` from `@/lib/datetime`. |
| n/a | `updated_at: timestamp` | `updatedAt: string` | Used as `If-Match`-equivalent for optimistic concurrency (see §5 Triage flow + ADR-0019). |
| `similarCount` | `similar_count: integer` (from `GET /vocs/:id?include=similar_count`) | `similarCount: number` | **GAP:** API contract does not yet specify whether `similar_count` is inlined on list rows or fetched via `GET /vocs/:id/similar`. Spec assumes inline for inbox row scanning; flag as S3-002 contract decision. |
| `linkedFindingId`, `linkedTaskId` | derived from `entity_links` per `docs/implementation/06-entity-linking-contract.md` | `linkedExecution: { findingRef?: EntityRef; taskRef?: EntityRef } \| null` | Backend should return inlined entity refs on detail fetch to avoid N+1; production hook: `useVocLinkedExecution(id)`. **GAP:** envelope shape for inlined linked-entity refs on `GET /vocs/:id` is not yet specified — flag for S3-002. |
| `sourceContext` (display string) | `source_context: enum(direct_use\|proxy_report\|operational_discovery\|stakeholder_request)` | `sourceContext: SourceContext` | Prototype uses display strings (`'Direct Use'`); production uses the enum + i18n label catalog. |
| `nextAction` (single string) | `next_actions: NextAction[]` per `docs/implementation/03-api-contracts.md` §Next Action Contract | `nextActions: NextAction[]` | Render the highest-priority `available` action in the sticky footer; surface the rest in `<DetailPanelHeaderActions>` More menu. Frontend MUST NOT infer eligibility. |
| `cluster` (cluster id) | `cluster_id: uuid \| null` (TBD per VOC Cluster spec) | `clusterId: string \| null` | Cluster confirmation/dismissal lives in VOC Cluster spec; this spec only consumes presence. |
| `permissionDecisions: { linkedFinding, … }` | `permission_decisions: Record<DecisionKey, PermissionDecision>` per `docs/implementation/05-permission-policy.md` §3 Permission Envelope | `permissionDecisions: Record<DecisionKey, PermissionDecision>` | See §7. |

### 4.2 PermissionDecision envelope

```ts
type PermissionDecisionState =
  | 'request_access'           // actor may request the missing scope
  | 'summary_visible'          // safe summary returned, full content hidden
  | 'denied'                   // explicit deny — no request CTA
  | 'blocked_not_requestable'; // structural restriction — actor must not know it can request

interface PermissionDecision {
  state: PermissionDecisionState;
  category: string;             // human-readable label, e.g. "Finding · safe summary only"
  reason?: string;              // domain-safe explanation
  requiredScope?: string[];     // MS ids actor would need
  summary?: SafeSummary | null; // only present when state === 'summary_visible'
  decisionId: string;           // for audit correlation
  evaluatedAt: string;          // ISO 8601
}
```

### 4.3 Conversation entries (public_updates, reporter_replies, internal_comments)

Each entry is append-only (per `docs/implementation/03-api-contracts.md` §VOC Conversation).

| Field | Type | Notes |
|---|---|---|
| `id: uuid` | required | |
| `voc_id: uuid` | required | |
| `actor_id: uuid` | required | author |
| `body_rich_content: TipTapDoc` (jsonb) | required | sanitized server-side per ADR-0011 |
| `created_at: timestamp` | required | |
| `visibility: enum('public_update' \| 'reporter_reply' \| 'internal_comment')` | required | also implicit from endpoint, but persisted for unified `conversation_timeline` queries |
| (public_updates only) `reporter_facing_status_before: enum`, `reporter_facing_status_after: enum`, `skip_public_update: bool`, `skip_reason: text \| null` | per status-change paired-write rule (`docs/implementation/03-api-contracts.md:176-179`) | |

**GAP:** `docs/design/15-data-contracts.md` lists VOC but does not enumerate the conversation tables. The shapes above are the minimum surface the frontend consumes; the migration spec lives in backend issue S3-001.

### 4.4 Pending attachment (Create form local state, pre-upload)

```ts
interface PendingAttachment {
  id: string;                   // client-generated, replaced with server uuid after upload
  name: string;
  size: number;                 // bytes
  mimeType: string;
  serverAttachmentId?: string;  // populated after POST /attachments returns
  uploadState: 'pending' | 'uploading' | 'uploaded' | 'failed';
  errorCode?: string;           // 'attachment.too_large' | 'attachment.unsupported_type'
}
```

Per-file limit: **25 MB** in the prototype Create form, **50 MB** in the RichEditor footer copy. Spec aligns to **25 MB per file** as the binding limit (the larger number is prototype copy drift). Production limit lives in ADR-0011 derivative — confirm with backend before S3-006.

### 4.5 Reporter-facing status transitions

```ts
type ReporterFacingStatus =
  | 'received' | 'reviewing' | 'assigned' | 'progress'
  | 'prep' | 'resolved' | 'reopened' | 'closed';

interface ReporterStatusTransitions {
  allowed: ReporterFacingStatus[];
  forbidden: Partial<Record<ReporterFacingStatus, string>>; // value = reason
}

interface VocDetailEnvelope {
  // ...VOC fields...
  next_reporter_states: ReporterStatusTransitions;
  reporter_status_gate?: {                 // optional — present when a linked-task gate applies
    blocking_for: ReporterFacingStatus[];  // e.g. ['resolved']
    reason: string;                        // e.g. "연결된 Task가 doing 상태입니다…"
  };
}
```

Prototype hardcodes the matrix in `data.js · REPORTER_STATUS_TRANSITIONS`. Production reads it from `GET /vocs/:id`. The matrix in `data.js` is the spec for which transitions are allowed; backend S3-001 ships the same matrix server-side as the source of truth.

---

## 5. Interaction Contract

### 5.1 Filters / Sort / Group by

| Surface | Categories | Sort fields | URL sync |
|---|---|---|---|
| Inbox (`/vocs?view=inbox`) | `severity` (low/medium/high/critical), `reporterStatus` (8 states), `owner` (assigned / unassigned) | `createdAt`, `severity`, `reporterStatus` (each asc/desc) | `filter.severity=high,critical`, `filter.reporterStatus=received`, `filter.owner=unassigned`, `sort=severity:asc` |
| Triage (`/vocs?view=triage`) | inline filter on the toolbar mirrors Inbox categories; **no Sort popover** — queue is sorted server-side as `unassigned first → severity desc → created asc` | n/a | `triage=unassigned\|untriaged\|high\|waiting`; tab change writes URL |
| My (`/vocs?view=my`) | `reporterStatus` only | `createdAt`, `reporterStatus` | same shape as Inbox |

**Multi-value encoding:** comma-separated in URL (`filter.severity=high,critical`); parsed back into `Set<string>` in component state.

**Group by:** **NOT supported on VOC surfaces in Slice 3** (group-by lives on Tasks board). State explicitly that the prototype Sort button is single-axis Sort only.

### 5.2 Command palette (⌘K)

VOC verbs registered in `features/voc/command-catalog.ts`:

| Command id | Group | Verb + label | Route intent |
|---|---|---|---|
| `voc.navigate.inbox` | Navigate | "Go to · VOC · Inbox" | `/vocs?view=inbox` |
| `voc.navigate.triage` | Navigate | "Go to · VOC · Triage" | `/vocs?view=triage` |
| `voc.navigate.my` | Navigate | "Go to · VOC · My VOCs" | `/vocs?view=my` |
| `voc.create` | Create | "Create · New VOC" (`kbd: 'C'`) | `/vocs?action=create` |
| `voc.scope.switch` | Switch scope | "Switch · Managed System scope" | writes `managedSystem=:msId` |
| `voc.open.<id>` (recent 6) | Open | `${id} · ${title}` | `/vocs?view=inbox&selected=<id>` |

Per `docs/frontend/interaction-patterns.md` §Command menu: commands resolve via backend route-resolution endpoint when ambiguous (e.g. "Open VOC 2814" must be reachable even when the actor is on `/tasks`). Backend returns `route_intent: { route, params }` and the menu navigates via TanStack Router. Frontend MUST NOT synthesize commands the backend marked `hidden`.

### 5.3 Optimistic mutation + undo (Triage Console)

Mirrors prototype `screen-voc-create.jsx · TriageScreen.handleAct`.

1. User clicks `Triage 확정 & 다음 VOC` (or `Finding 만들기` / `보류`).
2. Frontend computes `next` row, selects it, and removes the acted-on VOC from the local visible queue.
3. Toast (`<UndoToast>`) appears with `실행 취소` action and 4-second auto-dismiss.
4. Mutation fires: `PATCH /vocs/:id` with the triage payload, `Idempotency-Key: <uuidv4>` header (per ADR-0015).
5. **On success:** toast remains until timeout; no further action.
6. **On failure:** rollback local state (re-insert VOC), preserve user-entered values in the panel, toast with `tone: 'danger'`, show retry. Error body parsed per ADR-0012 (`code`, `message`, optional `requestable_permission`).
7. **On undo:** the local optimistic state is reverted **before** the mutation completes (if still in-flight, send an abort signal; if already committed, send a compensating PATCH with the prior values + `Idempotency-Key: <different-uuid>`).

**Idempotency key rules** (per ADR-0015 §Idempotency):
- One key per logical user-intent batch. Generating a fresh key on undo prevents the dedupe layer from returning the cached confirm response when the user intends a different write.
- Keys are UUIDv4, client-generated, 24-hour TTL server-side.
- Same key with different payload → `409 conflict.idempotency_key_reuse` (per ADR-0012 / ADR-0015) → display "다시 시도해 주세요" toast.

### 5.4 Detail panel header actions

`<DetailPanelHeaderActions>` provides:

| Affordance | Action | Production wiring |
|---|---|---|
| Copy link | Copies `window.location.origin + /vocs?view=inbox&selected=<id>` to clipboard, toasts "링크가 복사되었습니다" | `navigator.clipboard.writeText` |
| Expand | Toggles `useFullscreenPanel()` (panel takes columns 3-4); Esc collapses | Pure UI |
| Kebab → Mark read | `PATCH /vocs/:id/read-state` (TBD endpoint, S3-008 follow-up) | If not in Slice 3 backend, render the menu item with `disabledReason: 'Slice 3+에 출시 예정'` |
| Kebab → Snooze | TBD endpoint | same |
| Kebab → Subscribe / Unsubscribe | TBD (notifications, ADR-0014) | same |
| Kebab → Archive | TBD (per Slice 2 archive policy in ADR-0019 Section A; archived VOCs are immutable) | Show confirmation dialog citing immutability |

For Slice 3, only Copy link + Expand land. The kebab menu items render but are disabled with the backend-provided reason (per `interaction-patterns.md` "Permission-blocked commands can appear disabled with reason").

### 5.5 Composer Preview modal

- Triggered by the "Preview" button in `<ComposerFooter>`. Disabled on `internal` tab (intentional — internal notes have no public render).
- Renders `<ComposerPublicPreview>` or `<ComposerReplyPreview>` inside `<PreviewModal>`.
- Public preview reflects: VOC id, next `<ReporterStatusBadge>`, title, owner attribution, `descriptionRichContent` rendered through `<RichContentRenderer mode="reporter_visible">`, and a footer reminder ("첨부·외부 링크·@멘션은 공개 본문에 포함되지 않습니다…").
- Closing the modal does not commit; user must press Publish in the composer.

### 5.6 Permission-blocked surfaces (VOC)

VOC reads two `permission_decision` keys today:

| Key | Where shown |
|---|---|
| `linkedFinding` | Detail panel `Linked Finding` section, replacing the inlined finding card; also collapses the trail node into a placeholder ("Restricted Finding · access limited") |
| `source` (cross-reference only) | Not directly rendered by VOC; consumed by Evidence detail. Listed here for cross-spec consistency. |

Surface keys NOT consumed by VOC (listed for completeness — checked in other specs):
- `execution` → Finding spec
- `linkedVoc` → Task spec

`<PermissionBlockedPanel state="request_access">` CTA navigates to `/admin/permissions/requests?action=create&capability=read_finding&scope=<requiredScope>&source_entity=VOC:<vocId>&return=<currentUrl>`. Slice 3 does not ship in-product permission request creation UI — the link routes to the existing Permission Requests review console where Admin handles the request lifecycle.

Production hook signature:

```ts
function usePermissionDecision(
  entity: { permissionDecisions?: Record<string, PermissionDecision> },
  key: 'linkedFinding' | 'execution' | 'linkedVoc' | 'source'
): PermissionDecision | null;
```

### 5.7 RichEditor per-surface contract

| Surface | Allowed toolbar actions | Footer hint | Surface warning |
|---|---|---|---|
| `voc-description` | Bold, Italic, Underline, Code, List, Link, Attach | "본인이 직접 겪은 일을 기준으로 적어주세요. 첨부 파일은 25 MB 이하." | none |
| `reporter-reply` | Bold, Italic, Link, Attach | "공개 타임라인에 기록되며 리포터에게 알림이 발송됩니다." | "리포터에게 보이는 메시지입니다. 내부 도구/티켓 ID는 노출하지 않는 게 안전합니다." |
| `public-update` | Bold, Italic, List | "Reporter-facing status가 변경됩니다. 공개 안전한 표현인지 한 번 더 확인하세요." | "리포터에게 노출됩니다. 첨부 · 외부 링크 · @멘션은 사용할 수 없습니다." |
| `internal-comment` | Bold, Italic, Code, List, Link, @Mention, Attach | "팀원에게만 보입니다. 코드 블록 · @멘션을 자유롭게 사용하세요." | none |

Backend sanitization is authoritative (ADR-0011): the editor enforces the toolbar allowlist client-side as UX guidance only. The server rejects nodes/marks outside the surface allowlist with `code: 'rich_content.disallowed_node'` (added to ADR-0012 in Slice 3 #13). Attribute failures use first-class codes: `rich_content.disallowed_attr` for unknown attr keys, `rich_content.invalid_attr_value` for schema failures, and `rich_content.missing_required_attr` for absent required attrs. The shared allowlist contract also declares atomic `leafNodes`; `attachmentRef` and `mention` must be rejected with `rich_content.disallowed_node` when they carry non-empty `content[]`. FE/BE parity is pinned by the canonical corpus in `packages/shared/src/rich-content/fixtures.ts`; backend tests consume it directly, while `@fops/ui` keeps an ADR-0016-compliant local mirror plus drift/sanitize-on-render tests.

Attachment uploads from inside the editor and from the Create form dropzone share the same backend interface (per ADR-0011 §Inline Attachments). The frontend abstraction: `useAttachmentUpload({ vocId?: string, scope: 'voc' | 'comment' })`.

### 5.8 Dirty-save patterns

- **Create form:** unsaved changes prompt `<DirtyConfirmation>` on navigate-away (browser back, sidebar nav click, ⌘K navigation). Save Draft button (prototype copy "초안 저장") is **NOT in Slice 3** — strip from the production form or surface as `disabledReason: 'Drafts come in Slice 5'`. Confirm with PM before S3-006.
- **Detail panel composers:** dirty state per surface (public / reply / internal). Switching tabs preserves each surface's draft in component state (per prototype `key={composerTab}` reset rule — production keeps drafts in a `useReducer` keyed by `(vocId, surface)`). Closing the panel with any dirty composer prompts `<DirtyConfirmation>`.
- **Triage panel:** dirty when severity / owner / area / clusterAction differ from the loaded VOC. Confirm-and-next button is disabled until dirty.

### 5.9 Drag / drop

**None in VOC scope.** Tasks board owns DnD. The Create form attachment dropzone is HTML5 drag/drop for file ingest only — not list reordering.

### 5.10 Reporter-facing status change (Public Update tab)

Per `<ReporterStatusChangeBlock>` (Pack 8):

1. Block appears only on the `public` composer tab.
2. Status picker is a `<Select>` listing **current first, then allowed transitions, then forbidden transitions (disabled with `· 차단됨` suffix)**. Allowed set comes from `voc.next_reporter_states.allowed`.
3. If user selects a forbidden status (only possible via keyboard or stale data), a red `<Callout>` explains `voc.next_reporter_states.forbidden[next]` (e.g. "결과 확인 전에 해결됨으로 바꿀 수 없습니다.").
4. If `voc.reporter_status_gate` blocks the staged status (e.g. linked Task not yet released), an amber `<Callout>` renders with an "Open task" CTA. **Publish button is disabled while the gate is active.**
5. Reporter preview card mirrors the reporter inbox row: VOC id · new `<ReporterStatusBadge>` · 업데이트 chip · title · owner attribution · sanitized body excerpt · public-safe footer reminder.
6. On Publish: `POST /vocs/:id/public-updates` with body `{ body_rich_content, next_reporter_facing_status, skip_public_update: false }`. **Status change and Public Update body are paired in one request** per ADR-0019 / API contract (atomic; one audit row each for `public_update_created` + `reporter_facing_status_changed`).
7. If actor explicitly skips the public update (toggle TBD in Q3 — see §10), request becomes `{ skip_public_update: true, skip_reason: <text>, next_reporter_facing_status }`.

### 5.11 Triage flow

| Step | Action | Endpoint |
|---|---|---|
| Severity decide | Click chip in `<SeverityPicker>` → local dirty state | none yet |
| Owner assign | Click `<OwnerPicker>` row → local dirty | none yet |
| AA link | Click `<AnalyticsAreaPicker>` chip → local dirty | none yet |
| Cluster confirm/dismiss | Click button in cluster section → local dirty | none yet |
| Triage 확정 & 다음 VOC | Atomic `PATCH /vocs/:id` with `{ severity, owner_user_id, analytics_area_id, cluster_decision: 'confirm' \| 'dismiss' \| null, triage_state: 'triaged' }` + Idempotency-Key | `PATCH /vocs/:id` (backend service must apply `SELECT … FOR UPDATE` on the VOC row per ADR-0019 Section E pattern extended to VOC — see S3-002) |
| Finding 만들기 | Same triage commit, then navigate to Finding create flow (Slice 5) | flagged Slice 5; in Slice 3 just navigate to `/vocs?view=triage&selected=<id>` and toast that Finding creation is in Slice 5 |
| 보류 | Triage state stays `untriaged` but `triage_state_review_postponed_at: now()` writes (TBD field, S3-001) | TBD |

**Audit events emitted by backend** (consumed by Activity sections, frontend never invents these names):
- `voc_created`
- `voc_triage_committed` (severity / owner / AA / cluster decision)
- `voc_owner_assigned`
- `voc_severity_set`
- `voc_analytics_area_linked`
- `public_update_created` + `reporter_facing_status_changed` (paired when status changes)
- `reporter_reply_created`
- `internal_comment_created`

Full event vocab lives in backend audit module; this spec lists VOC-touching names so reviewers can validate Activity tab copy.

---

## 6. Visual Contract

Tailwind config lives in `apps/frontend/tailwind.config.ts`. **CSS custom properties from `docs/design-prototype/styles.css` port verbatim**; Tailwind config exposes them as kebab-case theme keys.

### 6.1 Surface tokens

| Semantic token | Tailwind key | Raw color | Usage rule |
|---|---|---|---|
| `--surface-canvas` | `bg-surface-canvas` | `#08090a` (Pitch Black) | App canvas, main scroll background |
| `--surface-sidebar` | `bg-surface-sidebar` | `#0a0b0c` | Left sidebar only |
| `--surface-list` | `bg-surface-list` | `#08090a` | List rows base |
| `--surface-row-hover` | `bg-surface-row-hover` | `#131416` | Row hover (group-hover:bg-surface-row-hover) |
| `--surface-row-selected` | `bg-surface-row-selected` | `#1a1c20` | Row selected (`aria-selected=true`) |
| `--surface-detail` | `bg-surface-detail` | `#0f1011` (Graphite) | Right detail panel |
| `--surface-card` | `bg-surface-card` | `#0f1011` | In-panel card sections |
| `--surface-card-elevated` | `bg-surface-card-elevated` | `#161718` (Deep Slate) | DetailPanelHeader band, raised cards |
| `--surface-popover` | `bg-surface-popover` | `#161718` | Popovers, command menu, dropdowns |
| `--surface-field` | `bg-surface-field` | transparent | Default input bg |
| `--surface-field-filled` | `bg-surface-field-filled` | `#161718` | Filled / focused input bg |
| `--surface-blocked` | `bg-surface-blocked` | `#15161a` | PermissionBlockedPanel bg |

### 6.2 Text tokens

| Semantic token | Tailwind key | Raw color | Usage |
|---|---|---|---|
| `--text-primary` | `text-text-primary` | `#f7f8f8` | Body, titles |
| `--text-secondary` | `text-text-secondary` | `#d0d6e0` | Subtitles, secondary labels |
| `--text-muted` | `text-text-muted` | `#8a8f98` | Meta, timestamps |
| `--text-disabled` | `text-text-disabled` | `#62666d` | Disabled |
| `--text-danger` | `text-text-danger` | `#eb5757` | Errors, "Owner 없음" |
| `--text-warning` | `text-text-warning` | `#f2c46d` | Warnings |
| `--text-success` | `text-text-success` | `#27a644` | Success |
| `--text-info` | `text-text-info` | `#02b8cc` | Info |

### 6.3 Border + focus

| Semantic token | Tailwind key | Raw color | Usage |
|---|---|---|---|
| `--border-subtle` | `border-border-subtle` | `#23252a` (Charcoal Grey) | Default 1px dividers |
| `--border-strong` | `border-border-strong` | `#323334` | Inputs, popover edges |
| `--border-selected` | `border-border-selected` | `#5e6ad2` (Aether Blue) | Row selected ring |
| `--focus-ring` | `ring-focus-ring` | `#e4f222` (Neon Lime) | All keyboard focus (`focus-visible:ring-2 focus-visible:ring-focus-ring`) |
| `--focus-ring-danger` | `ring-focus-ring-danger` | `#eb5757` | Destructive focus |

### 6.4 Reporter-facing status (pill — `rounded-full`)

| Status | Token | Tailwind class | Raw |
|---|---|---|---|
| `received` (접수됨) | `--status-reporter-received` | `bg-status-reporter-received/15 text-status-reporter-received` | `#02b8cc` |
| `reviewing` (검토 중) | `--status-reporter-reviewing` | same | `#5e6ad2` |
| `assigned` (담당자 배정됨) | `--status-reporter-assigned` | same | `#6366f1` |
| `progress` (처리 중) | `--status-reporter-progress` | same | `#8b5cf6` |
| `prep` (해결 준비 중) | `--status-reporter-prep` | same | `#f2c46d` |
| `resolved` (해결됨) | `--status-reporter-resolved` | same | `#27a644` |
| `reopened` (다시 처리 중) | `--status-reporter-reopened` | same | `#eb5757` |
| `closed` (종료됨) | `--status-reporter-closed` | same | `#62666d` |

### 6.5 Internal task status (squared — `rounded-sm`) — referenced from VOC linked execution row, not authored here

| Status | Token | Raw |
|---|---|---|
| `backlog` | `--status-internal-backlog` | `#62666d` |
| `todo` | `--status-internal-todo` | `#8a8f98` |
| `doing` | `--status-internal-doing` | `#5e6ad2` |
| `review` | `--status-internal-review` | `#8b5cf6` |
| `done` | `--status-internal-done` | `#27a644` |
| `released` | `--status-internal-released` | `#02b8cc` |
| `reopened` | `--status-internal-reopened` | `#eb5757` |

### 6.6 Severity (chip + 3×16px bar)

| Severity | Token | Tailwind | Raw |
|---|---|---|---|
| `low` | `--severity-low` | `bg-severity-low/15 text-severity-low` | `#8a8f98` |
| `medium` | `--severity-medium` | same | `#f2c46d` |
| `high` | `--severity-high` | same | `#f08a4a` |
| `critical` | `--severity-critical` | same | `#eb5757` |

### 6.7 Density + radii

| Token | Tailwind | Value | Usage |
|---|---|---|---|
| `--row-height-compact` | `h-row-compact` | 44px | List dense mode (not used in Slice 3 VOC) |
| `--row-height-default` | `h-row-default` | 60px | VOC Inbox / My rows |
| `--row-height-expanded` | `h-row-expanded` | 96px | Triage Console rows |
| `--sidebar-width` | `w-sidebar` | 240px | Sidebar |
| `--sidebar-width-collapsed` | `w-sidebar-collapsed` | 56px | Collapsed sidebar |
| `--rail-width` | `w-rail` | 52px | Global rail (Slice 3 keeps the prototype's rail) |
| `--detail-panel-width` | `w-detail-panel` | 440px | Right detail panel (`min 360, max 520` per ui-design-system.md — Tailwind utility `min-w-[360px] max-w-[520px]`) |
| `--radius-sm` | `rounded-sm` | 2px | Tags |
| `--radius-md` | `rounded-md` | 6px | Default buttons, inputs, cards |
| `--radius-lg` | `rounded-lg` | 8px | Toasts, preview modal |
| `--radius-pill` | `rounded-full` | 9999px | Reporter status badge, MS pill |
| `--focus-ring` shadow | `shadow-focus` | `0 0 0 2px var(--color-pitch-black), 0 0 0 4px var(--color-neon-lime)` | keyboard focus ring on all interactive |

### 6.8 Neon Lime usage rule

`#e4f222` (Neon Lime) is **reserved**:

1. Primary action button background (`<Button variant="primary">`).
2. Focus ring (always).
3. The Reporter-facing-status-change accent stripe in `<ReporterStatusChangeBlock>` (its title color + 4% bg).

**Forbidden uses:** status badges (reporter or internal), severity, hover row backgrounds, link text, info accents. Reviewers reject PRs that color non-action surfaces Neon Lime.

---

## 7. Permission Envelope Mapping

Backend `permission_decision` envelope (per `docs/implementation/05-permission-policy.md` §3 + ADR-0019 Section D for the `'managed_system_scope'` decision variant) attaches to each linked-object reference and is keyed on the relationship name.

VOC reads the following keys:

| Key | Where attached | Frontend surface | Hook |
|---|---|---|---|
| `linkedFinding` | `GET /vocs/:id` envelope: `permission_decisions.linkedFinding` | Detail panel `Linked Finding` section + trail node + `Open finding` footer button (changes copy to `Request Finding access`) | `usePermissionDecision(voc, 'linkedFinding')` |
| `execution` | (not on VOC envelope — lives on Finding) | n/a here — cross-spec reference only | n/a |
| `linkedVoc` | (not on VOC envelope — lives on Task) | n/a here — cross-spec reference only | n/a |
| `source` | (not on VOC envelope — lives on Evidence) | n/a here — cross-spec reference only | n/a |

**Decision lifecycle:**

```text
1. Frontend renders VOC detail.
2. usePermissionDecision returns the envelope.
3. If state === 'request_access': render CTA, on click navigate to /admin/permissions/requests?action=create with prefill.
4. If state === 'summary_visible': render the safe summary slot.
5. If state === 'denied' or 'blocked_not_requestable': render copy, no CTA.
6. Below the panel, always render the audit footer:
   `<Icon name="shield" /> Decision <code>{decisionId}</code> · evaluated {formatRelative(evaluatedAt)}`
```

The `decisionId` + `evaluatedAt` line is **mandatory** per Pack 8: reviewers correlate the visible block with the audit log row.

---

## 8. API Mapping

All paths relative to the VOC service base (`/api` per `apps/backend/AGENTS.md` routing convention — confirm). All request bodies are snake_case JSON. All mutation endpoints accept optional `Idempotency-Key: <uuidv4>` (24-hour TTL). All responses follow ADR-0012 error envelope on non-2xx.

### 8.1 `POST /vocs` — Create

| Property | Value |
|---|---|
| Method / Path | `POST /vocs` |
| Headers | `Content-Type: application/json`, `Idempotency-Key: <uuidv4>` (required from frontend — prevents double-submit on Create), session cookie (`fops_session`, HttpOnly + SameSite=Lax — set by `POST /auth/mock-login` or production OIDC handler) |
| Request body | `{ primary_managed_system_id, title, description_rich_content: TipTapDoc, analytics_area_id?, source_context?, attachment_ids?: string[] }` (PLAN-22 C7b — `attachments: AttachmentRef[]` retired; `attachment_ids[]` references pre-uploaded `voc.voc_attachments` rows linked in the same tx) |
| Forbidden fields | `reporter_id`, `severity`, `reporter_facing_status`, `triage_state`, `owner_user_id`, `owner_team_id`, `display_id` (per `packages/shared/src/vocs/create-request.ts FORBIDDEN_CREATE_FIELDS`) — client validation drops them before send |
| Success response | `201 Created` with full VOC envelope including server-resolved `reporter_id`, `triage_state: 'untriaged'`, `reporter_facing_status: 'received'`, `next_actions`, `permission_decisions` |
| Error codes (ADR-0012) | `validation.failed` (422) · `validation.unexpected_field` (422 — forbidden server-resolved field in body) · `validation.malformed_idempotency_key` (422 — Idempotency-Key header present but not UUIDv4) · `voc.severity_not_user_settable` (422) · `permission.denied` (403) · `not_found.record` (404 on referenced MS or AA) · `conflict.parent_archived` (409 if MS or AA is archived, per ADR-0019 Section A/B) · `conflict.idempotency_key_reuse` (409) · `rate_limited.actor` (429) · `rich_content.disallowed_node` (422) · `rich_content.disallowed_attr` (422) · `rich_content.invalid_attr_value` (422) · `rich_content.missing_required_attr` (422) · `rich_content.external_image_forbidden` (422) · `attachment.too_large` (422 — file exceeds 25 MB) · `attachment.unsupported_type` (422 — disallowed MIME) · `storage.unavailable` (502 — upstream storage failure) |
| Idempotency (ADR-0015) | Required from client; same key + same body returns the stored 201 verbatim; same key + different body returns `409 conflict.idempotency_key_reuse` |
| tx-scoped checks (ADR-0019 Section E pattern) | Service `createVoc` runs in a single tx; `SELECT … FOR UPDATE` on the parent MS row (and AA row, when present) to serialize against archive transactions. Per `apps/backend/AGENTS.md` Layer Rules: mutation service receives `Tx` not `Pool`. |
| Audit events | `voc_created` with `{ voc_id, primary_managed_system_id, analytics_area_id?, reporter_id, source_context }` |

### 8.2 `GET /vocs` — List (Inbox / My / Triage)

| Property | Value |
|---|---|
| Method / Path | `GET /vocs` |
| Query params | `view=inbox\|my\|triage`, `managed_system_id=:id\|all`, `tab=untriaged\|high\|unassigned\|similar\|no-link\|waiting`, `filter.severity=`, `filter.reporter_facing_status=`, `filter.owner=assigned\|unassigned`, `sort=created_at:desc\|severity:asc\|reporter_facing_status:asc`, `cursor=`, `limit=` |
| Response | `{ items: VocListItem[], page: { cursor?, has_more: bool }, out_of_scope_summary?: { count, severity_distribution } }` |
| `out_of_scope_summary` | Present when actor's effective scope union contains VOCs the actor cannot see; powers the Triage `<PermissionBlockedPanel state="summary_visible">` peek banner |
| Errors | `permission.denied` (403 if actor lacks any VOC read scope) · `validation.failed` (bad cursor) |
| Caching | Stale-while-revalidate on TanStack Query, key `[ 'vocs', view, managedSystem, tab, filters, sort ]` |

### 8.3 `GET /vocs/:id` — Detail

| Property | Value |
|---|---|
| Method / Path | `GET /vocs/:id` |
| Response | `VocDetailEnvelope` = `{ ...VocFields, next_actions, next_reporter_states, reporter_status_gate?, permission_decisions, linked_execution: { finding?, task? }, conversation_timeline: ConversationEntry[], attachments: LinkedAttachment[], attachment_count }` |
| `attachments[]` (PLAN-22 §Bug-1) | Always present; `[]` when none. Each item: `{ id, name, size_bytes, mime_type, uploaded_by_actor_id, created_at, linked_at }`. `storage_key`/`storage_uri` NOT exposed — clients reference by `id` and download via `GET /attachments/:id/download`. Archived rows excluded. |
| `ConversationEntry.attachments[]` (PLAN-22 §Bug-1) | Same shape as `attachments[]`. Always present on every entry on `conversation_timeline[]` AND on `GET /vocs/:id/conversation` items. `[]` when the entry has no linked rows. |
| `attachment_count` on list rows | `GET /vocs` includes `attachment_count: number` on each `VocListItem` (subquery, no full JOIN). Used by inbox to render a paperclip + count chip. |
| Errors | `not_found.record` (404) · `permission.denied` (403; backend may instead return summary envelope w/ permission_decision) |
| Conversation pagination | If `conversation_timeline.has_more`, fetch via `GET /vocs/:id/conversation?cursor=`. **`cursor` is optional** (PLAN-22 §Bug-2): the endpoint accepts a first-page call (no cursor) and treats it as "start from oldest". The FE infinite-query hook issues its first GET without a cursor by design. Subsequent calls carry the encoded `{ createdAt, id }` cursor returned from the previous page. |

### 8.4 `PATCH /vocs/:id` — Triage commit / metadata edit

| Property | Value |
|---|---|
| Method / Path | `PATCH /vocs/:id` |
| Headers | `Idempotency-Key: <uuidv4>` (required for optimistic Triage flow), `If-Match: <updated_at>` (proposed for optimistic concurrency — see ADR-0019 Section A/E pattern) |
| Allowed fields | `severity` (Admin / Developer in MS scope only), `owner_user_id`, `owner_team_id`, `analytics_area_id`, `triage_state`, `cluster_decision` (`confirm` \| `dismiss` \| `null`). **NOT** `reporter_facing_status` (must go through `POST /vocs/:id/public-updates`). **NOT** `title`, `description_rich_content` after triage begins (Reporter pre-triage edit is a separate restricted PATCH — S3-002 to decide if same endpoint or `PATCH /vocs/:id/description`). |
| Forbidden in MVP | `severity` change after triage commits — clarify in §10 Q-SEVRETRIAGE; archived VOC rejects PATCH per ADR-0019 Section A (`409 conflict.record_archived`) |
| Errors | `validation.failed` · `permission.denied` · `permission.scope_required` (Developer outside MS) · `conflict.stale_write` (If-Match miss) · `conflict.record_archived` (ADR-0019 Section A) · `conflict.parent_archived` (ADR-0019 Section B if MS now archived) |
| tx-scoped checks | `SELECT … FOR UPDATE` on the VOC row + parent MS row (ADR-0019 Section E extended pattern); permission re-check inside the same tx (ADR-0019 Section D step 5 for MS-scoped grants) |
| Audit events | `voc_triage_committed` (atomic), and individual events for any field that changed (`voc_owner_assigned`, `voc_severity_set`, `voc_analytics_area_linked`, `voc_cluster_decision_recorded`) |

### 8.5 `POST /vocs/:id/public-updates`

| Property | Value |
|---|---|
| Method / Path | `POST /vocs/:id/public-updates` |
| Headers | `Idempotency-Key: <uuidv4>` |
| Permission | Admin or Developer in same MS scope only (per `docs/design/04-voc-system.md:90`) |
| Request body (with status change) | `{ body_rich_content: TipTapDoc, next_reporter_facing_status: ReporterFacingStatus, skip_public_update: false }` |
| Request body (status change without public update) | `{ skip_public_update: true, skip_reason: string (≥ 8 chars), next_reporter_facing_status }` |
| Request body (public update without status change) | `{ body_rich_content, next_reporter_facing_status: <unchanged>, skip_public_update: false }` |
| Success | `201` with the created entry + the recomputed `reporter_facing_status` + fresh `next_reporter_states` |
| Errors | `permission.denied` · `permission.scope_required` · `reporter_facing_status.invalid_transition` (per ADR-0012 closed enum) · `reporter_facing_status.gate_blocked` (proposed — S3-002) when linked-Task gate fails · `validation.failed` (missing skip_reason) · `rich_content.external_image_forbidden` · `conflict.record_archived` |
| tx-scoped checks | Status transition validated against backend matrix in tx; linked-Task gate re-evaluated in tx (linked-Task state may have moved since the frontend's last fetch) |
| Audit events | Paired: `public_update_created` + `reporter_facing_status_changed` (when status changes), or `reporter_facing_status_changed` + `skipped_with_reason` (skip path) |

### 8.6 `POST /vocs/:id/reporter-replies`

| Property | Value |
|---|---|
| Method / Path | `POST /vocs/:id/reporter-replies` |
| Headers | `Idempotency-Key: <uuidv4>` |
| Permission | Reporter on their own VOC only |
| Request body | `{ body_rich_content: TipTapDoc, attachment_ids?: string[] }` (PLAN-22 C7b) |
| Side effect | May return Waiting Reporter VOCs to the follow-up queue (per API contract); **must not** auto-change `reporter_facing_status` |
| Errors | `permission.denied` (non-reporter) · `validation.failed` · `rich_content.external_image_forbidden` · `conflict.record_archived` |
| Audit events | `reporter_reply_created` |

### 8.7 `POST /vocs/:id/internal-comments`

| Property | Value |
|---|---|
| Method / Path | `POST /vocs/:id/internal-comments` |
| Headers | `Idempotency-Key: <uuidv4>` |
| Permission | Admin or Developer in same MS scope |
| Request body | `{ body_rich_content: TipTapDoc, mentions?: ActorRef[] }` |
| Errors | `permission.denied` · `permission.scope_required` · `validation.failed` · `conflict.record_archived` |
| Audit events | `internal_comment_created` |

### 8.8 Headers, rate limit, error rendering

- `Retry-After` honored on `429 rate_limited.actor` per ADR-0015 — frontend retry helper backs off and toasts "잠시 후 다시 시도해 주세요. (Nm Ns 후)".
- All errors map through `apps/frontend/src/lib/api/error-mapper.ts` → user-facing copy via i18next catalog keyed on `code`. Frontend **never** displays the raw English `message` field.
- `requestable_permission` (present on `permission.*` codes when safe) is forwarded into `<PermissionBlockedPanel state="request_access">` props automatically.

---

## 9. Acceptance Evidence Per Route

Per HANDOFF §5 P0/P1 reproduction criteria.

| Route | Curated screenshot | P0 (must match) | P1 (should match) |
|---|---|---|---|
| `/vocs?view=inbox&selected=<id>` | `docs/design-prototype/screenshots/final-baselines/voc-inbox-detail.png` (full-page: `voc-inbox-detail-full.png`) | Reporter pill vs internal squared badge separation; 60px default row height; sticky `+ New VOC` action in toolbar; 3-tab composer; sticky next-action footer; entity trail action panel | Detail panel rhythm matches screenshot; Linked execution section sits above abstract trail; Compose tabs are visually distinct (megaphone icon for public) |
| `/vocs?view=triage&selected=<id>` | `docs/design-prototype/screenshots/final-baselines/voc-triage-console.png` | Expanded 96px rows; severity color bar; "Owner 없음" / "Area 미지정" red/amber meta tags; out-of-scope summary peek banner; 4-second undo toast bottom-center; "큐가 비었습니다" empty state | Severity picker uses 4 chips with helper tooltips; Triage 결과 미리보기 card mirrors the screenshot's labels |
| `/vocs?action=create` | `docs/design-prototype/screenshots/final-baselines/voc-new.png` | Two-column form (1fr + 320px sidebar); compact `<FieldLabel>` style; MS chip strip; AA chips disabled when MS unselected; HTML5 dropzone with 25 MB hint; bottom action bar with "VOC 제출" disabled until valid | Reporter card + Similar VOC card + severity-disclaimer card in sidebar; Source segmented control; Proxy Report expands proxy_for + observed_situation row |
| `/vocs?view=my&selected=<id>` | reuse inbox baseline | Same as inbox but with `reporter_id=me` filter applied | Empty state copy differs ("내가 제출한 VOC가 없습니다") |

**Acceptance use** (per HANDOFF §5): for clean-room implementation, compare against the screenshots only after the source docs are followed; never let the implementation regress from the contract because the screenshot is missing.

---

## 10. Open Questions / Unresolved Gaps

These block specific routes/components and must be resolved before the corresponding backend or frontend issue closes. **Do not silently resolve in the spec.**

| ID | Question | Blocked surfaces | Owner | When |
|---|---|---|---|---|
| Q1 (attachment storage) | Is the Slice 3 backend ready to accept attachment refs on `POST /vocs` (i.e. is the storage abstraction from ADR-0011 implemented), or does Slice 3 VOC ship without attachments? Frontend dropzone + `AttachmentRow` are spec'd either way; the binding decision is whether to wire the upload service in S3-006 or strip attachments to a follow-up. | Create form attachments; RichEditor Attach button on `voc-description`, `reporter-reply`, `internal-comment` | Backend lead (S3-001 prologue) | Before S3-001 migration ships |
| Q2 (rich content format) | Confirm TipTap JSON in `jsonb` is locked for Slice 3 (ADR-0011 says yes; verify no downstream blocker). Frontend assumes TipTap throughout; if the decision flips to Lexical or sanitized HTML, every `<RichEditor>` and `<RichContentRenderer>` site has to migrate. | All four rich-content surfaces | Frontend + backend lead | Before S3-006 component scaffold |
| Q3 (Public Update + status change paired or separate) | The prototype always pairs them in one request. The API contract allows a `skip_public_update: true` path (status change without composing a public update body). Slice 3 UI: should the composer offer a `Skip update with reason` toggle, or restrict reporter-status changes to always require a public update? | `<ReporterStatusChangeBlock>` + `<PublicUpdateComposer>`; `POST /vocs/:id/public-updates` request shape | PM + Design (review Slice 3 prologue) | Before S3-007 starts |
| Q4 (AA owner vs MS default owner precedence) | ~~When the actor creates a VOC, multiple default-owner rules may apply…~~ **RESOLVED 2026-05-17 (Slice 3 #13):** `POST /vocs` does NOT resolve any default owner. `owner_user_id` and `owner_team_id` are NULL on the created VOC; ownership is assigned during manual triage in #14 (`PATCH /vocs/:id`). Triage "Owner 없음" wording stays accurate. Revisit if/when default-owner policy ships in a later slice. | Triage row meta; Triage panel Owner picker initial value | Backend (precedence rule lives in service code) | ✅ RESOLVED (Slice 3 #13) |
| Q5 (VOC Cluster scope in Slice 3) | Cluster confirm / dismiss is in the Triage panel mockup, but cluster CRUD lives in Slice 3+. Slice 3 VOC must either render the cluster section read-only (showing `similar_count` and an out-of-scope CTA) or commit cluster_decision through `PATCH /vocs/:id`. | Triage panel `Cluster 추천` section | PM (Slice 3 vs Slice 3+ scoping) | Before S3-002 |
| Q6 (dev/test seed) | Production needs deterministic VOC seed data for E2E + integration tests. The prototype's `Vocs` fixture is the design intent; backend issue S3-001 must commit a parallel seed (or fixture loader) that hydrates `permission_decisions` envelopes in the same shape the frontend consumes. | E2E (Playwright?) tests in S3-008; integration tests in S3-001..S3-005 | Backend test lead | Before S3-008 |
| Q-DISPLAYID | ~~The prototype renders `VOC-2814` as the human id. Production uses UUID v7. Who renders the display slug — backend (`display_id` column) or frontend (formatter that hashes UUID prefix)?~~ **RESOLVED 2026-05-24 (Issue #34):** backend owns `display_id`, generated by `next_voc_display_id(workspace_id)` from a per-workspace counter. URLs still select by canonical UUID; command palette and visible labels render `display_id`. | All routes (URL shape) + command palette + copy-link | Backend + Frontend lead | ✅ RESOLVED |
| Q-SEVRETRIAGE (newly surfaced) | Can severity change after triage commits, or is it locked? `docs/design/04-voc-system.md:117` says "severity is assigned during triage" but does not forbid retriage. Affects `PATCH /vocs/:id` allowed-fields list and the Detail panel "변경" button next to Severity. | Detail panel Triage block | PM | Before S3-002 |
| Q-CONVPAGINATION (newly surfaced) | Is `conversation_timeline` inlined on `GET /vocs/:id` or always paginated via `GET /vocs/:id/conversation`? Affects panel initial load size and timeline rendering. | Detail panel public + internal timelines | Backend | Before S3-002 |
| Q-STATUSGATECODE (newly surfaced) | The linked-Task gate (e.g. cannot mark `resolved` until task `released`) — does the backend return `reporter_facing_status.invalid_transition` (existing in ADR-0012 enum) or a new `reporter_facing_status.gate_blocked`? Affects error-mapper i18n keys. | Public Update composer error rendering | Backend + ADR-0012 maintainer | Before S3-002 |

---

## 11. What This Spec Does Not Cover

| Topic | Where it lives |
|---|---|
| VOC Cluster CRUD, cluster detail panel | Slice 3+ spec (`docs/frontend/specs/voc-cluster.md`, TBD) |
| Finding create flow from VOC (`POST /vocs/:id/create-finding`) | Slice 5 (`docs/frontend/specs/finding.md`, TBD) |
| Task Request from VOC (`POST /vocs/:id/request-task`) | Slice 6 (`docs/frontend/specs/task-request.md`, TBD) |
| Entity Links create UI, bulk-detach | Slice 4 (`docs/frontend/specs/entity-links.md`, TBD) |
| Attachment upload backend (storage abstraction wiring, virus scan policy) | Separate slice owning ADR-0011 implementation |
| Mobile / tablet layouts | Deferred per HANDOFF §11 |
| In-product Permission Request creation UI | Slice 3+ (`docs/frontend/specs/permissions.md`, TBD); for now `<PermissionBlockedPanel state="request_access">` deep-links into `/admin/permissions/requests` |
| Notifications (subscribe / unsubscribe on kebab menu) | ADR-0014 derivative spec (Slice 4+) |
| VOC read-state, snooze, archive | Slice 3+; menu items render disabled in Slice 3 |
| Saved list views (`/vocs?view=list`) | Slice 3+ |
| Draft VOC ("초안 저장") | Slice 5+ |

---

## Self-review checklist

- [x] §1 header + scope present with explicit non-scope
- [x] §2 route matrix covers Inbox / My / Triage / Create / Detail
- [x] §3 component mapping covers every VOC-touching surface (header, list, toolbar, triage queue + panel, create form, composers, status block, badges, permission, hover, command)
- [x] §4 data mapping covers VOC record, permission envelope, conversation entries, pending attachment, reporter-status transitions
- [x] §5 interaction contract covers filters/sort, command palette, optimistic + undo, header actions, preview modal, permission surfaces, RichEditor allowlist, dirty save, drag/drop (explicitly none), reporter-status change, triage flow + audit events
- [x] §6 visual contract enumerates every cited token with Tailwind key + raw color + usage; Neon Lime rule called out
- [x] §7 permission envelope maps four keys (only `linkedFinding` consumed by VOC) and specifies the `usePermissionDecision` hook + audit footer rule
- [x] §8 API mapping covers POST /vocs, GET /vocs, GET /vocs/:id, PATCH /vocs/:id, POST /vocs/:id/{public-updates, reporter-replies, internal-comments} with headers, errors, idempotency, tx checks, audit events
- [x] §9 acceptance per route; gaps flagged where curated screenshots are missing
- [x] §10 open questions: original 6 + 4 newly surfaced
- [x] §11 explicit non-scope
- [x] File length: ~870 lines (within 800-1200 budget)
