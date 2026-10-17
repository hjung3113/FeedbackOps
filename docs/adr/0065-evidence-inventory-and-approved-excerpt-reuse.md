# ADR-0065: Evidence inventory and approved Survey excerpt reuse

## Status

Accepted 2026-10-13 by the owner (MVP close-out decisions); implemented.

The Evidence inventory and approved Survey excerpt reuse described below shipped
through #739/#740, #816, #1040, #1107 and #1109. The original implementation
breakdown is retained as history; it is not pending work.

Builds on [ADR-0064](0064-survey-provenance-read-boundary.md), especially
Implementation issues 3 (#816) and 4 (Integration Evidence). That ADR owns
protected provenance, source/target permission semantics, linked versus result
privacy audiences, withdrawal, locking, safe reuse and the accepted threat-model
limit. This ADR adds retrieval/composition and picker interaction contracts;
it neither repeats that cutover nor creates another provenance boundary.

## Context

Every stored Evidence Highlight belongs to one Finding. A Developer remembering
an observation should be able to find the saved fragment without knowing its
Finding UUID, preview it, and reach the Finding where judgment and execution
belong. The existing nested highlight read requires knowing the Finding first.
The Survey branch of Finding's Add Evidence form currently asks for a response
UUID and editable quote that the generic backend attachment rejects.

## Decision

### Product scope and ownership

Evidence is a read-only search inventory of highlights stored on readable
Findings, with one item per highlight. It is not an ingestion inbox or a new
standalone Evidence model. Two snapshots of one approved excerpt may remain
separate items. No Evidence table, lifecycle, `EH-` display-ID stream, new
capability, synthetic execution link or Unlinked tab is introduced.

Findings owns `GET /evidence-highlights`, selected-item read and the attachment
application transaction. Survey supplies its ADR-0064 authorized projection and
#816 eligibility/binding seams. Entity Links retains canonical lineage ownership.
Integration owns frontend route composition only. Shared strict wire schemas
belong in `packages/shared`; frontend clients use `apiRequest` response parsing.
This assigns the backend owner left open in ADR-0064; it creates no Integration
backend module and permits no foreign repository/private-table reads.

### Inventory read contract

The detailed wire contract is in `docs/implementation/api/findings.md`.

- Proposed/new `GET /evidence-highlights` accepts strict optional
  `managed_system_id` (UUID or `all`), `source_type` (`voc|survey_response|note`),
  `q` (trimmed literal text, at most 200 characters), opaque `cursor`, and
  integer `limit` (1..100, default 50). Omitted/`all` scope is the actor's
  effective scope union, workspace-wide only where Admin is authorized.
- Proposed/new `GET /evidence-highlights/:id` resolves a selected local highlight
  directly, including when absent from loaded pages. Both reads require an
  authenticated workspace Actor and the elevated canonical Finding read seam:
  Admin or authorized Developer. User/Reporter is blocked even with an explicit
  Finding grant. Exclude unreadable parent Findings entirely.
- A readable Finding with an unreadable/revoked source may retain only safe
  local highlight/classification metadata and `content_state='withheld'`.
  Notes retain authored text; VOC source checks remain unchanged. Survey reads
  use ADR-0064's existing attached-highlight audience, not picker suppression.
- Apply workspace/role/parent scope, current source access and exact approval
  eligibility **before** matching, order, pagination or continuation decisions.
  Match case-insensitive literal text only against the currently visible quote,
  allowed source labels and safe parent Finding title/display ID. Withheld text,
  denied source labels and Finding summaries never contribute to search.
  Search must not reveal hidden text through membership, order or `has_more`.
- Order eligible matches by highlight `created_at DESC, id DESC`; use the exact
  stored timestamp for continuation. Return `{ items, page: { has_more, cursor? } }`,
  with no exact totals/facets. Bind opaque cursors to workspace/Actor, normalized
  query and requested scope/source; reauthorize on every page. A context-mismatched
  or malformed cursor returns `422 validation.failed`. Permissions may change
  the later visible set; stable paging does not promise a frozen authorization snapshot.
- Selected missing/foreign/unreadable records use `404 not_found.record`;
  malformed ID/query uses `422 validation.failed`, role block uses the existing
  `403 permission.denied`. Use existing read rate limiting. Read-only inventory
  writes no domain mutation, link or fabricated personal-read audit.

The proposed/new item DTO is an allowlisted projection, not `FindingDto` plus
raw provenance: local highlight `id`, `finding_id`, target
`primary_managed_system_id`, `source_type`, classification (`analytics_area_id`,
`sentiment`, `importance`), highlight `created_at`, readable parent
`finding: { id, display_id, title }`, `content_state: available|withheld`, and
optional `quote_or_summary` only when available. Optional `source` is a strict
source-type-specific object: VOC `{ id, display_id, title, route }` only when
readable; Survey `{ survey_type, survey_display_id, question_label,
identity_protected }` only when permitted, never a per-response jump. Note has
no `source` object or source jump. Withheld context omits denied source details.
Never return Finding summary, response UUID/ordinal, approval→response binding,
respondent identity, Survey title, submission time, raw answer, audit JSON or
raw Entity Links. Candidate approval IDs belong only to the selection API.

### Evidence route and continuity

Proposed/new `/integration/evidence` uses `ListShell`, `ListToolbar`, compact rows
and the RightDetailPanel layout region (using the existing ListShell detail-panel
slot, not a new exported component). The prototype `docs/design-prototype/screen-evidence.jsx`
is a new-surface reference under ADR-0060, not a behavior/copy authority. Match
shipped Integration density, scroll ownership and Korean chrome; reuse
`EVIDENCE_SOURCE_TYPE_LABELS` from `apps/frontend/src/lib/copy/enum-labels.ts`.

URL keys are `managedSystem`, `source`, `q`, `selected` and `cursor`. Omit defaults;
validate/drop invalid or unrecognized keys independently. Map source/scope to
wire keys. Restore filters, selection and paging on refresh/Back/Forward. Changing
scope/source/search clears cursor and reconciles selection against safe detail
and active filters. Page membership alone never proves deletion. An explicit
missing/unreadable selection shows the not-found panel and selects no substitute.
Close clears `selected` with replace, retains list context and restores focus to
the originating row when present. Permission/session/scope changes clear stale
query content; failure must not display old-scope text.

Rows show authorized snippet or withheld copy, safe source context and parent
`FIN-…`. The panel's primary action is `Finding 보기`, navigating to
`/findings?selected=<findingId>`; preserve Evidence context in browser history so
Back restores it. Add Evidence navigation and an Integration dashboard entry.
Explain scope with `Finding에 저장된 Evidence를 찾습니다.` Loading, role block,
genuinely empty inventory, filtered-empty, withheld content, first-page error,
load-more error and selected not-found are distinct states. A load-more error
retains successful rows and offers retry. Unknown data is not zero.

No inventory editor, attach button, Request Task or promotion flow is added.
Those actions remain on Finding detail. Desktop 1440 and keyboard search/row/
close/focus, later-page selection and shell-local scroll require implementation
verification; responsive expansion remains the existing frontend non-goal.

### Approved-excerpt selection in Finding

Use the ADR-0064 proposed/new `GET /surveys/:id/evidence-candidates` and
`POST /findings/:id/survey-evidence`; do not introduce the memo's alternative
`evidence-excerpts` endpoint or change its permission/audit decisions. Existing
API documents own strict fields, error ordering, response and transaction rules.
This ADR does not weaken response-addressed create-Finding or generic Survey
attachment rejection.

In Finding Add Evidence, the Survey branch selects an authorized Survey from
its separately authorized catalog, then a returned approved question/excerpt.
The catalog may show its own authorized Survey title; candidate and inventory
DTOs may not. Show source Managed System when different from the target; target
scope must not filter away independently authorized cross-system sources.
No response UUID input, response ordinal, editable Survey quote or response URL
may appear in picker DOM, URL, cache or logs. No personal-result payload fetch
is used to populate it. Resolve bindings and copy approved text on the server.

Use only bounded candidate pages, with no excerpt-text search, date, segment or
Analytics Area cohort filters. Distinguish `none`, `below_threshold`, visible
with no approved excerpts, source denial, loading/error and revoked selection.
Safe reads use ADR-0064's audience and audit rules, including holders' existing
below-threshold exception; do not fabricate personal-read audits for these safe
DTOs. Actual personal source reads keep their separate audits.

Clear approval selection when source/Survey changes; disable submit while
pending or without an eligible choice. Preserve draft/classification on retryable
errors; stale approval rejection enables reselection. Submit returned
`approved_excerpt_id` with existing optional classification and UUIDv4
`Idempotency-Key`. Keep the existing API contract's target-first validation and
404/422 distinction rather than the memo's alternative ordering/all-404 proposal.
The metadata-only mutation response never supplies a cached quote. Success
invalidates Finding evidence/detail/list and Evidence inventory, then obtains a
fresh authorized read. A separate intentional key retains existing add semantics;
replay remains duplicate-free. VOC and note inputs/behavior stay unchanged.

### Engineering choices and product value

- Source-owned batch hydration and capability checks per distinct scope avoid
  per-row Survey transactions and loading every Finding's nested endpoint. Page
  inside the safe boundary; optimization may not search raw content first.
  This keeps dense retrieval usable without broadening provenance grants.
- Workspace-first existing indexes and query-plan inspection come before any
  proposed/new journaled index migration. Reuse #739/#740 storage/readers instead
  of another migration, preserving private history and ordinary source behavior.
- Typed schemas/clients, feature-local rows/picker and fresh cache invalidation
  make withheld/revoked states consistent across retrieval and Finding detail.
  No import of Finding modal controllers into Integration or Survey internals
  into Findings; expose a public seam only for actual reused feature UI.
- Measure populated queues at the release workload (~5k VOCs/~5k Tasks) plus
  representative Evidence/Survey fan-out; do not infer response volume or claim
  timing from static inspection. Bounded pages and no exact-count KPI keep the
  first version focused on finding a useful fragment and reaching its owner.

## Non-goals and consequences

No standalone pre-Finding evidence capture, arbitrary graph editing, execution
coverage percentage, bulk promotion, taxonomy, automatic summary, export, raw
response browser, approval/redaction editor or public Survey links. No new
source permission, response→VOC or direct response→Task Request workflow.
Deferrals and reopening conditions are in `docs/design/14-post-mvp-backlog.md`.

Accepted docs make Slice 54 briefable; implementation still depends on the
coordinated #739/#740 cutover and real application-role verification. Evidence
retrieval does not resolve a policy-driven follow-up gap. ADR-0064's trusted
application boundary and withdrawal limits remain the release guarantee.

## Implementation issues

Ordered chunks adapted from memo §5; 54-1 is this ADR (#1067, owner #1040/#816).
Paths below exist unless explicitly marked proposed/new. All chunks wait for
#739/#740's coordinated ADR-0064 cutover; no partial grant rollout is sufficient.

1. **54-2 — Safe inventory and selected-item read (#1040, BE + shared).** Depends
   on 54-1 and #739/#740. Extend `apps/backend/src/modules/findings/routes.ts`,
   `evidence.ts`, `repo-read.ts`, `authorization.ts` and service wiring in that
   directory; `packages/shared/src/findings/index.ts`. A feature-local inventory
   reader is proposed/new only if needed. Acceptance: route-level app/migrate
   tests for Admin, allowed-A/denied-B Developer, explicitly granted User still
   blocked, foreign workspace, VOC denied, note and active/revoked Survey sources.
   Assert serialized DTO, eligible-before-search/page behavior, no hidden-text
   matches/cursor influence, source loss between pages, later-page direct detail,
   no read-side mutations/audits and no excerpt via parent summary. Inspect query
   plans and measure stable bounded pagination with representative fan-out.
2. **54-3 — Evidence route/navigation (#1040, FE).** Depends on 54-2. Proposed/new
   `apps/frontend/src/routes/_authed/integration/evidence.tsx`,
   `apps/frontend/src/features/integration/routes/EvidenceRoute.tsx` and local
   rows/panel/hooks/client/copy files; update existing
   `apps/frontend/src/routes/_authed.tsx`, Integration's
   `routes/IntegrationDashboardRoute.tsx`, route docs and Integration guide.
   Acceptance: known-fragment retrieval, correct parent Finding jump/Back,
   refresh/Back/Forward, later-page selection, filter reconciliation, missing
   explicit selection, keyboard/focus, source loss, blocked/withheld/empty/error
   states and retry. Desktop-1440 visuals and shell scroll before delivery.
3. **54-4 — Candidate read and atomic attach (#816, BE + shared).** Implements
   ADR-0064 Implementation issue 3, depends on 54-1 and #739/#740; independent
   of 54-3. Extend Surveys `routes.ts`, `results.ts`, `evidence-access.ts`,
   `repo-evidence.ts`; Findings `routes.ts`, `evidence.ts` and service wiring;
   `packages/shared/src/surveys/results.ts`, proposed/new candidate schemas in
   `packages/shared/src/surveys/`, and `packages/shared/src/findings/index.ts`.
   Extend existing Findings/Survey integration suites. Acceptance: above-threshold
   Developer without personal grant succeeds; non-holder/Admin below cohort or
   question threshold cannot discover/attach; explicit holder exception returns
   only safe DTOs without fabricated personal audits. Test source deny, target
   deny, foreign/guessed/revoked selection, draft, archived target, cross-system
   dual grants and threshold/revoke races. Assert atomic highlight/binding/count,
   one active internal-only `evidence_of` per response/Finding, identifier-only
   audits, no `generated_finding`/new Finding/VOC, rollback and duplicate-free
   metadata replay/changed-body conflict. Preserve app-role isolation, personal
   creation/approval audits, ordinary VOC/note and derived-Finding reads.
4. **54-5 — Replace rejected UUID form (#816, FE).** Depends on 54-4; 54-3 may
   ship independently after 54-2. Extend
   `apps/frontend/src/features/findings/components/FindingDetail/AddEvidenceModal.tsx`
   and its existing `.test.tsx`;
   `apps/frontend/src/features/findings/hooks/useEvidenceMutations.ts` and
   `apps/frontend/src/features/findings/hooks/useEvidenceHighlights.ts`; proposed/new Finding-local
   picker, typed clients and copy. Acceptance: Survey→approved excerpt→attachment
   only with returned selection ID, no UUID/editable quote; empty/suppressed/denied/
   retry/revoked states, source reset, pending disable, retained draft, fresh cache
   invalidation and unchanged VOC/note behavior. Replace the existing contradictory
   UUID-preservation test explicitly. Desktop-1440 modal visuals; reuse public
   Survey UI only through an exported seam if actually necessary.
