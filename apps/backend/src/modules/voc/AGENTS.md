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
- `voc_embeddings.updated_at` therefore means "last written **or** last
  confirmed current against its VOC", not "last vector rewrite".
- Archived VOCs are excluded. Un-archiving is an UPDATE, so a previously
  embedded VOC becomes a stale candidate on the next run; only one that was
  never embedded at all stays uncovered until its next edit or a version bump.
- **Disabled provider enqueues nothing** — write path and cron both gate on
  `isEmbeddingEnabled(config)`, so a key-less environment accumulates no queue.
  Registration is unconditional: enabling a provider is a config change, not a
  queue-registration change.
- Both queues are pre-created in migration `0043_voc_embedding_queues.sql`;
  `fops_app` holds no DDL on `pgboss.*`, so `register*` only verifies existence.

## Verification

- Test reporter-facing status transitions, public update behavior, VOC-to-Finding creation, cluster-to-Finding creation, and forbidden Survey Response-to-VOC paths when touched.
