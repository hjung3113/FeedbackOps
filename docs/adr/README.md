# Architecture Decision Records

ADRs record decisions that are hard to reverse, surprising without context, and the result of a real trade-off. On the decision it made, an ADR supersedes any other document (`docs/design/*`, `docs/implementation/*`, `CONTEXT.md`, the prototype, `AGENTS.md`); see root `AGENTS.md`, Source Of Truth. ADRs are immutable history: to change a decision, write a new ADR and add a `Superseded by` / `Amended by` line at the top of the old one. Other edits to an accepted ADR are limited to its `## Status` line, back-links, and dated `## Amended YYYY-MM-DD` sections or notes that record what changed.

**To add an ADR:** take the next number (highest below + 1, currently `0061`), name the file `NNNN-kebab-slug.md`, start with `# ADR-NNNN: Title`, and make `## Status` the first section (`Proposed`, `Accepted`, `Superseded by ADR-NNNN`, or `Deprecated`, with the date). The `## Status` section is required in this repo, which is stricter than the vendored `.agents/skills/domain-modeling/ADR-FORMAT.md` (there it is optional). Then add one line to the matching topic below, in the form `- [NNNN](file.md) Title — decision. *Status*`. Read the ADRs for the topic you are about to touch before you start (`docs/agents/domain.md`).

## Product scope and domain model

- [0001](0001-use-managed-system-as-mvp-scope.md) Use Managed System as the MVP scope — Managed System, not Project, is the scope for filing, triage, assignment and filtering. *Accepted*
- [0004](0004-severity-enum-and-distinct-priority.md) Severity enum and distinct Priority — VOC Severity is low/medium/high/critical, separate from Finding/Task Priority. *Accepted*
- [0005](0005-separate-voc-state-machines-and-no-auto-mapping.md) Three VOC state machines — Triage, Reporter-Facing and Task status never map to each other automatically. *Accepted*

## Architecture, platform and operations

- [0007](0007-core-technology-stack.md) Core technology stack — Node 22, Fastify, Postgres 16, Drizzle, Zod, TanStack, Vitest, Biome, pnpm + Turborepo. *Accepted*
- [0008](0008-audit-log-storage-and-immutability.md) Audit log storage and immutability — one `core.audit_log` table committed with the mutation, append-only by DB role grants. *Accepted*
- [0009](0009-background-jobs-with-pg-boss.md) Background jobs with pg-boss — jobs run in the backend process, idempotent, locked retry defaults. *Accepted*
- [0012](0012-error-code-contract.md) API error code contract — one envelope, stable dotted codes, field-path validation detail, conditional `requestable_permission`. *Accepted*
- [0013](0013-observability-logs-first-deployment-k8s.md) Observability and deployment — Docker on internal k8s, structured stdout logs only, `/health/live` + `/health/ready`, no metrics/tracing yet. *Accepted*
- [0015](0015-operational-safety-rate-limit-headers-migrations-idempotency.md) Operational safety — Postgres-backed rate limits, helmet CSP and no CORS, Drizzle Kit SQL migrations, `Idempotency-Key`. *Accepted*

## Auth, roles and permissions

- [0006](0006-authentication-and-actor-provisioning.md) Authentication and Actor provisioning — AuthProvider seam (mock + OIDC), opaque server-side sessions, first-login `user`. *Accepted, amended*
- [0044](0044-permission-request-composition-and-managed-system-owner-selection.md) Permission request composition and owner selection — reason and return intent required; Managed System owner is none, one Actor, or one team. *Accepted*
- [0048](0048-role-level-extension.md) Role Level extension — checklist for adding a role across enum, DB CHECK, local unions and domain gates. *Accepted*
- [0056](0056-capability-based-admin-navigation.md) Capability-based Admin navigation — Admin entries appear only when `workspace.admin` is approved; direct links stay gated. *Accepted*
- [0061](0061-admin-revoke-permission-grants-and-denies.md) Admin revokes active Permission grants and denies — revocation audit, notification, and re-request behavior. *Accepted*

## Managed System registry, teams and display IDs

- [0017](0017-managed-system-registry-shape.md) Managed System Registry shape — immutable workspace slug, MS->AA archive cascade, snapshot/diff audit detail. *Accepted, amended by 0019*
- [0018](0018-teams-placeholder-schema.md) Teams placeholder schema — `core.teams` and owner FKs ship as schema only; CRUD deferred. *Accepted, grants amended by 0019*
- [0019](0019-slice2-review-followups.md) Slice 2 review follow-ups — archived rows immutable, cascade-race rules, teams SELECT-only, parent-row lock. *Accepted*
- [0029](0029-human-display-id-scheme.md) Human display ID scheme — shared `core.display_counters` streams (`TASK-`, `FIN-`, `CLU-`, `REQ-`, `SRV-`, `MLS-`); VOC grandfathered. *Accepted*

