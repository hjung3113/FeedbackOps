# VOC Module Agent Guide

## Ownership

VOC owns VOC records, VOC clusters, reporter-facing VOC status, public updates, and VOC-specific read models.

VOC Clusters are implemented as a separate top-level module directory (`../voc-clusters/`) but logically owned by VOC for boundary/permission purposes.

## Invariants

- VOC means customer or user-submitted voice.
- Do not create VOC from Survey Response.
- Reporter-facing VOC status is separate from Task status.
- Task Done or Released must not automatically mark a VOC as resolved.
- Public updates are distinct from internal comments.
- The ADR-0031 visibility rule ("Managed System in the actor's `voc.read` scope
  OR the actor reported it") has exactly **one** implementation *within this
  module*: `similarVocVisibilityPredicate` in `repo-read.ts`, parameterized by
  row alias. Both the similar-peer projections and the ADR-0034 recommendation
  read model call it; nothing here restates it, and it has no TypeScript twin —
  the recommendation mutation paths filter in SQL through the same function. It
  is pinned by `__tests__/voc-visibility-predicate.integration.test.ts`, which
  asserts a verdict matrix and that both read models admit the same VOCs on one
  fixture. **Do not add a second copy**: parameterize the alias instead.
- One copy still lives outside this module and is knowingly excluded from the
  above: `isAuthorizedMember` in `../voc-clusters/service.ts`, which wraps the
  same scope-or-reporter disjunction in TypeScript together with cluster
  membership conditions (same Managed System, not archived). It is not reached
  by anything in this module, and unifying it means touching the shipped
  cluster authorization path, so it was left alone rather than folded in
  blind. Treat it as a known divergence risk: **a change to the scope semantics
  here must be applied there in the same commit**, because nothing fails if the
  two disagree.

## Cross-System Rules

- VOC may create Finding through the approved application command.
- VOC links to Findings, Tasks, and other entities through `entity_links`.
- Convenience projections are allowed only when canonical history remains in `entity_links`.

## Embedding Provider (ADR-0034 D2)

- `embedding/` is a pure text-to-vector provider boundary. It has no database,
  job, queue, route, or recommendation-resource dependency.
- `EmbeddingProvider.embed(texts)` preserves batch order and returns vectors
  with provider, model, dimensions, and embedding version metadata for storage.
- `fake` is deterministic and valid for offline tests only; hash-derived vectors
  are not semantic similarity data. `voyage` uses injected fetch for testability.
- `disabled` signals unavailability with `EmbeddingUnavailableError`; callers
  must not convert it to an empty result.

Note the one exception to that last rule, added by ingestion below: the
`voc.embed_voc` handler *does* absorb `EmbeddingUnavailableError`, because a
job has no caller to report to and pg-boss would otherwise retry a permanent
configuration state. The rule still binds the read/recommendation side, which
has a user to be honest with.

## Embedding Ingestion (ADR-0034 D6)

`embedding/text.ts` derives the embedded input; `embedding/repo.ts` owns
`voc.voc_embeddings`; `jobs/` owns the two queues. Nothing else writes vectors.

- **Input derivation.** The embedded text is `title` + blank line + the
  ADR-0011 rich content flattened to its `text` leaves (attributes excluded —
  they are identifiers, not prose). An empty or missing description yields the
  title alone, so every VOC is embeddable and there is no "nothing to embed"
  branch. Flattening is total: unparseable content becomes `''` rather than
  throwing, because ingestion must not be where a legacy row is discovered.
- **`source_hash`** is sha256 of that derived text. Equality is the entire
  re-embed decision — a matching hash skips the provider call outright.
- **`voc.embed_voc`** (queue, no cron) embeds one VOC at the active
  `EMBEDDING_VERSION` and upserts on the `(voc_id, embedding_version)` primary
  key. Never read-then-insert: the PK is what makes concurrent runs for the
  same VOC safe. `provider` / `model` / `dimensions` are written from the
  `EmbeddingResult`, never from config.
- **Non-failure outcomes.** The handler returns rather than throws for
  `disabled` (configuration, not a fault) and `voc_not_found` (a rolled-back
  create). Provider HTTP and database errors still propagate so ADR-0009 retry
  applies to what retrying can fix.
- **Enqueue-on-write** (`embedding/enqueue.ts`) fires on VOC create and on
  title/description edits only — an attachment-only edit leaves the derived
  text identical. It runs on pg-boss's own pool (**not** `fromDrizzle(tx)`,
  unlike `modules/tasks/service.ts`) and swallows every error: a VOC write must
  never fail because the embedding queue failed. The cost is that the job is
  visible before the VOC commits, covered by `VOC_EMBED_START_AFTER_SECONDS`.
- **`voc.embedding_backfill`** (cron, `*/15 * * * *`, batch 200) is the safety
  net for a dropped enqueue, and the migration path for a version bump. It
  selects non-archived VOCs that are **missing or stale** at the active version
  and logs `remaining` — a bounded batch must report what it left, never
  silently truncate. Missing and stale share the one bound and both count
  toward `remaining`, so it still answers "is this converging".
- **Staleness signal.** `source_hash` is derived in TypeScript from flattened
  rich content, so the backfill's SQL cannot recompute it. Stale therefore
  means `voc_embeddings.updated_at < vocs.updated_at`. `vocs.updated_at` is
  maintained by the unconditional `vocs_touch_updated_at_trg` BEFORE UPDATE
  trigger, so the signal is **sound but not minimal**: it never misses a real
  title/description change, but it also flags VOCs touched by writes that left
  the embedded text alone (a severity change, an owner reassignment). Those
  false candidates are cheap and self-clearing — the handler compares
  `source_hash`, skips the provider call, and calls
  `touchVocEmbeddingCheckedAt`, so each costs one no-op job and then stops
  being selected. **The `unchanged` path must keep touching that timestamp**;
  drop it and the backfill re-selects the same VOCs forever.
