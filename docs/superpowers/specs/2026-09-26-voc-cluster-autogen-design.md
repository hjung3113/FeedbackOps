# RESEARCH-4 — VOC Cluster candidate auto-generation

Read-only pre-issue research. No implementation, no contract change. Sources are the ADRs, the VOC Cluster and recommendation services, the API contract, and `CONTEXT.md`. Line numbers are from the tree as read on 2026-09-26. Revised in place after `.review/RESEARCH-4-voc-cluster-autogen-OPUS-REVIEW.md`; the citations that review challenged were rechecked the same day.

**Do not implement an unattended cluster writer on the current contracts.** ADR-0031, ADR-0034 D3, FR-VOC-004, and `CONTEXT.md` agree that a cluster is created only by an authorized person. They do not disagree with each other, so there is no tiebreak to apply. A cron that inserts `voc_clusters` rows is a reopen of those decisions, not a job that can be dropped in beside them.

That reopen is not the only choice. §6 puts three options in front of the product owner and recommends a shadow job — the same pairwise query, no cluster write — as what to build now. The writer design in §5 stays a sketch for the reopen, if it is ever accepted.

---

## 1. What ADR-0031 actually reserves

ADR-0031 does **not** reserve auto-creation of clusters. It defines a temporary peer hint, and it says clustering stays manual.

The decision sentence:

> "Similar" temporarily means active, authorized peers in the same workspace and same primary Managed System, excluding the source VOC. All reporter-facing statuses and all ages are eligible. This is deliberately a weak heuristic, not #127 clustering, which remains manual/confirmed; real similarity is deferred to #168 / Phase-1.

(`docs/adr/0031-similar-voc-same-managed-system-heuristic.md`, Decision, lines 18–22.)

The #127 amendment is explicit that the heuristic must not become a cluster status:

> #127 ships this heuristic as explicitly labelled temporary scaffolding and does NOT widen `voc_clusters.status` to `suggested`; recommendations are modelled as a separate DTO/state machine whose confirmation creates a `draft`/`confirmed` cluster (#127 decision D1).

(Same file, lines 31–34.)

What it defers is **embedding similarity**, later specified by ADR-0034, not an unattended cluster writer:

> **Design decided 2026-07-26.** ADR-0034 records how #168 builds that infrastructure (pgvector, an embedding provider port with a deterministic offline fake, a versioned embedding store, and a recommendation resource with dismissal state). The heuristic described below remains the shipped behavior until that recommendation resource lands; this ADR is amended at that point, not before.

(Same file, lines 36–41.)

The 2026-07-27 amendment kept the heuristic **beside** the recommendation resource, as a fallback when `available: false` (provider disabled, or source not yet embedded). It did not promote the heuristic into a clustering rule (lines 43–47).

The rest of ADR-0031 is a read projection: `similar_count`, at most three `similar.items` on detail, ordered `created_at DESC, id DESC`, visibility = `voc.read` on the peer's Managed System or "the actor reported that peer", no migration, no new endpoint for the detail projection (lines 61–81). The create surface consumes the same heuristic before a source VOC exists (line 92); that surface is ADR-0046, still a read, still not a cluster write.

Nothing in ADR-0031 discusses a background scan, a size threshold, a confidence cut, or creating a `voc_clusters` row without a person.

---

## 2. What a person does today — and what candidate-peers is not

There are three different "similar VOC" surfaces. Only one of them writes a cluster, and it is not `candidate-peers`.

### 2.1 Manual create does not look at suggestions

`POST /voc-clusters` inserts one draft row and no members.

`createCluster` (`apps/backend/src/modules/voc-clusters/service.ts` 207–269):

1. Lock the Managed System; 404 if missing; `conflict.parent_archived` if archived.
2. Require `finding.manage` on that Managed System (`canManageCluster`, lines 127–140). There is no `voc_cluster.*` capability (API contract authz row, `docs/implementation/api/voc-clusters.md` line 44).
3. Optionally check `owner_user_id` is an `internal_member` in the workspace.
4. `insertVocCluster` allocates `core.next_display_id(..., 'cluster')` and inserts `status = 'draft'` (`apps/backend/src/modules/voc-clusters/repo.ts` 140–183). `created_by` is the session actor and is `NOT NULL REFERENCES core.actors` (`apps/backend/migrations/0022_voc_clusters.sql` lines 13–20).
5. Audit `voc_cluster_created` in the same transaction. Detail is `voc_cluster_id`, `primary_managed_system_id`, `title`, `summary_present`, `status` (`packages/shared/src/audit/voc-cluster.ts` 23–29). No origin field.

The create body is title (1–200), Managed System, and optional summary / severity / confidence / rationale / owner (`packages/shared/src/voc-clusters/index.ts` 14–24). The screen sends only title, optional summary, and Managed System (`apps/frontend/src/routes/_authed/voc-clusters/index.tsx` 184–191, modal copy `클러스터 생성` / `제목` / `요약 (선택)` / `Managed System`). Members are not part of create. On success the UI navigates to the new detail route (lines 137–143).

Confirm is a later `PATCH` with `status: 'confirmed'` only. The server stamps `confirmed_by` / `confirmed_at`; the client cannot send them (`docs/implementation/api/voc-clusters.md` line 35).

### 2.2 `GET /voc-clusters/:id/candidate-peers` is a membership picker, not a scored group

It cannot run until a cluster already exists. The SQL returns **every active VOC** in the cluster's workspace and Primary Managed System that is not already a member of **this** cluster, newest first, with no score and no cap (`repo.ts` `listSameManagedSystemCandidatePeers`, lines 390–409):

- `workspace_id` match
- `primary_managed_system_id` match
- `archived_at IS NULL`
- `NOT EXISTS` member of this `cluster_id`
- `ORDER BY created_at DESC, id DESC`

`listCandidatePeers` (`service.ts` 353–392) then drops candidates the caller cannot read (`isAuthorizedCandidatePeer`: admin, `voc.read` on the candidate Managed System, or the caller reported it — lines 159–166). The response is exactly:

