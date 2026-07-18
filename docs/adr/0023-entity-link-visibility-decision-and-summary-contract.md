# Entity link visibility decision and summary contract

`docs/design/11-entity-linking.md` FR-LINK-002 locks that entity-link reads enforce all four stored visibility tokens (`internal_only`, `summary_visible`, `visible_to_reporter`, `admin_only`) on both source and target, and that the linked-object UI visibility is backend-decided. `docs/implementation/05-permission-policy.md` (Summary-Visible Contract) and `docs/implementation/06-entity-linking-contract.md` (Visibility Enforcement) sketch the summary fields. `CONTEXT.md:195` already canonicalises the per-request verdict vocabulary as **UI Visibility Decision** = `allowed | hidden | summary_visible | request_access | denied`.

Those documents leave the operative shape open: exactly which decision each (stored-token × actor) pair yields, what `summary_visible` exposes when the only linkable entity is `voc`, where the evaluator lives, and which fields the Task reporter summary canonically carries (the three docs disagree). This ADR locks those decisions for issue #115 (Slice 4.4) and is the human-signed `summary_visible` contract the issue's HITL gate required.

The grounding constraint: production entity links today are **VOC↔VOC `related_to` only**, and creation is hard-locked to `visibility='internal_only'` (`packages/shared/src/entity-links.ts` `creatableEntityLinkVisibilitySchema = z.literal('internal_only')`). Slice 4.1–4.3 read paths emit only `allowed`/`hidden`. #115 closes the decision-vocabulary gap and writes the forward summary contract; it does **not** make richer link targets reachable.

## Section A — Decision vocabulary and the hidden/denied boundary

**Locked:** The backend-decided per-read verdict is the `CONTEXT.md:195` enum `allowed | hidden | summary_visible | request_access | denied`. Stored `visibility` (the four tokens) and the per-request decision are distinct: the decision is `f(stored visibility, actor scope, source readable?, target readable?, target summary available?)` and is never persisted.

The hidden/denied boundary:

- **`hidden`** — existence is concealed. Emitted whenever either endpoint is unreadable to the actor, or the stored token grants the actor nothing and acknowledging the row would itself leak (the default for out-of-scope actors and for Reporters/Users on internal links).
- **`denied`** — existence is acknowledged but full detail is refused. Emitted only when **both endpoints are otherwise readable** to the actor and the stored token still withholds detail — in this slice that is exactly `admin_only` seen by a non-Admin who can read both VOCs.

`hidden` is the safe default; `denied` is the narrow "you may know it exists, but not see it" case. Conflating them was rejected because an out-of-scope actor must not learn that an `admin_only` link exists, while an in-scope Developer legitimately may.

## Section B — `request_access` is deferred (amends the FR-LINK-002 state list for this slice)

**Locked:** `request_access` is **not reachable** in #115 and is not added to the entity-link read DTO. For VOC↔VOC `related_to`, a Reporter can never legitimately request to see another reporter's VOC, and creation is `internal_only`-only, so no read path can produce a requestable-blocked state. Effective entity-link read decisions in this slice are `allowed | hidden | denied`, with `summary_visible` defined in the contract but never emitted for a `voc` target.

`request_access` returns when a slice introduces a requestable link target (a Task/Finding endpoint a Reporter may petition to summarise). That slice re-adds the variant plus the FR-PERM-001 minimum-requestable-scope candidates the backend must supply (`05-permission-policy.md`); inventing requestable scopes client-side stays forbidden. Wiring a dead `request_access` path now was rejected as untestable fiction — nothing this slice can persist would exercise it.

## Section C — Decision table (stored visibility × actor)

**Locked.** Actor classes below assume `voc.read` is the read-authz capability on each endpoint's Managed System (the Slice 4.1 contract). "Dev in-scope" holds `voc.read` on both endpoints' Managed Systems; "Dev out-scope" holds it on neither (mixed readability resolves per Section D).

| stored \ actor | Reporter (own VOC) | User | Dev in-scope | Dev out-scope | Admin |
|---|---|---|---|---|---|
| `internal_only` | hidden | hidden | allowed | hidden | allowed |
| `summary_visible` | hidden (no VOC summary) | hidden | allowed | hidden | allowed |
| `visible_to_reporter` | allowed iff both VOCs share the reporter, else hidden | hidden | allowed | hidden | allowed |
| `admin_only` | hidden | hidden | denied | hidden | allowed |

Notes:

- **`summary_visible` for a `voc` target is `hidden`, never a synthesised summary.** A VOC has no reporter-facing summary contract (Section F defines summaries only for future non-VOC targets). The evaluator returns `summary_visible` only when `targetSummaryAvailable` is true, which no `voc` target satisfies in this slice — so the realised cell is `hidden`.
- **`visible_to_reporter` on VOC↔VOC collapses to `allowed`/`hidden`.** It is meaningful only when both VOCs share the same reporter, and then the correct decision is full `allowed` (the Reporter already has read on both), not a summary. Otherwise it leaks another reporter's existence and is `hidden`. Re-purposing `related_to` into reporter-facing product copy was rejected; that needs explicit product approval in a later slice.
- **`admin_only` + non-Admin** is `denied` only when both endpoints are readable (Section A); an out-of-scope actor gets `hidden`.

## Section D — Both-side enforcement

**Locked:** Both source and target permissions are checked on every read (FR-LINK-002).

