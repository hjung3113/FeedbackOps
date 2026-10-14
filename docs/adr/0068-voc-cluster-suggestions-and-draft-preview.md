# ADR-0068: VOC Cluster suggestions and paid draft similar-VOC preview

## Status

Accepted 2026-10-13 by the owner (MVP close-out decisions)

Resolves ADR-0054 choice (b), superseding its open-choice-(b) deferral and the
choice-(c) close-out scope in `docs/design/13-mvp-roadmap.md`. Amends ADR-0034
D3/D6 with a separate persisted Cluster suggestion lifecycle, without allowing
unattended domain Cluster writes or changing saved recommendation decisions.
Supersedes ADR-0046 D4's paid-preview deferral only for #340; #293's shipped
heuristic and navigation-only decision remain valid. Extends ADR-0012 and
ADR-0015 for preview budgets and privacy-safe replay. ADR-0009's runner remains.

Storage/settings/audit schemas (#1096) and item 2's backend suggestion
generation/review commands and shared DTOs (#1097) and the paid-preview
backend (#1099) are implemented. The suggestion and preview UI remain
proposed/new here; implementation of item 2
is not activation evidence. Generation remains default off pending #1152.

## Context

The owner scheduled these capabilities for MVP close-out on 2026-10-13. The
D-58 design memo recommended provisional automatic Cluster drafts; the owner
instead selected choice (b): automatically find pairs outside domain Cluster
tables, then create a Cluster only when a person confirms. This gives a triager
a grouping shortcut without system attribution, provisional Cluster lifecycle,
or downstream-use guards. Paid draft preview addresses the remaining duplicate
risk outside the latest three same-Managed-System peers, without requiring a
reporter to submit first.

Inputs: D-58 memo sections 3, 4 and 6 (local design memo at
`/Users/hyojung/Desktop/2026/FeedbackOps/.review/wave/D-58-MEMO.md`), and owner
comments read on 2026-10-13 on [#1048](https://github.com/hjung3113/FeedbackOps/issues/1048),
[#340](https://github.com/hjung3113/FeedbackOps/issues/340) and the historical
[#293](https://github.com/hjung3113/FeedbackOps/issues/293) decisions. The latest
#340 decision supersedes its 2026-08-07 decision not to fund preview. No real
provider calibration, shadow-run data, corpus, invoice or latency measurement
was available to this worker. Numerical cuts/caps below are initial policy,
not empirical conclusions.

## Decision

### Owner decisions (58-1 through 58-6)

| Decision | Accepted contract | Product value |
| --- | --- | --- |
| 58-1 / O1 | ADR-0054 choice (b): pairs are Cluster suggestions outside domain Cluster tables; one human confirmation creates a Cluster. | Compare two VOCs once without maintaining unusable system-created Clusters. |
| 58-2 / O2 | Admin opt-in, default off, for suggestion generation. Disable stops new suggestions; pending suggestions remain reviewable. | Teams deliberately own their review queue. |
| 58-3 / O3 | Disjoint pairs only; a human-rejected suggestion pair is never automatically proposed again, including after a model/version change. | Small comparisons and respect for rejection reduce repeated triage work. |
| 58-4 / O4 | Undo only an accidental suggestion discard, server grace five minutes, with fresh validation. | Correct a slip without promising to reverse accepted work. |
| 58-5 / O5 | All roles: actor 2 paid attempts/minute and 20/UTC day; workspace 10/minute and 100/UTC day across all callers/pods. Review after two weeks of use. | Bound spend and keep one actor from exhausting the team allowance. |
| 58-6 / O6 | Only an optional `유사 VOC 확인` button sends draft prose; concise disclosure says it goes to the embedding provider. Typing sends nothing and preview never blocks submit. | An intentional duplicate check with predictable cost and transmission. |

### Cluster suggestions: memo C1–C10 adapted to choice (b)

1. **C1 — Opt-in.** `voc_cluster_suggestions_enabled=false` is one
   workspace policy through existing Admin `PATCH /workspace/settings` and the
   resolved-settings barrel. Effective changes alone are audited; preserve
   other policies. No per-MS switch, schedule UI or configurable cut. Generation
   locks/rechecks the setting in its short write transaction; disabling it cannot
   race a cached admission. Shadow measurement stays independent. Turning off
   generation does not prevent an authorized person's review/confirmation.
2. **C2 — Shape.** Highest-score disjoint pairs, sorted VOC UUID tie-breaks,
   exactly two VOCs from the same workspace/Primary Managed System. A VOC occurs
   in at most one currently eligible pending suggestion. No transitive groups,
   auto joins, expansion, merge/split or batch acceptance. Confirm one reviewed
   pair at a time so the person's judgment is unambiguous.
3. **C3 — Cut and veto.** Saved recommendations and preview retain 0.75;
   suggestion generation initially pins a separate global 0.85 cut. Shadow floor
   stays 0.60. These are unvalidated quality pins. An active-version saved
   dismissal, either orientation and any scope, blocks automatic suggestions;
   an explicit suggestion discard adds a permanent, cross-version sorted-pair
   veto. Ordinary saved dismissal scope/version behavior and another authorized
   actor's saved confirmation rights do not change.
4. **C4 — Membership and retention.** Exclude either VOC already in any Cluster
   in that MS, whether draft or confirmed. Do not impose a new single-membership
   rule on manual Clusters. A confirmed suggestion keeps its pair identity and
   resulting Cluster reference forever, preventing automatic recreation after
   later member removal. Ineligible pending pairs release disjoint/cap occupancy
   but keep identity/history; they may be refreshed when eligible again, unlike
   discarded or confirmed pairs.
5. **C5 — Initial bounds and measurement.** Initial ceilings are five newly
   admitted suggestions per MS per UTC hour and 20 eligible pending suggestions
   per workspace, not measured demand. Retries/refreshes do not spend new-admission
   slots. No automatic generation is enabled until seven days of successful
   shadow summaries plus configured-provider labelled pairs demonstrate at least
   90% observed precision at the chosen cut and a manageable review workload.
   Measure distinct newly eligible disjoint pairs/hour, including uncapped tail
   and borderline samples; `seen_count`/`would_form` are not acceptance evidence.
   Reassess the initial cap against `min(5, ceil(median(new_disjoint_pairs_per_hour)))`;
   zero median means keep generation off. Record evidence and any revised pin in
   a dated decision amendment with a versioned offline evaluation fixture before
   activation. A new model/cut needs fresh evidence; no measurements are claimed.
6. **C6 — Freshness.** Recheck at generation, read, confirm and restore: active
   workspace/MS/provider/version; both VOCs unarchived and in that workspace/MS;
   current derived text hashes matching stored embedding hashes; score/cut;
   saved dismissals, suggestion veto/terminal state and current Cluster membership.
   Read recomputes current eligibility before exposing anything. Store both
   hashes, provider/model/dimensions/version and embedding source-row watermarks
   (not physical embedding time). Confirm/restore supply the reviewed hashes,
   embedding version and suggestion revision; mismatches return
   `409 conflict.stale_write`, requiring refresh without silently accepting new
   text. A confirmed Cluster is curated work; automation never changes it.
7. **C7 — Discard/undo.** Soft-discard the suggestion, never a Cluster or members.
   Keep pair identity, discard actor/time, revision and history. Only a pending
   suggestion can be discarded; repeat discard is a no-op. Restore by the actor
   who discarded it is allowed within five minutes of the original server
   timestamp, after C6 and pending-cap/disjoint rechecks. Restore clears only
   that discard veto; it cannot override saved dismissals or accepted work.
   Repeat discard/replay cannot extend grace. An expired or ineligible restore
   returns `409 conflict.stale_write` and leaves suppression intact. No hard
   delete, Cluster undo, accepted-work rewind or trash-management surface.
8. **C8 — Attribution.** No new system actor provisioning: generation writes
   operational suggestion state only, never a domain Cluster/audit. Human
   confirmation owns `created_by`, `confirmed_by`, `confirmed_at` and member
   attribution through the existing Cluster application commands.
9. **C9 — Audit.** Automatic generation emits structured summaries, no domain
   audit or `system.` event. Human confirm atomically creates the Cluster and two
   members, sets Cluster status `confirmed` with the human's provenance, records
   the suggestion's confirmed state and Cluster reference, and writes existing
   `voc_cluster_created`, `voc_cluster_member_added`, `voc_cluster_updated`
   events plus `voc_cluster_suggestion_confirmed`. Human discard and
   successful restore use `voc_cluster_suggestion_discarded` and
   `voc_cluster_suggestion_restored`. audit subject is
   `voc_cluster_suggestion/<suggestion UUID>`; detail schemas contain pair IDs,
   MS, revision/version/hashes, score/cut and Cluster ID when confirmed, never
   bodies or copied titles. No audit for reads, replay or no-op.
10. **C10 — Join-newest.** Existing `selectClusterIdForVoc` and saved confirmation
    keep their existing create/join-newest semantics. Suggestions are not in
    Cluster tables, so there is no auto-origin to filter/promote. Suggestion
    confirmation always creates one new human-confirmed Cluster; if either VOC
    acquired membership meanwhile, reject as stale instead of joining it.

**Storage/ownership.** VOC owns proposed
`voc.voc_cluster_suggestions`, separate from the existing measurement table
`voc.voc_cluster_autogen_shadow_candidates`. A permanent unique key is
workspace/MS/sorted pair, independent of embedding version; lifecycle
is `pending|discarded|confirmed`, with ineligibility derived rather than a new
Cluster status. Use one durable row/revision and append-only human audit history.
No Cluster provenance/backfill/discard columns or new Cluster states are needed.
VOC's `cluster-suggestions/` service calls only VOC Clusters' exported
application commands, never a foreign repository. Do not materialize the saved
recommendation read resource or expose raw shadow rows as suggestions.

**Concurrency/job.** Use existing in-process pg-boss, hourly, with a new
migration-precreated `voc.cluster_suggestions` queue. One bounded transaction
per workspace/MS, incremental embedding-revision scan with periodic reconciliation,
not another unrestricted quadratic sweep. Cursor advances only on committed
work; replays cannot duplicate pairs or bypass caps. Coordinate generation,
confirm/discard/restore through the dated matrix below. Existing manual/saved
membership paths retain their recovery-first locking; they do not acquire new
suggestion admission locks. Disable serializes through the settings row and
never acquires those locks in reverse.
Use approved owner barrels/projections. Provider I/O never holds a DB transaction.
At ~5k VOCs the conductor measures scan/query time and queue growth; if bounded
incremental work is still too slow, keep generation off and justify indexed
neighbor search separately, without a new vector service/process.

**2026-10-14 concurrency amendment (#1097 brief check).** Every suggestion
writer takes the workspace recovery advisory lock first. This serializes with
existing membership and permission writers and prevents the generation/settings,
manual createCluster/MS/actor-FK, permission-approval/recovery/actor/settings cycle.
Reacquiring recovery inside Cluster commands is safe in the same transaction.

| Writer | Lock order after entering its transaction |
| --- | --- |
| Generation | recovery → suggestion advisory → settings FOR UPDATE → active MS FOR SHARE → VOCs FOR SHARE in UUID order → suggestion rows |
| Confirm | recovery → authorization → idempotency → suggestion advisory → MS FOR UPDATE → VOCs FOR UPDATE in UUID order → suggestion row → Cluster commands |
| Discard / restore | recovery → authorization → idempotency → suggestion advisory → MS FOR UPDATE → VOCs FOR SHARE in UUID order → suggestion row; restore also rechecks C6 |

Generation pins scoring embeddings after VOC locks. Existing membership writers
stay unchanged; recovery serialization makes an earlier membership stale for
confirm, while manual multi-membership after confirmation remains allowed.
Confirm/restore do not lock settings: disabling generation never blocks review.
Authorization is checked before cached-key lookup; only a new confirmation
returns 201, replay/already-confirmed return 200 after access/key validation.

**Read/UI boundary.** Suggestion read requires elevated `finding.read` on the
pair's MS and both VOCs readable via the existing VOC scope-or-reporter rule.
Mutation requires elevated `finding.manage`, plus both VOC reads, even on replay.
Filter complete pairs before visible totals, ordering and page limits; never
return partial pairs or hidden titles/counts. The existing `/voc-clusters`
ListShell gains a distinct proposal section labelled `Cluster 제안`, with
`확인 후 Cluster 생성`, `기각`, and contextual `되돌리기`; no fake Cluster ID,
CLU display ID, owner/severity/confidence/rationale or confidence percentage.
Inspect the two authorized texts before confirming. Suggestions are not Entity
Link endpoints, Finding/Task Request/bulk-update sources, or execution,
coverage/recovery records. This separation removes all memo pre-accept Cluster
use guards while leaving manual drafts fully usable. Preserve existing Cluster
URLs; new suggestion selection is feature-local and is not a Cluster route.

### Paid draft preview: #340 Q1–Q4

- **Q1/Q2 — Paid budgets.** Fixed UTC minute/day windows use the owner ceilings
  above, including Admin. One Postgres transaction claims a required UUIDv4
  `Idempotency-Key` and reserves all four budgets atomically, locking workspace
  minute/day then actor minute/day then the request claim in fixed order. If any
  budget denies or storage fails, no provider egress; no partial reservations.
  All dispatched or uncertain attempts, including HTTP failure/timeout/crash,
  consume allowance. One bounded text/request, zero automatic retries. This is
  preview-only spend, not saved-VOC ingestion/backfill or an invoice estimate.
- **Q3 — Honest states.** Exhaustion is `429 rate_limited.actor` or proposed/new
  `rate_limited.workspace`, with safe `budget_period: minute|day`,
  `retry_after_seconds` and `Retry-After`. No usage/identity disclosure. Provider
  disabled/failed/timeout, expiry and unknown outcome differ from successful
  empty results. Heuristic peers keep their own heading, never substitute for
  semantic output. Actor-day copy is `오늘 유사 VOC 조회 한도를 사용했습니다`;
  workspace-day copy is `이 워크스페이스의 유사 VOC 조회 한도를 사용했습니다`;
  minute copy explains a temporary limit and retry time.
- **Q4 — Source-less read.** No draft VOC, recommendation decision key, domain
  audit subject, dismiss/confirm, join mutation or relationship. Operational
  identity is workspace/actor/key plus canonical sanitized input hash, MS and
  provider/model/version. Saved-VOC directional decision state is unchanged.

Proposed `POST /vocs/similarity-preview` is authenticated under VOC create's
workspace/session boundary, body `{ primary_managed_system_id, title,
description_rich_content }`, strict schema and required UUIDv4 key. Any role
may request it without triage/Finding capability. Validate the active MS,
sanitize TipTap content and reuse `deriveVocEmbeddingText`; enforce the existing
server body limit and 16 KiB UTF-8 derived text limit before reservation. Send
only derived title/body prose, never attachment bytes/URLs, mention IDs,
internal comments or candidate prose. If no authorized non-archived same-MS
active-version candidate could be returned, return successful empty without
paid reservation/egress. Use `similarVocVisibilityPredicate` before score
ordering/limit, 0.75 cut, top three, score DESC/UUID ASC. Candidate fields are
only `{ id, display_id, title, created_at }`; no total/severity/score.

VOC owns proposed `voc.voc_similarity_preview_requests` and
`voc.voc_similarity_preview_budgets`, not a generic AI subsystem in Core. Commit
a short reservation transaction, call the provider outside it with cancellable
I/O and a ten-second deadline, then commit a short completion transaction. A
claim is at most one dispatch, not a promise of exactly-once external billing.
Persist no raw prose, request body or returned candidate titles/IDs. Keep
operational tombstones 24h and a successful vector for at most ten minutes;
a VOC-owned pg-boss cleanup removes expired vectors and tombstones. Expiry is
enforced on reads even if cleanup is late. Retain only live minute/day budget
buckets until their windows end. Narrow cleanup grants are confined to these
operational tables, never domain Cluster/audit DELETE grants.

Same key with changed canonical text/MS returns `409
conflict.idempotency_key_reuse`. An identical concurrent/replayed request never
dispatches again. In-flight/uncertain/crashed dispatch returns explicit
`provider_outcome_unknown`; after vector expiry return `preview_expired`,
requiring a fresh explicit request/key. Replay rechecks current authorization,
provider enablement and compatible provider/model/version/dimensions, and
requeries candidates from the vector; never replay cached identifiers/titles
following revocation. Configuration changes in flight invalidate results as
`provider_outcome_unknown`, not empty. A disabled provider returns
`provider_disabled`; response union is `200 { available:true, items:[...] }`
or `200 { available:false, reason, items:[] }`, where reason is
`provider_disabled|provider_failed|provider_timeout|preview_expired|provider_outcome_unknown`.
Invalid input uses existing validation/rich-content envelopes; budget storage
failure uses `500 internal.unexpected` with no egress. No heuristic fallback.

Add a separate request-abuse tier, 10 requests/minute/actor with a distinct
preview bucket, separate from paid budgets and the VOC submit mutation bucket.
Admission can be disabled operationally without stopping submission or saved
embedding enqueue; no additional workspace preview-setting console is proposed.
Structured logs include workspace/actor/version/attempt/outcome/latency, never
prose/vectors/titles. No domain audit for this read-only preview.

In the shipped create right column, `유사 VOC 추천` contains the optional button
and transmission disclosure; `같은 Managed System의 최근 VOC` remains separate.
Text/MS edits immediately clear old results, require a fresh check, and
cancel/ignore stale responses. Render, typing, refocus, query retries and submit
never trigger preview egress. All states keep submit usable. Candidate UUID
navigation uses the existing unsaved-change blocker; no extra continue-anyway
step, duplicate decision or forced recommendation workflow. Canonical copy
will be implemented in existing `apps/frontend/src/lib/copy/voc.ts` and
`apps/frontend/src/lib/copy/voc-cluster.ts` in the corresponding FE chunks.

## Alternatives rejected and non-goals

Automatic/provisional Cluster rows (memo O1 A), system actor provisioning,
auto-origin Cluster backfills, pending-Cluster downstream guards and new
`system.` formation events add maintenance without improving the chosen
human-confirmation job. Fully automatic confirmation, Finding/Task/Task
Request/Public Update/reporter-status changes, Survey Response → VOC, VOC merge,
transitive clustering, Cluster merge/split and accepted-work undo stay excluded.
Automatic idle preview, quota/model/cut/schedule consoles, a generic AI billing
platform, durable/shared draft collaboration and external public access are
outside MVP. Deferrals and reopen conditions are in
`docs/design/14-post-mvp-backlog.md`.

## Consequences and validation

This ADR is the prerequisite for implementation briefs, not a delivery claim.
No real provider calibration is attached; generation remains off. The initial
preview allowance is an approved ceiling, reviewed after two weeks of actual
use for exhaustion frequency and latency; changes need a recorded decision,
not an automatic increase. Offline arithmetic/fake-vector checks cannot prove
semantic usefulness. The conductor owns provider measurement, throwaway-DB
integration, root gates, 1440 rendered/visual review and Release Value Gate.
Implementation must preserve recommendation-read/shadow no-domain-write tests,
manual Cluster draft flows and the heuristic panel's zero-paid-call behavior.

## Implementation issues

The conductor files these proposed chunks in dependency order; none are filed
by this worker. BE acceptance uses actual Fastify routes/personas and Postgres
app/migrate roles; jobs use real transactions and runner invocation. Reuse
existing coverage; no mock internal-call assertions substitute for public seams.

1. **Inert suggestion storage and Admin opt-in — BE/shared.** Depends on this
   ADR. Existing seams: `apps/backend/src/db/schema/voc.ts`,
   `apps/backend/src/db/schema/core.ts`, `apps/backend/migrations/`,
   `apps/backend/src/modules/workspace-settings/`, `packages/shared/src/audit/`.
   Add proposed suggestion schema/constraints, policy, counters/cursor and audit
   subject/events; no Cluster schema changes or registered generator yet.
   Acceptance: permanent sorted-pair uniqueness, lifecycle/retention constraints,
   migration grants as both roles; missing policy defaults off; Admin-only PATCH,
   no-op audit suppression and preservation of unrelated settings.
2. **Bounded suggestion generation and human review commands — BE/shared (shipped #1097).**
   Depends on 1. Existing seams: `apps/backend/src/modules/voc/jobs/index.ts`,
   `apps/backend/src/modules/voc/jobs/cluster-autogen-shadow.ts`,
   `apps/backend/src/modules/voc/recommendations/`,
   `apps/backend/src/modules/voc-clusters/` and `packages/shared/src/vocs/`.
   Implemented `voc/cluster-suggestions/` service/repo/routes and generation job;
   exported Cluster commands and coordinated membership locks. Acceptance:
   off/disabled/stale/cross-scope/archived/member/dismissed inputs produce no
   suggestion; retries/final-slot races obey caps/disjointness; reads filter both
   VOCs before totals/limit and write no domain state; confirm creates exactly
   one confirmed human Cluster/two members with atomic audits; concurrent manual
   membership fails stale without side effects; discard/model bump suppresses,
   five-minute restore rechecks conflicts, and accepted pairs never recreate.
   Same-key replay checks permissions; changed body conflicts. Existing saved
   join-newest and shadow/recommendation no-write tests remain green.
3. **Cluster proposal review and Admin opt-in — FE.** Depends on 2. Existing
   seams: `apps/frontend/src/features/voc-cluster/components/detail/`,
   `apps/frontend/src/features/voc-cluster/hooks/`,
   `apps/frontend/src/features/admin/settings/`,
   `apps/frontend/src/lib/copy/voc-cluster.ts`, `apps/frontend/tests/visual/`.
   Proposed feature-local suggestion panel/hooks. Acceptance: 1440 keyboard,
   focus/loading/denied/stale/off states, two authorized texts, explicit confirm,
   discard/undo and invalidation; no pre-confirm execution/link actions; revoked
   access hides complete pair/count; existing URLs/manual drafts unchanged.
   Rendered before/after and intended visual diffs; no prototype approval gate.
4. **Paid preview ledger, budgets and route — BE/shared.** Depends on this ADR,
   independent of 1–3. Existing seams:
   `apps/backend/src/modules/voc/embedding/`,
   `apps/backend/src/modules/voc/jobs/index.ts`, `apps/backend/src/server.ts`,
   `apps/backend/src/lib/rate-limit-tiers.ts`, `packages/shared/src/vocs/`,
   `packages/shared/src/errors/codes.ts`,
   `apps/frontend/src/lib/api/errorMapper.ts`. Add proposed preview submodule,
   operational schema/cleanup, response/detail schemas and cancellable provider
   I/O. Acceptance: real-route quotas across actors/pods/UTC windows, final-slot
   races and same-key concurrency bound paid transport requests; malformed,
   unauthenticated, foreign/inactive MS, disabled/no-readable-candidate and failed
   budget storage cause zero egress; one uncertain/timeout attempt is consumed
   without retry; TTL and revocation/in-flight config rechecks; honest quota,
   provider and empty states; no VOC/Cluster/decision/domain-audit writes.
   Hand-authored vectors verify cut/rank/filter; fake hashes do not prove value.
5. **Optional semantic check on VOC create — FE.** Depends on 4. Existing seams:
   `apps/frontend/src/features/voc/components/create/VocCreateScreen.tsx`,
   `apps/frontend/src/features/voc/components/create/SimilarVocPanel.tsx`,
   `apps/frontend/src/lib/copy/voc.ts`, `apps/frontend/tests/visual/`.
   Proposed feature-local semantic panel/hook. Acceptance: explicit button alone
   calls preview; edits clear results and late replies cannot resurrect them;
   recent/semantic headings and quota/provider/empty states remain distinct;
   submit stays usable; UUID navigation preserves dirty-form guard and sends no
   create/join/dismiss/confirm request. Verify 1440 keyboard/focus and visual diff.
6. **Calibration, value and 5k-corpus activation evidence — BE/FE acceptance.**
   Depends on 2–5. Existing integration suites under
   `apps/backend/src/modules/voc/` and `apps/backend/src/modules/voc-clusters/`,
   and `apps/frontend/tests/visual/`; conductor-owned authorized real-provider
   samples and throwaway DB. Acceptance: seven-day successful summaries,
   stratified real-provider labels/precision, tail/new-disjoint workload/cap
   review, bounded incremental scan/preview latency and queue growth at about
   5k VOCs/5k Tasks; authorized older-than-latest-three duplicate found, unrelated
   control absent, unreadable duplicate absent; triager accepts/discards useful
   pair without extra workflow. Suggestions do not affect execution/coverage/
   recovery. Amend pins with evidence and enable only after FE review ships.
   Record two-week preview quota review; offline green alone cannot pass value.
