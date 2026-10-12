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