## Rich content and attachments

- [0002](0002-use-wysiwyg-first-rich-content-editor.md) WYSIWYG-first rich content editor — users never write markup; editor choice left to a spike (resolved by 0011). *Accepted*
- [0011](0011-rich-content-editor-and-attachment-storage.md) Rich content editor and attachment storage — TipTap JSON in jsonb, S3-compatible storage, server-proxied transfer, no Rich Table. *Accepted, storage amended*

## i18n and copy

- [0010](0010-i18n-strategy-single-locale-with-catalog.md) i18n single Korean locale — no catalog runtime; strings live at the component or in `lib/copy`; backend does not translate. *Accepted, mechanism replaced 2026-09-24*

## UI foundation and shell

- [0016](0016-ui-foundation-dark-wcag-tokens-wrap.md) UI foundation — dark-only theme and token mechanism replaced; component wrap via `packages/ui` and WCAG AA remain. *Partially superseded by 0021, 0058*
- [0020](0020-shell-taxonomy-three-route-shells-and-50px-header-rhythm.md) Shell taxonomy — every route is `PageShell`, `ListShell` or `WorkbenchShell`; shared 50px header rhythm. *Accepted, amended by 0021, 0060*
- [0021](0021-pack-17-samsung-light-design-system.md) Pack 17 Samsung-light design system — light is the only MVP theme; token names kept, RGB-triple runtime values. *Accepted*
- [0052](0052-list-empty-filtered-error-state-contract.md) List empty / filtered / error states — shared `ListStateMessage` with reset and retry actions. *Accepted*
- [0058](0058-tailwind-v4-css-first-theme.md) Tailwind v4 CSS-first theme — `@theme inline` in `@fops/ui` replaces the JS preset; no visual change. *Accepted*
- [0060](0060-shipped-ui-replaces-prototype-as-ui-authority.md) Shipped UI replaces the prototype as UI authority — existing screens, `lib/copy` and visual baselines decide; the prototype is a reference for unbuilt surfaces. *Accepted*

## VOC intake and triage

- [0022](0022-voc-triage-tab-toolbar-deviation.md) Triage toolbar tab strip — four URL-backed tabs replace prototype search/filter/skip. *Accepted*
- [0042](0042-voc-composer-contract-errors-and-timeline-identity.md) VOC composer contract — requests match strict backend schemas; unmapped errors toast; timelines de-duplicate by id. *Accepted*
- [0045](0045-triage-analytics-area-and-optional-owner.md) Triage Analytics Area and optional owner — areas scoped to the VOC's Managed System; Finding inherits area; Owner optional. *Accepted*
- [0051](0051-triage-panel-grouped-sections-and-diff-summary.md) Triage panel grouped sections — Overview, Assignment, Similar, Summary; diff-only Summary; muted metadata colour. *Accepted*

## VOC similarity and clusters

- [0031](0031-similar-voc-same-managed-system-heuristic.md) Same-Managed-System similar-VOC heuristic — authorized peers, newest first, capped at three; fallback beside embeddings. *Accepted, amended*
- [0034](0034-voc-embedding-similarity-infrastructure.md) VOC embedding similarity — pgvector behind a provider port; recommendations are a separate resource with dismissal. *Accepted, implemented*
- [0046](0046-pre-submit-similar-voc-surface.md) Pre-submit similar-VOC surface — shows the 0031 heuristic peers, navigation only, no draft embedding preview. *Accepted*
- [0054](0054-voc-cluster-autogen-shadow-job.md) Cluster auto-generation shadow job — hourly pair measurement at >= 0.60 into a non-domain table; no cluster writes. *Accepted*

## Entity links and Findings

- [0023](0023-entity-link-visibility-decision-and-summary-contract.md) Entity-link visibility and summary contract — backend verdicts allowed/hidden/denied/summary_visible; `request_access` deferred. *Accepted, amended by 0024, 0032*
- [0024](0024-finding-as-entity-link-target-and-provider-registry.md) Finding as link target and provider registry — `created_finding` link, `finding.read`/`finding.manage`, Finding status endpoint. *Accepted*
- [0032](0032-task-reporter-summary-read-time-projection.md) Task reporter summary — Reporter sees a read-time projection of Task title and coarse status only. *Accepted*
- [0047](0047-entity-link-voc-read-required-not-triage.md) Entity-link VOC read needs `voc.read` — `voc.triage` alone is not enough to read or create VOC links. *Accepted*

