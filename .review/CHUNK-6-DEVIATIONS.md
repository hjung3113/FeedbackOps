# Chunk 6 Deviations

## C6.1

### D-C6.1-1: Test body omits `description_rich_content: null`

**Found during:** GREEN phase typecheck.

**Issue:** `EditDescriptionRequest` (`editDescriptionRequestSchema`) marks `description_rich_content` as `tipTapDocSchema.optional()` — `null` is not a valid value. The initial test fixture used `null` which caused `TS2322`.

**Fix:** Removed the field from the test fixture entirely (using `undefined` via omission). The test still exercises the PATCH path via `title` alone, which is a valid `EditDescriptionRequest`.

**Files modified:** `apps/frontend/src/features/voc/hooks/__tests__/useVocEditDescriptionMutation.test.ts`

**Commit:** c3b521f (folded into GREEN commit)

---

### D-C6.1-2: Pre-existing typecheck errors from C4.1 RED tests

**Found during:** `pnpm typecheck` after GREEN.

**Issue:** Two files from the C4.1 parallel wave (`ReporterStatusChangeBlock.test.tsx` line 67/68/178, `useReporterStatusTransitions.test.ts` line 58`) have TypeScript errors because those files are C4.1 RED tests — their implementation files do not exist yet. These errors were present before C6.1 started.

**Fix:** Out of scope for C6.1. No C6.1 files have typecheck errors. The errors will be resolved when C4.1 ships its GREEN commit.

**Files affected (not C6.1 scope):**
- `apps/frontend/src/features/voc/components/detail/__tests__/ReporterStatusChangeBlock.test.tsx`
- `apps/frontend/src/features/voc/hooks/__tests__/useReporterStatusTransitions.test.ts`
