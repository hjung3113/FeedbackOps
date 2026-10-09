# VOC Frontend Implementation Spec — Slice 3

> Status: Implemented. Slice 3 shipped (milestone closed, 42 issues); this spec is the as-built contract for the VOC surfaces below, not a forward-looking draft. It originally drove backend S3-001..S3-008 and frontend S3-006/S3-007/S3-008. API authority is `docs/implementation/api/voc.md`; token values are in `packages/ui/src/styles/tokens.css` and `docs/frontend/tokens.md`.
> Stack: React 18 + TypeScript 5 + Tailwind 4.3.3 (CSS-first theme, ADR-0058) + shadcn/ui (production), TipTap (rich content, per ADR-0002 / ADR-0011), TanStack Router (production route shell — see `apps/frontend/src/routes/`).
> Authority: AGENTS.md > CONTEXT.md > docs/adr > docs/implementation. Spec docs win every disagreement with the prototype (HANDOFF.md Rule 4).

---

## 1. Header & Scope

### What this spec covers (Slice 3 VOC)

- **Create VOC** — `/vocs?action=create` form, including attachments dropzone, MS / AA pickers, `voc-description` rich editor surface.
- **VOC Inbox** — `/vocs?view=inbox` list-first + RightDetailPanel, with tab filters (Untriaged / High / Unassigned / No-link / High-no-link / No-task); `tab=similar` remains accepted but its tab is hidden until a predicate exists (see `04-voc-system.md`, “Similar VOC Suggested”). Includes `<ListFilterButton>`, `<ListSortButton>`, and bulk-select toolbar.
- **My VOCs** — `/vocs?view=my` reuses Inbox list mechanics filtered by `reporter_id = me`.
- **Triage Console** — `/vocs?view=triage`, expanded-row queue, severity-decide / owner-assign / AA-link / cluster confirm, optimistic mutation + 4-second undo toast. Its right-panel navigation always includes `유사 VOC 추천`, independent of the same-Managed-System peer count, because ADR-0034 candidates are workspace-wide.
- **VOC Detail Panel** — identity, triage block, description (TipTap read render), linked-execution section, linked-entity trail, public timeline, internal timeline, three-tab composer (Public Update / Reporter Reply / Internal Comment), Reporter-facing status change block, composer preview modal, sticky next-action footer.

### What this spec does NOT cover

These surfaces shipped in later slices and are governed by their ADRs plus the code itself — no separate frontend spec doc was ever written for them, so read the ADR and the route.

- **VOC Cluster** (`/voc-clusters`) — shipped; ADR-0020 (shell), ADR-0031 (similarity). Route: `apps/frontend/src/routes/_authed/voc-clusters/`.
- **Finding create flow from VOC** (`POST /vocs/:id/create-finding` UI) — shipped in Slice 5. ADR-0024.
- **Task Request from VOC** (`POST /vocs/:id/request-task` UI) — shipped in Slice 6. ADR-0028.
- **Entity Links create UI** (free-form linking, bulk detach) — shipped in Slice 4. ADR-0023.
- **Attachment upload backend** — covered by the ADR-0011 abstraction.
- **Mobile / tablet layouts** — desktop-only per HANDOFF §11; basic responsive guardrails inherited from `AppShell`.
- **Permission Request in-product creation UI** — shipped as the request-access dialog (`RequestAccessButton`, `apps/frontend/src/features/admin/permissions/request-access-button.tsx`); the Admin review console is `/admin/permissions/requests` per `docs/frontend/routes-and-layout.md`.

### Upstream references

| Topic | Source |
|---|---|
| Product invariants | `AGENTS.md`, `docs/design/00-product-overview.md` |
| VOC system design | `docs/design/04-voc-system.md` |
| Domain shapes | `docs/design/01-domain-model.md`, `docs/design/15-data-contracts.md` |
| Routes / URL state | `docs/frontend/routes-and-layout.md` |
| UI contract | `docs/frontend/ui-design-system.md`, `docs/frontend/component-inventory.md`, `docs/frontend/interaction-patterns.md` |
| API contract | `docs/implementation/api/voc.md` §VOC Create And Conversation Contract |
| Permission policy | `docs/design/09-permission-access.md`, `docs/implementation/05-permission-policy.md` |
| Entity linking | `docs/implementation/06-entity-linking-contract.md`, `docs/design/11-entity-linking.md` |
| Error envelope | `docs/adr/0012-error-code-contract.md` |
| Operational safety (rate-limit, idempotency, headers) | `docs/adr/0015-operational-safety-rate-limit-headers-migrations-idempotency.md` |
| Rich editor + attachment storage | `docs/adr/0002-use-wysiwyg-first-rich-content-editor.md`, `docs/adr/0011-rich-content-editor-and-attachment-storage.md` |
| Slice 2 locked decisions | `docs/adr/0019-slice2-review-followups.md` Sections A/B/D/E |
| Prototype operating rules | `docs/design-prototype/HANDOFF.md`, `docs/design-prototype/DESIGN-MAP.md` |
| Prototype visual baselines | `docs/design-prototype/screenshots/final-baselines/voc-inbox-detail.png`, `voc-triage-console.png`, `voc-new.png`, `voc-clusters.png` (+ `manifest.json` for `mustSurvive` contract) |
| Frontend module guide | `apps/frontend/AGENTS.md`, `apps/frontend/src/features/voc/AGENTS.md` |
| Backend layer rules | `apps/backend/AGENTS.md` (Tx union, tx-not-pool for mutations, snake_case at HTTP / camelCase in services) |

---

## 2. Route Matrix

Production uses TanStack Router (`apps/frontend/src/routes/`) with query-param state. The prototype's `#route=voc&view=inbox&selected=...` maps to `/vocs?view=inbox&selected=...`.

