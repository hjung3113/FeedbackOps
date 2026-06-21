# Issue #121 — review adjudication & deviations

VERIFY: PASS 56/0 (`feedbackops_wt121`, fops_app). Typecheck: no new errors beyond baseline.
Adversarial REVIEW (codex read-only) verdict: `request_changes`. Conductor adjudication below — all items are contract-faithful behavior, consistency-with-#112, or #122-scoped; none are #121 defects. Merged on green.

## Review items

- **(claimed BLOCKER) `findings.source_id` one-way CHECK.** Kept. `docs/design/15-data-contracts.md:134` = "source_id nullable **when** source_type=manual", i.e. required for non-manual, nullable for manual. The implemented CHECK `(source_type='manual' OR source_id IS NOT NULL)` is exactly that. A two-way `manual ⇒ source_id IS NULL` is stricter than the contract; `manual` Findings are unreachable in Slice 5 (create-finding is VOC-sourced) so there is nothing to over-constrain. No change.
- **(claimed BLOCKER) `analytics_area_id ∈ primary_managed_system_id` not DB-enforced.** Deferred to #122 service layer, matching the VOC precedent: `voc.vocs.analytics_area_id` is a simple FK to `analytics_areas(id)`; the AA-belongs-to-MS rule is enforced in the VOC create service, not a DB constraint. `finding.findings` mirrors that. #122 acceptance criteria already require this service check. No #121 change.
- **(claimed MAJOR) link MS recorded from source on a cross-MS voc→finding link.** Consistent with the #112 contract (`06-entity-linking-contract.md:60-69`): create authz is read on both endpoints and the stored `managed_system_id` is the source's. The finding path additionally requires `finding.manage` on the target (canCreateTarget). No regression.
- **(claimed MAJOR) list query accepts `source_type=finding`.** CREATE is gated by `isCreatableTuple`/`registeredEntityLinkPairSchema` (target-only enforced for writes). A read query with `source_type=finding` simply returns no rows (no finding is ever a link source this slice). Harmless; `entityLinkRefSchema.type` is shared by source+target so the target side legitimately needs `finding`. No change.
- **(MINOR) explicit `finding→finding` negative test absent.** The composite tuple CHECK is exercised by the passing "DB tuple check allows only registered entity-link tuples" test; the same mechanism rejects `finding→finding`. Optional hardening; deferred.

## Carried to #122
- Enforce `analytics_area_id ∈ primary_managed_system_id` in the create-finding service (VOC-rule reuse) — already in #122 AC.
