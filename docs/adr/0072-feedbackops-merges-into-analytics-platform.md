# ADR-0072: FeedbackOps merges into analytics-platform; the standalone app is in maintenance mode until it retires

## Status

Accepted 2026-10-21 (owner). The platform-side record is analytics-platform
[ADR-0066](https://github.com/hjung3113/analytics-platform/blob/main/docs/adr/0066-feedbackops-merges-into-platform.md);
the placement table, server mapping, phases and open questions live in its
[merge design](https://github.com/hjung3113/analytics-platform/blob/main/docs/integration/feedbackops-merge-design.md)
(roadmap issue hjung3113/analytics-platform#598, milestone `M6 FeedbackOps 합류`). Closes the
proposal in #1231 (one source, two hosts).

## Context

FeedbackOps shipped v1.3.0 as a standalone app. The analytics platform links into it in a new tab
(platform ADR-0027, ADR-0071 here). Platform ADR-0038 proposed packaging FeedbackOps screens as
modules mounted by two hosts, which would keep the standalone host and a cross-repo contract alive.
The platform has no real server yet; its planned server follows this repo's ADR-0006 design, which
the FeedbackOps backend already implements together with permissions, audit, notifications and jobs.

## Decision

1. **FeedbackOps becomes part of the platform.** The code moves into the analytics-platform
   workspace; the platform shell is the only host. The standalone app retires when the merge is done
   (platform #597).
2. **Screens split by audience, data does not.** Features every user needs (VOC submission from any
   screen with the current menu and Context attached, My VOCs and the reporter detail, Survey
   participation, notifications, Permission requests, a "my activity" view) become platform-global.
   Operator and Developer screens (Inbox, Triage, Clusters, Evidence/Coverage/Links, Findings,
   Task Requests, Tasks, Milestones, Dashboard, Survey management, settings) become one business
   system in the platform switcher. Both call the same FeedbackOps domain APIs; there is one store.
3. **Screens move; they are not rewritten.** Domain invariants carry over unchanged: VOC is never
   created from a Survey Response, the three VOC state machines never map to each other (ADR-0005),
   `entity_links` stays canonical, Task Request still guards the Task backlog.
4. **The FeedbackOps backend is the starting point of the platform's real server.** It implements the
   common part of the platform HTTP adapter contract (session, access directory, audit, usage,
   notices, entities).
5. **Permission management widens to platform business systems.** The platform will own identity,
   roles, per-system grants/denies and the request/approval surfaces; FeedbackOps keeps the domain
   checks and reads the platform grants. How Managed System relates to a platform business system,
   the role model and where admin screens go are open (platform #596, ready-for-human); until
   answered, this repo's permission module stays as is.
6. **Maintenance mode.** The standalone app has no in-house users (owner, 2026-10-21), so it retires with the platform's first deployment and runs no parallel period. Until then, this standalone app takes bug fixes and merge preparation
   only. New product features are built on the platform side.

## Not implemented

| Item | Reason | Reopen when |
| --- | --- | --- |
| R-1 reporter navigation and R-2 reporter home in the standalone shell (#1227) | Reporters will use the platform-global screens, so the standalone shell's operator nav no longer reaches them; the work would be discarded at the merge | The standalone app gets real in-house reporters before the platform ships (it has none as of 2026-10-21; in-house use starts on the platform) |
| One source, two hosts (#1231) | Superseded by the merge: no standalone host and no cross-repo host contract for FeedbackOps | — |

## Consequences

- The entry links (platform ADR-0045) and `platformReturn` (ADR-0071) stay until the operator system
  is mounted in the platform, then retire with the standalone app.
- Toolchain alignment (Node 26.7, pnpm 11, linters, the integration and visual gates in platform CI)
  is part of the first merge step (platform #592), not a change in this repo.