- `voc_embeddings.updated_at` is a **watermark, not a write time**: both the
  upsert and the touch stamp it with the `vocs.updated_at` the handler read
  *before* calling the provider, never `now()`. Embedding is read → slow
  provider call → write, and an edit can land in that window; `now()` would
  mark the row current as of after the edit and hide the stale vector forever,
  which a cron job overlapping the edit's own job reaches without anything
  going wrong. The watermark leaves the loser of that race behind its VOC, so
  it self-heals on the next run. Nothing records when a vector was physically
  computed; if a slice needs that, add a column rather than reverting to
  `now()`.
- Archived VOCs are excluded. Un-archiving is an UPDATE, so a previously
  embedded VOC becomes a stale candidate on the next run; only one that was
  never embedded at all stays uncovered until its next edit or a version bump.
- **Disabled provider enqueues nothing** — write path and cron both gate on
  `isEmbeddingEnabled(config)`, so a key-less environment accumulates no queue.
  Registration is unconditional: enabling a provider is a config change, not a
  queue-registration change.
- Both queues are pre-created in migration `0043_voc_embedding_queues.sql`;
  `fops_app` holds no DDL on `pgboss.*`, so `register*` only verifies existence.

## Recommendation Threshold Evaluation (ADR-0034 D5)

`recommendations/constants.ts` pins `VOC_RECOMMENDATION_SIMILARITY_THRESHOLD =
0.75` in code. ADR-0034 D5 requires a committed evaluation fixture beside it,
and requires that changing the default updates the fixture in the same change.

**Where it lives.**

- `recommendations/eval/fixture.ts` — the labelled corpus: VOC texts, a vector
  per item, and `(source, candidate, expected: related | unrelated)` pairs.
- `recommendations/eval/harness.ts` — pure precision/recall/F1 at a given cut.
  No database, no provider; it scores whatever vectors the fixture carries.
- `recommendations/eval/__tests__/` — harness arithmetic, and the coupling to
  the constant.
- `recommendations/__tests__/threshold-eval.integration.test.ts` — the same
  fixture driven through `selectVocRecommendations` against real Postgres and
  pgvector, at private `embedding_version` 168050.

**How to re-run.**

```
export DATABASE_URL=... DATABASE_URL_MIGRATE=... WORKSPACE_ID=...
pnpm --filter backend exec vitest run src/modules/voc/recommendations
```

The pure half needs no environment; the integration half is `WORKSPACE_ID`-gated
like every other integration suite here.

**What the current pin is based on: nothing measured.** 0.75 was chosen as an
initial value in step 4 and has never been evaluated against real embeddings.
The fixture's vectors are hand-authored from Pythagorean triples so that every
cosine is an exact rational; they carry no semantic content. The step-2 `fake`
provider cannot substitute — it is SHA-256-derived, so two paraphrases of one
complaint get unrelated vectors, and an eval over its output measures nothing
about meaning. Producing real voyage-3 vectors needs an API key and network,
neither of which the development environment has.

So the fixture pins **plumbing, not quality**:

- the harness computes precision/recall/F1 with the right denominators, and
  reports `null` rather than 0 or 1 for a metric with an empty denominator;
- `<=>` is cosine *distance* and the threshold is a *similarity*, so the read
  model converts with `1 - (a <=> b)` and compares `score >= threshold`. Both
  directions are asserted end-to-end; the integration suite asserts the score
  of an exact-duplicate pair is 1.0 and of a 4/5 pair is 0.8, so an inverted
  conversion (0.0 and 0.2) fails;
- near-boundary pairs — 55/73 ≈ 0.7534 just above, 72/97 ≈ 0.7423 just below —
  land on the side the fixture says, through the real query.

The precision of 2/3 and recall of 4/5 the fixture reports at the pin are
**properties of chosen vectors, not of the recommender**. Two pairs deliberately
disagree with their human label so the false-positive and false-negative arms
of the harness are exercised; quoting those figures as recommender quality
would be wrong.

**The coupling, and its limits.** `fixture-pins-threshold.test.ts` asserts
`thresholdPin` equals the constant, *and* evaluates the harness at the live
constant and compares the confusion matrix to a hand-counted `expectedAtPin`.
Editing the constant alone fails both; editing both numbers in lockstep still
fails the matrix, because the nearest banded pair on each side of the pin sits
within 0.01 of it (also asserted) and flips. That bound is on the nearest pair
per side, not on every `near_boundary` pair — the guarantee needed is that
*something* straddles the cut. What it cannot do is force a *justification* — someone can
rerun, paste the new counts, and go green. What it buys is that the flipped
pairs appear in the diff for a reviewer to see.

**Re-tuning once real vectors exist.**

1. Keep `items[].title` / `items[].body` and `pairs[].expected` — the labelled
   corpus is the durable part and should grow with real VOC text, labelled by a
   person, not by the model.
2. Embed the corpus with the production provider and replace `items[].vector`,
   `pairs[].expectedSimilarity`, and `vectorSource.provenance` / `.dimensions`.
   The harness and the tests do not change; that is what the format is for.
3. Sweep the cut with `evaluateFixture` and pick from the resulting
   precision/recall curve. Re-band pairs: `near_boundary` must still straddle
   the new pin, or the coupling stops biting.
4. Update `expectedAtPin` and the constant in the same commit, and replace this
   section's "nothing measured" paragraph with what was measured, on what
   corpus, at what size.

## Verification

- Test reporter-facing status transitions, public update behavior, VOC-to-Finding creation, cluster-to-Finding creation, and forbidden Survey Response-to-VOC paths when touched.
