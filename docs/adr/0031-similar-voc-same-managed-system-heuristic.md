# ADR-0031: Similar-VOC Same-Managed-System Heuristic

Date: 2026-07-15

## Status

Accepted

## Context

VOC detail and list surfaces need a small related-VOC signal before the
semantic-similarity work planned for #127 / Phase-1. The create prototype
groups the first three VOCs from the same Managed System, but that grouping
must preserve the VOC permission boundary.

## Decision

"Similar" temporarily means active, authorized peers in the same workspace and
same primary Managed System, excluding the source VOC. All reporter-facing
statuses and all ages are eligible. This is deliberately a weak heuristic, not
#127 clustering, which remains manual/confirmed; real similarity is deferred to
#127 / Phase-1.

A peer is visible only when its Managed System is in the actor's `voc.read`
scope or the actor reported that peer. A triage-only summary envelope exposes
neither `similar_count` nor `similar.items`: a full envelope for an actor's own
VOC does not grant peer read access.

`similar_count` is the sole authorized-peer total. Detail adds
`similar.items`, ordered by `created_at DESC, id DESC` and capped at three,
with `{ id, display_id, title, reporter_facing_status, severity }`. The detail
projection is not a new endpoint.

Detail currently retains its source-row ETag header but disables conditional
304 handling. A source-only validator cannot correctly represent creates,
edits, or archival of peer rows, and always returning the current detail
envelope is lower risk than a stale 304 until a projection-aware validator is
introduced.

No migration is added: the existing `(workspace_id, primary_managed_system_id,
created_at DESC)` index supports the peer lookup and ordering. The prototype's
Similar sidebar tab remains deferred, so a badge does not imply that the tab is
already populated.

## Consequences

- List counts are bulk-projected in one query per page; detail uses one count
  and one capped-items query.
- Similarity can be replaced by #127 without changing the list-item total or
  detail envelope placement.
- Consumers must treat the detail endpoint as non-conditional while this
  projection is peer-derived.