```text
{ candidate_basis: 'same_managed_system_active_voc',
  candidates: [{ voc_id, display_id, title, severity, reporter_facing_status }] }
```

The contract names what this is (`docs/implementation/api/voc-clusters.md` line 34):

> This is temporary same-Managed-System membership-picker scaffolding, not semantic or embedding similarity; it emits no score, confidence, or rationale.

The only UI caller is `AddVocModal` (`apps/frontend/src/features/voc-cluster/components/modals/AddVocModal.tsx`). The person sees current members (disabled, badge `이미 포함됨`) plus every readable candidate, picks **one** id, and submits `POST /voc-clusters/:id/vocs`. One click adds one VOC. `addMember` (`service.ts` 515–580) re-checks `finding.manage`, rejects archived or unreadable VOCs as 404, rejects a different Managed System as `validation.failed` / `out_of_scope`, and audits `voc_cluster_member_added` only on a real insert. Idempotent re-add returns 200 and writes no second audit.

So the human loop the endpoint supports is: **name a cluster, pick a Managed System, then optionally attach individual same-system VOCs one at a time.** It is not "accept some subset of a similarity ranking." Treating the candidate list as an auto-cluster input would put every active VOC in that Managed System into one cluster. ADR-0031 itself calls that predicate a weak heuristic (see §1).

A VOC may belong to more than one cluster. The member primary key is `(cluster_id, voc_id)` only (`0022_voc_clusters.sql` lines 32–37). There is an index on `voc_id`, not a unique constraint.

### 2.3 The path that already creates a cluster from a suggestion

That path is recommendation **confirm**, and it is deliberately manual.

ADR-0034 D3 (`docs/adr/0034-voc-embedding-similarity-infrastructure.md` lines 71–82):

