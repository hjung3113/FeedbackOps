# ADR-0034: VOC Embedding Similarity Infrastructure

Date: 2026-07-26

## Status

Proposed

Supersedes the deferral clause of ADR-0031 (which points real similarity at
epic #168 without deciding how it is built). ADR-0031's same-Managed-System
peer heuristic stays in force until the recommendation resource described here
ships.

## Context

FR-VOC-004 ("System recommends similar VOCs using embedding similarity",
`docs/design/04-voc-system.md`) is unsatisfied. An audit at develop `68f121e`
and a re-check at `e3b4de5` confirm the repository has no vector extension, no
embedding store, no embedding worker, no similarity score, no threshold, and no
dismissal state. The only shipped "similar" surface is the ADR-0031 peer query,
which the ADR itself labels a weak heuristic.

Facts that constrain the decision:

- Dev Postgres is `postgres:16-alpine` (`docker-compose.dev.yml`), which does
  **not** ship pgvector. Any in-database vector choice requires an image change.
- The backend already runs pg-boss against the same Postgres
  (`apps/backend/src/lib/jobs.ts`), with an established cron+queue job pattern
  (`modules/core/jobs/*`, `modules/tasks/jobs/*`). A backfill/refresh worker
  needs no new runtime.
- VOC text lives in `vocs.title` (text) and `vocs.description_rich_content`
  (jsonb, ADR-0011). Embedding input must be derived, not read from one column.
- Anthropic publishes no embeddings API, so an embedding provider is an
  external dependency regardless of model choice.
- Implementation agents run in a network-blocked sandbox. Any design that
  requires a live provider call to run the test suite is untestable here.

## Decision

### D1 — Vectors live in Postgres via pgvector

Adopt pgvector. `docker-compose.dev.yml` moves from `postgres:16-alpine` to
`pgvector/pgvector:pg16`, and a migration runs `CREATE EXTENSION IF NOT EXISTS
vector`. Rejected alternatives: `pg_trgm` alone (lexical, does not satisfy
FR-VOC-004's "embedding similarity"), and an external vector store (adds a
second authorization boundary and a second copy of workspace-scoped data, for a
corpus that is per-workspace small).

Consequence for deployment: every environment's Postgres must provide the
`vector` extension. This is a deployment prerequisite, not an application
fallback — the migration fails loudly if the extension is unavailable.

### D2 — Embeddings sit behind a provider port; the first adapter is Voyage

Define an `EmbeddingProvider` port (`embed(texts: string[]) => vectors`) with
three implementations:

1. a Voyage adapter (`voyage-3`) as the production default,
2. a deterministic fake used by the test suite — a hash-derived unit vector, so
   similarity assertions are exact and offline,
3. a disabled/no-op provider for environments with no API key, under which
   ingestion enqueues nothing and the recommendation surface reports "not
   available" rather than silently returning an empty list.

Every stored vector carries `provider`, `model`, `dimensions`, and
`embedding_version` on its own row. Model changes are therefore a data
migration (re-embed under a new version), never a silent reinterpretation of
existing vectors. Queries filter on the active version; rows of other versions
are inert until backfilled or dropped.

### D3 — Recommendations are a separate resource, not cluster rows

Recommendations do **not** widen `voc_clusters.status` (ADR-0031 amendment,
#127 decision D1). They are their own table with their own state machine:
`suggested` → `dismissed` | `confirmed`. Confirmation is the only path that
creates or joins a `draft`/`confirmed` cluster, and it stays an explicit
authorized action — no auto-clustering, satisfying FR-VOC-004's second
criterion.

Dismissal is persisted per (source VOC, candidate VOC, actor scope) and
survives recomputation: a recomputed run must not resurface a dismissed pair
under the same embedding version. A new embedding version clears that
suppression, because the ranking that produced the dismissal no longer exists.

### D4 — Authorization reuses the ADR-0031 predicate unchanged

A candidate VOC is visible only when its Managed System is in the actor's
`voc.read` scope or the actor reported it. The similarity search runs over the
whole workspace, but the **result set is filtered by that predicate before any
count, score, or identifier leaves the service** — a recommendation total must
never let an actor infer the existence of a VOC they cannot read. The
triage-only summary envelope continues to expose neither counts nor items.

### D5 — Threshold is configuration with a pinned default, and is evaluated

Cosine similarity with a workspace-level threshold, default pinned in code (not
in the database) so a fresh workspace behaves identically across environments.
The threshold ships with a committed evaluation fixture: labelled VOC pairs and
an assertion on precision/recall at the chosen cut, run offline and
deterministically without a live provider. Changing the default requires
updating that fixture in the same change.

> **Amended 2026-07-27 (#168 step 5).** This clause originally said the fixture
> runs "under the deterministic fake provider". That is not implementable as
> written: the fake provider is hash-derived and preserves no meaning, so
> precision and recall computed over its output are noise, and asserting on
> noise produces a fixture that must be rewritten whenever the corpus text
> changes for reasons unrelated to quality. The intent was offline determinism,
> not that specific provider; the fixture therefore carries hand-authored
> vectors with exact, checkable cosine relationships.
>
> This makes explicit what the fixture does and does not establish. It pins the
> harness arithmetic, the distance-to-similarity conversion, the comparison
> direction, and the shipped query's agreement with the harness. It does NOT
> validate the pinned cut itself: that requires real embeddings from the
> configured provider, which no offline environment can produce. The default
> stays an unmeasured pin until a run against real vectors either confirms or
> moves it.

### D6 — Refresh policy: enqueue on write, backfill by cron

VOC create and title/description edits enqueue an embedding job through the
existing pg-boss pattern. A cron job backfills rows whose `embedding_version`
is behind the active version. Recommendations are computed on read against
current vectors rather than materialized, until a measured latency problem
justifies a cache.

## Consequences

> **Amended 2026-07-27 (#168 step 6).** The recommendation HTTP surface has
> landed: `GET /vocs/:id/recommendations`, `POST
> /vocs/:id/recommendations/:candidate_id/dismiss`, and `POST
> /vocs/:id/recommendations/:candidate_id/confirm`.

- `docker-compose.dev.yml`, CI Postgres, and every deployed environment must
  use a pgvector-capable image before the migration lands. This is the single
  highest-risk step and is sequenced first.
- The test suite stays fully offline: the deterministic fake provider is the
  default in tests, and no test may depend on live provider output.
- ADR-0031 and FR-VOC-004 must be amended in the same change that ships the
  recommendation resource, not before — the heuristic remains the shipped
  behavior until then.
- A model swap is a versioned re-embed with an explicit backfill, and it clears
  dismissal suppression by design.
- An environment without an embedding API key runs with the disabled provider:
  degraded but honest, never a silently empty recommendation list.

## Implementation sequence (sub-issues of #168)

1. pgvector image + extension migration + embedding table with provider/model/
   version metadata.
2. `EmbeddingProvider` port, deterministic fake, Voyage adapter, disabled
   provider; config wiring.
3. Ingestion: enqueue-on-write + cron backfill worker.
4. Recommendation resource: read model, authorization filter, dismissal state,
   confirmation → cluster path.
5. Threshold evaluation fixture and tuning.
6. ADR-0031 amendment + FR-VOC-004 status update + API/FE surface.
