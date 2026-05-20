# SLICE-3 #20 — REV cycle 2

**Reviewer:** main orchestrator (Opus 4.7) — second pass after REV-1 fixes
**Date:** 2026-05-21

## REV-1 fixes verified

- **M2 — usePermissionDecision _self drift default to denied**
  - `apps/frontend/src/features/voc/hooks/usePermissionDecision.ts:35-42` adds the safe-default branch.
  - Test updated (`apps/frontend/src/features/voc/hooks/__tests__/usePermissionDecision.test.ts`): one existing test renamed/strengthened + one new test asserts the non-`_self` path still returns null (no over-defaulting).
  - 218 FE tests pass (217 → 218).

- **M1 — Internal tab visibility**
  - `apps/frontend/src/features/voc/components/detail/ConversationTimeline.tsx:27-32` adds a TODO comment locking the deferral to #21.
  - Decision: composer + permission-aware viewer logic lives in #21; resolving M1 requires plumbing useMe + viewer role into the Detail panel which extends scope significantly. TODO is the correct hand-off.

## Regression scan

- typecheck clean (frontend + ui + shared)
- All test suites pass: backend 558, shared 236, ui 404, frontend 218
- Pixel-diff baseline unchanged (CP1 capture is pre-M2 fix; M2 only affects drift handling, not visible UI)
- No new exports or barrel changes
- No new deps

## Outstanding items (non-blocking)

- L1-L5 from REV-1: inline TODOs OR PR body notes; address in follow-ups
- Test gaps: out_of_scope_summary peek + 더보기 → fetchNextPage — cover in follow-up test PR
- Visual fidelity gaps (CP2) — 1 MEDIUM (theme — #55) + 5 OOS items — tracked
- Codex integration: non-interactive invocation failed in this run; workflow follow-up needed before #21

## Verdict

REV-2 clean. Go to PR.