| ID | URL | Page / component owner | Required params | Optional params | Panel | Loading | Empty | Success | Error | Permission |
|---|---|---|---|---|---|---|---|---|---|---|
| R-VOC-INBOX | `/vocs?view=inbox` | `apps/frontend/src/features/voc/routes/InboxRoute.tsx` → `<VocInboxScreen>` | `view=inbox` | `managedSystem=:msId\|all`, `selected=:vocId`, `tab=untriaged\|high\|unassigned\|similar\|no-link\|no-task\|high-no-link`, `filter.severity=…`, `filter.reporterStatus=…`, `filter.owner=assigned\|unassigned`, `sort=created_at:desc\|created_at:asc\|severity:desc\|severity:asc\|reporter_facing_status:asc` | `<VocDetailPanel>` when `selected=` resolves | Skeleton rows (10) in `<VocList>`; detail panel skeleton sections | "큐가 비었습니다" — `<EmptyState>` with `+ New VOC` CTA | — | Toast on list fetch fail; `<ErrorState>` row with retry | If actor has no VOC read capability for any MS in scope and the 403 carries no `requestable_permission` → render `<PermissionBlockedPanel state="blocked_not_requestable">` instead of the list, with a `My VOCs` link to `/vocs?view=my` (#562). A 403 naming one out-of-scope Managed System keeps the request-access path and says the selected Managed System is out of reach (no My VOCs link). |
| R-VOC-MY | `/vocs?view=my` | Same screen, `reporter_id=me` server filter | `view=my` | `selected=:vocId` | `<VocDetailPanel>` | Same | "내가 제출한 VOC가 없습니다" + Submit CTA | — | Same | Always available to authenticated actor |
| R-VOC-TRIAGE | `/vocs?view=triage` | `apps/frontend/src/features/voc/routes/TriageRoute.tsx` → `<VocTriageScreen>` | `view=triage` | `tab=unassigned\|untriaged\|high\|waiting` (default `unassigned`; `untriaged` excludes postponed VOCs, which are in `waiting`; postponed VOCs stay in `미배정`/`높음` with a `보류` marker), `managedSystem=:msId\|all`, `selected=:vocId` | `<TriagePanel>` (always — single-pane decision flow) | Toolbar + tablist stay mounted during a queue load; the route-level `불러오는 중…` covers only the initial `/me` + capability load; a pending tab refetch renders `<output>불러오는 중…</output>` inside the queue column (`TriageQueue` `queuePending`) | "큐가 비었습니다 · 모든 VOC를 Triage 처리했습니다" — `<TriageEmpty>` only when the whole-queue total is a known 0; a positive or unknown total renders the neutral tab-empty copy "이 탭에 해당하는 VOC가 없습니다" (`VOC_TRIAGE_TAB_EMPTY_LABEL`) | — | Toast on per-action failure; rollback optimistic state. A failed queue read with no rows (failed first read, or failed refetch over a cached empty page) renders `불러오기 실패 · 잠시 후 다시 시도해 주세요.` with a `다시 시도` button inside the queue column (`TriageQueue` `queueError`, mirroring `VocList`); the toolbar and tabs stay mounted and the deep-link-missing notice is suppressed; a failed refetch over cached rows keeps showing them | Requires VOC triage capability (Admin or same-MS Developer). Out-of-scope VOCs surface a `<PermissionBlockedPanel state="summary_visible">` peek above the queue per backend `out_of_scope_summary` envelope. **Layout (V1 inline kicker, 2026-05-21):** `WorkbenchShell` renders without `toolbar` prop; route identity ("Console · Triage") is the first child of `VocTriageScreen`'s own 50px toolbar. ShellHeader is absent for this route only. Pixel-diff baseline `voc-triage-console.png` is stale (shows removed 50px header); re-capture is a follow-up. |
| R-VOC-CREATE | `/vocs?action=create` | `apps/frontend/src/features/voc/routes/CreateRoute.tsx` → `<VocCreateScreen>` | `action=create` | `managedSystem=:msId` (seeds picker) | none (full-page form) | Skeleton form | n/a | Toast `접수 완료: <display_id>`, then navigate to `/vocs?view=my&selected=<id>` | Field-level `<FormError>` from `code='validation.failed'`; toast on transport failure; `<DirtyConfirmation>` modal on navigate-away | Any AD-authenticated Actor may submit (FR-VOC-001). Workspace + MS submission eligibility enforced server-side; the picker hides MSs the actor cannot submit to. |
| R-VOC-DETAIL | `/vocs?view=inbox&selected=:vocId` (no standalone page in Slice 3) | `<VocDetailPanel>` mounts inside whichever list route owns selection | `selected=:vocId` | — | n/a (panel itself) | Panel skeleton blocks | n/a | — | If `GET /vocs/:id` returns `404 not_found.record` → render `<DetailPanelNotFound>` with "선택을 해제" CTA; if `403 permission.denied` → `<PermissionBlockedPanel state="denied">` | If actor lacks read permission on the targeted VOC, route still resolves but panel shows blocked state per `permission_decision` envelope. |

**Route-state rules** (per `docs/frontend/routes-and-layout.md` §URL State Rules):
- Filter, tab, sort, and `selected` MUST round-trip through URL; refresh on a selected URL must restore the panel.
- Closing the panel clears `selected=` but preserves filters, sort, tab, scroll.
- The Managed System scope switcher writes `managedSystem=` and re-fetches the list; switching does not change the route tree.
- For Developers, `managedSystem=all` resolves to the actor's effective scope union (per ADR-0019 Section D + backend `actor.effective_scope`); for My VOCs, the backend rejects `managed_system_id=all` (`validation.failed`).
- Browser back/forward must restore prior URL state intact.
- Closing the panel during a dirty composer prompts the `<DirtyConfirmation>` modal (per `interaction-patterns.md`).

---

## 3. Component Mapping

Production tree under `apps/frontend/src/features/voc/`. Shared primitives live in `packages/ui/src/` (extracted only after a second feature consumer exists, per `apps/frontend/AGENTS.md`).

### 3.1 Detail / panel scaffolding

| Prototype surface | Production component | shadcn/ui base | Props | State variants |
|---|---|---|---|---|
| `<DetailPanelHeader kind="voc" id … extras>` | `<DetailPanelHeader>` in `packages/ui/src/panel/` (custom — no shadcn equivalent) | none (Tailwind + `lucide-react` for icons) | `kind: 'voc' \| 'finding' \| 'task_request' \| 'task' \| 'milestone' \| 'survey' \| 'cluster'` (7 kinds), `id?: string`, `onClose?: () => void`, `extras?: ReactNode` | One color band per kind, bound to `--surface-card-elevated` + kind-specific accent token (voc uses `--color-aether-blue` accent stripe); fullscreen toggle before close inside the detail slot |
| `<PanelTitleBlock>` | `<PanelTitleBlock>` in `packages/ui/src/panel/` | none | `title: string`, `badges?: ReactNode`, `className?: string`, `size?: 'lg' \| 'xl'` (default `'lg'`) | `size='lg'`: `text-lg font-semibold tracking-tight leading-[1.35]` (prototype `.panel-title`, VOC detail and triage default). `size='xl'`: `text-xl font-bold tracking-tight` (legacy opt-in only). `children` prop does not exist — use `badges` slot. |
| `<NestedTextBlock>` | `<NestedTextBlock>` in `packages/ui/src/panel/` | none | `padding?: number`, `children: ReactNode` | Default only |
| `<FieldRow>` | `<FieldRow>` in `packages/ui/src/panel/` | none | `label: string`, `children: ReactNode` | Default |
| `<PanelSectionTitle>` | `<PanelSectionTitle>` in `packages/ui/src/panel/` | none | `children: ReactNode`, `action?: ReactNode` | Default |
| `<Callout tone icon title action>` | `<Callout>` in `packages/ui/src/panel/` | shadcn `<Alert>` (variant prop replaced by `tone`) | `tone: 'amber' \| 'red' \| 'blue' \| 'cyan' \| 'emerald'`, `icon?: ReactNode`, `title?: string`, `action?: ReactNode`, `children: ReactNode` | 5 tones; each binds a raw color token (amber `--color-amber`, red `--color-warning-red`, blue `--color-aether-blue`, cyan `--color-cyan-spark`, emerald `--color-emerald`) |
| `<DetailPanelHeaderActions entityKind entityId copyHash extraMore?>` | `<DetailPanelHeaderActions>` in `packages/ui/src/panel/` | shadcn `<DropdownMenu>` for kebab, `<Tooltip>` for icon buttons | `entityKind: string` (display name), `entityId: string`, `copyHash: string` (production receives `copyUrl: string` instead), `extraMore?: MoreItem[]` | Copy link and kebab; no expand toggle; "copied" toast state after clipboard write |
| `useFullscreenPanel()` | `useFullscreenPanel()` hook in `apps/frontend/src/lib/panel/` | none | none | `(isFullscreen, toggle)`. Triage's local panel uses it; AppFrame owns detail-slot state. |

### 3.2 List + toolbar

| Prototype surface | Production component | shadcn/ui base | Props | State variants |
|---|---|---|---|---|
| `<VocList>` + `<VocRow>` | `<VocList>` + `<VocRow>` with paperclip + attachment count chip in `features/voc/components/list/` | none (Tailwind grid, `<Checkbox>` from shadcn for row checkbox) | `vocs: VocListItem[]`, `selectedId: string \| null`, `onSelect: (id) => void`, `checked: Set<string>`, `onToggleCheck: (id) => void` | default · hover · selected · checked · permission-limited (row body replaced by `<PermissionBlockedPanel state="summary_visible">`) · skeleton · error. Inbox and My VOC keep the previous page's rows visible and clickable while the next page for a changed tab, filter, sort, search or Managed System loads (`keepPreviousData`); Triage does not. |
| Bulk action bar (inline in `<VocList>`) | internal `BulkActionBar` in `features/voc/components/list/VocList.tsx` | shadcn `<Button>` | `count: number`, `onClear: () => void` | hidden when no row is checked; `담당자 지정` / `심각도 설정` / `Cluster에 추가` / `Finding 생성` render disabled by design (no batch endpoint), only `선택 해제` is wired |
| `<ListToolbar tabs activeTab onTabChange action>` | `<ListToolbar>` in `packages/ui/src/toolbar/` | shadcn `<Tabs>` for tab strip | `tabs: TabDescriptor[]`, `activeTab: string`, `onTabChange`, `action?: ReactNode`, `children?: ReactNode` | default; `action` slot pinned right via `position: sticky` (per Pack 12 wiring rule) |
| `<ListFilterButton categories applied onChange onClear>` | `<ListFilterButton>` in `packages/ui/src/toolbar/` | shadcn `<Popover>` + `<Checkbox>` group | `categories: FilterCategory[]`, `applied: Record<string, Set<string>>`, `onChange: (cat, value, on) => void`, `onClear: () => void` | closed · open · applied (count badge) |
| `<ListSortButton fields value onChange>` | `<ListSortButton>` in `packages/ui/src/toolbar/` | shadcn `<Popover>` + `<RadioGroup>` | `fields: SortField[]`, `value: string` (`'<field>:<asc\|desc>'`), `onChange` | closed · open · sorted (chip on button) |
| `<SearchInput placeholder>` | `<SearchInput>` in `packages/ui/src/forms/` | shadcn `<Input>` + leading icon | `placeholder`, `value?`, `onValueChange?`, `onCommit?` (passing `onValueChange` enables the box; without it the box renders disabled with a tooltip; `onCommit` fires on Enter and on blur in controlled mode) | disabled · default · focus · with-value; Escape clears a non-empty value and never commits. Inbox/My VOCs (#821, #864): Enter or blur writes the URL `q` at once (an unchanged draft writes nothing, and so does a repeat of a draft the URL has not acknowledged yet; an Enter that confirms an IME composition does not commit). Otherwise a 300 ms debounce does (700 ms when the draft ends in a Hangul character, which may still be a half-typed syllable), and `GET /vocs` receives it as `q`. A search covers the whole inbox: starting it drops the active tab, which returns when the search is cleared, and a tab picked during the search narrows it to that tab. |
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

- **Pre-submit same-Managed-System peer panel** — once a Managed System is selected, the right column reads `GET /vocs/pre-submit-peers?managed_system_id=:managedSystemId` and shows up to three authorized peers under `같은 Managed System의 최근 VOC`, as title plus `display_id · relative time`. The panel exposes no count or total. Activating a peer navigates to that existing VOC (`/vocs?view=inbox&selected=:vocId`); it creates neither a new VOC nor a relationship. An empty result is normal. There is no dismiss or confirm action.

| Prototype surface | Production component | shadcn/ui base | Props | State variants |
|---|---|---|---|---|
| `<PageShell>` | `<PageShell>` in `packages/ui/src/layout/` | none | `header?: ShellHeaderProps` (`title?`, `subtitle?`, `actions?`, `variant?`), `children`, `detailPanel?`, `fluid?`, `className?`, `contentClassName?` | default |
| `<FieldLabel required tip>` | `<FieldLabel>` in `packages/ui/src/forms/` | shadcn `<Label>` + `<Tooltip>` (for `tip`) | `required?: boolean`, `tip?: string`, `children: ReactNode` | required · with-tip · default |
| Managed System chip selector | `<ManagedSystemPicker>` in `packages/ui/src/components/ManagedSystemPicker.tsx` (already named in `component-inventory.md`) | shadcn `<ToggleGroup>` (chip style) | `value: string`, `onChange`, `options: ManagedSystemRef[]`, `disabled?: string[]` (MSs the actor cannot submit to) | default · disabled-chip (hover tooltip with reason) |
| Analytics Area chip selector | `<AnalyticsAreaPicker>` in `packages/ui/src/components/AnalyticsAreaPicker.tsx` | shadcn `<ToggleGroup>` | `managedSystemId: string`, `value: string \| null`, `onChange`, `allowEmpty: true` (defaults to true; user may pick 없음) | default · empty-list (helper text) |
| Source segmented control | `<SourceContextSegmented>` in `features/voc/components/create/` | shadcn `<RadioGroup appearance="segmented">` | `value: SourceContext`, `onChange`, `labelId`, `disabled?` | radiogroup named `출처` with 4 labeled radio options; no proxy sub-fields (Proxy Report adds no extra row) |
| Dropzone + file list | `<AttachmentDropzone>` (with an internal `AttachmentRow`) in `features/voc/components/create/` | none (HTML5 drag/drop + shadcn `<Card>` for rows) | `attachments: PendingAttachment[]`, `onAdd`, `onRemove`, `maxBytes: 25 * 1024 * 1024` (per file), `accept?: string[]` | empty · drag-over · with-files · over-limit (row-level error) |
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
| `<InternalTaskBadge status>` | `<InternalTaskBadge>` in `packages/ui/src/badges/` | shadcn `<Badge>` (squared variant — `rounded-sm`) | `status: InternalTaskStatus` (7 enum values) | 7 base tints via `--status-internal-*` with AA-safe label text via `--status-internal-*-label`; **always squared** — never inherits reporter pill tokens |
| `<SeverityBadge severity>` | `<SeverityBadge>` in `packages/ui/src/badges/` | shadcn `<Badge>` (compact chip + `<SeverityIndicator>` bar prefix) | `severity: Severity` (4 enum) | 4 colors via `--severity-*` |
| `<ManagedSystemPill id>` | `<ManagedSystemPill>` in `packages/ui/src/badges/` | shadcn `<Badge>` (variant outline + 6px round color dot) | `id: string` (resolves to `{ name, color, mark }` via `useManagedSystem(id)`) | 4 MSs in MVP fixtures; unknown id renders muted "Unknown MS" |
| `<OutlineBadge>` | `<OutlineBadge>` in `packages/ui/src/badges/` | shadcn `<Badge variant="outline">` | `children`, `color?` | default |
| `<EntityIconBadge type size>` | `<EntityIconBadge>` in `packages/ui/src/badges/` | none | `type: 'voc' \| 'finding' \| 'task' \| 'request' \| 'evidence' \| 'survey' \| 'outcome'`, `size?: number` | 7 letter glyphs |

### 3.7 Permission, linking, hover preview

| Prototype surface | Production component | shadcn/ui base | Props | State variants |
|---|---|---|---|---|
| `<PermissionBlockedPanel state category reason requiredScope summary>` | `<PermissionBlockedPanel>` in `packages/ui/src/permissions/` | shadcn `<Alert>` (custom layout) | `state: 'request_access' \| 'summary_visible' \| 'denied' \| 'blocked_not_requestable'`, `category: string`, `reason?: string`, `requiredScope?: string[]`, `summary?: ReactNode`, `decisionId?: string`, `evaluatedAt?: string`, `onRequestAccess?: () => void` | 4 state variants. `request_access` shows CTA into the permission-request creation flow; administrator review deep links use `/admin/permissions/requests?tab=…&selected=…` only (the strict search schema rejects `action`, `capability`, `scope`, and `source_entity`). `summary_visible` renders `summary` slot. `denied` is read-only. `blocked_not_requestable` hides CTA entirely. |
| `<EntityHoverPreview type id blocked>` | `<EntityHoverPreview>` in `packages/ui/src/hover/` (미구현 설계) | shadcn `<HoverCard>` | `type: 'voc' \| 'finding' \| 'task' \| 'evidence' \| 'request'`, `id: string`, `blocked?: PermissionDecision \| null`, `children: ReactNode` | resolved (id · title · status · MS · owner · jump) · blocked (renders compact `<PermissionBlockedPanel state="summary_visible">`) · loading (skeleton) · error |
| `<EntityRelationRow link compact? className? testId?>` | `<EntityRelationRow>` in `apps/frontend/src/features/integration/components/EntityRelationRow.tsx` (Integration-owned; VOC detail uses `<LinkedEntityTrail>` instead) | none | `link: EntityLinkDto`, `compact?: boolean`, `className?: string`, `testId?: string` | allowed (source → relation → target) · restricted (`권한 제한` lock chip) |
| `<LinkedEntityTrail nodes selectedKey onNodeClick>` | `<LinkedEntityTrail>` in `packages/ui/src/entity/` | none | `nodes: TrailNode[]`, `selectedKey?: string`, `onNodeClick?` | default · selected-node · placeholder-node (dashed) · blocked-node (shield icon). In VOC detail, `LinkedEntityTrailSection` consumes `voc.links`; a Reporter renders a Task only from the `summary_visible.summary` payload (`public_title`, projected `reporter_facing_status`, and present optional public fields). `allowed` Task DTOs render only for explicit Admin/Developer identities; unknown and User identities fail closed. `hidden` renders nothing; `denied` uses a minimal acknowledged blocked surface. |
| `<UserChip user size sub>` | `<UserChip>` in `packages/ui/src/identity/` | none (Tailwind + `<Avatar>`) | `user: ActorRef`, `size?: 'sm' \| 'md'`, `sub?: string` | default · unknown (renders "Unknown") |
| `<UserAvatar user size>` | `<UserAvatar>` in `packages/ui/src/identity/` | shadcn `<Avatar>` | `user: { display_name: string }`, `size?: 'sm' \| 'md' \| 'lg'` | initials only (no image URL) |

### 3.8 Command palette (⌘K)

Shipped in #611 as `CommandPalette` (`apps/frontend/src/lib/layout/command-palette/`: `CommandPalette.tsx`, `commands.tsx`, `platform.ts`), hosted by `AppFrame`. See §5.2.

### 3.9 Form primitives (already in `packages/ui` per inventory)

`<Button>`, `<Input>`, `<Textarea>`, `<Select>`, `<Combobox>`, `<Checkbox>`, `<RadioGroup>`, `<Tooltip>`, `<Popover>`, `<Dialog>`, `<Sheet>` (the drawer), `<Skeleton>`, and `sonner` for toasts (`<Toaster>` is mounted in `apps/frontend/src/routes/__root.tsx`). Use these directly — do not re-wrap.

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
| `createdAt` (`'2시간 전'`) | `created_at: timestamp` (ISO 8601) | `createdAt: string` | Format via `formatRelativeTime(createdAt)` from `@/lib/format/datetime`. |
| n/a | `updated_at: timestamp` | `updatedAt: string` | Used as `If-Match`-equivalent for optimistic concurrency (see §5 Triage flow + ADR-0019). |
| `similarCount` | `similar_count: integer` (from VOC list/detail responses) | `similarCount: number` | Authorized active peer total in the same workspace and primary Managed System. Retain the DTO field, but do not render it as a per-row list signal; detail and triage copy names the same-Managed-System peers. |
| `linkedFindingId`, `linkedTaskId` | derived from `entity_links` per `docs/implementation/06-entity-linking-contract.md` | `links?: EntityLinkDto[]` on `GET /vocs/:id` | VOC detail consumes the backend-projected `links` read DTO already included in its detail response; it does not issue a separate entity-links request. Reporter-facing Task UI must never synthesize a summary from an `allowed` DTO. |
| `sourceContext` (display string) | `source_context: enum(direct_use\|proxy_report\|operational_discovery\|stakeholder_request)` | `sourceContext: SourceContext` | Prototype uses display strings (`'Direct Use'`); production stores the enum and renders the inline `LABELS` map in `apps/frontend/src/features/voc/components/create/SourceContextSegmented.tsx`. |
| `nextAction` (single string) | `next_actions: NextAction[]` per `docs/implementation/api/next-actions.md` §Next Action Contract | `nextActions: NextAction[]` | Render the highest-priority `available` action in the sticky footer; surface the rest in `<DetailPanelHeaderActions>` More menu. Frontend MUST NOT infer eligibility. |
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

Each entry is append-only (per `docs/implementation/api/voc.md` §VOC Create And Conversation Contract).

| Field | Type | Notes |
|---|---|---|
| `id: uuid` | required | |
| `voc_id: uuid` | required | |
| `actor_id: uuid` | required | author |
| `body_rich_content: TipTapDoc` (jsonb) | required | sanitized server-side per ADR-0011 |
| `created_at: timestamp` | required | |
| `visibility: enum('public_update' \| 'reporter_reply' \| 'internal_comment')` | required | also implicit from endpoint, but persisted for unified `conversation_timeline` queries |
| (public_updates only) `reporter_facing_status_before: enum`, `reporter_facing_status_after: enum`, `skip_public_update: bool`, `skip_reason: text \| null` | per status-change paired-write rule (`docs/implementation/api/voc.md` §VOC Create And Conversation Contract (`skip_public_update`)) | |

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

Per-file limit: **25 MB** in the prototype Create form, **50 MB** in the RichEditor footer copy. Spec aligns to **25 MB per file** as the binding limit (the larger number is prototype copy drift). Production limit lives in ADR-0011 derivative.

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
| Inbox (`/vocs?view=inbox`) | `severity` (low/medium/high/critical), `reporterStatus` (8 states), `owner` (assigned / unassigned) | `created_at` and `severity` (asc/desc), `reporter_facing_status` (asc) | `filter.severity=high,critical`, `filter.reporterStatus=received`, `filter.owner=unassigned`, `sort=severity:asc` |
| Triage (`/vocs?view=triage`) | inline filter on the toolbar mirrors Inbox categories; **no Sort popover** — queue is sorted server-side as `unassigned first → severity desc → created asc` | n/a | `tab=unassigned\|untriaged\|high\|waiting` (default `unassigned`; `untriaged` excludes postponed VOCs, which are in `waiting`; postponed VOCs stay in `미배정`/`높음` with a `보류` marker); tab change writes URL and drops `selected` (#922 clears the #383 deep-link pin — a pinned VOC must not union into every tab's list) |
| My (`/vocs?view=my`) | `reporterStatus` only | `createdAt`, `reporterStatus` | same shape as Inbox |

**Multi-value encoding:** comma-separated in URL (`filter.severity=high,critical`); parsed back into `Set<string>` in component state.

**Group by:** **NOT supported on VOC surfaces in Slice 3** (group-by lives on Tasks board). State explicitly that the prototype Sort button is single-axis Sort only.

### 5.2 Command palette (Ctrl+K / ⌘K)

The shortcut is Ctrl+K on Windows/Linux and ⌘K on macOS.

> Shipped in #611 (`apps/frontend/src/lib/layout/command-palette/`, not `features/voc/command-catalog.ts`): the navigate commands (`이동`) are derived generically from `RAIL_ITEMS` + `NAV_TREE` (no per-domain catalog), `VOC 생성` (`/vocs?action=create`) is the only create verb, and display-id open (`열기`) resolves on demand via `GET /nav/resolve`, whose `route_intent: { route, search }` uses `selected` for VOC and Finding and the `/tasks` `param` for Task Request and Task (`view=requests` or `view=board`). Managed System scope switching and recent-record rows are out of scope for the first version, and the palette does not synthesize commands the backend does not resolve. See `docs/frontend/routes-and-layout.md` → Global command palette (#611).

### 5.3 Optimistic mutation + undo (Triage Console)

Mirrors prototype `screen-voc-create.jsx · TriageScreen.handleAct`.

1. User clicks `Triage 확정 & 다음 VOC` (or `Finding 만들기` / `보류`).
2. Frontend computes `next` row and selects it. Confirm/Finding removes the acted-on VOC from the local visible queue. `보류` removes it only on `미분류` (`untriaged`); all other tabs retain it with an optimistic postponed state (`review_postponed_at !== null`). The `보류` row meta-tag appears outside `waiting`, whose tab name already announces that state. Row meta is linked as the accessible description. Undo clears that marker; forward failure restores the original marker and selects the failed VOC. The optimistic exclusion belongs only to that queue context (tab and Managed System scope only; row selection and the deep-link pin do not expire exclusions). It expires when the context changes or a successful, settled queue read no longer includes the VOC; pending/error reads do not expire it. Undo and error restoration still use the original VOC ID. The screen and toolbar remain mounted across tab changes.
3. Toast (`<UndoToast>`) appears with `실행 취소` action and 4-second auto-dismiss.
4. Mutation fires: `PATCH /vocs/:id` with the triage payload, `Idempotency-Key: <uuidv4>` header (per ADR-0015).
5. **On success:** toast remains until timeout; increment the mounted screen session's processed-count independently of exclusions and invalidate `['vocs', 'triage']` list queries alongside navigation counts. Tab, scope, selection, and settled reads do not reset the counter.
6. **On failure:** dismiss that command's optimistic success toast; on `409 conflict.stale_write`, invalidate the triage list queries to refresh the next command's `If-Match`. For a command still eligible for lifecycle error handling, rollback local state (re-insert VOC), select the failed VOC, preserve user-entered values in the panel, toast with `tone: 'danger'`, show retry. A late failure of an undone or preempted command does not change selection or run this rollback/error UI. Error body parsed per ADR-0012 (`code`, `message`, optional `requestable_permission`).
   A forward archived failure (`conflict.record_archived` / `conflict.parent_archived`) excludes a marked row, discards its marker override, and invalidates the lists; an already removed row stays excluded; an archived failure does not reselect the archived VOC. `conflict.idempotency_key_reuse` discards a mark override and invalidates the lists while retaining the panel lock and any removal exclusion. A late forward failure after undo or preemption only discards the marker override, using the original command's VOC ID.
7. **On undo:** the forward PATCH is never aborted, because an abort cannot un-send a request.
   - **Undo while the forward PATCH is in flight:** restore the local optimistic state at once. Never abort the request. Compensate if it succeeds; nothing to compensate if it fails.
   - **Undo after it settled:** send the compensating PATCH first, then restore when it succeeds.
   Undo invalidates the triage list queries, and successful compensation invalidates them again after restoring the original ID. Successful compensation decrements the session counter once; undo before success is never counted.
   Failed compensation (detail refetch failure or compensating PATCH rejection) discards the marker override and invalidates the triage lists so the server decides the marker. Exclusions are unchanged: undo after settle keeps its exclusion until the existing context/settled-read expiry rules retire it; in-flight undo or preemption already restored the row, so server reads decide visibility without a new exclusion. Existing failure toasts fire once.
   Once a command's lifecycle has ended (forward failure, compensation success or failure), no local override for that VOC outlives the next settled server read.
   The compensating PATCH keeps the prior values, uses the forward response's `updated_at` as `If-Match`, and uses a fresh `Idempotency-Key`.

**Idempotency key rules** (per ADR-0015 §Idempotency):
- One key per logical user-intent batch. Generating a fresh key on undo prevents the dedupe layer from returning the cached confirm response when the user intends a different write.
- Keys are UUIDv4, client-generated, 24-hour TTL server-side.
- Same key with different payload → `409 conflict.idempotency_key_reuse` (per ADR-0012 / ADR-0015) → display "다시 시도해 주세요" toast.

### 5.4 Detail panel header actions

`<DetailPanelHeaderActions>` provides:

| Affordance | Action | Production wiring |
|---|---|---|
| Copy link | Copies `window.location.origin + /vocs?view=inbox&selected=<id>` to clipboard, toasts "링크가 복사되었습니다" | `navigator.clipboard.writeText` |
| Expand | `DetailPanelHeader` owns the toggle for every detail-slot drawer; Triage uses a local toggle. An expanded panel is a centred 60rem reading column with bordered gutters, in both the detail slot and Triage. Esc collapses unless already handled; closing the panel and changing route collapse it. | AppFrame owns detail-slot state; Triage uses `useFullscreenPanel()` |
| Kebab → Mark read | `PATCH /vocs/:id/read-state` (TBD endpoint, S3-008 follow-up) | If not in Slice 3 backend, render the menu item with `disabledReason: 'Slice 3+에 출시 예정'` |
| Kebab → Snooze | TBD endpoint | same |
| Kebab → Subscribe / Unsubscribe | TBD (notifications, ADR-0014) | same |
| Kebab → Archive | TBD (per Slice 2 archive policy in ADR-0019 Section A; archived VOCs are immutable) | Show confirmation dialog citing immutability |

For Slice 3, only Copy link lands from `<DetailPanelHeaderActions>`. The kebab menu items render but are disabled with the backend-provided reason (per `interaction-patterns.md` "Permission-blocked commands can appear disabled with reason").

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

`<PermissionBlockedPanel state="request_access">` renders its CTA only when the caller supplies `onRequestAccess`. Where it is wired (for example the Inbox list 403 that carries `requestable_permission`), the CTA opens the request-access dialog (`RequestAccessButton`: required reason, optional expiration, `POST /permission-requests`). The Admin route's strict search schema accepts only `tab` and `selected`.

Production adapter (`apps/frontend/src/lib/cross-system/getPermissionDecision.ts`; returns `null` for a missing key or a schema failure):

```ts
function getPermissionDecision(
  entity: { permission_decisions?: Record<string, unknown> | null } | null | undefined,
  key: string
): PermissionDecisionView | null;
```

### 5.7 RichEditor per-surface contract

| Surface | Allowed toolbar actions | Footer hint | Surface warning |
|---|---|---|---|
| `voc-description` | Bold, Italic, Underline, Code, List, Link, Attach | "본인이 직접 겪은 일을 기준으로 적어주세요. 첨부 파일은 25 MB 이하." | none |
| `reporter-reply` | Bold, Italic, Link, Attach | "공개 타임라인에 기록되며 리포터에게 알림이 발송됩니다." | "리포터에게 보이는 메시지입니다. 내부 도구/티켓 ID는 노출하지 않는 게 안전합니다." |
| `public-update` | Bold, Italic, List | "Reporter-facing status가 변경됩니다. 공개 안전한 표현인지 한 번 더 확인하세요." | "리포터에게 노출됩니다. 첨부 · 외부 링크 · @멘션은 사용할 수 없습니다." |
| `internal-comment` | Bold, Italic, Code, List, Link, @Mention, Attach | "팀원에게만 보입니다. 코드 블록 · @멘션을 자유롭게 사용하세요." | none |

Backend sanitization is authoritative (ADR-0011): the editor enforces the toolbar allowlist client-side as UX guidance only. The server rejects nodes/marks outside the surface allowlist with `code: 'rich_content.disallowed_node'` (added to ADR-0012 in Slice 3 #13). Attribute failures use first-class codes: `rich_content.disallowed_attr` for unknown attr keys, `rich_content.invalid_attr_value` for schema failures, and `rich_content.missing_required_attr` for absent required attrs. The shared allowlist contract also declares atomic `leafNodes`; `attachmentRef` and `mention` must be rejected with `rich_content.disallowed_node` when they carry non-empty `content[]`. FE/BE parity is pinned by the canonical corpus in `packages/shared/src/rich-content/fixtures.ts`; backend tests consume it directly, while `@fops/ui` keeps a local mirror (`scripts/check-boundaries.mjs` forbids `packages/ui` from importing `@fops/shared`) plus drift/sanitize-on-render tests.

The canonical surface → rich-editor extension capability map lives in `packages/shared/src/rich-content/allowlist.ts`. `apps/backend/src/lib/rich-content/surface-allowlists.ts` may re-export it, while `packages/ui/src/rich-content/allowlist-local.ts` mirrors it locally because `scripts/check-boundaries.mjs` forbids `@fops/ui` from importing `@fops/shared`.

Attachment uploads from inside the editor and from the Create form dropzone share the same backend interface (per ADR-0011 §Inline Attachments). The frontend abstraction: `useAttachmentUpload({ vocId?: string, scope: 'voc' | 'comment' })`.

### 5.8 Dirty-save patterns

- **Create form:** unsaved changes prompt `<DirtyConfirmation>` on navigate-away (browser back, sidebar nav click, ⌘K navigation). Save Draft button (prototype copy "초안 저장") is not built; the production form has none.
- **Detail panel composers:** dirty state per surface (public / reply / internal). Switching tabs preserves each surface's draft in component state (per prototype `key={composerTab}` reset rule — production keeps drafts in a `useReducer` keyed by `(vocId, surface)`). Closing the panel with any dirty composer prompts `<DirtyConfirmation>`.
- **Triage panel:** dirty when severity / owner / area / clusterAction differ from the loaded VOC. Confirm-and-next button is disabled until dirty.

### 5.9 Drag / drop

**None in VOC scope.** Tasks board owns DnD. The Create form attachment dropzone is HTML5 drag/drop for file ingest only — not list reordering.

### 5.10 Reporter-facing status change (Public Update tab)

Per `<ReporterStatusChangeBlock>` (Pack 8):

1. Block appears only on the `public` composer tab.
2. Status picker is a `<Select>` listing **current first, then allowed transitions, then forbidden transitions (disabled with `· 차단됨` suffix)**. Allowed set comes from `voc.next_reporter_states.allowed`.
3. Non-allowed options are `disabled`, and the staged status is initialised to the current status, so the only way the staged status becomes non-allowed is that **another actor moved the VOC and the detail query refetched underneath the selection**. The staged status is deliberately **not** resynced on refetch — resyncing would silently drop the user's choice while the body draft survives, leaving them to publish believing the status change went with it. Instead a red `<Callout>` states that the current status changed, names both statuses, and tells the user to pick again; `voc.next_reporter_states.forbidden[next]` is appended as the concrete rule when the pair is listed at all (most pairs are absent from the matrix). **Publish is disabled while the staged status is non-allowed** — before #356 only the inline Callout fired and submit went through, and the server rejected it with an opaque `validation.failed` toast.
4. If `voc.reporter_status_gate` blocks the staged status (e.g. linked Task not yet released), an amber `<Callout>` renders with an "Open task" CTA. **Publish button is disabled while the gate is active.**
5. Reporter preview card mirrors the reporter inbox row: VOC id · new `<ReporterStatusBadge>` · 업데이트 chip · title · owner attribution · sanitized body excerpt · public-safe footer reminder.
6. On Publish: `POST /vocs/:id/public-updates` with body `{ body_rich_content, next_reporter_facing_status, skip_public_update: false }`. **Status change and Public Update body are paired in one request** per ADR-0019 / API contract (atomic; one audit row each for `public_update_created` + `reporter_facing_status_changed`).
7. The API also accepts the skip path `{ skip_public_update: true, skip_reason: <text>, next_reporter_facing_status }`, but the composer offers no skip toggle: `PublicUpdateComposer` always sends `skip_public_update: false`.

### 5.11 Triage flow

| Step | Action | Endpoint |
|---|---|---|
| Severity decide | Click chip in `<SeverityPicker>` → local dirty state | none yet |
| Owner assign | Click `<OwnerPicker>` row → local dirty | none yet |
| AA link | Click `<AnalyticsAreaPicker>` chip → local dirty | none yet |
| Cluster confirm/dismiss | Per-candidate actions in the `유사 VOC 추천` section (ADR-0034); not part of the triage PATCH | `POST /vocs/:id/recommendations/:candidate_id/confirm` · `…/dismiss` |
| Triage 확정 & 다음 VOC | Atomic `PATCH /vocs/:id` with `{ severity, owner_user_id, owner_team_id, analytics_area_id, triage_state: 'triaged' }` + Idempotency-Key + `If-Match: <updated_at>` | `PATCH /vocs/:id` (backend service must apply `SELECT … FOR UPDATE` on the VOC row per ADR-0019 Section E pattern extended to VOC — see S3-002) |
| Finding 만들기 | Same triage commit, then opens the Finding create flow (ADR-0024) | `PATCH /vocs/:id`, then `POST /vocs/:id/create-finding` |
| 보류 | Triage state stays `untriaged`; sends `{ postpone_review: true }` and the backend sets `triage_state_review_postponed_at` (valid only while `untriaged`). The action is disabled with a reason when the VOC is not `untriaged` or is already postponed; `422 invalid_state` on `postpone_review` shows the specific state reason | `PATCH /vocs/:id` |
| 보류 취소 | Triage 보류를 취소하며 `{ postpone_review: false }`만 보냅니다. 보류된 `untriaged` VOC의 `triage_state_review_postponed_at`를 비우고, 보류되지 않은 VOC에서는 no-op입니다. `postpone_review`는 `true`와 `false` 모두 `triage_state`와 함께 보낼 수 없습니다. 자세한 조건은 [API 계약](../../implementation/api/voc.md) 참조 | `PATCH /vocs/:id` |

**Audit events emitted by backend** (consumed by Activity sections, frontend never invents these names):
- `voc_created`
- `voc_triage_committed` (severity / owner / AA)
- `voc_triage_postponed` (보류)
- `voc_triage_postpone_cleared` (보류 취소)
- `voc_owner_assigned`
- `voc_severity_set`
- `voc_analytics_area_linked`
- `public_update_created` + `reporter_facing_status_changed` (paired when status changes)
- `reporter_reply_created`
- `internal_comment_created`

Full event vocab lives in backend audit module; this spec lists VOC-touching names so reviewers can validate Activity tab copy.

---

## 6. Visual Contract

There is no `tailwind.config.ts` any more: since ADR-0058 the Tailwind theme is the CSS-first `packages/ui/src/styles/theme.css` (v4 `@theme inline` aliasing the token variables). **CSS custom property names from `docs/design-prototype/styles.css` port verbatim** (values follow ADR-0021 light-only); the theme exposes them as kebab-case utility keys.

Values: `packages/ui/src/styles/tokens.css` and `docs/frontend/tokens.md` (ADR-0021 light-only).

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

---

## 7. Permission Envelope Mapping

Backend `permission_decision` envelope (per `docs/implementation/05-permission-policy.md` §3 + ADR-0019 Section D for the `'managed_system_scope'` decision variant) attaches to each linked-object reference and is keyed on the relationship name.

VOC reads the following keys:

| Key | Where attached | Frontend surface | Hook |
|---|---|---|---|
| `linkedFinding` | `GET /vocs/:id` envelope: `permission_decisions.linkedFinding` | Detail panel `Linked Finding` section + trail node + `Open finding` footer button (changes copy to `Request Finding access`) | `getPermissionDecision(voc, 'linkedFinding')` |
| `execution` | (not on VOC envelope — lives on Finding) | n/a here — cross-spec reference only | n/a |
| `linkedVoc` | (not on VOC envelope — lives on Task) | n/a here — cross-spec reference only | n/a |
| `source` | (not on VOC envelope — lives on Evidence) | n/a here — cross-spec reference only | n/a |

**Decision lifecycle:**

```text
1. Frontend renders VOC detail.
2. getPermissionDecision returns the parsed decision, or `null`.
3. If state === 'request_access': render the panel; its CTA appears only when the caller supplies `onRequestAccess`, and opens the request-access dialog (`RequestAccessButton`).
4. If state === 'summary_visible': render the safe summary slot.
5. If state === 'denied' or 'blocked_not_requestable': render copy, no CTA.
6. Below the panel, always render the audit footer:
   `<Icon name="shield" /> Decision <code>{decisionId}</code> · evaluated {formatRelative(evaluatedAt)}`
```

The `decisionId` + `evaluatedAt` line is **mandatory** per Pack 8: reviewers correlate the visible block with the audit log row.

---

## 8. API Mapping

Endpoint contracts (request and response bodies, error codes, permissions, audit events) are owned by `docs/implementation/api/voc.md`; the request and response schemas are the Zod schemas in `packages/shared/src/vocs/`. This section keeps only what is specific to the frontend. All request bodies are snake_case JSON and all non-2xx responses follow the ADR-0012 error envelope.

| Endpoint | Contract |
|---|---|
| `POST /vocs` | `docs/implementation/api/voc.md` → VOC Create And Conversation Contract |
| `GET /vocs` | `docs/implementation/api/voc.md` → VOC (endpoint list); query schema `packages/shared/src/vocs/list-query.ts` |
| `GET /vocs/:id`, `GET /vocs/:id/conversation` | `docs/implementation/api/voc.md` → VOC (endpoint list); response schema `packages/shared/src/vocs/detail.ts` |
| `PATCH /vocs/:id` | `docs/implementation/api/voc.md` → VOC (endpoint list); request schema `packages/shared/src/vocs/patch-request.ts`; `If-Match` rule in `docs/implementation/03-api-contracts.md` |
| `POST /vocs/:id/public-updates`, `POST /vocs/:id/reporter-replies`, `POST /vocs/:id/internal-comments` | `docs/implementation/api/voc.md` → VOC Create And Conversation Contract (VOC conversation endpoints) |

### 8.1 Frontend-specific notes

- **Idempotency-Key per mutation.** `apiRequest` (`apps/frontend/src/lib/api/client.ts`) mints a UUIDv4 `Idempotency-Key` for every POST, PATCH, and DELETE unless the caller passes one; the triage undo's compensating PATCH passes a fresh key (§5.3). One key per logical user intent (ADR-0015).
- **Query key shape.** `GET /vocs` uses `['vocs', view, managedSystemId, tab, filters, sort, cursor, pinVocId]`; `pinVocId` is part of the key so two deep links differing only by target cannot share a cached queue.
- **Triage deep link.** The detail panel's `트리아지에서 변경` link opens `/vocs?view=triage&selected=:vocId`; `TriageRoute` forwards `selected` to `GET /vocs` as `pin_voc_id` (#383), which unions that one in-scope VOC into the triage queue even though the triage predicate excludes it. An out-of-scope or unknown id is dropped silently with 200; the missing-target notice (`요청한 VOC를 이 대기열에서 찾을 수 없습니다.`) is suppressed until the queue request settles (#922) — an uncached deep link mounts with a pending queue and empty items, which is not yet evidence the target is missing.
- **`out_of_scope_summary`.** `GET /vocs` may return `out_of_scope_summary: { count, severity_distribution }`; it powers the Triage `<PermissionBlockedPanel state="summary_visible">` peek banner.
- **Conversation pagination.** The conversation infinite-query hook issues its first `GET /vocs/:id/conversation` without a `cursor`; later pages carry the cursor returned by the previous page.

### 8.2 Headers, rate limit, error rendering

- A `429` envelope's `detail.retry_after_seconds` is what the toast renders, via `formatRetryAfter` in `apps/frontend/src/lib/copy/rate-limit.ts`. A finite number greater than 0 and below 60 is shown as `{n}초`; 60 or above is rounded up to whole minutes (`{ceil(n / 60)}분`). The actor message is `요청이 너무 많습니다. {wait} 후 다시 시도해 주세요.` with that wait, or `요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.` when the value is missing, not a finite number, or not positive. The `Retry-After` header is parsed in `apps/frontend/src/lib/api/client.ts` and is not an input to this copy.
- `apps/frontend/src/lib/api/errorMapper.ts`'s `CATALOG` owns user-facing copy for most codes, keyed on `code`. The Triage mutation policy (`apps/frontend/src/features/voc/lib/triage-error-policy.ts`) classifies its own errors and uses the same rate-limit copy. The frontend **never** displays the raw English `message` field.
- `requestable_permission` (present on `permission.*` codes when safe) is forwarded into `<PermissionBlockedPanel state="request_access">` props automatically.

---

## 9. Acceptance Evidence Per Route

Per HANDOFF §5 P0/P1 reproduction criteria.

| Route | Curated screenshot | P0 (must match) | P1 (should match) |
|---|---|---|---|
| `/vocs?view=inbox&selected=<id>` | `docs/design-prototype/screenshots/final-baselines/voc-inbox-detail.png` (full-page: `voc-inbox-detail-full.png`) | Reporter pill vs internal squared badge separation; 60px default row height; sticky `+ New VOC` action in toolbar; 3-tab composer; sticky next-action footer; entity trail action panel | Detail panel rhythm matches screenshot; Linked execution section sits above abstract trail; Compose tabs are visually distinct (megaphone icon for public) |
| `/vocs?view=triage&selected=<id>` | `docs/design-prototype/screenshots/final-baselines/voc-triage-console.png` | Expanded 96px rows; severity color bar; "Owner 없음" / "Area 미지정" red/amber meta tags; out-of-scope summary peek banner; 4-second undo toast bottom-center; "큐가 비었습니다 · 모든 VOC를 Triage 처리했습니다" whole-queue empty state only when the queue total is a known 0, tab-scoped "이 탭에 해당하는 VOC가 없습니다" empty state otherwise | Severity picker uses 4 chips with helper tooltips; Triage 결과 미리보기 card mirrors the screenshot's labels |
| `/vocs?action=create` | `docs/design-prototype/screenshots/final-baselines/voc-new.png` | Two-column form (1fr + 320px sidebar); compact `<FieldLabel>` style; MS chip strip; AA chips disabled when MS unselected; HTML5 dropzone with 25 MB hint; bottom action bar with "VOC 제출" disabled until valid | Reporter card + same-Managed-System peer card + severity-disclaimer card in sidebar; Source segmented control (no proxy sub-fields are built) |
| `/vocs?view=my&selected=<id>` | reuse inbox baseline | Same as inbox but with `reporter_id=me` filter applied | Empty state copy differs ("내가 제출한 VOC가 없습니다") |

**Acceptance use** (per HANDOFF §5): for clean-room implementation, compare against the screenshots only after the source docs are followed; never let the implementation regress from the contract because the screenshot is missing.

---

## 10. What This Spec Does Not Cover

| Topic | Where it lives |
|---|---|
| VOC Cluster CRUD, cluster detail panel | Shipped — ADR-0020 / ADR-0031 + `apps/frontend/src/routes/_authed/voc-clusters/` |
| Finding create flow from VOC (`POST /vocs/:id/create-finding`) | Shipped in Slice 5 — ADR-0024 |
| Task Request from VOC (`POST /vocs/:id/request-task`) | Shipped in Slice 6 — ADR-0028 |
| Entity Links create UI, bulk-detach | Shipped in Slice 4 — ADR-0023 |
| Attachment upload backend (storage abstraction wiring, virus scan policy) | ADR-0011 implementation |
| Mobile / tablet layouts | Deferred per HANDOFF §11 |
| Notifications (subscribe / unsubscribe on kebab menu) | Not built — ADR-0014 derivative |
| VOC read-state, snooze, archive | Not built; menu items render disabled |
| Saved list views | Shipped as sidebar saved views (`apps/frontend/src/lib/api/saved-views.ts`, `docs/implementation/api/saved-views.md`); `/vocs?view=list` is not a route |
| Draft VOC ("초안 저장") | Not built |
