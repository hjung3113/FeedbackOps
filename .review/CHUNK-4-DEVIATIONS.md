# Chunk 4 Deviations — C4.1

## D-4.1 — `reporter_status_gate` added to `VocDetailEnvelope` schema

**Rule:** 2 (auto-add missing critical functionality)
**Found during:** Task implementation (useReporterStatusTransitions hook)
**Issue:** `reporter_status_gate` is referenced in `docs/frontend/specs/voc.md §5.10` and `docs/design-prototype/screen-voc.jsx:527` but was absent from `packages/shared/src/vocs/detail.ts`. Without it, the hook cannot read the gate and TypeScript would error.
**Fix:** Added optional field to `vocDetailEnvelopeSchema`:
```ts
reporter_status_gate: z.object({
  blocking_for: z.array(reporterFacingStatusEnumSchema),
  reason: z.string(),
}).optional(),
```
**Files modified:** `packages/shared/src/vocs/detail.ts`
**Commit:** `f1d9040`
**Impact:** Additive; no existing tests broken (field is optional, existing fixtures without it still validate). `packages/shared` typecheck passes clean.
