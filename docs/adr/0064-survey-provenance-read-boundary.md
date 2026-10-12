# ADR-0064: Survey provenance read boundary and safe approved-excerpt reuse

## Status

Accepted 2026-10-13 by the owner (MVP close-out decisions)

Records [#1039](https://github.com/hjung3113/FeedbackOps/issues/1039), including the
owner's 2026-10-13 approval of all recommendations in design memo §3–4
(`/Users/hyojung/Desktop/2026/FeedbackOps/.review/wave/D-53-MEMO.md`, local design input).
The same decisions are recorded on [#739](https://github.com/hjung3113/FeedbackOps/issues/739),
[#740](https://github.com/hjung3113/FeedbackOps/issues/740), and
[#816](https://github.com/hjung3113/FeedbackOps/issues/816). The newer owner decisions
supersede the October 3 optional-hardening disposition of #739/#740 and the audit-read
disposition of #738. This ADR amends ADR-0033, ADR-0008, ADR-0015 and ADR-0024 on those decisions.
Accepted is a contract status; #739/#740 must implement the cutover before delivery is claimed.
All extensions, views, readers and endpoints introduced below are proposed/new, not shipped.

## Context

The shipped response-addressed Finding command copies a response UUID and approved excerpt
into `finding.findings.source_id/summary` and into `finding.evidence_highlights.source_id`,
`approved_excerpt_id`, and `quote_or_summary`. Canonical `core.entity_links` and
`core.audit_log` also retain identifying associations. Finding DTO omission of `source_id`
does not close direct SQL reads or copied summaries in list/provider/mutation responses.
Revocation hides a highlight's quote but leaves its copied Finding summary readable.

Teams need useful evidence, effective withdrawal of approved text, and accountable history.
The MVP therefore removes these directly readable residual copies without introducing another
authorization service or pretending that app-executable definers authenticate an Actor.

## Decision

### Owner decisions and product value

1. **O1-A: trusted application authorization.** Close direct Finding/highlight/link/audit
   paths, including active and detached history, with protected storage and narrow projections.
   Arbitrary SQL using a stolen `fops_app` credential can still compose permitted Survey
   readers; SQL-level unlinkability is **not guaranteed**. Actor/workspace parameters,
   caller-set session variables, NOLOGIN ownership and owner-backed views do not prove an
   authenticated caller. Release claims must state this limit. This provides useful evidence
   and reduces accidental SQL exposure within the existing deployment model.
2. **O2-B: metadata-only Survey-derived Finding summaries.** Deterministic type/display ID
   and approved question metadata identify the source without copying an excerpt. Approved
   text is supplied only through active, freshly authorized highlights; revocation withdraws
   those system-generated reads. Preserve historical generated text privately. This gives
   withdrawal a consistent meaning while keeping queues and execution defaults useful.
3. **O3-B: safe approved-excerpt reuse without personal-response permission.** A Survey
   result reader may select only excerpts their result privacy state permits, and attach
   with `finding.manage` on the target. This avoids a sensitive grant for text already safe
   to read. The existing response-addressed create-Finding command retains its explicit
   personal gate; this is a new approval-selection command, not a raw response chooser.

### Protected provenance and ownership (memo §4.2–4.4, §4.12)

Survey owns two proposed/new protected extensions, with exact names chosen in #739:

| Binding | Required private fields | Public parent after cutover |
| --- | --- | --- |
| Survey-derived Finding | `workspace_id`, `finding_id`, `response_id`, `historical_generated_summary` | `source_type='survey_response'`, NULL `source_id`, metadata-only `title/summary` |
| Survey evidence highlight | `workspace_id`, `highlight_id`, `response_id`, `approved_excerpt_id`, `approved_excerpt_snapshot` | local highlight/Finding IDs, classification metadata; NULL `source_id`, `approved_excerpt_id`, `quote_or_summary` |

Finding owns parent lifecycle and evidence counters; Survey owns protected response/approval
bindings and their read/write application seam; Entity Links owns canonical relation behavior.
Foreign modules never write the extensions directly. Use workspace-qualified composite
keys/constraints and transactional validation for parent, response, Survey, and approval
consistency, response↔approval matching, and exactly one binding per applicable parent.
Preserve original UUIDs, including zero-highlight Findings and revoked approval snapshots.
Never substitute a Survey ID for a response UUID or merge response/result source identities.

Conditional constraints retain required ordinary VOC/Cluster Finding IDs and VOC highlight
IDs; note source IDs remain NULL. Survey-only binding/text columns must be NULL in public
parents. Ordinary notes retain authored text, and VOC quotes keep their source/reporter checks.
Do not revoke all `source_id` or highlight reads: that would break ordinary provenance.
Generated Survey titles/question labels use ADR-0033's allowlist, never Survey title or raw text.

`fops_app` receives **no SELECT, INSERT, UPDATE or DELETE** on the proposed extensions.
Access uses workspace/parent-scoped narrow functions, an appropriately least-privileged
NOLOGIN reader owner, and a separate narrow mutator owner for required writes. Create
functions, set ownership, revoke PUBLIC EXECUTE, and grant only explicit EXECUTE to
`fops_app` in one migration transaction. Fully qualify tables, use a trusted
`search_path` (`pg_catalog`), forbid dynamic SQL, and return only local IDs/safe metadata
where response IDs are unnecessary. Do not widen existing raw-reader or aggregate-owner
write privileges or give `fops_app` membership in an owner role. These functions are
trusted application tools, not an independent user-authentication boundary.

This physical separation preserves both ordinary operations and private traceability;
SQL column grants alone cannot express a Survey-only row restriction.

### Canonical links, Results and audits (memo §4.5–4.7)

Keep every `core.entity_links` row and its endpoint UUIDs canonical. Introduce a proposed/new
explicitly column-listed owner-backed `security_barrier` simple updatable view with
`WITH CHECK OPTION`, excluding **either endpoint** of type `survey_response` in every
status (`active`, `stale`, `detached`, `revoked`). Grant `fops_app` SELECT/INSERT/UPDATE
through that view, no DELETE. Revoke its raw-table SELECT/INSERT/UPDATE and surviving
column ACLs; inspect inherited grants too. Generic repositories and ordinary cross-module
read models use the view. Survey relation writes use an Entity Links-owned narrow definer
returning link ID and inserted state, never a raw endpoint row. Preserve tuple checks,
active uniqueness, detach attribution/reasons/timestamps, and ordinary link behavior.

Cutover must verify real INSERT, conflict handling, UPDATE and RETURNING callers against
the view, not assume table SQL works unchanged on an updatable view. Adapt those callers
within the owning seam while retaining concurrency/idempotency behavior. An unsupported
view operation is a cutover blocker, not permission to restore raw app-table grants.

Results replace the raw response-ID link join with a proposed/new Survey-owned reader
addressed by workspace and Survey ID. It returns candidate Finding IDs and target scope,
not response IDs. The application applies source Survey read/privacy state and target
Finding read independently. Accessible derived Findings must not require a personal grant
merely for discovery. Generic lists, counts, cursors and detach omit opaque Survey links
in every status; there is no generic Survey-response detach surface.

Ordinary endpoints retain Managed System equality. Survey-response command-only links
are the explicit exception: source Survey authorization on its Managed System and target
Finding authorization on the Finding's Managed System permit different systems inside
one workspace. Workspace equality is never waived. This reconciles the Entity Links guide
with `docs/implementation/06-entity-linking-contract.md` without changing the shipped flow.

Revoke raw `core.audit_log` SELECT from `fops_app`; retain INSERT and no UPDATE/DELETE.
Keep canonical subject/detail identifiers and Actor attribution unchanged, with indefinite
MVP retention and same-transaction business/audit writes. The controlled migrate/operator
path reads history; test observations use that handle and separately prove app denial.
No broad app-readable audit definer is added. Inventory non-module consumers before cutover;
a required app audit UI needs an explicitly allowlisted projection. This closes the audit
copy in #740 without deleting accountability or reopening #738 for a separate implementation.

### Safe-read and permission matrix (memo §4.8–4.10)

| Surface | Source gate | Target gate | Personal gate / privacy rule |
| --- | --- | --- | --- |
| Response-addressed create Finding (existing) | `survey.read` | `finding.manage` on selected target | Explicit `survey.read_personal_responses`; no Admin personal bypass |
| Finding list/detail/provider summary | Existing Finding gate | Existing `finding.read` semantics | Metadata only; no Survey-authorized context needed for generated metadata |
| Attached Survey highlight | Fresh `survey.read`, exact active approval | Existing Finding read gate | No personal grant; preserve existing linked-highlight audience, distinct from result suppression |
| Safe evidence candidates (proposed/new) | Fresh `survey.read` and result privacy state | None for Survey-only browsing | No personal grant; non-holders obey cohort/per-question suppression |
| Approval-selection attachment (proposed/new) | Fresh source read/result audience and active approval | `finding.manage` on target | No personal grant; revalidate preview eligibility on submit |
| Results derived-Finding discovery | Source Survey read/privacy state | Finding read on each target | No personal grant merely to return accessible derived Findings |
| Personal source detail/export (existing) | Existing Survey gates | None | Existing explicit personal/export grants and sensitive-read audits unchanged |

Use existing module-specific role rules: `survey.read` Admin satisfaction remains subject
to explicit deny; Finding read/manage retain their documented bypass/elevated-role semantics.
O3 creates no new capability or general User Finding-read grant. Missing/foreign/source-denied
Survey access retains the non-disclosing `404 not_found.record`; personal gates never gain
an Admin bypass. Source and target grants do not substitute for each other.

A proposed/new batch projection keyed by workspace and local Finding/highlight IDs returns
only approved snapshot text that is currently permitted, plus safe type/display ID,
approved question label and identity-protection metadata. Its application wrapper checks
target Finding read, source Survey read and the **exact active approval** in one transaction
snapshot. Use the existing response evidence lock ordering for read/approval/revoke/mutation
serialization: a revoke committed before a later read/attach check suppresses/rejects it;
a read serialized before revoke can return its authorized snapshot. Do not promise to
recall text already delivered. Batch hydration must not reintroduce the split-check stale
excerpt race. After source deny or approval revoke, local highlight/classification metadata
may remain but quote is omitted with a safe unavailable state; no response/approval binding
or denied source detail is exposed. Generic Finding providers always use metadata-only summary.

#### #816 safe candidates (proposed/new API)

`GET /surveys/:id/evidence-candidates` uses session Actor/workspace, strict bounded
cursor paging (default 50, maximum 100), and a stable opaque continuation that exposes no
response identity. Recheck authorization and suppression on **each page**, including
permissions lost between pages. Return result `none` / `below_threshold` / `visible`
semantics and only eligible approval selection IDs, redacted excerpts, approved question
labels, Survey type/display ID and identity-protection metadata. Count actual response
subjects and question answers under existing result rules, never approval rows as people.
Suppress low positive buckets and below-threshold text questions; disclose no suppressed
counts. Personal holders retain their existing below-threshold result privilege, but this
picker still returns no response UUID. Draft results remain unavailable.

Forbidden: respondent/Actor identity, correlatable response UUID, response deep link,
exact submission time, raw answer, Survey title, arbitrary free-text/dimension filters,
or permission/audit internals. An approval selection ID is not respondent identity and
is never authority by itself. Safe picker reads do not fabricate personal-read audits;
actual personal-data reads retain existing per-row sensitive-read audits.

#### #816 safe attachment (proposed/new API)

`POST /findings/:id/survey-evidence` accepts an approval selection ID and existing
highlight classification fields (`analytics_area_id`, `sentiment`, `importance`),
with strict validation and required UUIDv4 `Idempotency-Key`. It accepts no response UUID
or user-written quote. The Finding application command resolves the private response via
Survey's seam, rechecks active approval, source/result audience and target `finding.manage`
under transaction/response locking, validates classification/target scope, and atomically
writes the highlight, private binding, canonical internal-only `evidence_of`, counter,
audit and idempotency entry. It does **not** add `generated_finding` to an existing Finding.
Two approvals of one response may produce two highlights but one active response→Finding
`evidence_of` link. Retries create no duplicate side effects and return safe mutation
metadata; quotes are obtained through a fresh authorized read, never a cached mutation body.
Revoked/wrong/foreign selections, suppressed non-holders and unauthorized targets fail
without mutation audits. Existing generic raw Survey attachment remains rejected.
The API contracts own detailed wire fields and existing error-envelope families; #816
must define strict schemas without inventing a new capability or weakening this matrix.

#### Evidence composition (Slice 54, proposed/new surface)

Integration owns `/integration/evidence` UI. Its backend-composed DTO delegates source
reads to owning modules and consumes the same Survey safe projection and #816 candidate/
attachment seams wherever those actions are offered. Choose the backend endpoint/composition
owner in the Slice 54 brief before implementation; frontend ownership grants no Survey
mutation ownership. Ordinary VOC reads preserve source permission/reporter rules; notes
retain authored text. Expose local evidence/Finding IDs and safe source context, never raw
core links, private bindings, audit JSON joins, or reconstructed response URLs. Personal
source-detail navigation stays in the authorized Survey surface. Links/Coverage behavior
remains ordinary and independent. Batch reads and bounded paging keep dense queues usable.

### Migration, cache and release contract (memo §4.11 and §6)

#739 and #740 form one coordinated application/schema/grant cutover. Old binaries cannot
operate after the new NULL constraints/grants; use a controlled rollout rather than claim
that either partial deployment completes Slice 53.

1. Inventory all direct-link/audit consumers and generated/cached Finding DTOs, including
   create/status/link responses, nested Task source Finding summaries, and downstream
   source-summary/default paths.
2. Backfill Survey Finding/highlight bindings and historical generated text into protected
   extensions; reconcile active/archived parents, zero-highlight creations, all approvals
   including revoked rows, and every link status. Reject orphan, cross-workspace and
   approval↔response mismatches rather than invent provenance. Preserve UUIDs, timestamps,
   counters, detach reasons and audit history.
3. Clear public Survey binding/text fields and replace generated Finding summary with
   deterministic metadata. Inventory generated titles for allowlist violations too.
4. Sanitize **only confirmed Survey-derived** legacy idempotency response copies to safe
   metadata. Preserve Actor/key/hash/status, retention and exactly-once side effects.
   This is a one-time exception to ADR-0015's verbatim replay, not a blanket cache reset.
   New stored mutation responses contain metadata only and cannot replay a withdrawn quote.
5. Install/review narrow functions, owners, view and grants atomically; revoke raw and
   surviving column privileges. Update repositories, DTOs and application seams together.
   Generate/review migration SQL, journal and snapshots per ADR-0015; never hand-edit metadata.
6. As real `fops_app`, prove denial and ordinary behavior; as migrate/operator, prove
   exact retained history. Verify races and affected routes, then conductor gates and any
   affected desktop-1440 visual harness before declaring delivery.

Prevent future automatic excerpt propagation via `finding.summary` into Task Request or
Task source defaults. Independently authored Task/Task Request prose, exports and already
read browser content are not retroactively erased. Historical authored-text remediation
needs a separate owner scope decision and is recorded in the post-MVP backlog.

Use workspace-first indexes for private Finding/highlight/response/approval lookups and
existing canonical source/target indexes. No request-time audit JSON scan. Benchmark populated
ordinary queues and allowed/denied evidence paths at the release workload (~5k VOCs/~5k Tasks);
this does not infer Survey response volume or claim measured timings.

## Alternatives rejected and non-goals

- O1-B separate authenticated trusted boundary: deferred past MVP because it adds a second
  credential/service model and review of all callable readers; stolen-app-credential
  unlinkability and application-process compromise protection are not release claims.
- Permanent public excerpt summaries (O2-A): rejected because revocation remains ineffective.
- Personal grant for safe reuse (O3-A): rejected because it adds sensitive-access friction
  for already-visible approved text; existing raw/personal routes keep that grant.
- Global source-column/highlight read revocation, redacting audit Actor attribution, deleting
  canonical history, replacing response UUIDs with Survey IDs, and creating VOC: rejected
  because they break ordinary work, accountability or source identity.
- Public Survey links/external respondents remain rejected. No new result filters, general
  Survey detach, arbitrary graph editor, direct response→Task Request path, LLM summaries,
  bulk authored-text rewrite or implementation code is authorized by this docs-only issue.

## Consequences

Lists carry less excerpt prose, while detail supplies approved text only when still readable.
History remains recoverable through controlled operator access; accidental direct SQL joins
are closed but app-executable reader composition remains an accepted limit. ADR acceptance
makes #739/#740 briefable; runtime roles, production data, migration execution, concurrency,
rendered UI and performance still require implementation verification.

## Implementation issues

Ordered chunks for the conductor; existing issue numbers are reused, not newly filed here.

### 1. #739 — Isolate Survey Finding/highlight provenance and generated text

- **BE/FE:** BE plus affected existing FE rendering/DTO alignment. **Dependency:** ADR-0064;
  coordinate release with #740, neither alone closes Slice 53.
- **Files/modules:** `apps/backend/src/db/schema/finding.ts`, `survey.ts` in the same schema
  directory; proposed/new generated migration/metadata under `apps/backend/migrations/`;
  `scripts/db/init.sql`; Findings `creation.ts`, `repo.ts`, `repo-read.ts`, `record.ts`,
  `service-shared.ts`, `entity-link-provider.ts`, `evidence.ts`; Surveys `repo-evidence.ts`,
  `evidence-access.ts`; Core idempotency only for targeted legacy handling; shared contracts
  in `packages/shared/src/findings/` and `packages/shared/src/surveys/`.
- **Tests first/acceptance:** extend existing Findings
  `__tests__/create-finding-from-survey-response.integration.test.ts` and
  `__tests__/evidence-highlights.integration.test.ts`, Surveys
  `__tests__/survey-evidence.integration.test.ts`, and DB reader/role suites. Real app SQL
  cannot read extensions or reconstruct bindings/text from public parents; migrate recovers
  exact history. Test source/personal/target denial, source-denied Admin, foreign workspace,
  wrong/revoked approval, draft, empty excerpts and authorized cross-Managed-System creation.
  Fresh highlights suppress after deny/revoke; read/revoke/attach/replay races preserve the
  lock contract. Lists/providers/defaults and legacy cache replay are metadata-only; audits
  keep identifiers, not answer text. VOC/Cluster IDs and VOC/note quotes still work.
- **Rendered acceptance:** useful metadata summaries, active/unavailable highlights, clear
  Task Request defaults, existing Korean chrome/English nouns and URL-selected detail;
  desktop 1440 and affected visual diff for any rendered change.

### 2. #740 — Restrict canonical link/audit reads while retaining history

- **BE/FE:** BE with existing Links/Coverage regression verification. **Dependency:** ADR-0064
  and coordinated #739 provenance/read contract; inventory consumers before grant cutover.
- **Files/modules:** `apps/backend/src/db/schema/core.ts`, proposed/new view/function mapping,
  generated migration/metadata, `scripts/db/init.sql`; Entity Links `repo.ts`, `service.ts`;
  Surveys `repo-evidence.ts`, `results.ts`; Findings creation/repositories; direct-link read
  consumers in Tasks, Dashboard and VOC Clusters; Core audit tests and DB role assertions.
  Milestones continues through existing module seams.
- **Tests first/acceptance:** app raw link/audit reads and raw link DML denied; filtered view
  preserves actual ordinary conflict/RETURNING/detach paths, excludes both Survey endpoints
  in all statuses, rejects predicate-escaping writes, and has no DELETE. Pin owner/PUBLIC/
  membership/function ACLs. Migrate reads history assertions. Generic list/count/cursor/detach
  never leaks Survey tuples to Reporter, source-only/target-only/denied/foreign Actors.
  Results discovers accessible derived Findings under both source/target gates without a
  personal grant. Successful/replayed commands retain canonical links/counters/existing
  audits; denied commands have no mutation audit. Ordinary Task/Dashboard/Cluster/Coverage
  and retained audit Actor/detail/detached history remain intact. Together with #739 close
  named direct/cached copies and report permitted definer composition as the accepted limit.

### 3. #816 / Slice 54 — Approved Survey evidence selection and attachment

- **BE/FE:** both. **Dependency:** completed #739+#740 cutover; reuse existing VOC picker flow.
- **Files/modules:** Surveys/Findings `routes.ts` and owning application services;
  `packages/shared/src/surveys/` and `findings/`; frontend
  `apps/frontend/src/features/findings/components/FindingDetail/AddEvidenceModal.tsx` and
  its existing test, typed hooks and `apps/frontend/src/lib/copy/`.
- **Tests first/acceptance:** non-personal Survey readers select only result-visible approved
  text and attach with target manage. Cover none/below-threshold/per-question suppression,
  personal-holder exceptions, no Admin personal bypass, foreign/wrong/revoked selection,
  source deny, raw UUID/free quote rejection, dual Managed System authorization, two
  approvals/one response link, retries and revoke races. Safe reads write no fabricated
  personal-read audit; actual sensitive reads keep theirs. Submit rechecks preview rights.
- **Rendered acceptance:** scoped Survey list then approved safe previews; loading/empty/
  below-threshold/permission/error/revoked states, keyboard selection and retry retaining
  Finding context. No response UUID/free quote entry; VOC remains usable; desktop 1440/visual diff.

### 4. Slice 54 — Integration Evidence through accepted projections

- **BE/FE:** both. **Dependency:** Slice 53 safe-read implementation; #816 wherever attachment
  is offered. Backend composition owner/endpoint must be named in the Slice 54 brief.
- **Files/modules:** chosen backend composition surface (proposed/new), delegated Survey
  and ordinary-source readers, shared DTOs/copy, frontend
  `apps/frontend/src/features/integration/`, proposed/new `/integration/evidence` route.
- **Tests first/acceptance:** safe excerpt vs source/target denial, revoked approval,
  non-holder suppression, empty evidence and foreign workspace; source permission/reporter
  rules for VOC and authored notes preserved. Render local IDs/safe metadata/context without
  response URLs; Links/Coverage remain usable. No private SQL join/audit parsing/public
  Survey link/response→VOC conversion. Verify batch/bounded reads, desktop 1440 and visual diff.
