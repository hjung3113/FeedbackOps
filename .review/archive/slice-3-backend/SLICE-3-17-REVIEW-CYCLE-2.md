# Slice 3 #17 — Adversarial Review Cycle 2 (Opus subagent)

**Reviewer:** Opus general-purpose subagent. **Date:** 2026-05-19. Cross-file + invariant focus.

0 BLOCKER. 0 MAJOR. 6 MINOR + 6 INFO clean.

## Findings + dispositions

| # | Sev | Summary | Disposition |
|---|---|---|---|
| C2-1 | MINOR | Rate-limit bucket separation | **Resolved here.** Same finding as cycle-1 C1-1; bucket added in fix. |
| C2-2 | MINOR | Case 17 missing `fields_code='invalid_attr_value'` assertion (post-#23 wire shape) | **Resolved.** Added `expect(body.detail?.fields?.[0]?.code).toBe('invalid_attr_value')`. |
| C2-3 | MINOR | Case 28 name no longer matches (shuffled-attr deferred to unit test) | **Documented in test comment.** `voc-description` surface has no multi-key attrs to shuffle; renamed to "identical-doc empty diff". Unit suite `stable-stringify.test.ts` covers shuffled-attr invariance. |
| C2-4 | MINOR | Case 20 not truly concurrent (uses `forceTriageState` direct SQL) | **Documented in plan §risks + matches #14 cycle-2 carry-over.** Outcome (state-check fires before stale_write) is what matters; true two-tx fixture is a follow-up across the codebase. |
| C2-5 | MINOR | `attachments` repo-update branch unreachable in Slice 3 — latent footgun for #22 | **Documented.** Service code path comment notes "attachments-only diff is unreachable in Slice 3; storage slice (#22) must thread attachments through `updateVocDescriptionFields`". |
| C2-6 | MINOR | Case 22 replay byte-equality not asserted | **Attempted, reverted.** Idempotency cache stores parsed object then re-serializes; key order differs at second send. Deep-equal (`.toEqual`) is the right invariant — content match, not byte-equal. |

## Cross-file invariants — clean

- Audit event `voc_description_edited` registered in closed enum + detail schema map + emit site (`service.ts`).
- ADR-0012 amendment style consistent with prior amendments.
- Idempotency hash includes If-Match (matches #14 caveat).
- `stableStringify` handles null / primitives / arrays / nested objects correctly; edge cases (Object.create(null), symbol keys) safe for hash determinism.
- `updateVocDescriptionFields` workspace_id filter present + always sets `updated_at = now()`.
- Audit row `actor_id` = reporter, not admin/system.
- Sanitizer error path wires `fields_code` to response.
- Slice 3 BE exit criterion met.

## Verify

- `pnpm -w typecheck` — pass.
- `pnpm --filter @fops/backend test` — **558/558** live Postgres.

## Verdict

Ready for merge. Cycle-1 MAJORs both resolved; cycle-2 MINORs all resolved or documented.
