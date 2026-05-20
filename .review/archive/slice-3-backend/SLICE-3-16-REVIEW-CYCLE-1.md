# Slice 3 #16 — Adversarial Review Cycle 1 (codex CLI)

**Diff:** `develop..HEAD` (3391 LoC, 27 files) at commit 710facb pre-review.
**Reviewer:** `codex exec --skip-git-repo-check` (gpt-5.5, default reasoning).
**Date:** 2026-05-19.

## Findings

| # | Severity | Summary |
|---|---|---|
| 1 | BLOCKER | Reporter/internal idempotency hash spoofable via body `vocId` field — schemas not strict, spread overrides path id. |
| 2 | MAJOR | Mention nodes with missing / non-string / non-UUID `attrs.actor_id` silently filtered out — passes set-equality + workspace check while body carries malformed mentions. |
| 3 | MAJOR | DB `voc_public_updates_skip_invariants` CHECK enforces body/skip-reason/null but not `status_before <> status_after`. App-layer rejects same-status skip; direct INSERTs can drift. |

## Resolutions (commit bca46df)

1. **BLOCKER → fixed.**
   - `packages/shared/src/vocs/reporter-reply-request.ts` + `internal-comment-request.ts` → both `.strict()` (matches `public-update-request.ts`). Unknown top-level fields (incl `vocId`) → 422 `validation.failed` before hash runs.
   - `apps/backend/src/modules/voc/routes.ts` lines 415/470/525: flipped `hashRequestBody({ vocId, ...rawBody })` → `{ ...rawBody, vocId }` so path id wins in hash even if a future schema regression allows unknown fields (defense-in-depth).
   - Note: line 221 (PATCH /vocs/:id from #14) has the same shape — out of scope for #16; tracked as pre-existing.

2. **MAJOR → fixed.**
   - `conversation-service.ts` postInternalComment step 4: explicit reject of every mention node whose `attrs.actor_id` is absent / non-string / non-UUID → 422 `validation.failed` with `code: 'invalid_mention_actor_id'`. Set-equality + workspace check unchanged downstream.

3. **MAJOR → fixed.**
   - New migration `0013_slice3_voc_public_update_skip_status_diff.sql`: DROP+RE-ADD `voc_public_updates_skip_invariants` CHECK to include `reporter_facing_status_before <> reporter_facing_status_after` on the skip=true branch.
   - Drizzle schema mirror updated in `apps/backend/src/db/schema/voc.ts:147`.
   - Journal entry `idx 13` added.

## Verify

- `pnpm -w typecheck` — 6/6 successful.
- `pnpm --filter @fops/backend db:migrate` — migrations applied.
- `pnpm --filter @fops/backend test` — 447/447 passed (42 files).

## Open

- Codex's `gh issue view 16` failed (network). Review used local plan + supplied invariant list; cross-validation against the live issue body was indirect. Mitigated by cycle 2 (Opus subagent with file-system access).