- **Endpoint mode** (`GET /entity-links?source=…` / `target=…`): an unreadable focused endpoint returns `404` (per the Slice 4.1 contract). When the focused endpoint is readable but the opposite endpoint is not, the opposite endpoint is emitted as `hidden` (formalising the Slice 4.1 tracer behaviour).
- **Inventory mode** (`GET /entity-links?scope=workspace`): a row is `allowed` only when both endpoints are readable; otherwise the token-driven decision from Section C applies (so inventory now emits `allowed | hidden | denied`, where Section C produces `denied`).

## Section E — Evaluator placement, DTO extension, no migration, no read audit

**Locked:**

- **Evaluator** `evaluateLinkVisibility({ visibility, actorContext, sourceReadable, targetReadable, targetSummaryAvailable }): UIVisibilityDecision` is a pure function in the backend `apps/backend/src/modules/entity-links` module. It depends on actor semantics and readable-endpoint facts, so it does not belong in `packages/shared`; the **decision enum and DTO types** do live in `packages/shared/src/entity-links.ts`.
- **DTO** extends the discriminated union with `summary_visible` and `denied` variants (not `request_access` — Section B). Hidden-like variants (`hidden`, `denied`) expose audit/list metadata only (`id`, endpoint types, relation/status/managed_system/created metadata, `visibility_state`) and never `source_id`, `target_id`, or a summary. Only the `summary_visible` variant carries a `summary` payload (Section F).
- **Endpoints**: both endpoint-mode and inventory reads route through the evaluator. `POST /entity-links` stays locked to `internal_only`; the contract that the API cannot yet create non-`internal_only` links is asserted by a dedicated test so seeded-row enforcement tests are not misread as product behaviour.
- **No DB migration.** #115 is read-path + DTO + ADR only. A migration is forced only by new stored columns, enum/CHECK changes, indexes, or persisted request/access state — none of which this slice adds.
- **Reads are not audited.** Visibility decisions on read produce no audit row; auditing stays on create/detach (and future sensitive permission flows).

## Section F — Canonical summary contract (forward spec)

The summary contract is documented here as the canonical, executable shape future slices implement against. #115 lands the **type/zod schema** in `packages/shared` (decision (A): the contract is the deliverable, and an executable schema prevents downstream drift) but builds **no** runtime resolver (`getReporterSummary(taskId)` is explicitly out of scope — that lands with the Task link-target slice). The `summary_visible` DTO variant references this shape via an explicit `summary.target_type`; **#115 defines no `voc` summary member** (a VOC has no reporter-facing summary).

**Canonical Task reporter summary fields** (reconciles the three divergent doc lists — `11-entity-linking.md`, `05-permission-policy.md`, `06-entity-linking-contract.md` — into one; the `05`/`06` superset wins):

```text
public_title
reporter_facing_status
owning_team_public_name        optional
expected_resolution_date       optional
last_public_update_at
public_update_excerpt          optional
```

**Canonical forbidden fields** (a reporter summary MUST NOT expose any of these; `05-permission-policy.md` had the fullest list):

```text
raw Task status
internal comments
internal assignee notes
backlog priority
individual Developer names
internal due dates
root-cause detail
severity
confidence
private notes
private customer or Survey response detail
permission decision internals
```

The Frontend renders the backend-decided state (via `PermissionBlockedPanel` where applicable) and never synthesises a summary from raw data the actor cannot read (FR-LINK-002).

## Alternatives rejected

- **Docs-only ADR, defer all read-path enforcement** — rejected: the stored `visibility` enum already admits four tokens while the read DTO admits two; leaving that gap open lets the next writer of a non-`internal_only` row silently bypass enforcement. The evaluator + DTO must land with the contract.
- **Wire `summary_visible`/`request_access`/`denied` as reachable VOC outcomes** — rejected: no `voc` target has a reporter summary, and `request_access` has no requestable VOC link target. Reachable-looking states no production data can produce are fiction (Section B).
- **Put the evaluator in `packages/shared`** — rejected: it depends on actor scope and per-request readability, which are backend facts; only the types are shared.

## Reopening triggers

- A slice introduces a non-VOC link target (Task/Finding) with a reporter summary. That slice implements `getReporterSummary`, makes `summary_visible` reachable, and re-adds `request_access` plus its minimum-requestable-scope candidates — reopening Sections B and F.
  - **Partially fired by ADR-0032 (Slice 7a-1a).** Task now exposes the Section F safe summary through a read-time projection; `last_public_update_at` is optional because Task has no public-update source. `request_access` remains deferred.
  - **Partially fired by ADR-0024 (Slice 5).** Finding is the first non-VOC link target, but it has **no** reporter-facing summary (`05-finding-insight-system.md:215`, `CONTEXT.md`). ADR-0024 therefore amends Section C (adds the `finding`-target row) and registers a `getReporterSummary` that returns UNAVAILABLE, but does **not** make `summary_visible` reachable, does **not** add a `finding` member to Section F, and does **not** re-add `request_access`. Sections B and F stay as written here until a Finding reporter summary is actually introduced. See `docs/adr/0024-finding-as-entity-link-target-and-provider-registry.md`.
- Product approves reporter-facing VOC↔VOC visibility. That reopens the `visible_to_reporter` collapse in Section C.
- `POST /entity-links` is unlocked beyond `internal_only`. That reopens the creation-side note in Section E.