> Recommendations do **not** widen `voc_clusters.status` (ADR-0031 amendment, #127 decision D1). They are their own table with their own state machine: `suggested` → `dismissed` | `confirmed`. Confirmation is the only path that creates or joins a `draft`/`confirmed` cluster, and it stays an explicit authorized action — no auto-clustering, satisfying FR-VOC-004's second criterion.
>
> Dismissal is persisted per (source VOC, candidate VOC, actor scope) and survives recomputation: a recomputed run must not resurface a dismissed pair under the same embedding version. A new embedding version clears that suppression, because the ranking that produced the dismissal no longer exists.

The service comment matches (`apps/backend/src/modules/voc/recommendations/service.ts` 246–249):

> The only path that creates or joins a cluster (ADR-0034 D3, FR-VOC-004 criterion 2). Nothing about computing recommendations writes a cluster row; clustering happens here and only when a person asks for it.

`confirmRecommendation` (same file, 251–355), inside one transaction:

1. Load the pair under the ADR-0031 visibility predicate.
2. Reject the pair if the two VOCs have different Primary Managed Systems (`validation.failed`, `out_of_scope`). Cluster membership is single-Managed-System.
3. If the source VOC is already a member of a cluster in that workspace and Managed System, **join the newest** (`selectClusterIdForVoc`, `recommendations/repo.ts` 257–278: `ORDER BY created_at DESC, id DESC LIMIT 1`). The comment there records that multiple clusters are possible "through the manual cluster surface."
4. Otherwise `createCluster` with `title` = the source VOC's title and `primary_managed_system_id` only — no summary, severity, confidence, rationale, or owner — then `addMember` for the source.
5. `addMember` for the candidate.
6. Upsert a `confirmed` recommendation decision bound to that cluster and embedding version.
7. Audit `voc_recommendation_confirmed` (subject = the cluster) with `source_voc_id`, `candidate_voc_id`, `embedding_version`, `scope_key`, `voc_cluster_id`, `cluster_created`, and `primary_managed_system_id` (`recommendations/service.ts` 340–348). The nested `createCluster` / `addMember` also write `voc_cluster_created` and `voc_cluster_member_added`.

The cluster stays `draft`. Confirm does not confirm the cluster and does not create a Finding.

`listRecommendations` is proven not to write clusters: `recommendations.integration.test.ts` lines 838–866 ("(g) no auto-clustering") seeds two above-threshold candidates, reads recommendations, and asserts zero `voc_clusters` and zero `voc_cluster_members`.

FR-VOC-004 (`docs/design/04-voc-system.md` 244–254), priority SHOULD:

> - System recommends similar VOCs using embedding similarity.
> - Recommendation does not auto-cluster without authorized confirmation.
> - Recommended matches can be dismissed.

`CONTEXT.md` lines 209–211 and 306–308:

> **VOC Cluster**: A manually curated grouping of related **VOC** records …
>
> MVP **VOC Cluster** supports manual create, add/remove membership, and confirm; cluster merge/split is a later feature.

The API contract repeats the last clause: "Cluster merge and split endpoints are out of scope for MVP" (`docs/implementation/api/voc-clusters.md` lines 24–25). There is no `DELETE /voc-clusters/:id`. Undo today is `DELETE /voc-clusters/:id/vocs/:voc_id` (audited `voc_cluster_member_removed`). The detail panel only offers that button while `status === 'draft'` (`VocClusterDetailPanel.tsx` around the `canRemove` prop); the service itself does not check draft before delete. An emptied cluster row remains.

### 2.4 What "replicate the human" would have to copy

If auto-generation is meant to approximate the **confirm** loop, not the candidate-peer list, the mechanical analogue of one human confirmation is:

| Human step | Already stored as | Unattended analogue |
|---|---|---|
| Judge a pair similar enough | cosine ≥ pinned 0.75, on read, cap 10 (`recommendations/constants.ts` `VOC_RECOMMENDATION_SIMILARITY_THRESHOLD`, `VOC_RECOMMENDATION_LIMIT`) | A job must run its own similarity query. The HTTP recommendation read is actor-scoped and capped; it is not a workspace grouping API. |
| Refuse a pair they already dismissed | `voc_recommendation_decisions`, per source, candidate, scope, embedding version. The unique key is directional (§4.2) | A job has no actor scope, and a pairwise scan must check both orientations. See §4. |
| Stay inside one Managed System | confirm rejects cross-system pairs; `addMember` rejects them | Same predicate. Never fall back to "all active VOCs in the system." |
| Name the cluster | confirm copies the source VOC title; the create modal asks the person to type one | No honest automatic name exists. Copying a VOC title is the only shipped precedent, and it leaks that title onto a cluster readable with `finding.read` but not `voc.read`. |
| Leave it a draft | `insertVocCluster` always writes `draft` | Do not auto-confirm. |
| Not create a Finding or Task Request | separate commands, `finding.manage`, idempotency key | Out of scope for any auto job. |
| Add members one at a time, possibly skipping most of the picker | `addMember` | Add only the pair (or the decided group), not the candidate-peer list. |

---

## 3. Trigger — proposal, not a default

**Do not scan `candidate-peers`.** That query has no confidence, no minimum size, and its result set is "everyone else in the Managed System." A similarity scan only makes sense on top of the ADR-0034 vectors. A scan that **inserts** clusters only makes sense after D3 / FR-VOC-004 / `CONTEXT.md` are amended. A scan that only records what it would insert does not need that amendment (§6 choice (a)).

**Do not write the cluster inside the VOC create request.** ADR-0034 D6 already separates the two: create and title/description edits enqueue an embedding job; a cron backfills; recommendations are computed on read, not materialized (`docs/adr/0034-…md` lines 121–127). The enqueue helper's own rule is that a VOC write must never fail because the embedding queue failed (`apps/backend/src/modules/voc/embedding/enqueue.ts` lines 1–16), and the job waits 5 seconds so the worker does not race the commit (`VOC_EMBED_START_AFTER_SECONDS`). A brand-new VOC has no vector yet. An "on create, immediately cluster" hook would either no-op or block the report on a provider call. Both are wrong.

**Proposed trigger: a pg-boss cron in the VOC jobs module, not a second runner.** ADR-0009 already allows a new job type without reopening the runner decision (`docs/adr/0009-background-jobs-with-pg-boss.md` lines 50–59). The queue, registration, cron, and batch shape to copy is `voc.embedding_backfill` (`apps/backend/src/modules/voc/jobs/embedding-backfill.ts`). The audit and actor shape is **not** a pattern to copy — no job in this repo has ever written one (§4.4).

- Queue name `<module>.<action>`. The near-term job is `voc.cluster_autogen_shadow` (§6 (a)). The writer, if the reopen lands, is `voc.cluster_autogen` (§6 (c)). Pre-create the queue in a migration; boot throws if it is missing (backfill lines 138–143).
- Register from `registerVocJobs` (`jobs/index.ts`), workers inside the backend process.
- Cron via `boss.schedule`. The embedding backfill uses `*/15 * * * *`, batch 200, and reports `remaining` rather than silently dropping the tail (lines 27–36, 111–121). A cluster scan should be at least that coarse. Clustering is a product side effect, not an index repair, so faster than the embedding cron buys nothing and can race vectors that are still being written.
- Handler idempotent (ADR-0009: `INSERT … ON CONFLICT` or check current state; payload carries `correlation_id`). The shadow handler's idempotency is "logging the same would-be group twice is harmless." The writer's is "the same member set does not insert a second draft."
- A writer that mutates clusters owes an audit row in the same transaction (ADR-0009 lines 47–48). That clause has never been called: no job writes a domain audit row, no `system.`-prefixed event type exists, and the `system` actor is seed-only. See §4.2 and §4.4. Do not treat "use the system actor" as a lookup that already works.
- Disabled embedding provider: the handler returns without writing, the same way backfill returns `skipped: true` (ADR-0034 D2: ingestion enqueues nothing; the surface says "not available" rather than pretending). **No same-Managed-System fallback.** That fallback is exactly the failure mode in §2.2.

Enqueue-on-embed-completion can be a latency optimization later, the way enqueue-on-write is an optimization on top of embedding backfill. It is not the source of truth. The embed worker finishing does not mean the peer's vector exists, and a retry of the embed job must not create a second cluster.

The cron cannot call `GET /vocs/:id/recommendations`. That read applies the caller's visibility predicate and a limit of 10 before it returns (ADR-0034 D4; `selectVocRecommendations` in `recommendations/repo.ts` 61–135). A system scan needs a workspace-scoped query that:

- joins `voc_embeddings` at the **active** `embedding_version` only (other versions are inert, ADR-0034 D2);
- keeps pairs whose Primary Managed System is the same;
- excludes archived VOCs;
- applies cosine similarity `1 - (embedding <=> embedding)` the same way the read model does;
- applies a cut (see §4 — do not silently reuse 0.75);
- excludes pairs that already produced a cluster or that a persisted auto-formation record says were rejected;
- respects dismissal in **both** orientations (see §4.2). The recommendation read filters only `d.source_voc_id = source`. A shadow job uses the same exclusion so its "would form" log is not a list of pairs a triager already refused;

Recommendations stay computed on read until a measured latency problem (D6). This job would be a writer, not a cache of the recommendation resource. Do not materialize recommendation rows just to have something to cluster.

**Group shape is part of the open autonomy question, not a default.** The shipped confirm path is a pair: source + one candidate. Transitive closure (A~B and B~C ⇒ one cluster of three) is how unrelated reports get merged. A first implementation that is allowed to exist at all should form pairs only, and should refuse to auto-attach a VOC that is already a member of any cluster in that Managed System. Joining "the newest cluster" is what confirm does for a human who is looking at a specific source; a cron doing that will keep pouring new VOCs into an old draft the person is no longer curating.

The reverse direction is not the cron's code, and the original note missed it. `confirmRecommendation` joins the newest cluster the source VOC is already in, and it does not care who created that cluster. Once an auto-origin draft contains the source, a human confirm pours the candidate into it. See §4.6. That rule is a decision-record item whichever of the §6 choices is picked. Sorted member ids make a formation idempotency key symmetric; they do not make the dismissal lookup symmetric.

---

## 4. Risks and safeguards already established elsewhere

### 4.1 Over-clustering is the main product risk

Same-Managed-System co-membership is not similarity. A busy system with dozens of unrelated open VOCs is one candidate-peer list. An embedding graph is better and still wrong in known ways:

- The 0.75 cut is **unvalidated against real provider vectors**. ADR-0034 D5 (amended 2026-07-27, lines 104–119) says the committed fixture pins harness arithmetic, not the quality of the cut. `recommendations/constants.ts` lines 12–23 repeats that. A false positive on a recommendation can be dismissed. A false positive that inserts a draft cluster shows up in the triage list (`전체` and `Finding 없음` both include drafts — `apps/frontend/src/features/voc-cluster/components/detail/VocClusterListShell.tsx` lines 35–40 and 108–119) and can be confirmed, turned into a Finding, or given a bulk public-update candidate by someone who trusts the grouping. Asking "what cut?" with no real-provider run is not answerable. The shadow job in §6 (a) is the measurement; it is also why that job should be built before any writer.
- Transitive grouping snowballs. Pairwise does not.
- A VOC already in a human cluster must not be silently pulled into a second one. Multiple membership is legal today; auto-generation should not rely on that accident.
- Copying a member title into `voc_clusters.title` publishes that title to anyone with `finding.read` on the Managed System, including people who cannot `voc.read` the member. Confirm already does this for one human-chosen pair. A cron would do it for every pair it likes. It is worse than that one leak: the list DTO shows `title` to the cluster-read audience while members are filtered (`authorizedMembersByCluster` in `voc-clusters/service.ts`). A cron draft whose only members the viewer cannot read still shows that viewer a VOC-derived title. A safe default for auto drafts, pending prototype copy, is a synthetic non-content title (display id plus an auto marker), not a copied VOC title.
- New `embedding_version` clears dismissal suppression on purpose (D3). A cron that re-runs on version bump will recreate clusters a person already dismantled, unless rejection is stored separately from the recommendation decision and is **not** cleared by a version bump.
- **Cap drafts created, not only rows scanned.** Backfill bounds its batch and reports `remaining`. That limits work per tick. It does not limit how many clusters one tick inserts. A version bump on a busy Managed System clears dismissal suppression and can propose hundreds of pairs in one run. Choice (c) needs a hard cap on drafts created per Managed System per run, with the tail reported the same way backfill reports `remaining`. Without the cap, the noise scenario in §4.3 arrives in a single tick. The shadow job should log the same count, so a later cap is taken from a real run rather than invented.
- **A formed pair goes stale and nothing notices.** D6 re-embeds a VOC when its title or description changes. Archiving a VOC drops it from the peer query. Neither path revisits a cluster a cron already wrote, so the draft formed on the old vector stays. Humans own that judgment on clusters they formed. A cron that formed the pair either re-checks it — and the reaction is a flag, not a silent split, because split is a later feature — or the formation record stores the member vector timestamps so drift is visible. Nothing in the current schema does either. This blocks a careful (c). It does not block (a): a shadow log is point-in-time and leaves no membership behind.

### 4.2 Safeguard patterns ADR-0034 already locked — reuse the pattern, do not weaken it

| Pattern | Where | What auto-generation must not do |
|---|---|---|
| No auto-cluster; confirm is the only writer | D3 lines 75–78; consequences line 142; FR-VOC-004; integration test `(g)` | Cannot ship a writer without amending these in the same change. The test will fail on purpose if a read path starts inserting clusters. The job must not be wired through `listRecommendations`. |
| Do not widen `voc_clusters.status` with `suggested` | ADR-0031 lines 31–34; D3 lines 73–74 | An auto row, if ever allowed, is still `draft` or it is a different table. A third status reopens the decision that was already rejected. |
| Dismissal survives recomputation for the same embedding version | D3 lines 80–83; unique key `(source_voc_id, candidate_voc_id, embedding_version, scope_key)` (`0044_voc_recommendation_decisions.sql` 49–50); read filter `d.source_voc_id = source` only (`recommendations/repo.ts` 109–116) | The key is directional. A triager who dismissed B on A's panel has not suppressed A on B's panel. A pairwise job must check **both** orientations or it misses half the dismissals. Sorted member ids (§5) make the idempotency key symmetric; they do not make this lookup symmetric. **Open:** dismissal is also per actor scope. A system job has no scope. The conservative reading is "any dismissal of the pair, in either orientation, blocks auto-formation for that version." The opposite reading (ignore dismissals; they were about the recommendation chip, not about clustering) will re-merge pairs a triager already refused. Do not pick the scope question here. Do not leave the orientation question open — both directions are the check. |
| One global threshold, pinned in code, no workspace column, no env var | D5 lines 94–119 (lines 84–92 are D4, not D5); `VOC_RECOMMENDATION_SIMILARITY_THRESHOLD` | A per-workspace aggressiveness knob, or a looser cut for auto-create, contradicts D5. A stricter second constant is a new decision and needs its own fixture update in the same change (`fixture-pins-threshold.test.ts` fails if 0.75 moves without the fixture). Do not start from "reuse 0.75." Suggestion-quality and auto-write-quality are different costs. The cut stays unmeasured until a real-provider run (D5 lines 113–119); §6 (a) is that run. |
| Disabled provider is honest, never a silent empty list and never a lexical fallback | D2 lines 62–63; D5 consequences lines 154–155; backfill `skipped` | If embeddings are off, the job no-ops. It must not scan candidate-peers instead. |
| Filter before count or identifier leaves a service | D4 lines 84–92 | The job sees the whole workspace, which is fine for a system actor. The list/detail DTOs must keep filtering members. Do not add an auto-origin field that includes raw scores or hidden VOC ids on the list DTO for a caller who cannot read those VOCs. |
| Version on the row; other versions inert | D2 lines 65–69 | Formation identity includes `embedding_version`. Do not compare vectors across versions. |
| Same-Managed-System only | confirm lines 264–274; `addMember` lines 551–555 | Hard reject, not a soft penalty. |
| Cluster does not merge VOC rows, is not reporter-visible, does not auto-send public updates | FR-VOC-003 lines 238–241; FR-VOC-005 "MVP does not auto-send cluster updates"; `CONTEXT.md` 306–309 | Auto-create must not archive, merge, or notify reporters. Draft only. No Finding, no Task Request, no public update. |
| Job audit + system actor + idempotency | ADR-0009 lines 41–48; seed `apps/backend/src/seed/index.ts` 13, 44–50; `checkFindingManage` `findings/authorization.ts` 68–86 | There is **no permission wall**. The seeded `system` actor is `role_level: 'admin'`, `actor_type: 'system'`. `checkFindingManage` returns `{ allow: true, via: 'role' }` for any admin before the elevated-role policy. `addMember`'s readability check also passes: `actorReadScope` is `{ kind: 'all' }` for an admin (`scope-service.ts` 53–54, via `voc/authorization.ts` `actorReadScope`; `isAuthorizedMember` treats `kind === 'all'` as readable, `voc-clusters/service.ts` 153). A job holding that actor can call `createCluster` / `addMember` today. The risk runs the other way. Those HTTP-shaped services would accept the call and emit `voc_cluster_created` / `voc_cluster_member_added` under user-shaped names, with no origin field and no authorization backstop. The internal command must not route through them. Do not "fix" this by granting `finding.manage` — the admin bypass already satisfies it. The job's own eligibility predicate is the only guard: active, same Managed System, not already clustered, not dismissed in **either** orientation. That predicate needs its own mutation-tested suite. The `system` actor is also seed-only (§4.4); the FK allowing any actor does not mean every workspace has one. |
| Minimum size | not in ADR-0034 | Confirm's minimum is 2, because a recommendation is a pair. Candidate-peers has no minimum. Any auto rule below 2 is a cluster with no evidence. Any rule whose membership test is "same Managed System" has no safe minimum. |

### 4.3 Undo

Split is a named later feature (`CONTEXT.md` line 308; API contract lines 24–25). This issue should not smuggle a split API in as "undo."

What exists: remove one member (draft in the UI, any status in the service), edit title/summary, confirm. What does not exist: delete cluster, archive cluster, split, un-confirm.

A proportionate undo, if auto drafts are allowed, is a discard of an **auto-origin draft that has no Finding link and no applied public update**, audited, leaving the VOC rows untouched. That is not split. Member-by-member removal is already there but leaves an empty shell, which is a poor undo for a cron that may create many shells. Whether discard is in scope is part of the product decision; shipping auto-create without a discard leaves triage to clean up with a tool that was not designed for bulk noise.

Discard cannot be `DELETE FROM voc_clusters`. `fops_app` is granted only `SELECT, INSERT, UPDATE` on `voc_cluster.voc_clusters` (`0022_voc_clusters.sql` line 47). `DELETE` is granted on members only (line 51). Two real foreign keys have no `ON DELETE`, so Postgres treats them as `NO ACTION` and rejects the delete while a child row exists: `voc_cluster_members.cluster_id` (line 33) and `voc_recommendation_decisions.cluster_id` (`0044_voc_recommendation_decisions.sql` line 33). The review grouped `core.entity_links` with those FKs. It is not one: `source_id` and `target_id` are polymorphic uuids with no `REFERENCES` clause (`0018_entity_links.sql` lines 9–12), so that table would not raise a constraint error. A hard delete would still leave dangling ids, and `fops_app` cannot delete link rows either (`0018` line 55 grants `INSERT, SELECT`; `0019` adds `UPDATE` only, and says hard delete stays unavailable). The discard shape is a soft column on the cluster. Widening the `voc_clusters` `DELETE` grant is a separate decision, and it would not get past the two foreign keys.

"No Finding link and no applied public update" is not a sufficient guard. A human who later confirms a recommendation onto the auto draft (§4.6) has written a `confirmed` decision whose `cluster_id` points at it, and has added a member the person chose. Discarding that row throws away human work. The §4.6 rule — ignore auto-origin drafts in the join, or promote on any human add and then refuse discard — has to be in place before a discard command exists.

### 4.4 Audit additions — greenfield, not a pattern to copy

Adding an event type is not an ADR-0008 reopen (`docs/adr/0008-audit-log-storage-and-immutability.md`: new `event_type` values are added to `AUDIT_EVENT_TYPES` and `AUDIT_EVENT_DETAIL_SCHEMAS`). ADR-0009 wants a `system.` prefix when no user initiated the work (lines 47–48). Existing cluster events have no such prefix and no origin field (`packages/shared/src/audit/voc-cluster.ts` 11–29, 79–84).

No job in this repo has ever written a domain audit row as a system actor, and no `system.`-prefixed event type exists under `packages/shared/src/audit`. The only jobs that mention audit say they write none, because they are cache evictions rather than domain mutations (`apps/backend/src/modules/core/jobs/rate-limits-purge.ts` lines 11–12; `idempotency-purge.ts` lines 7–8). An auto-cluster writer would be the **first** caller of that ADR-0009 clause. The registry entry, the actor lookup, and the prefix-versus-`voc_cluster_*` vocabulary reconciliation are all new work. Do not describe them as copying `voc.embedding_backfill`.

The `system` actor is seed-only. `apps/backend/src/seed/index.ts` (lines 44–50) inserts one row, `externalId: 'system'`, `roleLevel: 'admin'`, `actorType: 'system'`, into `config.WORKSPACE_ID` (lines 146–169). Nothing else in `apps/backend/src` inserts `actor_type = 'system'`. Actors are workspace-scoped. Mock login lists one workspace and excludes `actor_type = 'system'` (`mock-auth-provider.ts` line 38), which is why that actor cannot log in — not why a cron can assume it exists everywhere. ADR-0009's "seeded `system` Actor" names that seed row. A workspace-scoped cron has nothing valid to put in `created_by`, `added_by`, or `audit.actor_id` on any workspace the seed did not touch. Provisioning one system actor per workspace is its own line item (sub-scope S). It lands before any writer. A log-only shadow job does not need it; the moment the shadow record is a domain audit row, it does, and that would still be the first `system.` event.

Calling `createCluster` / `addMember` does not supply the event for free. Those services would accept the admin system actor (§4.2) and emit `voc_cluster_created` / `voc_cluster_member_added`, user-shaped names with no origin. That hides a system write inside the human lifecycle stream. The internal command writes its own event.

Sketch, if the reopen happens — proposal for that first event, not an existing shape:

- Keep `voc_cluster_created` / `voc_cluster_member_added` so the lifecycle stream stays one shape. Extend `vocClusterCreatedDetailSchema` with an origin enum (`manual` | `recommendation_confirm` | `auto`) only if every current writer is updated in the same change. Today both the modal and `confirmRecommendation` emit the same event; a new required field breaks the registry tests (`packages/shared/src/audit/__tests__/`).
- Add `system.voc_cluster_auto_formed` (name illustrative) whose detail carries `embedding_version`, the cut that was applied, the member VOC ids, the scores, `primary_managed_system_id`, `cluster_created` vs joined, and `correlation_id`. Subject = the cluster. Do not reuse `candidate_basis: 'same_managed_system_active_voc'` — that literal means the unscored picker (`packages/shared/src/voc-clusters/index.ts` 76–80).
- A discard command gets its own event, not a silent member-delete loop. `voc_cluster_member_removed` does not record why.
- Do not invent `system.` copies of member-added unless ADR-0009 is read as requiring the prefix on every system write. The prefix rule and the existing `voc_cluster_*` vocabulary should be reconciled in the ADR amendment rather than doubled.

### 4.5 Frontend

The list does not know origin. `ClusterRow` shows display id, title, status badge (`초안` / `확정`), `VOC {n}개`, and created date (`apps/frontend/src/features/voc-cluster/components/detail/VocClusterListShell.tsx` 188–215; labels in `features/voc-cluster/lib/presentation.tsx` 9–10). Tabs are `전체`, `확정`, `Finding 없음`. Auto drafts land in `전체` and `Finding 없음` with no distinction from a person's draft. That is enough to confuse triage, so **yes, the list and the detail header need a visible auto-vs-manual distinction if auto drafts share this list.**

That distinction is not in the prototype. Root `AGENTS.md` says layout and copy come from `docs/design-prototype/`, and a deviation needs an ADR or an explicit user OK. Do not invent the badge string in the implementation issue. The create modal, the add-VOC picker, and the triage panel's Cluster 추천 confirm/dismiss actions stay as they are; ADR-0034's consequences (lines 136–142) say confirmation remains an explicit user action on that surface. An opt-in setting would be a new admin control on `GET/PATCH /workspace/settings`, which today exposes only `permission_self_approval` and `survey_anonymity_threshold` (`docs/implementation/api/core.md` lines 22–41; `migrations/0041_workspace_settings.sql`).

### 4.6 `confirmRecommendation` will join an auto draft

`selectClusterIdForVoc` (`recommendations/repo.ts` 257–278) returns the newest cluster the source VOC already belongs to in that workspace and Managed System (`ORDER BY created_at DESC, id DESC LIMIT 1`). It does not look at who created the cluster. §3 already says the **cron** must not use that rule for its own writes. The missed direction is the existing human path.

Once any auto-origin draft contains the source VOC, a person confirming a recommendation on that VOC adds the candidate **into the auto draft**. Three things follow:

- Origin stops being a property of the cluster. Human-confirmed members sit in a system-formed row.
- The `confirmed` decision's `cluster_id` now references the auto cluster. That is one of the foreign keys in §4.3, so a hard delete is blocked even if the grant existed, and a soft discard would throw away the human's confirm.
- "Discard auto-origin drafts" silently removes human work. "No Finding link and no applied public update" does not see this.

The decision record locks one of these two rules **whichever of §6 (a), (b), or (c) is chosen**. Do not leave it implicit:

1. `selectClusterIdForVoc` ignores auto-origin drafts. A human confirm creates or joins a manual cluster only.
2. Any human add — recommendation confirm or `addMember` — promotes the cluster's origin to `manual` and makes it non-discardable.

(a) creates no drafts, so the rule is latent. It is still written down before (b) or (c) can ship, so a later writer does not inherit silence. Under a pure (b) every draft is already created by a person's confirm, which is the current join-newest behavior and is fine. The hazard is specifically a system-origin row. The record should say the rule is required before any non-human origin can be written, and that (a) and a pure (b) have nothing to ignore or promote yet.

---

## 5. Rough design (choice (c) only — blocked on the reopen)

This section is the unattended writer. Choices (a) and (b) in §6 do not use it. Assume the product amends ADR-0034 D3, FR-VOC-004 criterion 2, and the `CONTEXT.md` "manually curated" / manual-create sentences in the same change that writes code. Until that amendment exists, the design is a proposal.

1. **Internal formation command** in the VOC Cluster module, not a new HTTP route, and **not** a call to `createCluster` / `addMember`. Those services would accept the admin system actor and emit `voc_cluster_created` under a user-shaped name (§4.2). Inputs: workspace, Managed System, embedding version, cut, ordered member ids, scores, correlation id. It attributes the row to the workspace's system actor (sub-scope S — the seed row is not that guarantee). It does not consult `finding.manage`; that check is already true for this actor and is not a backstop. The only guard is the command's eligibility predicate: every member is active, in that Managed System, not already clustered there, and the pair is not dismissed in **either** orientation. Inserts one `draft` plus members, or no-ops, in one transaction with the audit rows. Idempotency key: workspace + managed system + embedding version + sorted member ids (the sort is what makes the key symmetric; the dismissal lookup is a separate both-orientations check). Does not confirm, does not link a Finding, does not write a public update. Does not join the newest existing cluster (§4.6 is the human path's rule, not a license for the cron to join).
2. **Persisted formation record** (new table, not a status widening): the member set, version, outcome (`formed` | `skipped_already_clustered` | `discarded_by_human`), and the member vector timestamps so a later edit or archive is detectable (§4.1). A human discard writes `discarded_by_human` and sets a soft-discard column on the auto draft. It does not `DELETE` the cluster row (§4.3). Later cron runs and later embedding versions must not recreate a discarded set. This is the piece recommendation-dismissal does not give you, because dismissal is scoped, directional, and version-cleared.
3. **Cron** `voc.cluster_autogen`, registered next to `voc.embedding_backfill`, no-op when the provider is disabled. Pairwise only until a later decision says otherwise. Bounded batch **and** a hard cap on drafts created per Managed System per run, with the uncapped tail reported as `remaining`. Retry defaults from ADR-0009 (5, 30s, backoff). No same-MS fallback. Depends on sub-scope S.
4. **No new public create API.** Manual `POST /voc-clusters` stays the human path. `candidate-peers` stays the add-member picker.
5. **DTO origin**, if the list must distinguish: a field on `VocClusterDto` such as `origin`, populated for new and backfilled rows (`manual` for every row that exists today, including ones confirm created — those are human). List badge and detail line. Copy and visual design wait on prototype or user OK. Do not add a tab until that copy exists. A synthetic non-content title is the safe default until that copy exists (§4.1).
6. **Settings column only if the product picks opt-in.** Default off is the only shape that matches "we have never clustered unattended." A threshold column is a D5 reopen and should not be folded into the boolean. Admin-only `PATCH /workspace/settings`, audited `workspace_settings_updated`, same partial-update rules as the existing two fields.

### Sub-scope if this is split

| # | Scope | Notes |
|---|---|---|
| 0 | Decision record | Pick §6 (a), (b), or (c). (c) amends ADR-0034 D3, FR-VOC-004, `CONTEXT.md`, and the "no auto-clustering" test's contract before any writer code. (a) does not wait on that. **Decision-record line item, all three choices:** the §4.6 join-newest rule — `selectClusterIdForVoc` ignores auto-origin drafts, or any human add promotes origin to `manual` and makes the cluster non-discardable. Also record the per-MS draft cap and whether a formed pair is re-checked after re-embed or archive, so (c) does not invent them later. |
| 0.5 | Shadow job | **What to build now.** `voc.cluster_autogen_shadow`. The real pairwise query, no `voc_clusters` write, log or non-domain record of what it would form. New job type under ADR-0009; no D3 reopen. This is the measurement of the 0.75 cut. |
| S | System-actor provisioning + first system audit event | **Own line item.** Not folded into the formation migration. Guarantee every workspace has a `system` actor (the dev seed covers `config.WORKSPACE_ID` only). Register the first `system.`-prefixed domain event, the actor lookup, and the prefix vs `voc_cluster_*` reconciliation (§4.4). Prerequisite of any writer that sets `created_by`, `added_by`, or `audit.actor_id`. A log-only shadow run does not need it; a shadow record that is a domain audit row does. |
| 1 | Formation record + origin column | Migration, journal entry, shared Zod, backfill existing rows to `manual`. Soft-discard column lives here if discard ships with the writer. No job. The event registry itself is S, not this row. |
| 2 | Internal pairwise command + idempotency | Still no cron. Does not call `createCluster` / `addMember`. The eligibility predicate is the only guard, so the suite is the guard: disabled provider writes nothing; cross-MS writes nothing; archived VOC writes nothing; non-active embedding version writes nothing; already-clustered VOC writes nothing; dismissed pair writes nothing; **dismissal in the reverse orientation writes nothing**; replay writes nothing; VOC rows are not merged. |
| 3 | pg-boss queue, migration pre-create, writer cron | Depends on S and 2. Embedding-style boot test. Per-MS per-run cap on drafts created, not only a scan batch. |
| 4 | Discard auto-draft | Soft column, not `DELETE`, not a widened grant. Not split, not discard of manual drafts. Blocked if a Finding link or an applied public update exists, **and** blocked once §4.6 has promoted the row or a human confirm references it. |
| 5 | List/detail distinction | Blocked on prototype copy. Pixel-diff fixture update. Only if auto and manual share one list. |
| 6 | Workspace opt-in | Only if §6 (c) says opt-in. Settings API, admin screen, job reads the flag and no-ops when off. |

The near-term ship is 0.5 (and 0's written choice of (a), including the latent §4.6 rule). Slices 1–3 remain the smallest path that can form a draft, and they do not start until scope 0 picks (c) and the reopen lands. S lands before 2. 4 ships in the same release as 3; a writer cron without discard is the noise scenario. 5 ships in the same release as 3 if auto and manual share one list.

---

## 6. Open question — three choices, not "reopen or nothing"

Do not default how aggressive an unattended writer is. Do decide which of these three the issue is allowed to build. This research recommends **(a)** as what to actually build in the near term. (c) stays a full reopen and is not the default.

### (a) Shadow / dry-run job — build this

Queue `voc.cluster_autogen_shadow`. Runs the pairwise query in §3 (active version, same Managed System, archived excluded, cosine cut, both dismissal orientations, already-clustered excluded). Writes nothing to `voc_clusters`, `voc_cluster_members`, or `voc_recommendation_decisions`. Logs or records what it would have formed: member ids, scores, embedding version, Managed System, correlation id.

Needs **no** ADR-0034 / FR-VOC-004 / `CONTEXT.md` reopen. ADR-0009 already says adding a job type is not a reopen (line 59). D3, criterion 2, "manually curated", and integration test (g) stay true because no cluster row appears.

This is also the only way to measure the unvalidated 0.75 cut (D5 lines 113–119). The fixture pins harness arithmetic, not quality. A shadow run against the configured provider is the evidence any later reopen would need. Asking "what cut?" with no such run asks the product owner to guess.

Prefer an application log or a non-domain record. The moment that record is a `core.audit_log` row, sub-scope S lands first, because it would be the first `system.` event in the repo. No list change, no origin badge, no discard grant.

### (b) Proposed groups + human batch-confirm

A read-only "proposed clusters" surface, computed on read so D6 stays intact. Not a new `voc_clusters.status`, and not the rejected idea of materializing recommendation rows just to have something to cluster (§3). A cache and a propose-then-confirm surface are different.

A person confirms a proposed pair or group into one real `draft` in one action, through the existing authorized services. The writer is that person. `finding.manage`, `created_by`, and `voc_cluster_created` stay user-shaped. "Confirmation is the only writer" and "manually curated" stay true in substance. FR-VOC-004 criterion 2 forbids clustering *without authorized confirmation*. It does not forbid the system from proposing a group.

Needs at most a clarifying ADR-0034 D3 sentence: one confirmation may cover more than one pair. That is not a reversal of "no auto-clustering", not a `CONTEXT.md` rewrite, and not a new status. Most of the undo, origin-badge, system-actor, and foreign-key discard work in §4.3–§4.4 disappears, because no system-origin row exists.

### (c) Full unattended auto-write

What §5 describes. A cron inserts `draft` rows with no person in the loop. **This still needs the full reopen** of ADR-0034 D3, FR-VOC-004 criterion 2, and the `CONTEXT.md` "manually curated" / manual-create sentences, in the same change as the code. Test (g) encodes the current contract and will fail on purpose. There is no internal tiebreak that makes the reopen optional.

If (c) is the pick, the owner still answers these in writing before any migration. This research does not default them:

- Opt-in per workspace (default off) or on for every workspace. A settings column is a product choice. D5's "no workspace column" was about the threshold; a threshold column is still a separate D5 reopen and is not folded into the boolean. "On at 0.75, workspace-wide" would implement a rejected decision. "Off unless a flag is set" is also a product choice, and it still requires the D3 amendment.
- Pairs only, or transitive groups. Minimum size — the only mechanical floor that matches today's confirm path is 2. Cut: not silently the unvalidated 0.75; a stricter pinned constant needs its own fixture update. Whether any dismissal, in either orientation, blocks the pair. Whether a VOC already in a human cluster is ineligible. Whether a version bump may recreate a discarded group (if discard exists, the formation record says no). Provider disabled: the job no-ops. That last one is already D2; it is listed so it is not re-litigated as aggressiveness.
- The §4.6 join-newest rule. Required before any system-origin row exists. Recorded for (a) and (b) as well.
- The per-Managed-System per-run cap on drafts created, taken from shadow counts rather than invented.
- Whether a formed pair is re-checked when a member is re-embedded or archived, or the formation record only stores vector timestamps so drift is visible. The reaction is not a silent split.

(a) does not need the opt-in flag, the cut decision, the cap, or the stale-pair policy to ship. (b) needs the clarifying D3 sentence and the §4.6 line in the decision record, not the reversal of "no auto-clustering". (c) needs all of it.

The list impact follows the choice. (c), and (b) once people confirm many drafts, puts new drafts on `전체` / `Finding 없음` next to curated ones, so a visible distinction waits on prototype copy. A workspace that only runs the shadow job needs no frontend change.

---

## Revision (opus review addressed)

Revised in place against `.review/RESEARCH-4-voc-cluster-autogen-OPUS-REVIEW.md`. The conclusion that an unattended cluster writer needs a reopen of ADR-0034 D3, FR-VOC-004 criterion 2, and `CONTEXT.md` is unchanged. What the review confirmed — ADR quotes, `createCluster` / confirm flow, candidate-peers, multi-membership, test (g), the unvalidated 0.75 pin, enqueue-must-not-fail-the-write, list tabs — is still the body of §§1–2 and §4.1.

- **Permission wall removed.** The seeded `system` actor is `role_level: 'admin'` (`seed/index.ts` 44–50) and passes `finding.manage` via the admin bypass (`checkFindingManage`, `findings/authorization.ts` 79) and `isAuthorizedMember` via `kind: 'all'`. §4.2 and §5 no longer say the job must skip `finding.manage` or that the actor is not a Developer. The internal command must not call `createCluster` / `addMember`: those services would accept it and emit `voc_cluster_created` under a user-shaped name. The only guard is the eligibility predicate (active, same Managed System, not already clustered, not dismissed in either orientation).
- **§6 is three choices.** (a) `voc.cluster_autogen_shadow`, recommended as the near-term build, no reopen, and the only real measurement of the 0.75 cut. (b) proposed groups computed on read, human batch-confirm, at most a clarifying D3 sentence. (c) the original unattended writer, still the full reopen. "Reopen or nothing" is withdrawn.
- **Greenfield called out.** No job writes a domain audit row; the purge jobs say they write none; no `system.` event type exists. The `system` actor is inserted only by the dev seed, for one workspace. Sub-scope S is that provisioning plus the first system audit event, and it is a prerequisite of any writer, not a copy of `embedding_backfill`.
- **Discard is a soft column.** `fops_app` has no `DELETE` on `voc_clusters` (members do). `voc_cluster_members.cluster_id` and `voc_recommendation_decisions.cluster_id` have no `ON DELETE`. The review also named `core.entity_links` as such a foreign key. The schema does not declare one — `source_id` / `target_id` are polymorphic (`0018_entity_links.sql` 9–12) — so that table would not reject the delete. It would dangle, and `fops_app` cannot delete link rows either. The note records that distinction instead of repeating the shorthand. Widening the cluster `DELETE` grant is a separate decision and still would not pass the two real foreign keys.
- **Dismissal is directional.** Unique key `(source_voc_id, candidate_voc_id, embedding_version, scope_key)`; the read filters source→candidate only. A pairwise job checks both orientations. Scope 2's tests include the reverse orientation. Sorted member ids cover idempotency symmetry only.
- **Join-newest.** `selectClusterIdForVoc` does not care who created the cluster it joins. A human confirm would pour a member into a system-formed draft, which breaks origin and blocks discard. Scope 0 records one rule for all three choices: the lookup ignores auto-origin drafts, or any human add promotes the cluster to manual and non-discardable.
- **Two further risks.** A per-Managed-System per-run cap on drafts created (a version bump can otherwise insert hundreds in one tick). Formed pairs are not re-checked when a member is re-embedded or archived.
- **Citation-only.** D5 is lines 94–119; 84–92 is D4. `voc_recommendation_confirmed` detail also carries `voc_cluster_id` and `primary_managed_system_id`. `VocClusterListShell.tsx` is under `apps/frontend/src/features/voc-cluster/components/detail/`.

<!-- RESEARCH-4-DONE -->
<!-- RESEARCH-4-REVISED-DONE -->
