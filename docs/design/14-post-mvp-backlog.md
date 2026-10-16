# Post-MVP Backlog

## Purpose

This document records what the owner decided **not** to ship before the MVP release, and why, so later work starts from a decision instead of rediscovering the gap. It is the companion of `13-mvp-roadmap.md` → MVP Close-Out. Delivery status is the GitHub milestones; this is a record of deferrals, not an execution queue.

Add an entry whenever a close-out slice defers or drops something. Remove an entry only when it ships or a later decision closes it.

## Deferred by scope decision (2026-10-13)

| Item | Decision | Reopen when |
| --- | --- | --- |
| Phase 2: automatic summary, root cause candidates, priority score, advanced clustering, external tool integrations, advanced Audit / Export, Executive Report | Out of the MVP; priorities come from real use after release. | Real users ask for it, or a pilot finding shows the gap blocks a daily job. |
| Public survey links and external respondents | Rejected: ADR-0035 and ADR-0036. MVP respondents stay AD-authenticated internal Actors (FOP-OUT-008). | A need for respondents outside the company; start from a new ADR. |
| Explicit MVP Exclusions (`13-mvp-roadmap.md`) | Unchanged. | Each needs its own decision. |

## Deferred during the close-out slices

| Item | Reason | Reopen when |
| --- | --- | --- |
| Single-object permission enforcement and approval narrowing (Slice 55, ADR-0066; owner #1041, 2026-10-13) | Current checks enforce workspace/Managed System only. End-to-end object gates across consuming routes would expand this close-out slice and its privacy tests; an object-scope warning cannot enforce a restriction. MVP rejects object-scoped writes/approval rather than silently broadening access, preserving historical rows. | A demonstrated job needs one-object access and an ADR defines object identity, every consuming-route/check/list gate, privacy tests, and explicit legacy-data disposition. Legacy unsuperseded object grants must be inventoried and resolved explicitly before MVP release. |

### Slice 62 — owner decisions (session 83, 2026-10-16)

Questions left in merged PR bodies, decided by the owner. Smaller noted items from Slices 56–62 are tracked in #1214.

| Deferred item | Reason | Reopen condition |
| --- | --- | --- |
| Keep staged Triage choices when a confirm is rejected (#1191); today every staged choice resets, not only the owner | The owner picker offers only eligible Actors, so a rejection needs a permission change between opening and confirming; re-seeding the panel adds draft state for a rare race | Users report losing Triage input after a rejected confirm |
| Name the would-be automatic recipient before Task conversion (#1190) | Needs a defaults read, a new contract; the success toast already names the actual recipient | Reviewers convert to the wrong recipient because they cannot see the default in advance; decide the defaults-read contract first |
| Scroll the Task board to search matches outside the visible columns (#1203) | The count (`보드 N건`) is truthful and the list view is the search surface; auto-scroll adds board state | Users search from the board and miss Done/Released matches |
| Digits-only search (`2240` → `TASK-2240`) on VOC, Task and Finding lists (#1203) | All three lists share one rule: display-id prefix or title contains; changing one list alone breaks consistency | Users ask for number-only search; change the three lists together |
| Recheck entitlement on an idempotent replay of a VOC write (#1196) | ADR-0015 replays the stored response verbatim; a replay after the actor lost `voc.read`/`voc.triage` can return a cached envelope with internal fields (severity, full detail). Needs a revocation, the same key and the 24 h TTL. Accepted for MVP (ADR-0015 amendment 2026-10-16) | Post-MVP hardening: on a cache hit, recheck current entitlement and redact or reject without re-running writes or audits |

### Slice 62 — #1175 (2026-10-16)

| Deferred item | Reason | Reopen condition |
| --- | --- | --- |
| VOC bulk actions (assign owner, set severity, add to Cluster, create Finding) | No bulk endpoint; disabled stubs removed from the Inbox | When a bulk VOC command API is approved |

### Slice 56 — ADR-0067 (2026-10-13)

These exclusions do not defer the five Coverage bands, real Actor/team responsibility,
or any of the six accepted D3 capabilities.

| Deferred item | Reason | Reopen condition |
| --- | --- | --- |
| Per-system Coverage overrides, new ratios / `milestone-outcome` | Five workspace metric pairs solve setup; no accepted outcome metric definition exists. | Real operations need system-specific standards or a separate milestone-outcome predicate is approved. |
| Additional queue wishlist categories | Keep bounded parity with the six emitted categories; unlinked work is not automatically a gap. | A daily workflow provides a source-owned expected-link predicate and scoped action. |
| Team CRUD, membership and team-candidate listing | Known team defaults can route work without inventing member permissions/notifications; ADR-0018/0044 boundary remains. | Admin needs to manage/select new teams; approve a candidate/read or management contract first. |
| Automatic reassignment/backfill | Defaults affect new work; retroactive routing would overwrite intentional/historical assignments. | Owner approves an explicit audited reassignment workflow. |
| Standalone Task creation in this slice | Existing request conversion is the covered path; standalone creation requires its own contract/issue. | Its separately authorized issue lands, consuming the same Task resolver. |
| Shared snooze/mute and new workflow permissions | Personal noise controls must not change operational policy, counts or authority. | Real team policy demand justifies a new ADR. |
| Trend/chart platform, cache solely for timestamps, pre-rollout reconstructed history | Bounded queue/history and truthful computation times serve repair without BI scope or invented evidence. | Measured read pressure warrants caching, or independently evidenced historical migration/reporting is approved. |
| Changing indefinite source audit retention | Three-month recovery history is a projection window, not permission to delete audit. | Company data-handling policy reopens ADR-0008. |
| Item | Reason deferred (ADR-0069, 2026-10-13) | Reopen when |
| --- | --- | --- |
| Reporter-facing Analytics Area report | Internal operational queues serve Admin/scoped Developer; broader exposure needs a separate safe-summary contract. | Reporter research identifies an Area-level job that existing own-work/public-safe views cannot support; decide disclosure in a new ADR. |
| Derived per-Area Task Request attribution/counts | Requests have no direct Area; Cluster sources can span Areas and source reclassification makes guessed totals misleading. | Reviewers demonstrate that the Managed System review queue plus source details cannot complete intake; decide mixed-source/reclassification/visibility semantics first. |
| Historical Area trends, cohorts, funnel/composite score, custom charts and export reporting | Current optional classification and overlapping gaps cannot establish historical or causal improvement; extra BI work does not shorten the operational action path. | A measured post-release job needs these analyses, with temporal attribution and disclosure contracts decided first. |
| Stronger released communication-complete metric | Existing ratio means at least one non-skipped update, not every reporter updated after release; the unresolved-reporter queue remains separate. | Operational evidence requires all-reporter/post-release completion, with an owner decision on timing, membership and permission semantics. |

Area permissions, hierarchy, mandatory classification/backfill and persisted report lifecycle remain explicit
non-goals, not implicit future commitments. The separately scheduled ADR-0059 D3 recovery-model work
is MVP close-out scope, not a post-MVP deferral or a requirement to wait for snooze/history UI.

| Item | Reason / decision | Reopen when |
| --- | --- | --- |
| SQL-level Survey unlinkability against a stolen `fops_app` credential; separate authenticated read boundary | ADR-0064 O1-A retains trusted app authorization and closes named direct-table copies. A second credential/service model and review of every personal/raw/self-history/aggregate reader exceed MVP value; app-executable reader composition remains an accepted limit. | Owner requires compromised-credential unlinkability or an API path violates the accepted guarantee; new boundary/threat-model ADR before rebriefing implementation. |
| Retroactive remediation of independently authored Task/Task Request prose, exports or already-read browser material | ADR-0064 O2-B withdraws system-generated excerpts and sanitizes confirmed generated caches, not authored history. Production contents were not established and no bulk rewrite is authorized. | Inventory proves a remaining authored copy needs remediation and the owner approves the exact affected records/surfaces and handling policy. |
| New Survey result/picker free-text or cohort/dimension filters | Existing result suppression relies on actual response/answer cohorts; immutable cohort snapshots and subtraction-resistant policy are absent. ADR-0064 keeps #816 bounded and filter-free. | Stored cohort dimensions plus an explicit privacy decision and inference tests justify the filter. |
| Item | Reason for deferral (ADR-0068, amended 2026-10-14) | Reopen when |
| --- | --- | --- |
| Real-provider calibration/value and 5k-corpus activation evidence (#1101/#1152) | MVP runs without an embedding provider; preview/suggestion surfaces remain absent while unavailable. Fake-vector checks cannot prove semantic value. | internal embedding/LLM API approved |
| 58-5 two-week preview allowance review | Provider-free MVP has no real preview use to measure; review exhaustion and latency after two weeks of actual post-MVP use. | internal embedding/LLM API approved |
| Unattended/provisional domain Cluster creation (choice c), system attribution and auto-Cluster provenance | Owner selected choice b; human confirmation gives the grouping value without unusable drafts and their lifecycle guards. | Real review workload shows human creation blocks the job, and the owner accepts a new autonomy ADR. |
| Transitive groups, auto expansion/join, batch acceptance, Cluster merge/split and accepted-work undo | Pair review is understandable; broader grouping/rewind adds ambiguous judgment and irreversible downstream work. | Repeated triage cases cannot be served by pair confirmation/manual membership; define acceptance and rollback guarantees in a new decision. |
| Per-MS switches, model/cut/schedule/quota consoles and automatic quota increases | Global initial pins and one workspace opt-in bound maintenance/cost. | Measured precision/workload or two-week preview exhaustion proves a need; owner approves revised policy. |
| Automatic idle/debounced preview, durable/shared drafts and draft dismiss/confirm/join | Unintended transmission and unbounded paid attempts; no persisted source decision identity. | Observed duplicate-check friction justifies new consent, budget and source-identity contracts. |
| Generic AI billing platform or new vector service/process | Existing Postgres, VOC ownership and in-process pg-boss fit the internal corpus. | Multiple real consumers require shared billing, or bounded/indexed Postgres work fails measured operational budgets. |

Bounded incremental/reconciliation scanning with transactional cursors and time
bounds shipped in #1097; its 5k-corpus timing is part of the deferred evidence. Real-provider
calibration/value, 5k-corpus activation evidence (#1101/#1152), and the 58-5
two-week preview allowance review are post-MVP under the 2026-10-14 amendment.
Generation remains off and unconfigured preview/suggestion surfaces are not
rendered; the provider-free MVP does not wait for that evidence.

### Slice 54 — ADR-0065 (2026-10-13)

| Deferred item | Product reason | Reopen when |
| --- | --- | --- |
| Standalone pre-Finding Evidence capture/inbox/lifecycle, bulk promotion and taxonomy | Saved-fragment retrieval reaches the owning Finding without introducing another synthesis model or duplicate editor. | Observed daily work needs evidence before a Finding; decide ownership/lifecycle/migration in a new ADR. |
| Evidence execution coverage KPI, exact inventory totals/facets, export and automatic summaries | Every stored highlight already has a Finding; execution absence is not automatically a gap. Bounded retrieval solves the accepted job without BI or extra disclosure. | A demonstrated operational job and explicit metric/disclosure contract justify it. |
| Picker excerpt-text search and additional cohort filters | Question/excerpt paging reuses the accepted result privacy boundary without new inference paths. | Real selection workload requires richer search; decide eligibility and inference tests before implementing. |
| Marking approved excerpts already attached to the Finding in the picker (#1110 follow-up; owner, session 77) | Which excerpts a Finding holds lives only in Survey's private binding (ADR-0064); showing it needs a new Survey-owned definer, a candidates field and a migration. A repeat attachment adds one more evidence row, with no wrong or leaked data. | Repeat attachments are observed in real use; add a Survey-owned narrow read gated on Finding read plus `survey.read`, with privacy tests. |

#739/#740 and #1040/#816 remain scheduled MVP implementation dependencies, not deferrals.
