# VOC Module Agent Guide

## Ownership

VOC owns VOC records, VOC clusters, reporter-facing VOC status, public updates, and VOC-specific read models.

VOC Clusters are a separate module directory (`../voc-clusters/`) but logically owned by VOC. Recommendations and pre-submit peers live under this module.

## Invariants

- VOC means customer or user-submitted voice.
- Do not create VOC from Survey Response.
- Reporter-facing VOC status is separate from Task status.
- Task Done or Released must not automatically mark a VOC as resolved.
- Public updates are distinct from internal comments.
- The ADR-0031 visibility rule (Managed System in the actor's `voc.read` scope, or the actor reported it) has one definition with three faces in `authorization.ts`: `similarVocVisibilityPredicate` (SQL; callers pass the row alias), `isVocVisibleToActor` (already-loaded rows with a loaded scope) and `canReadVocAsSource` (one subject through `CheckService`; the only source-VOC read for Findings, Task Requests and Entity Links, exported from `index.ts`). They must change together; `__tests__/voc-visibility-predicate.integration.test.ts` pins the first two, including an SQL/object agreement matrix, and the callers' route tests pin the third. Do not add a fourth.
- VOC Clusters delegates the base scope-or-reporter rule to `isVocVisibleToActor` and adds only cluster membership conditions.

## Cross-System Rules

- VOC may create Finding through the approved application command.
- VOC links to Findings, Tasks, and other entities through `entity_links`.
- Convenience projections are allowed only when canonical history remains in `entity_links`.

## Embedding And Recommendations

Provider, ingestion, threshold, and the recommendation HTTP surface are ADR-0034 (D2, D4, D5, D6), including the 2026-07-27 amendments. D4 reuses `similarVocVisibilityPredicate`. Do not restate those rules here.

## Verification

- Test reporter-facing status transitions, public update behavior, VOC-to-Finding creation, cluster-to-Finding creation, and forbidden Survey Response-to-VOC paths when touched.

## Close-out contract (ADR-0067; VOC/Finding responsibility implemented by #1090)

- ADR-0067 creation-time owner routing is implemented by #1090. Ordinary
  reporters cannot supply owner fields; privileged overrides require server `voc.triage`.
- Explicit invalid values reject; absent/invalid automatic defaults fall through to visible
  scoped unassigned queue with Admin warning. Authorized null opts out; omission requests defaults.
- Persist Actor/team ownership while staying untriaged; safe response/audit metadata excludes
  private candidate IDs for Reporter. Source/link repairs use the injected Dashboard recorder.

## Accepted close-out additions (ADR-0068; suggestions BE/shared #1097, preview #1099)

VOC owns Cluster suggestion state/job/cursor/caps and paid-preview ledger/budgets/
cleanup. Keep shadow measurement and saved recommendations separate. Automatic
pairs write no Cluster/member/decision/domain-audit rows; human confirmation uses
VOC Clusters' exported commands in the same transaction. Do not add a system
actor or foreign repo access. Follow ADR-0068's coordinated admission lock order.
Paid preview (#1099) and Cluster suggestion BE/shared (#1097) are implemented; their FE parts are #1100/#1098.
Preview is explicit-click, bounded, zero automatic retries, with atomic four-budget
Postgres reservation and fresh visibility on completion/replay. API authority:
`docs/implementation/api/voc.md`; suggestion and preview fields are shipped in `docs/design/15-data-contracts.md`.