## Tasks, Task Requests and Milestones

- [0003](0003-single-workflow-template-and-task-status-enum.md) Single Workflow Template and Task Status enum — one shared template; status enum locked (seven values since 0027). *Accepted, amended by 0027*
- [0025](0025-task-request-tracer-from-finding.md) Task Request tracer from Finding — first source path, `pending_review`, `requested_task` link. *Accepted (deferrals superseded by 0026, 0027, 0028)*
- [0026](0026-task-request-review-decisions.md) Task Request review decisions — approve/reject/needs-more-evidence apart from conversion; self-approval is sensitive. *Accepted (conversion deferral superseded by 0027)*
- [0027](0027-task-domain-and-conversion.md) Task domain and conversion — `task.tasks`, convert or link-existing from an approved request, provenance via entity links. *Accepted, amended by 0043, 0050*
- [0028](0028-voc-and-cluster-task-request-sources.md) VOC and Cluster Task Request sources — VOC and VOC Cluster raise Task Requests, never Tasks. *Accepted*
- [0030](0030-task-status-transition-and-kanban-board.md) Task status transition and kanban — free transitions via `PATCH /tasks/:id` with `If-Match`; `@dnd-kit` board. *Accepted*
- [0043](0043-finding-task-conversion-chain-decisions.md) Finding-to-Task conversion chain — visible truncation, inline validation, both `linked_task_id` and entity link. *Accepted*
- [0049](0049-finding-task-progress-notes.md) Finding and Task progress notes — append-only per-entity tables with different read/write gates. *Accepted*
- [0050](0050-milestone-status.md) Milestone status — planning/in_progress/blocked/released; free PATCH; release ignores child Task status. *Accepted*

## Surveys

- [0033](0033-survey-evidence-anonymity-safe-summary-contract.md) Survey evidence, anonymity and safe summaries — identity-protected responses, no Admin bypass for personal reads, threshold 5. *Accepted, amended by 0053*
- [0035](0035-external-survey-responses.md) External survey responses — public-link responses store no Actor, dedupe by cookie identity. *Proposed (not implemented)*
- [0036](0036-survey-link-distribution-and-respondent-model.md) Survey link distribution — opaque 30-day revocable links; no recipients or delivery channels. *Proposed (not implemented)*
- [0053](0053-survey-result-response-state.md) Survey result response state — `none` / `below_threshold` / `visible` without exposing small counts. *Accepted*
- [0055](0055-outcome-survey-follow-up-decisions.md) Outcome Survey follow-up — low-band poor-response classifier; Finding or no-follow-up decision clears the gap. *Accepted*

## Notifications

- [0014](0014-notifications-in-app-and-email-channels.md) Notifications — in-app table plus abstracted email channel; code-driven catalogue; no per-Actor preferences. *Accepted, amended*

## Prototype deviations and MVP exclusions

These record where the product deliberately differs from `docs/design-prototype/` or leaves a prototype feature out. Each is a live exception, not history.

- [0037](0037-link-finding-deferred-out-of-mvp.md) Survey result Link Finding out of MVP — `next_actions` ship `create_finding` and `request_task` only. *Accepted*
- [0038](0038-entity-link-management-surface-out-of-mvp.md) Entity-link management and My Work out of MVP — per-record projections only; no detach UI. *Accepted*
- [0039](0039-survey-creation-requires-a-dialog.md) Survey creation dialog — `New survey` collects the four required fields; keyboard reorder added. *Accepted*
- [0040](0040-ux-voc-home-navigation-deviations.md) VOC and Home navigation deviations — dead My Work entries removed; sixth Inbox tab `high-no-link`. *Accepted*
- [0041](0041-admin-permission-request-ux-deviations.md) Admin Permission Request UX deviations — setting relabelled for Permission Requests; own detail header. *Accepted*
- [0057](0057-approved-ux-deviations-from-prototype-579.md) Approved UX deviations (#579) — enum display labels, Korean-first copy, layout items B1-B10. *Accepted, amended by 0060*

## Scope decisions

- [0059](0059-deferred-mvp-requirements-from-doc-audit.md) Deferred MVP requirements — default owner/reviewer resolution (except Survey operator), Survey templates, Dashboard recovery items deferred; public survey links unscheduled. *Accepted*

## Status legend

- *Accepted* - in force. *Accepted, implemented* - in force and shipped.
- *Proposed* - not decided or not built; do not rely on it. *(not implemented)* means no code exists.
- *Partially superseded* / *amended by* - part of the text is replaced; the superseding ADR or dated amendment wins for that part.
- *Superseded by NNNN* - fully replaced; keep for history only.
