# ADR-0054: VOC cluster auto-generation shadow job

Date: 2026-09-28

## Status

Accepted.

## Context

ADR-0034 D5 pins the recommendation threshold at 0.75, but its committed
fixture checks query arithmetic rather than the quality of the cut against real
provider vectors. The research in
`docs/superpowers/specs/2026-09-26-voc-cluster-autogen-design.md` recommends
measuring pairwise output before any proposal or writer is considered. Its §6
choice (a) is the approved scope for Issue #512.

## Decision

Build the `voc.cluster_autogen_shadow` pg-boss job, scheduled hourly. It scans
active VOC embeddings at the configured active embedding version, pairs only
VOC records in the same workspace and Primary Managed System, and records pairs
with cosine similarity of at least 0.60 in the separate, non-domain table
`voc.voc_cluster_autogen_shadow_candidates`.

The 0.60 measurement floor does not change ADR-0034 D5. Each row's `would_form`
value compares its score with the imported
`VOC_RECOMMENDATION_SIMILARITY_THRESHOLD` (0.75). The recommendation threshold
and its evaluation fixture remain unchanged.

Pairs are excluded if either VOC is archived, either VOC already belongs to a
cluster in that Managed System, or any dismissal exists for the pair at the
active embedding version in either orientation and any scope. Pairs are stored
with sorted VOC ids. A rerun upserts the existing workspace/pair/version row,
updates its latest score and run correlation id, and increments `seen_count`.
Each run records at most 200 pairs per workspace and Managed System in
descending score order and reports the uncapped eligible count and remaining
tail.

When the embedding provider is disabled, the job returns `skipped` and writes
nothing. It does not use candidate-peers as a fallback. The job does not write
VOC rows, clusters, cluster members, recommendation decisions, `core.audit_log`,
or `system.` event types, and it does not call the cluster or recommendation
mutation services. Sub-scope S — provisioning a per-workspace system actor and
the first `system.` audit event — remains deferred.

This is a shadow measurement only. ADR-0034 D3, FR-VOC-004, and `CONTEXT.md` do
not reopen; the existing no-auto-cluster assertion remains unchanged.

## Consequences

The non-domain measurement table grows by distinct workspace/pair/version rows,
not by job runs. Its app grant permits reads and upserts while withholding
`DELETE`. A single structured job summary reports the correlation id, active
embedding version, and each workspace/Managed System's eligible, would-form,
recorded, and remaining counts.

The §4.6 join-newest behavior is a latent requirement: before any non-human
cluster origin can be written, a decision must establish either that
`selectClusterIdForVoc` ignores auto-origin drafts or that a human add promotes
the cluster to manual and makes it non-discardable. This shadow job creates no
drafts, so neither rule is selected here.

## Open questions for later choices

Choice (b), proposed groups with human batch-confirm, remains open: whether the
surface is computed on read or cached, which group shapes may be proposed, and
what one human confirmation may cover are not decided here.

Choice (c), unattended cluster writes, remains open: workspace opt-in, pairwise
versus transitive grouping, the cut and dismissal scope, treatment of VOCs
already in clusters, caps informed by shadow measurements, rechecking stale
pairs, discard and undo behavior, system actor provisioning, audit-event
vocabulary, and the §4.6 join-newest rule all require a future decision. This
ADR chooses none of them.
